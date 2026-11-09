// Blocks (required by the App Store for UGC): GET list, POST { handle }, DELETE /api/blocks/:handle.
// Family `/api/blocks/:path*` (rewrite in vercel.json). DELETE also accepts `{ handle }` in the body.
import { route, segments, body, badRequest, notFound } from '../lib/http.js';
import { requireAuth } from '../lib/auth.js';
import { one, many, withTransaction } from '../lib/db.js';

const BASE = '/api/blocks';

async function targetByHandle(handle) {
  if (typeof handle !== 'string' || !handle.trim()) throw badRequest('handle is required');
  const user = await one(`SELECT id, handle, display_name, avatar_url FROM users WHERE handle = $1`, [
    handle.trim().replace(/^@/, ''),
  ]);
  if (!user) throw notFound('User not found');
  return user;
}

async function GET(req) {
  const { userId } = await requireAuth(req);
  const rows = await many(
    `SELECT u.id, u.handle, u.display_name, u.avatar_url, b.created_at
       FROM blocks b JOIN users u ON u.id = b.blocked_id
      WHERE b.blocker_id = $1 ORDER BY b.created_at DESC`,
    [userId],
  );
  return {
    blocks: rows.map((r) => ({
      id: r.id,
      handle: r.handle,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
      blockedAt: r.created_at,
    })),
  };
}

async function POST(req) {
  const { userId } = await requireAuth(req);
  const { handle } = body(req);
  const target = await targetByHandle(handle);
  if (target.id === userId) throw badRequest('You cannot block yourself');

  await withTransaction(async (tx) => {
    await tx.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userId, target.id]);
    await tx.query(
      `DELETE FROM follows WHERE (follower_id = $1 AND followee_id = $2) OR (follower_id = $2 AND followee_id = $1)`,
      [userId, target.id],
    );
  });
  console.log('[blocks] blocked', { userId, targetId: target.id });
  return { blocked: true, user: { id: target.id, handle: target.handle, displayName: target.display_name, avatarUrl: target.avatar_url } };
}

async function DELETE(req) {
  const { userId } = await requireAuth(req);
  const seg = segments(req, BASE);
  const handle = seg[0] ? decodeURIComponent(seg[0]) : body(req).handle || req.query?.handle;
  const target = await targetByHandle(handle);
  await one(`DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2 RETURNING 1`, [userId, target.id]);
  return { blocked: false, handle: target.handle };
}

export default route({ GET, POST, DELETE });
