// Posts: creation, feed query builder, single-post loaders and serialisation.
// Owner: Backend D. Contract in docs/CONVENTIONS.md.
import { one, many, withTransaction } from './db.js';
import { badRequest, notFound } from './http.js';
import { camelize } from './serialize.js';
import { track, EVENT } from './events.js';
import { awardOnce } from './points.js';
import { RULES } from './points-rules.js';
import { onReferredConversion } from './referrals.js';

export const MEDIA_TYPES = ['image', 'video'];
export const MAX_CAPTION = 2200;
export const DEFAULT_FEED_LIMIT = 20;
export const MAX_FEED_LIMIT = 50;

/* ------------------------------------------------------------------------------------------------
 * Serialisation
 * ---------------------------------------------------------------------------------------------- */

const POST_COLUMNS = `
  p.id, p.user_id, p.pet_id, p.generation_id, p.challenge_id, p.caption, p.media_url, p.media_type,
  p.thumbnail_url, p.media_status, p.width, p.height, p.duration_seconds, p.visibility, p.feature_consent,
  p.like_count, p.comment_count, p.share_count, p.is_hidden, p.created_at, p.updated_at,
  u.handle AS author_handle, u.display_name AS author_display_name, u.avatar_url AS author_avatar_url,
  pe.name AS pet_name, pe.species AS pet_species,
  c.title AS challenge_title`;

const POST_JOINS = `
  FROM posts p
  JOIN users u ON u.id = p.user_id
  LEFT JOIN pets pe ON pe.id = p.pet_id
  LEFT JOIN challenges c ON c.id = p.challenge_id`;

/** Viewer-dependent column; `$n` is the viewer id param (NULL when anonymous). */
function likedByViewerSql(param) {
  return `EXISTS (SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = ${param}) AS liked_by_viewer`;
}

/** Row (from POST_COLUMNS) → API JSON. */
export function serializePost(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    petId: row.pet_id,
    generationId: row.generation_id,
    challengeId: row.challenge_id,
    caption: row.caption,
    mediaUrl: row.media_url,
    mediaType: row.media_type,
    thumbnailUrl: row.thumbnail_url,
    mediaStatus: row.media_status ?? 'ready',
    width: row.width,
    height: row.height,
    durationSeconds: row.duration_seconds === null || row.duration_seconds === undefined ? null : Number(row.duration_seconds),
    visibility: row.visibility,
    featureConsent: row.feature_consent,
    likeCount: row.like_count,
    commentCount: row.comment_count,
    shareCount: row.share_count,
    isHidden: row.is_hidden,
    createdAt: row.created_at,
    likedByViewer: row.liked_by_viewer === true,
    author: {
      id: row.user_id,
      handle: row.author_handle,
      displayName: row.author_display_name,
      avatarUrl: row.author_avatar_url,
    },
    pet: row.pet_id && row.pet_name ? { id: row.pet_id, name: row.pet_name, species: row.pet_species } : null,
    challenge: row.challenge_id && row.challenge_title ? { id: row.challenge_id, title: row.challenge_title } : null,
  };
}

export function serializeComment(row) {
  return {
    id: row.id,
    postId: row.post_id,
    body: row.body,
    createdAt: row.created_at,
    author: {
      id: row.user_id,
      handle: row.author_handle,
      displayName: row.author_display_name,
      avatarUrl: row.author_avatar_url,
    },
  };
}

/* ------------------------------------------------------------------------------------------------
 * Create
 * ---------------------------------------------------------------------------------------------- */

/**
 * Insert a post, award the first-post bonus once, emit events and pay the referrer on the
 * creator's first creation. Runs in its own transaction unless `tx` is given.
 */
