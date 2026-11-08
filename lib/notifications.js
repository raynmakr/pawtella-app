// Notifications: the single table the automation engine, crons and other modules write to.
// Rows are queued per channel (email | push | inapp) and deduplicated by `dedupe_key`.
// Email rows are delivered by deliverQueued() (called from api/cron/run-automations.js);
// push is a no-op sender until Phase 2; inapp rows are read by GET /api/notifications.
//
//   import { notify, enqueueAdmin } from '../lib/notifications.js';
//   await notify({ userId, journey: 'generation_ready', channel: 'email', dedupeKey: `generation_ready:gen:${id}`, title, body, payload });
import { query, one, many } from './db.js';
import { env, flags } from './env.js';
import { camelize } from './serialize.js';
import { sendEmail } from './email.js';
import { renderTemplate, TEMPLATES } from './email-templates.js';
import { track, EVENT } from './events.js';

export const CHANNELS = ['email', 'push', 'inapp'];

/**
 * Journeys that are sent regardless of users.marketing_opt_in: the user asked for them or they
 * are a direct consequence of an action they took. Everything else is marketing.
 */
export const TRANSACTIONAL_JOURNEYS = new Set([
  'generation_ready',
  'password_reset',
  'back_in_stock',
  'challenge_won',
  'abandoned_hold',
  'post_purchase_review_request',
  'partner_applied',
  'partner_approved',
  'partner_tier_up',
  'partner_monthly_statement',
  'partner_inactive_60d',
  'admin_digest',
]);

export const isMarketingJourney = (journey) => !TRANSACTIONAL_JOURNEYS.has(journey);

/**
 * Queue one notification. Duplicate dedupeKey → `{ created: false }` (no error).
 * `payload` carries template vars for email and the deep link / cta for inapp.
 */
export async function notify({ userId, journey, channel = 'inapp', dedupeKey, title, body, payload = {} }, tx) {
  if (!journey) throw new Error('notify: journey is required');
  if (!CHANNELS.includes(channel)) throw new Error(`notify: unknown channel ${channel}`);
  const key = dedupeKey || `${journey}:${userId == null ? 'admin' : `user:${userId}`}:${channel}:${Date.now()}`;
  const run = tx ? tx.query : query;
  const { rows } = await run(
    `INSERT INTO notifications (user_id, journey, channel, dedupe_key, title, body, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING id`,
    [userId ?? null, journey, channel, key, title ?? null, body ?? null, JSON.stringify(payload ?? {})],
  );
  const created = rows.length > 0;
  if (created) console.log('[notifications] queued', { id: rows[0].id, journey, channel, userId: userId ?? null });
  return { created, id: created ? Number(rows[0].id) : null };
}

/**
 * Queue a note for the admin (user_id NULL). The daily digest (api/cron/admin-digest.js) drains
 * these rows into one email instead of sending each on its own.
 */
