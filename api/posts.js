// Social: feed, posts, likes, comments, share. Family /api/posts/* (vercel.json rewrite).
import { route, segments, body, badRequest, notFound, forbidden, intParam } from '../lib/http.js';
import { requireAuth, optionalAuth } from '../lib/auth.js';
import { one, withTransaction } from '../lib/db.js';
import { env } from '../lib/env.js';
import { track, EVENT } from '../lib/events.js';
import { getOrCreateReferralCode } from '../lib/referrals.js';
import {
  createPost,
  listFeed,
  listComments,
  requirePost,
  canView,
  isBlockedEitherWay,
  serializeComment,
  MAX_CAPTION,
  MEDIA_TYPES,
  DEFAULT_FEED_LIMIT,
  MAX_FEED_LIMIT,
} from '../lib/posts.js';

const BASE = '/api/posts';

function postId(seg) {
  const n = Number(seg);
  if (!Number.isInteger(n) || n <= 0) throw notFound('Post not found');
  return n;
}

/** Load a post the viewer is allowed to see (404 otherwise, also when blocked). */
async function visiblePost(id, viewer) {
  const post = await requirePost(id, viewer?.userId ?? null);
  if (!canView(post, viewer)) throw notFound('Post not found');
  if (viewer && viewer.role !== 'admin' && (await isBlockedEitherWay(viewer.userId, post.userId))) {
    throw notFound('Post not found');
  }
  return post;
}

/* ---------------------------------------- GET ---------------------------------------- */

async function GET(req) {
  const seg = segments(req, BASE);
  const viewer = await optionalAuth(req);

  if (seg.length === 0) {
    const mode = req.query.mode || 'discover';
    const challengeId = req.query.challengeId ? intParam(req.query.challengeId, null, { min: 1 }) : null;
    return listFeed({
      viewerId: viewer?.userId ?? null,
      mode,
      challengeId,
      cursor: req.query.cursor || null,
      limit: intParam(req.query.limit, DEFAULT_FEED_LIMIT, { min: 1, max: MAX_FEED_LIMIT }),
    });
  }

  const id = postId(seg[0]);

  if (seg.length === 1) {
    const post = await visiblePost(id, viewer);
    const { comments, nextCursor } = await listComments(id, { limit: 3 });
    return { post, comments, commentsNextCursor: nextCursor };
  }

  if (seg.length === 2 && seg[1] === 'comments') {
    await visiblePost(id, viewer);
    return listComments(id, {
      cursor: req.query.cursor || null,
      limit: intParam(req.query.limit, 20, { min: 1, max: 50 }),
    });
  }

  throw notFound();
}

/* ---------------------------------------- POST --------------------------------------- */