export async function createPost(userId, input, tx) {
  const {
    petId = null,
    generationId = null,
    challengeId = null,
    caption = null,
    mediaUrl,
    mediaType,
    thumbnailUrl = null,
    featureConsent = false,
    width = null,
    height = null,
    durationSeconds = null,
    mediaStatus = 'ready',
    mediaKey = null,
  } = input || {};

  if (!mediaUrl || typeof mediaUrl !== 'string') throw badRequest('mediaUrl is required');
  if (!MEDIA_TYPES.includes(mediaType)) throw badRequest(`mediaType must be one of ${MEDIA_TYPES.join(', ')}`);
  if (caption !== null && caption !== undefined) {
    if (typeof caption !== 'string') throw badRequest('caption must be a string');
    if (caption.length > MAX_CAPTION) throw badRequest(`caption must be at most ${MAX_CAPTION} characters`);
  }

  const run = async (t) => {
    if (challengeId) {
      const ch = await t.one(
        `SELECT id, status, starts_at, ends_at FROM challenges WHERE id = $1`,
        [challengeId],
      );
      if (!ch) throw badRequest('Challenge not found');
      const now = Date.now();
      const active =
        ch.status === 'active' ||
        (ch.status !== 'closed' && new Date(ch.starts_at).getTime() <= now && new Date(ch.ends_at).getTime() > now);
      if (!active) throw badRequest('Challenge is not active');
    }

    const post = await t.one(
      `INSERT INTO posts (user_id, pet_id, generation_id, challenge_id, caption, media_url, media_type,
                          thumbnail_url, feature_consent, width, height, duration_seconds, media_status, media_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        userId,
        petId,
        generationId,
        challengeId,
        caption ? caption.trim() || null : null,
        mediaUrl,
        mediaType,
        thumbnailUrl,
        !!featureConsent,
        width,
        height,
        durationSeconds,
        mediaStatus === 'processing' ? 'processing' : 'ready',
        mediaKey,
      ],
    );

    if (generationId) {
      await t.query(`UPDATE ai_generations SET post_id = $1 WHERE id = $2 AND user_id = $3`, [post.id, generationId, userId]);
    }

    const bonus = RULES?.firstPostBonus ?? 5;
    let firstPostAwarded = false;
    await t.query('SAVEPOINT first_post_bonus');
    try {
      const res = await awardOnce(
        userId,
        'bonus_first_post',
        bonus,
        { type: 'bonus', source: 'first_post', refType: 'post', refId: String(post.id), description: 'First post bonus' },
        t,
      );
      await t.query('RELEASE SAVEPOINT first_post_bonus');
      firstPostAwarded = !!res?.awarded;
    } catch (err) {
      await t.query('ROLLBACK TO SAVEPOINT first_post_bonus');
      console.error('[posts] first-post bonus failed', { userId, postId: post.id, err: err.message });
    }

    await track(
      EVENT.post_created,
      { userId, props: { postId: post.id, mediaType, challengeId, generationId, petId, firstPostAwarded } },
      t,
    );
    if (challengeId) {
      await track(EVENT.challenge_entered, { userId, props: { postId: post.id, challengeId } }, t);
    }

    await onReferredConversion(userId, 'creation', t); // isolates its own failures (savepoint)

    console.log('[posts] created', { postId: post.id, userId, challengeId, firstPostAwarded });
    return camelize(post);
  };

  return tx ? run(tx) : withTransaction(run);
}

/* ------------------------------------------------------------------------------------------------
 * Feed
 * ---------------------------------------------------------------------------------------------- */

export function encodeCursor(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

export function decodeCursor(cursor) {
  if (!cursor) return null;
  // Plain numeric cursor = post id (works for following/challenge pagination).
  if (/^\d+$/.test(String(cursor))) return { id: Number(cursor) };
  try {
    const obj = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    return obj && typeof obj === 'object' ? obj : null;
  } catch {
    throw badRequest('Invalid cursor');
  }
}

/**
 * Build the feed. Public, not hidden, authors active, excluding anyone the viewer blocked or who
 * blocked the viewer.
 *  - following: posts by followees + own, newest first, cursor = id
 *  - discover:  ranked by recency with a like boost (like_count+1)/(hours+2)^1.5, computed in SQL.
 *               The cursor pins the reference time so scores are deterministic across pages,
 *               giving a stable keyset on (score, id).
 *  - challenge: entries of one challenge, most liked first, keyset (like_count, id)
 */
export async function listFeed({ viewerId = null, mode = 'discover', challengeId = null, cursor = null, limit = DEFAULT_FEED_LIMIT } = {}) {
  const lim = Math.min(MAX_FEED_LIMIT, Math.max(1, Number(limit) || DEFAULT_FEED_LIMIT));
  if (!['following', 'discover', 'challenge'].includes(mode)) throw badRequest('mode must be following, discover or challenge');
  if (mode === 'following' && !viewerId) throw badRequest('Sign in to see your following feed');
  if (mode === 'challenge' && !challengeId) throw badRequest('challengeId is required for the challenge feed');

  const cur = decodeCursor(cursor) || {};
  const params = [viewerId];
  const p = (v) => {
    params.push(v);
    return `$${params.length}`;
  };

  const where = [
    `p.is_hidden = false`,
    `p.visibility = 'public'`,
    `u.status = 'active'`,
    `NOT EXISTS (SELECT 1 FROM blocks b WHERE ($1::int IS NOT NULL) AND
        ((b.blocker_id = $1 AND b.blocked_id = p.user_id) OR (b.blocker_id = p.user_id AND b.blocked_id = $1)))`,
  ];

  let select = `${POST_COLUMNS}, ${likedByViewerSql('$1')}`;
  let orderBy = 'p.id DESC';
  let nextCursorFor;

  if (mode === 'following') {
    where.push(`(p.user_id = $1 OR p.user_id IN (SELECT followee_id FROM follows WHERE follower_id = $1))`);
    if (cur.id) where.push(`p.id < ${p(cur.id)}`);
    nextCursorFor = (row) => encodeCursor({ id: row.id });
  } else if (mode === 'challenge') {
    where.push(`p.challenge_id = ${p(challengeId)}`);
    if (cur.id !== undefined && cur.l !== undefined) {
      where.push(`(p.like_count, p.id) < (${p(cur.l)}, ${p(cur.id)})`);
    }
    orderBy = 'p.like_count DESC, p.id DESC';
    nextCursorFor = (row) => encodeCursor({ l: row.like_count, id: row.id });
  } else {
    const ref = cur.t ? new Date(cur.t) : new Date();
    if (Number.isNaN(ref.getTime())) throw badRequest('Invalid cursor');
    const refParam = p(ref.toISOString());
    const scoreSql = `((p.like_count + 1)::double precision /
        power(GREATEST(EXTRACT(EPOCH FROM (${refParam}::timestamptz - p.created_at)) / 3600.0, 0) + 2, 1.5))`;
    select += `, ${scoreSql} AS score`;
    if (cur.s !== undefined && cur.id !== undefined) {
      where.push(`(${scoreSql}, p.id) < (${p(Number(cur.s))}::double precision, ${p(cur.id)})`);
    }
    orderBy = 'score DESC, p.id DESC';
    const t = ref.toISOString();
    nextCursorFor = (row) => encodeCursor({ t, s: Number(row.score), id: row.id });
  }

  const sql = `SELECT ${select} ${POST_JOINS} WHERE ${where.join(' AND ')} ORDER BY ${orderBy} LIMIT ${lim + 1}`;
  const rows = await many(sql, params);
  const hasMore = rows.length > lim;
  const page = hasMore ? rows.slice(0, lim) : rows;
  return {
    posts: page.map(serializePost),
    nextCursor: hasMore ? nextCursorFor(page[page.length - 1]) : null,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Single post
 * ---------------------------------------------------------------------------------------------- */

/** Full post row for an API response (null when missing). Does not filter hidden posts. */
export async function getPostById(id, viewerId = null) {
  const row = await one(
    `SELECT ${POST_COLUMNS}, ${likedByViewerSql('$2')} ${POST_JOINS} WHERE p.id = $1`,
    [id, viewerId],
  );
  return row ? serializePost(row) : null;
}

/** True when `viewerId` may see `post` (owner/admin always can; others only public, visible posts). */
export function canView(post, viewer) {
  if (!post) return false;
  if (viewer && (viewer.role === 'admin' || viewer.userId === post.userId)) return true;
  return !post.isHidden && post.visibility === 'public';
}

/** Blocks either way between two users. */
export async function isBlockedEitherWay(a, b, tx) {
  if (!a || !b || a === b) return false;
  const row = await (tx || { one }).one(
    `SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1`,
    [a, b],
  );
  return !!row;
}

export async function listComments(postId, { cursor = null, limit = 20 } = {}) {
  const lim = Math.min(50, Math.max(1, Number(limit) || 20));
  const params = [postId];
  let after = '';
  if (cursor) {
    const c = Number(cursor);
    if (!Number.isInteger(c)) throw badRequest('Invalid cursor');
    params.push(c);
    after = `AND pc.id > $2`;
  }
  const rows = await many(
    `SELECT pc.id, pc.post_id, pc.user_id, pc.body, pc.created_at,
            u.handle AS author_handle, u.display_name AS author_display_name, u.avatar_url AS author_avatar_url
       FROM post_comments pc JOIN users u ON u.id = pc.user_id
      WHERE pc.post_id = $1 AND pc.is_hidden = false ${after}
      ORDER BY pc.id ASC LIMIT ${lim + 1}`,
    params,
  );
  const hasMore = rows.length > lim;
  const page = hasMore ? rows.slice(0, lim) : rows;
  return { comments: page.map(serializeComment), nextCursor: hasMore ? String(page[page.length - 1].id) : null };
}

/** Landing page payload: `{ post, user, pet }` or null when missing, hidden or not public. */
export async function getPostForLanding(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return null;
  const row = await one(
    `SELECT p.*, u.id AS u_id, u.handle AS u_handle, u.display_name AS u_display_name, u.avatar_url AS u_avatar_url,
            pe.id AS pe_id, pe.name AS pe_name, pe.species AS pe_species, pe.breed AS pe_breed
       FROM posts p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN pets pe ON pe.id = p.pet_id
      WHERE p.id = $1 AND p.is_hidden = false AND p.visibility = 'public' AND u.status = 'active'`,
    [n],
  );
  if (!row) return null;
  const { u_id, u_handle, u_display_name, u_avatar_url, pe_id, pe_name, pe_species, pe_breed, ...post } = row;
  return {
    post: camelize(post),
    user: { id: u_id, handle: u_handle, displayName: u_display_name, avatarUrl: u_avatar_url },
    pet: pe_id ? { id: pe_id, name: pe_name, species: pe_species, breed: pe_breed } : null,
  };
}

/** Throw 404 unless the post exists. Returns the serialized post. */
export async function requirePost(id, viewerId = null) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw notFound('Post not found');
  const post = await getPostById(n, viewerId);
  if (!post) throw notFound('Post not found');
  return post;
}

