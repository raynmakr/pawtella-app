// Reports (App Store UGC requirement): POST /api/reports { targetType, targetId, reason, details? }.
// One open report per reporter+target; a post or comment with >= AUTO_HIDE_THRESHOLD open reports is
// hidden automatically and an admin notification is queued.
import { route, body, badRequest, notFound, requireFields } from '../lib/http.js';
import { requireAuth } from '../lib/auth.js';
import { withTransaction } from '../lib/db.js';
import { enqueueAdmin } from '../lib/notifications.js';

export const REASONS = ['spam', 'abuse', 'animal_welfare', 'nudity', 'other'];
export const TARGET_TYPES = ['post', 'comment', 'user'];
export const AUTO_HIDE_THRESHOLD = 3;

async function POST(req, res) {
  const { userId } = await requireAuth(req);
  const b = requireFields(body(req), ['targetType', 'targetId', 'reason']);
  const { targetType, reason } = b;
  const targetId = Number(b.targetId);
  const details = typeof b.details === 'string' ? b.details.trim().slice(0, 2000) || null : null;

  if (!TARGET_TYPES.includes(targetType)) throw badRequest(`targetType must be one of ${TARGET_TYPES.join(', ')}`);
  if (!REASONS.includes(reason)) throw badRequest(`reason must be one of ${REASONS.join(', ')}`);
  if (!Number.isInteger(targetId) || targetId <= 0) throw badRequest('targetId must be a positive integer');

  const result = await withTransaction(async (tx) => {
    // Target must exist (and for user targets, not be yourself).
    let owner = null;
    if (targetType === 'post') {
      const row = await tx.one(`SELECT id, user_id FROM posts WHERE id = $1`, [targetId]);
      if (!row) throw notFound('Post not found');
      owner = row.user_id;
    } else if (targetType === 'comment') {
      const row = await tx.one(`SELECT id, user_id FROM post_comments WHERE id = $1`, [targetId]);
      if (!row) throw notFound('Comment not found');
      owner = row.user_id;
    } else {
      const row = await tx.one(`SELECT id FROM users WHERE id = $1`, [targetId]);
      if (!row) throw notFound('User not found');
      if (targetId === userId) throw badRequest('You cannot report yourself');
    }
    if (owner === userId) throw badRequest('You cannot report your own content');

    const existing = await tx.one(
      `SELECT id FROM reports WHERE reporter_id = $1 AND target_type = $2 AND target_id = $3 AND status = 'open'`,
      [userId, targetType, targetId],
    );
    if (existing) return { reportId: existing.id, duplicate: true, autoHidden: false };

    const report = await tx.one(
      `INSERT INTO reports (reporter_id, target_type, target_id, reason, details)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [userId, targetType, targetId, reason, details],
    );

    const { n } = await tx.one(
      `SELECT count(*)::int AS n FROM reports WHERE target_type = $1 AND target_id = $2 AND status = 'open'`,
      [targetType, targetId],
    );

    let autoHidden = false;
    if (n >= AUTO_HIDE_THRESHOLD) {
      if (targetType === 'post') {
        const upd = await tx.query(`UPDATE posts SET is_hidden = true WHERE id = $1 AND is_hidden = false`, [targetId]);
        autoHidden = upd.rowCount === 1;
      } else if (targetType === 'comment') {
        const upd = await tx.one(
          `UPDATE post_comments SET is_hidden = true WHERE id = $1 AND is_hidden = false RETURNING post_id`,
          [targetId],
        );
        if (upd) {
          autoHidden = true;
          await tx.query(`UPDATE posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = $1`, [upd.post_id]);
        }
      }
    }

    return { reportId: report.id, duplicate: false, autoHidden, openReports: n };
  });

  if (!result.duplicate) {
    try {
      await enqueueAdmin({
        journey: result.autoHidden ? 'report_auto_hidden' : 'report_created',
        title: result.autoHidden ? `Auto-hidden ${targetType} #${targetId}` : `New report on ${targetType} #${targetId}`,
        body: `${reason}${details ? `: ${details}` : ''}`,
        payload: { reportId: result.reportId, targetType, targetId, reason, reporterId: userId, openReports: result.openReports },
      });
    } catch (err) {
      console.error('[reports] enqueueAdmin failed', { reportId: result.reportId, err: err.message });
    }
  }

  console.log('[reports] created', { reportId: result.reportId, targetType, targetId, duplicate: result.duplicate, autoHidden: result.autoHidden });
  res.status(result.duplicate ? 200 : 201).json({ ok: true, reportId: result.reportId, duplicate: result.duplicate, autoHidden: result.autoHidden });
}

export default route({ POST });
