// Users: GET/PATCH /api/users/me, POST /api/users/me/push-token,
//        GET /api/users/:handle, GET /api/users/:handle/posts
import { route, segments, body, badRequest, notFound, intParam } from '../lib/http.js';
import { MOCK_UPLOAD_MAX_BYTES } from '../lib/media.js';
import { query, one, many } from '../lib/db.js';
import { requireAuth, optionalAuth } from '../lib/auth.js';
import { getUserById, getUserByHandle, toPublicUser, toPrivateUser, maybeAwardProfilePetBonus } from '../lib/users.js';
import { getOrCreateReferralCode } from '../lib/referrals.js';
import { camelize } from '../lib/serialize.js';
import { toPublicPet } from './pets.js';

const COUNTRY_RE = /^[A-Za-z]{2}$/;

function optStr(v, max, field) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  if (typeof v !== 'string') throw badRequest(`${field} must be a string`);
  const s = v.trim();
  if (s.length > max) throw badRequest(`${field} is too long (max ${max})`);
  return s || null;
}

async function privatePayload(row) {
  return { ...toPrivateUser(row), referralCode: await getOrCreateReferralCode(row.id) };
}

async function getMe(req) {
  const { userId } = await requireAuth(req);
  const user = await getUserById(userId);
  if (!user || user.status === 'deleted') throw notFound('Account not found');
  return { user: await privatePayload(user) };
}

async function patchMe(req) {
  const { userId } = await requireAuth(req);
  const b = body(req);
  const fields = {};
  const displayName = optStr(b.displayName, 60, 'displayName');
  if (displayName !== undefined) fields.display_name = displayName ? displayName.replace(/\s+/g, ' ') : null;
  const bio = optStr(b.bio, 300, 'bio');
  if (bio !== undefined) fields.bio = bio;
  // Large cap: in mock mode (no Cloudinary) the uploader returns an inline data: image URL (allowed below).
  const avatarUrl = optStr(b.avatarUrl, MOCK_UPLOAD_MAX_BYTES, 'avatarUrl');
  if (avatarUrl !== undefined) {
    if (avatarUrl && !/^(https?:\/\/|data:image\/)/i.test(avatarUrl)) throw badRequest('avatarUrl must be a URL');
    fields.avatar_url = avatarUrl;
  }
  if (b.country !== undefined) {
    if (b.country === null || b.country === '') fields.country = null;
    else if (typeof b.country === 'string' && COUNTRY_RE.test(b.country.trim())) fields.country = b.country.trim().toUpperCase();
    else throw badRequest('country must be an ISO-3166 alpha-2 code');
  }
  const postalCode = optStr(b.postalCode, 12, 'postalCode');
  if (postalCode !== undefined) fields.postal_code = postalCode ? postalCode.toUpperCase().replace(/\s+/g, ' ') : null;
  if (b.marketingOptIn !== undefined) fields.marketing_opt_in = !!b.marketingOptIn;
  if (b.featureConsentDefault !== undefined) fields.feature_consent_default = !!b.featureConsentDefault;
  const cols = Object.keys(fields);
  if (!cols.length) throw badRequest('Nothing to update');
  const sets = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
  const user = await one(`UPDATE users SET ${sets} WHERE id = $1 AND status <> 'deleted' RETURNING *`, [
    userId,
    ...cols.map((c) => fields[c]),
  ]);
  if (!user) throw notFound('Account not found');
  const bonus = await maybeAwardProfilePetBonus(userId);
  const fresh = bonus.awarded ? await getUserById(userId) : user;
  return { user: await privatePayload(fresh), bonusAwarded: bonus.awarded };
}

async function pushToken(req) {
  const { userId } = await requireAuth(req);
  const b = body(req);
  const raw = b.token !== undefined ? b.token : b.pushToken;
  if (raw === undefined) throw badRequest('token is required');
  const token = raw === null || raw === '' ? null : optStr(raw, 512, 'token');
  await query('UPDATE users SET push_token = $2 WHERE id = $1', [userId, token]);
  return { ok: true };
}

