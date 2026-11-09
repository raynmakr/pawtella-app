// Follow graph: POST/DELETE /api/follows { handle } → { following, counts }.
import { route, body, badRequest, notFound, requireFields } from '../lib/http.js';
import { requireAuth } from '../lib/auth.js';
import { one, query } from '../lib/db.js';

async function targetByHandle(handle) {
  if (typeof handle !== 'string' || !handle.trim()) throw badRequest('handle is required');
  const user = await one(
    `SELECT id, handle FROM users WHERE handle = $1 AND status = 'active'`,
    [handle.trim().replace(/^@/, '')],
  );
  if (!user) throw notFound('User not found');
  return user;
}

/** Follower/following counts for a user plus whether the viewer follows them. */
export async function followCounts(userId, viewerId = null) {
  const row = await one(
    `SELECT
       (SELECT count(*)::int FROM follows WHERE followee_id = $1) AS followers,
       (SELECT count(*)::int FROM follows WHERE follower_id = $1) AS following,
       EXISTS (SELECT 1 FROM follows WHERE follower_id = $2 AND followee_id = $1) AS is_following`,
    [userId, viewerId],
  );
  return { followers: row.followers, following: row.following, isFollowing: row.is_following };
}

async function POST(req) {
  const { userId } = await requireAuth(req);
  const { handle } = requireFields(body(req), ['handle']);
  const target = await targetByHandle(handle);
  if (target.id === userId) throw badRequest('You cannot follow yourself');

  const blocked = await one(
    `SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1`,
    [userId, target.id],
  );
  if (blocked) throw badRequest('You cannot follow this user');

  await query(`INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userId, target.id]);
  const counts = await followCounts(target.id, userId);
  console.log('[follows] follow', { userId, targetId: target.id });
  return { following: true, handle: target.handle, counts };
}

async function DELETE(req) {
  const { userId } = await requireAuth(req);
  const { handle } = requireFields(body(req), ['handle']);
  const target = await targetByHandle(handle);
  await query(`DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2`, [userId, target.id]);
  const counts = await followCounts(target.id, userId);
  return { following: false, handle: target.handle, counts };
}

export default route({ POST, DELETE });
