// Admin route family `/api/admin/*` (role admin). Owned by Backend E.
//
// Built in here:
//   GET   /api/admin/metrics                      lib/metrics.js getMetrics()
//   GET   /api/admin/reports?status=open&page=1   moderation queue
//   PATCH /api/admin/reports/:id { status, hideTarget? }
//   POST  /api/admin/points { userId, amount, reason }   awardPoints type 'admin'
//   GET   /api/admin/settings · PATCH /api/admin/settings { key, value }   app_settings
//   GET   /api/admin/digest  (preview JSON) · POST /api/admin/digest/send
//   POST  /api/admin/automations/run { journeys?: [] }    runAutomations now
//   GET   /api/admin/notifications?status=&journey=&page=  recent notification rows
//   GET   /api/admin/email-preview/:template      rendered HTML with sample vars
//
// EXTENSION POINT for other backends (no edits to this file needed):
//   /api/admin/<area>/* is delegated to `lib/admin/<area>.js` when that file exists. The module's
//   default export is `async (req, res, segments) => result`, where `segments` is the path after
//   `/api/admin/<area>` (e.g. ['42'] for PATCH /api/admin/partners/42) and the return value is sent
//   as JSON 200 (or write to `res` yourself; throw ApiError for expected failures). requireAdmin
//   has already run; `req.admin = { userId, role }` is set. Areas: challenges (Backend D),
//   partners (Backend F), sourcing (Backend G). Add more by dropping a file in lib/admin/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { route, segments as pathSegments, body, pagination, badRequest, notFound, requireFields, html } from '../lib/http.js';
import { requireAdmin } from '../lib/auth.js';
import { query, one, many, withTransaction } from '../lib/db.js';
import { camelize } from '../lib/serialize.js';
import { awardPoints } from '../lib/points.js';
import { getMetrics } from '../lib/metrics.js';
import { buildDigest, sendDigest } from '../lib/digest.js';
import { runAutomations, JOURNEYS } from '../lib/automation.js';
import { renderTemplate, TEMPLATE_NAMES, SAMPLE_VARS } from '../lib/email-templates.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const adminLibDir = path.resolve(here, '..', 'lib', 'admin');
const DELEGATED_AREAS = ['challenges', 'partners', 'sourcing'];
const delegateCache = new Map();

/** Load lib/admin/<area>.js if present (cached). Returns the handler or null. */
async function loadDelegate(area) {
  if (!DELEGATED_AREAS.includes(area)) return null;
  if (delegateCache.has(area)) return delegateCache.get(area);
  const file = path.join(adminLibDir, `${area}.js`);
  let handler = null;
  if (fs.existsSync(file)) {
    const mod = await import(pathToFileURL(file).href);
    handler = typeof mod.default === 'function' ? mod.default : null;
    if (!handler) console.warn('[admin] lib/admin module has no default function export', { area });
  }
  delegateCache.set(area, handler);
  return handler;
}

/** app_settings row → API shape. The JSONB value is passed through untouched (keys are user-chosen). */
const settingRow = (r) => ({ key: r.key, value: r.value, updatedAt: r.updated_at });