export async function enqueueAdmin({ journey, title, body, payload = {}, dedupeKey }, tx) {
  const key = dedupeKey || `admin:${journey}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  return notify({ userId: null, journey, channel: 'email', dedupeKey: key, title, body, payload }, tx);
}

/** Mark inapp notifications read. `ids` omitted → all of the user's unread. Returns the count. */
export async function markRead(userId, ids) {
  let res;
  if (Array.isArray(ids) && ids.length) {
    const clean = ids.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0);
    if (!clean.length) return { updated: 0 };
    res = await query(
      `UPDATE notifications SET read_at = now()
       WHERE user_id = $1 AND channel = 'inapp' AND read_at IS NULL AND id = ANY($2::bigint[])`,
      [userId, clean],
    );
  } else {
    res = await query(
      `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND channel = 'inapp' AND read_at IS NULL`,
      [userId],
    );
  }
  return { updated: res.rowCount };
}

/** In-app inbox page + unread count. */
export async function listInapp(userId, { page = 1, limit = 20 } = {}) {
  const lim = Math.min(50, Math.max(1, Number(limit) || 20));
  const pg = Math.max(1, Number(page) || 1);
  const offset = (pg - 1) * lim;
  const [rows, counts] = await Promise.all([
    many(
      `SELECT id, journey, title, body, payload, read_at, created_at
       FROM notifications
       WHERE user_id = $1 AND channel = 'inapp'
       ORDER BY created_at DESC, id DESC
       LIMIT $2 OFFSET $3`,
      [userId, lim + 1, offset],
    ),
    one(
      `SELECT count(*) FILTER (WHERE read_at IS NULL)::int AS unread, count(*)::int AS total
       FROM notifications WHERE user_id = $1 AND channel = 'inapp'`,
      [userId],
    ),
  ]);
  const hasMore = rows.length > lim;
  const items = rows.slice(0, lim).map((r) => camelize({ ...r, id: Number(r.id), read: r.read_at != null }));
  return { notifications: items, unreadCount: counts?.unread ?? 0, total: counts?.total ?? 0, page: pg, hasMore };
}

export async function unreadCount(userId) {
  const row = await one(
    `SELECT count(*)::int AS unread FROM notifications WHERE user_id = $1 AND channel = 'inapp' AND read_at IS NULL`,
    [userId],
  );
  return row?.unread ?? 0;
}

async function setStatus(id, status, { error = null } = {}) {
  await query(
    `UPDATE notifications SET status = $2, error = $3, sent_at = CASE WHEN $2 = 'sent' THEN now() ELSE sent_at END WHERE id = $1`,
    [id, status, error],
  );
}

/** Push sender placeholder (Phase 2: Expo push). Marks the row skipped. */
export async function sendPush() {
  return { skipped: true, error: 'push not configured' };
}

/**
 * Deliver queued email + push rows for real users (admin rows with user_id NULL are left for the
 * digest). Email body comes from lib/email-templates.js: `payload.template` or the journey name;
 * unknown names fall back to title/body. Marketing journeys respect users.marketing_opt_in.
 * Returns counts: { sent, skipped, failed, total }.
 */
export async function deliverQueued({ limit = 100 } = {}) {
  const rows = await many(
    `SELECT n.id, n.user_id, n.journey, n.channel, n.title, n.body, n.payload,
            u.email, u.display_name, u.handle, u.marketing_opt_in, u.status AS user_status, u.paw_points
     FROM notifications n
     JOIN users u ON u.id = n.user_id
     WHERE n.status = 'queued' AND n.channel IN ('email', 'push')
     ORDER BY n.created_at ASC, n.id ASC
     LIMIT $1`,
    [Math.min(500, Math.max(1, limit))],
  );
  const result = { sent: 0, skipped: 0, failed: 0, total: rows.length, mock: !flags.hasEmail };
  for (const row of rows) {
    const id = Number(row.id);
    try {
      if (row.channel === 'push') {
        const r = await sendPush(row);
        await setStatus(id, 'skipped', { error: r.error });
        result.skipped++;
        continue;
      }
      if (row.user_status && row.user_status !== 'active') {
        await setStatus(id, 'skipped', { error: `user ${row.user_status}` });
        result.skipped++;
        continue;
      }
      if (!row.email) {
        await setStatus(id, 'skipped', { error: 'no email on account' });
        result.skipped++;
        continue;
      }
      if (isMarketingJourney(row.journey) && row.marketing_opt_in === false) {
        await setStatus(id, 'skipped', { error: 'marketing opt-out' });
        result.skipped++;
        continue;
      }
      const payload = row.payload || {};
      const templateName = payload.template || row.journey;
      const vars = {
        ...payload,
        title: payload.title || row.title,
        body: payload.body || row.body,
        name: payload.name || row.display_name || row.handle,
        displayName: row.display_name,
        handle: row.handle,
        email: row.email,
        pawPoints: payload.pawPoints ?? row.paw_points,
        appUrl: env.appUrl,
      };
      const rendered = TEMPLATES[templateName] ? renderTemplate(templateName, vars) : renderTemplate('__generic__', vars);
      const sendResult = await sendEmail({ to: row.email, subject: rendered.subject, html: rendered.html, text: rendered.text });
      await setStatus(id, 'sent');
      await track(EVENT.notification_sent, {
        userId: row.user_id,
        props: { journey: row.journey, channel: 'email', notificationId: id, mock: !!sendResult.mock },
      });
      result.sent++;
    } catch (err) {
      console.error('[notifications] delivery failed', { id, journey: row.journey, error: err?.message });
      await setStatus(id, 'failed', { error: String(err?.message || err).slice(0, 500) });
      result.failed++;
    }
  }
  if (rows.length) console.log('[notifications] deliverQueued', result);
  return result;
}

/** Queued admin rows (user_id NULL) for the digest. */
export async function listAdminQueue() {
  const rows = await many(
    `SELECT id, journey, title, body, payload, created_at FROM notifications
     WHERE user_id IS NULL AND status = 'queued' ORDER BY created_at ASC`,
  );
  return rows.map((r) => camelize({ ...r, id: Number(r.id) }));
}

/** Mark admin rows sent after the digest went out. */
export async function markAdminQueueSent(ids) {
  if (!ids?.length) return 0;
  const { rowCount } = await query(
    `UPDATE notifications SET status = 'sent', sent_at = now() WHERE id = ANY($1::bigint[]) AND user_id IS NULL`,
    [ids.map(Number)],
  );
  return rowCount;
}

export default { notify, enqueueAdmin, markRead, listInapp, unreadCount, deliverQueued };