async function POST(req, res) {
  const seg = segments(req, BASE);
  const viewer = await requireAuth(req);
  const { userId } = viewer;

  // POST /api/posts
  if (seg.length === 0) {
    const b = body(req);
    const { mediaUrl, mediaType, thumbnailUrl, mediaKey, petId, generationId, challengeId, caption, featureConsent } = b;
    if (!mediaUrl || typeof mediaUrl !== 'string') throw badRequest('mediaUrl is required');
    if (!MEDIA_TYPES.includes(mediaType)) throw badRequest(`mediaType must be one of ${MEDIA_TYPES.join(', ')}`);
    if (caption !== undefined && caption !== null && (typeof caption !== 'string' || caption.length > MAX_CAPTION)) {
      throw badRequest(`caption must be a string of at most ${MAX_CAPTION} characters`);
    }
    let pet = null;
    if (petId !== undefined && petId !== null) {
      pet = await one(`SELECT id FROM pets WHERE id = $1 AND user_id = $2`, [petId, userId]);
      if (!pet) throw badRequest('petId does not belong to you');
    }
    if (generationId !== undefined && generationId !== null) {
      const gen = await one(`SELECT id FROM ai_generations WHERE id = $1 AND user_id = $2`, [generationId, userId]);
      if (!gen) throw badRequest('generationId does not belong to you');
    }
    // A user-uploaded video arrives as the raw original (with its storage key); mark it 'processing'
    // so the process-media cron transcodes it. The original plays in the feed until then.
    const willProcess = mediaType === 'video' && typeof mediaKey === 'string' && !!mediaKey;
    const created = await createPost(userId, {
      mediaUrl,
      mediaType,
      thumbnailUrl: thumbnailUrl || null,
      petId: pet ? pet.id : null,
      generationId: generationId ?? null,
      challengeId: challengeId ?? null,
      caption: caption ?? null,
      featureConsent: !!featureConsent,
      width: b.width ?? null,
      height: b.height ?? null,
      durationSeconds: b.durationSeconds ?? null,
      mediaStatus: willProcess ? 'processing' : 'ready',
      mediaKey: willProcess ? mediaKey : null,
    });
    const post = await requirePost(created.id, userId);
    res.status(201).json({ post });
    return;
  }

  const id = postId(seg[0]);

  // POST /api/posts/:id/like
  if (seg.length === 2 && seg[1] === 'like') {
    const post = await visiblePost(id, viewer);
    const likeCount = await withTransaction(async (tx) => {
      const ins = await tx.query(
        `INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [id, userId],
      );
      if (ins.rowCount === 1) {
        const row = await tx.one(`UPDATE posts SET like_count = like_count + 1 WHERE id = $1 RETURNING like_count`, [id]);
        await track(EVENT.post_liked, { userId, props: { postId: id, authorId: post.userId } }, tx);
        return row.like_count;
      }
      const row = await tx.one(`SELECT like_count FROM posts WHERE id = $1`, [id]);
      return row.like_count;
    });
    return { liked: true, likeCount };
  }

  // POST /api/posts/:id/comments
  if (seg.length === 2 && seg[1] === 'comments') {
    await visiblePost(id, viewer);
    const { body: text } = body(req);
    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (!trimmed) throw badRequest('body is required');
    if (trimmed.length > 1000) throw badRequest('body must be at most 1000 characters');
    const comment = await withTransaction(async (tx) => {
      const row = await tx.one(
        `INSERT INTO post_comments (post_id, user_id, body) VALUES ($1, $2, $3) RETURNING *`,
        [id, userId, trimmed],
      );
      await tx.query(`UPDATE posts SET comment_count = comment_count + 1 WHERE id = $1`, [id]);
      await track(EVENT.comment_created, { userId, props: { postId: id, commentId: row.id } }, tx);
      const author = await tx.one(`SELECT handle, display_name, avatar_url FROM users WHERE id = $1`, [userId]);
      return serializeComment({
        ...row,
        author_handle: author.handle,
        author_display_name: author.display_name,
        author_avatar_url: author.avatar_url,
      });
    });
    const { comment_count } = await one(`SELECT comment_count FROM posts WHERE id = $1`, [id]);
    res.status(201).json({ comment, commentCount: comment_count });
    return;
  }

  // POST /api/posts/:id/share
  if (seg.length === 2 && seg[1] === 'share') {
    const post = await visiblePost(id, viewer);
    const [code, row] = await Promise.all([
      getOrCreateReferralCode(userId),
      one(`UPDATE posts SET share_count = share_count + 1 WHERE id = $1 RETURNING share_count`, [id]),
    ]);
    await track(EVENT.share_clicked, { userId, props: { postId: id, authorId: post.userId, channel: body(req).channel ?? null } });
    const shareUrl = `${env.appUrl}/p/${id}${code ? `?ref=${encodeURIComponent(code)}` : ''}`;
    // Hand out a shareable media URL. For AI creations the generation keeps a dedicated share URL;
    // otherwise the processed post media (poster for videos, the image itself for photos) is used.
    const gen = post.generationId
      ? await one(`SELECT watermarked_url FROM ai_generations WHERE id = $1`, [post.generationId])
      : null;
    let wm = gen?.watermarked_url || (post.mediaType === 'video' ? post.thumbnailUrl : post.mediaUrl) || post.mediaUrl;
    // Only hand out real URLs (mock media may be an inline data URL).
    if (!wm || !/^https?:\/\//.test(wm)) wm = post.mediaUrl;
    return { shareUrl, watermarkedUrl: wm, shareCount: row.share_count };
  }

  throw notFound();
}

/* --------------------------------------- DELETE -------------------------------------- */

async function DELETE(req) {
  const seg = segments(req, BASE);
  const viewer = await requireAuth(req);
  const { userId, role } = viewer;
  const id = postId(seg[0]);

  // DELETE /api/posts/:id
  if (seg.length === 1) {
    const post = await requirePost(id, userId);
    if (post.userId !== userId && role !== 'admin') throw forbidden('Not your post');
    await withTransaction(async (tx) => {
      await tx.query(`UPDATE ai_generations SET post_id = NULL WHERE post_id = $1`, [id]);
      await tx.query(`DELETE FROM posts WHERE id = $1`, [id]);
    });
    console.log('[posts] deleted', { postId: id, by: userId });
    return { ok: true };
  }

  // DELETE /api/posts/:id/like
  if (seg.length === 2 && seg[1] === 'like') {
    await requirePost(id, userId);
    const likeCount = await withTransaction(async (tx) => {
      const del = await tx.query(`DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2`, [id, userId]);
      if (del.rowCount === 1) {
        const row = await tx.one(
          `UPDATE posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = $1 RETURNING like_count`,
          [id],
        );
        return row.like_count;
      }
      const row = await tx.one(`SELECT like_count FROM posts WHERE id = $1`, [id]);
      return row.like_count;
    });
    return { liked: false, likeCount };
  }

  // DELETE /api/posts/:id/comments/:cid
  if (seg.length === 3 && seg[1] === 'comments') {
    const cid = Number(seg[2]);
    if (!Number.isInteger(cid) || cid <= 0) throw notFound('Comment not found');
    const post = await requirePost(id, userId);
    const comment = await one(`SELECT id, user_id, is_hidden FROM post_comments WHERE id = $1 AND post_id = $2`, [cid, id]);
    if (!comment) throw notFound('Comment not found');
    if (comment.user_id !== userId && post.userId !== userId && role !== 'admin') throw forbidden('Not allowed');
    const commentCount = await withTransaction(async (tx) => {
      const del = await tx.query(`DELETE FROM post_comments WHERE id = $1`, [cid]);
      if (del.rowCount === 1 && !comment.is_hidden) {
        const row = await tx.one(
          `UPDATE posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = $1 RETURNING comment_count`,
          [id],
        );
        return row.comment_count;
      }
      const row = await tx.one(`SELECT comment_count FROM posts WHERE id = $1`, [id]);
      return row.comment_count;
    });
    return { ok: true, commentCount };
  }

  throw notFound();
}

export default route({ GET, POST, DELETE });