async function isBlockedEither(a, b) {
  if (!a || !b || a === b) return false;
  const row = await one(
    'SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1',
    [a, b],
  );
  return !!row;
}

async function loadProfileUser(handle, viewerId) {
  const user = await getUserByHandle(String(handle).toLowerCase());
  if (!user || user.status !== 'active') throw notFound('User not found');
  if (await isBlockedEither(viewerId, user.id)) throw notFound('User not found');
  return user;
}

async function publicProfile(req, handle) {
  const viewer = await optionalAuth(req);
  const user = await loadProfileUser(handle, viewer?.userId);
  const [counts, following, pets] = await Promise.all([
    one(
      `SELECT (SELECT count(*) FROM follows WHERE followee_id = $1)::int AS follower_count,
              (SELECT count(*) FROM follows WHERE follower_id = $1)::int AS following_count,
              (SELECT count(*) FROM posts WHERE user_id = $1 AND is_hidden = false AND visibility = 'public')::int AS post_count`,
      [user.id],
    ),
    viewer ? one('SELECT 1 FROM follows WHERE follower_id = $1 AND followee_id = $2', [viewer.userId, user.id]) : null,
    many('SELECT * FROM pets WHERE user_id = $1 ORDER BY is_primary DESC, created_at ASC', [user.id]),
  ]);
  return {
    user: {
      ...toPublicUser(user),
      followerCount: counts.follower_count,
      followingCount: counts.following_count,
      postCount: counts.post_count,
      isFollowing: !!following,
      isMe: viewer?.userId === user.id,
    },
    pets: pets.map(toPublicPet),
  };
}

async function userPosts(req, handle) {
  const viewer = await optionalAuth(req);
  const user = await loadProfileUser(handle, viewer?.userId);
  const limit = intParam(req.query?.limit, 20, { min: 1, max: 50 });
  const cursor = intParam(req.query?.cursor, null, { min: 1 });
  const params = [user.id, limit + 1];
  let where = `p.user_id = $1 AND p.is_hidden = false AND p.visibility = 'public'`;
  if (cursor) {
    params.push(cursor);
    where += ` AND p.id < $${params.length}`;
  }
  const rows = await many(
    `SELECT p.id, p.user_id, p.pet_id, p.challenge_id, p.caption, p.media_url, p.media_type, p.thumbnail_url, p.media_status,
            p.width, p.height, p.duration_seconds, p.like_count, p.comment_count, p.share_count, p.created_at,
            pet.name AS pet_name, pet.species AS pet_species
       FROM posts p LEFT JOIN pets pet ON pet.id = p.pet_id
      WHERE ${where}
      ORDER BY p.id DESC
      LIMIT $2`,
    params,
  );
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const author = toPublicUser(user);
  const posts = page.map((r) => {
    const { pet_name, pet_species, ...rest } = r;
    const post = camelize(rest);
    return {
      ...post,
      durationSeconds: post.durationSeconds === null ? null : Number(post.durationSeconds),
      user: author,
      pet: r.pet_id ? { id: r.pet_id, name: pet_name, species: pet_species } : null,
    };
  });
  return { posts, nextCursor: hasMore ? page[page.length - 1].id : null };
}

export default route({
  GET: async (req) => {
    const [first, second, ...rest] = segments(req, '/api/users');
    if (!first || rest.length) throw notFound();
    if (first === 'me') {
      if (second) throw notFound();
      return getMe(req);
    }
    if (!second) return publicProfile(req, first);
    if (second === 'posts') return userPosts(req, first);
    throw notFound();
  },
  PATCH: async (req) => {
    const segs = segments(req, '/api/users');
    if (segs.length !== 1 || segs[0] !== 'me') throw notFound();
    return patchMe(req);
  },
  POST: async (req) => {
    const segs = segments(req, '/api/users');
    if (segs.length === 2 && segs[0] === 'me' && segs[1] === 'push-token') return pushToken(req);
    throw notFound();
  },
});