/** Built-in sub-routes keyed by area; each is `(req, res, segs) => result`. */
export const subroutes = {
  async metrics(req, res, segs) {
    if (req.method !== 'GET' || segs.length) throw notFound();
    return getMetrics();
  },

  async reports(req, res, segs) {
    if (req.method === 'GET' && segs.length === 0) {
      const { page, limit, offset } = pagination(req);
      const status = req.query?.status || 'open';
      const rows = await many(
        `SELECT r.*, u.handle AS reporter_handle,
                CASE r.target_type
                  WHEN 'post' THEN (SELECT json_build_object('id', p.id, 'caption', p.caption, 'mediaUrl', p.media_url, 'isHidden', p.is_hidden, 'userId', p.user_id) FROM posts p WHERE p.id = r.target_id)
                  WHEN 'comment' THEN (SELECT json_build_object('id', c.id, 'body', c.body, 'isHidden', c.is_hidden, 'userId', c.user_id, 'postId', c.post_id) FROM post_comments c WHERE c.id = r.target_id)
                  WHEN 'user' THEN (SELECT json_build_object('id', t.id, 'handle', t.handle, 'status', t.status) FROM users t WHERE t.id = r.target_id)
                END AS target
         FROM reports r JOIN users u ON u.id = r.reporter_id
         WHERE ($1 = 'all' OR r.status = $1)
         ORDER BY r.created_at ASC LIMIT $2 OFFSET $3`,
        [status, limit + 1, offset],
      );
      const hasMore = rows.length > limit;
      return { reports: camelize(rows.slice(0, limit)), page, hasMore };
    }
    if (req.method === 'PATCH' && segs.length === 1) {
      const id = Number(segs[0]);
      if (!Number.isInteger(id)) throw badRequest('Invalid report id');
      const b = body(req);
      const allowed = ['open', 'reviewed', 'actioned', 'dismissed'];
      if (b.status && !allowed.includes(b.status)) throw badRequest(`status must be one of ${allowed.join(', ')}`);
      const report = await one('SELECT * FROM reports WHERE id = $1', [id]);
      if (!report) throw notFound('Report not found');
      if (b.hideTarget) {
        if (report.target_type === 'post') await query('UPDATE posts SET is_hidden = true WHERE id = $1', [report.target_id]);
        if (report.target_type === 'comment') await query('UPDATE post_comments SET is_hidden = true WHERE id = $1', [report.target_id]);
        if (report.target_type === 'user') await query(`UPDATE users SET status = 'suspended' WHERE id = $1 AND role <> 'admin'`, [report.target_id]);
      }
      const updated = await one(
        `UPDATE reports SET status = COALESCE($2, status), reviewed_by = $3, reviewed_at = now() WHERE id = $1 RETURNING *`,
        [id, b.status || (b.hideTarget ? 'actioned' : null), req.admin.userId],
      );
      console.log('[admin] report reviewed', { id, status: updated.status, hideTarget: !!b.hideTarget, by: req.admin.userId });
      return { report: camelize(updated) };
    }
    throw notFound();
  },

  async points(req, res, segs) {
    if (req.method !== 'POST' || segs.length) throw notFound();
    const b = requireFields(body(req), ['userId', 'amount', 'reason']);
    const userId = Number(b.userId);
    const amount = Number(b.amount);
    if (!Number.isInteger(userId) || userId <= 0) throw badRequest('userId must be a positive integer');
    if (!Number.isInteger(amount) || amount === 0) throw badRequest('amount must be a non-zero integer');
    const user = await one('SELECT id, paw_points FROM users WHERE id = $1', [userId]);
    if (!user) throw notFound('User not found');
    const opts = { type: 'admin', source: 'admin', refType: 'admin_user', refId: String(req.admin.userId), description: String(b.reason).slice(0, 500), metadata: { adminId: req.admin.userId } };
    let result;
    if (amount > 0) result = await awardPoints(userId, amount, opts);
    else {
      // Negative adjustment: direct ledger write so the admin type is preserved (spendPoints forces type 'spend').
      result = await withTransaction(async (tx) => {
        const u = await tx.one('SELECT paw_points FROM users WHERE id = $1 FOR UPDATE', [userId]);
        const balanceAfter = u.paw_points + amount;
        if (balanceAfter < 0) throw badRequest('Adjustment would make the balance negative');
        await tx.query('UPDATE users SET paw_points = $2 WHERE id = $1', [userId, balanceAfter]);
        await tx.query(
          `INSERT INTO point_transactions (user_id, amount, type, source, ref_type, ref_id, balance_after, description, metadata)
           VALUES ($1, $2, 'admin', 'admin', $3, $4, $5, $6, $7::jsonb)`,
          [userId, amount, opts.refType, opts.refId, balanceAfter, opts.description, JSON.stringify(opts.metadata)],
        );
        return { balanceAfter };
      });
    }
    console.log('[admin] points adjusted', { userId, amount, by: req.admin.userId });
    return { userId, amount, balanceAfter: result.balanceAfter };
  },

  async settings(req, res, segs) {
    if (req.method === 'GET' && segs.length === 0) {
      const rows = await many('SELECT key, value, updated_at FROM app_settings ORDER BY key');
      return { settings: rows.map(settingRow) };
    }
    if (req.method === 'GET' && segs.length === 1) {
      const row = await one('SELECT key, value, updated_at FROM app_settings WHERE key = $1', [segs[0]]);
      if (!row) throw notFound('Setting not found');
      return settingRow(row);
    }
    if (req.method === 'PATCH' && segs.length === 0) {
      const b = body(req);
      if (!b.key || typeof b.key !== 'string') throw badRequest('key is required');
      if (b.value === undefined) throw badRequest('value is required');
      const row = await one(
        `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2::jsonb, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now() RETURNING key, value, updated_at`,
        [b.key, JSON.stringify(b.value)],
      );
      console.log('[admin] setting updated', { key: b.key, by: req.admin.userId });
      return settingRow(row);
    }
    throw notFound();
  },

  async digest(req, res, segs) {
    if (req.method === 'GET' && segs.length === 0) return buildDigest();
    if (req.method === 'POST' && segs[0] === 'send') {
      const r = await sendDigest();
      return { sent: r.sent, mock: r.mock ?? null, drained: r.drained ?? 0, reason: r.reason };
    }
    throw notFound();
  },

  async automations(req, res, segs) {
    if (req.method === 'GET' && segs.length === 0) {
      const last = await one(`SELECT value, updated_at FROM app_settings WHERE key = 'automation.last_run'`);
      return { journeys: JOURNEYS.map((j) => ({ id: j.id, channels: j.channels })), lastRun: last ? { value: last.value, updatedAt: last.updated_at } : null };
    }
    if (req.method === 'POST' && segs[0] === 'run') {
      const b = body(req);
      const only = Array.isArray(b.journeys) && b.journeys.length ? b.journeys : undefined;
      return runAutomations(new Date(), { only, deliver: b.deliver !== false });
    }
    throw notFound();
  },

  async notifications(req, res, segs) {
    if (req.method !== 'GET' || segs.length) throw notFound();
    const { page, limit, offset } = pagination(req, { defaultLimit: 50, maxLimit: 200 });
    const rows = await many(
      `SELECT n.id, n.user_id, u.handle, n.journey, n.channel, n.status, n.error, n.title, n.dedupe_key, n.created_at, n.sent_at, n.read_at
       FROM notifications n LEFT JOIN users u ON u.id = n.user_id
       WHERE ($1::text IS NULL OR n.status = $1) AND ($2::text IS NULL OR n.journey = $2)
       ORDER BY n.created_at DESC, n.id DESC LIMIT $3 OFFSET $4`,
      [req.query?.status || null, req.query?.journey || null, limit + 1, offset],
    );
    const hasMore = rows.length > limit;
    return { notifications: camelize(rows.slice(0, limit).map((r) => ({ ...r, id: Number(r.id) }))), page, hasMore };
  },

  async 'email-preview'(req, res, segs) {
    if (req.method !== 'GET') throw notFound();
    if (!segs.length) return { templates: TEMPLATE_NAMES };
    const name = segs[0];
    if (!TEMPLATE_NAMES.includes(name)) throw notFound('Unknown template');
    const rendered = renderTemplate(name, SAMPLE_VARS[name] || {});
    if (req.query?.format === 'json') return rendered;
    res.setHeader('Cache-Control', 'no-store');
    return html(res, rendered.html);
  },
};

async function dispatch(req, res) {
  req.admin = await requireAdmin(req);
  const segs = pathSegments(req, '/api/admin');
  if (!segs.length) {
    const delegated = [];
    for (const a of DELEGATED_AREAS) if (await loadDelegate(a)) delegated.push(a);
    return { areas: [...Object.keys(subroutes), ...delegated] };
  }
  const [area, ...rest] = segs;
  if (subroutes[area]) return subroutes[area](req, res, rest);
  const delegate = await loadDelegate(area);
  if (delegate) return delegate(req, res, rest);
  throw notFound(`No admin area "${area}"`);
}

export default route({ GET: dispatch, POST: dispatch, PATCH: dispatch, PUT: dispatch, DELETE: dispatch });
