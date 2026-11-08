// AI Studio: POST /api/ai/generate, GET /api/ai/generate (mine), GET /api/ai/generate/:id (polls the
// provider while pending), POST /api/ai/generate/:id/post (publish to the feed).
import { route, segments, body, badRequest, notFound, forbidden, pagination } from '../../lib/http.js';
import { one, many, query } from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { createGeneration, pollGeneration, toApiGeneration } from '../../lib/generations.js';
import { RULES, generationCost, allowedDurations } from '../../lib/points-rules.js';
import * as posts from '../../lib/posts.js';

async function loadOwned(id, userId) {
  const gen = await one('SELECT * FROM ai_generations WHERE id = $1', [parseInt(id, 10) || 0]);
  if (!gen) throw notFound('Generation not found');
  if (gen.user_id !== userId) throw forbidden();
  return gen;
}

export default route({
  GET: async (req) => {
    const { userId } = await requireAuth(req);
    const [id, sub] = segments(req, '/api/ai/generate');

    if (!id) {
      const { page, limit, offset } = pagination(req);
      const status = typeof req.query?.status === 'string' ? req.query.status : null;
      const rows = await many(
        `SELECT * FROM ai_generations WHERE user_id = $1 AND ($2::text IS NULL OR status = $2)
          ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
        [userId, status, limit + 1, offset],
      );
      return {
        generations: rows.slice(0, limit).map(toApiGeneration),
        page,
        hasMore: rows.length > limit,
        prices: { image: generationCost({ kind: 'image' }), video: Object.fromEntries(allowedDurations.map((d) => [d, generationCost({ kind: 'video', duration: d })])), hdMultiplier: RULES.prices.hdMultiplier },
      };
    }
    if (id === 'cost') {
      const kind = req.query?.kind || 'image';
      const hd = req.query?.hd === 'true' || req.query?.hd === '1';
      const duration = req.query?.duration ? Number(req.query.duration) : undefined;
      return { kind, hd, duration, cost: generationCost({ kind, duration, hd }) };
    }
    if (sub) throw notFound();
    let gen = await loadOwned(id, userId);
    gen = await pollGeneration(gen);
    return toApiGeneration(gen);
  },

  POST: async (req) => {
    const { userId } = await requireAuth(req);
    const [id, sub] = segments(req, '/api/ai/generate');
    const b = body(req);

    if (!id) {
      const gen = await createGeneration(userId, b);
      return toApiGeneration(gen);
    }

    if (sub === 'post') {
      const gen = await loadOwned(id, userId);
      if (gen.status !== 'done' || !gen.output_url) throw badRequest('Generation is not finished yet');
      if (gen.post_id) {
        const existing = typeof posts.getPostById === 'function' ? await posts.getPostById(gen.post_id, userId) : null;
        if (existing) return { post: existing, generation: toApiGeneration(gen), alreadyPosted: true };
      }
      const post = await posts.createPost(userId, {
        petId: gen.pet_id,
        generationId: gen.id,
        challengeId: b.challengeId ?? gen.challenge_id ?? null,
        caption: typeof b.caption === 'string' ? b.caption : null,
        mediaUrl: gen.output_url, // the feed shows the clean output; watermarked_url is for external shares
        mediaType: gen.kind,
        thumbnailUrl: gen.thumbnail_url,
        featureConsent: b.featureConsent === true,
        durationSeconds: gen.kind === 'video' ? gen.duration_seconds : null,
      });
      await query('UPDATE ai_generations SET post_id = $2 WHERE id = $1', [gen.id, post.id]);
      return { post, generation: toApiGeneration({ ...gen, post_id: post.id }) };
    }

    throw notFound();
  },
});
