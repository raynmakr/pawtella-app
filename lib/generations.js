// AI generations: validation, pricing, the charge-and-create transaction, provider calls and
// finalisation (persist output, watermark, refund on failure). Shared by api/ai/generate.js and
// api/cron/finalize-generations.js. Owner: Backend B.
import { one, many, withTransaction, query } from './db.js';
import { badRequest, notFound, tooMany } from './http.js';
import { camelize } from './serialize.js';
import { env } from './env.js';
import { track, EVENT } from './events.js';
import * as xai from './xai.js';
import * as media from './media.js';
import * as referrals from './referrals.js';
import * as notifications from './notifications.js';
import { RULES, generationCost, nearestDuration, allowedDurations } from './points-rules.js';
import { spendPoints, refundGeneration } from './points.js';
import { getPreset, renderPrompt } from './ai-presets.js';

export const KINDS = ['image', 'video'];
const MAX_PROMPT = 1000;

export function toApiGeneration(row) {
  if (!row) return null;
  const g = camelize(row);
  delete g.providerOutputUrl; // temporary provider URL: never needed by clients
  return g;
}

/** Normalise and validate the POST /api/ai/generate body. Returns the fields of the row to create. */
export async function prepareInput(userId, b = {}) {
  const kind = String(b.kind || '').toLowerCase();
  if (!KINDS.includes(kind)) throw badRequest('kind must be "image" or "video"');
  const hd = b.hd === true || b.hd === 'true';

  let preset = null;
  if (b.presetId) {
    preset = getPreset(String(b.presetId));
    if (!preset) throw badRequest('Unknown presetId');
    if (preset.kind !== 'both' && preset.kind !== kind) throw badRequest(`Preset "${preset.id}" is for ${preset.kind} only`);
  }

  let pet = null;
  if (b.petId !== undefined && b.petId !== null && b.petId !== '') {
    pet = await one('SELECT * FROM pets WHERE id = $1 AND user_id = $2', [parseInt(b.petId, 10) || 0, userId]);
    if (!pet) throw notFound('Pet not found');
  } else {
    pet = await one('SELECT * FROM pets WHERE user_id = $1 ORDER BY is_primary DESC, id ASC LIMIT 1', [userId]);
  }

  let prompt = typeof b.prompt === 'string' ? b.prompt.trim() : '';
  if (preset) prompt = prompt ? `${renderPrompt(preset.prompt, pet)}. ${prompt}` : renderPrompt(preset.prompt, pet);
  if (!prompt) throw badRequest('prompt or presetId is required');
  if (prompt.length > MAX_PROMPT) throw badRequest(`prompt is too long (max ${MAX_PROMPT} characters)`);

  let sourceImageUrl = typeof b.sourceImageUrl === 'string' && b.sourceImageUrl.trim() ? b.sourceImageUrl.trim() : null;
  if (sourceImageUrl && !/^(https?:\/\/|data:image\/)/i.test(sourceImageUrl)) throw badRequest('sourceImageUrl must be an http(s) URL or a data URL');
  if (kind === 'video' && !sourceImageUrl) {
    // Image-to-video is the product; text-to-video only through presets that explicitly allow it.
    if (!preset || preset.kind !== 'video') throw badRequest('sourceImageUrl is required for video (image-to-video)');
  }
  if (kind === 'video' && !sourceImageUrl && pet?.photo_url) sourceImageUrl = pet.photo_url;

  let duration = null;
  if (kind === 'video') {
    const requested = b.duration !== undefined && b.duration !== null && b.duration !== '' ? Number(b.duration) : preset?.suggestedDuration ?? 6;
    if (!Number.isFinite(requested) || requested <= 0) throw badRequest(`duration must be one of ${allowedDurations.join(', ')} seconds`);
    duration = nearestDuration(requested);
  }

  const aspectRatio = typeof b.aspectRatio === 'string' && xai.ASPECT_RATIOS.includes(b.aspectRatio) ? b.aspectRatio : preset?.aspectRatio || (kind === 'video' ? '9:16' : '1:1');
  const resolution = kind === 'image' ? (hd ? '2k' : '1k') : hd ? '1080p' : '720p';
  const model = kind === 'image' ? env.xai.imageModel : hd ? env.xai.videoModelHd : env.xai.videoModel;

  let challengeId = null;
  if (b.challengeId !== undefined && b.challengeId !== null && b.challengeId !== '') {
    const ch = await one(`SELECT id FROM challenges WHERE id = $1 AND status IN ('active', 'scheduled')`, [parseInt(b.challengeId, 10) || 0]);
    if (!ch) throw badRequest('Challenge not found or closed');
    challengeId = ch.id;
  }

  const cost = generationCost({ kind, duration, hd });
  return { kind, hd, preset, pet, prompt, sourceImageUrl, duration, aspectRatio, resolution, model, challengeId, cost };
}

/** Enforce the per-user daily cap (failed generations don't count). */
async function assertDailyCap(tx, userId) {
  const row = await tx.one(
    `SELECT count(*)::int AS n FROM ai_generations WHERE user_id = $1 AND created_at > now() - interval '24 hours' AND status <> 'failed'`,
    [userId],
  );
  if (row.n >= RULES.dailyGenerationCap) {
    throw tooMany(`Daily limit of ${RULES.dailyGenerationCap} creations reached. Try again tomorrow.`);
  }
}

/**
 * Charge points and create the generation row in ONE transaction, then call xAI.
 * Images complete synchronously; videos return in status 'running'.
 */
export async function createGeneration(userId, input) {
  const p = await prepareInput(userId, input);

  const gen = await withTransaction(async (tx) => {
    await assertDailyCap(tx, userId);
    const row = await tx.one(
      `INSERT INTO ai_generations (user_id, pet_id, kind, provider, model, prompt, preset_id, source_image_url, duration_seconds,
                                   resolution, aspect_ratio, hd, status, points_charged, challenge_id, started_at)
       VALUES ($1, $2, $3, 'xai', $4, $5, $6, $7, $8, $9, $10, $11, 'queued', $12, $13, now()) RETURNING *`,
      [userId, p.pet?.id ?? null, p.kind, p.model, p.prompt, p.preset?.id ?? null, p.sourceImageUrl, p.duration, p.resolution, p.aspectRatio, p.hd, p.cost, p.challengeId],
    );
    await spendPoints(userId, p.cost, {
      source: p.kind === 'video' ? 'ai_video' : 'ai_image',
      refType: 'generation',
      refId: row.id,
      description: `${p.kind === 'video' ? `${p.duration}s video` : 'Image'} creation${p.hd ? ' (HD)' : ''}`,
    }, tx);
    await track(EVENT.generation_started, { userId, props: { generationId: row.id, kind: p.kind, hd: p.hd, duration: p.duration, presetId: p.preset?.id ?? null, cost: p.cost } }, tx);
    return row;
  });
  console.log('[ai] generation created', { id: gen.id, userId, kind: gen.kind, cost: p.cost });

  try {
    if (p.kind === 'image') {
      const out = await xai.generateImage({ prompt: p.prompt, aspectRatio: p.aspectRatio, resolution: p.resolution, model: p.model });
      return await finalizeDone(gen, { url: out.url, costUsdTicks: out.costUsdTicks });
    }
    const started = await xai.startVideo({
      prompt: p.prompt,
      imageUrl: p.sourceImageUrl || undefined,
      duration: p.duration,
      resolution: p.resolution,
      aspectRatio: p.aspectRatio,
      model: p.model,
    });
    return await one(
      `UPDATE ai_generations SET status = 'running', provider_request_id = $2, progress = 1 WHERE id = $1 RETURNING *`,
      [gen.id, started.requestId],
    );
  } catch (err) {
    console.error('[ai] provider call failed', { id: gen.id, error: err.message });
    return failGeneration(gen, err.message || 'Provider error');
  }
}

/** Persist the provider output, derive watermark/thumbnail, mark done, fire side effects. */
export async function finalizeDone(gen, { url, costUsdTicks, durationSeconds } = {}) {
  const kind = gen.kind === 'video' ? 'video' : 'image';
  let outputUrl = url;
  let watermarked = url;
  let thumbnail = null;
  try {
    const up = await media.storeFromUrl(url, { kind });
    outputUrl = up.url || url;
    thumbnail = up.thumbnailUrl || null;
    watermarked = outputUrl; // no dynamic overlay CDN anymore; share the processed output
  } catch (err) {
    console.error('[ai] media persist failed, keeping provider URL', { id: gen.id, error: err.message });
  }
  const row = await one(
    `UPDATE ai_generations
        SET status = 'done', progress = 100, provider_output_url = $2, output_url = $3, watermarked_url = $4, thumbnail_url = $5,
            cost_usd_ticks = COALESCE($6, cost_usd_ticks), duration_seconds = COALESCE($7, duration_seconds), finished_at = now(), error = NULL
      WHERE id = $1 RETURNING *`,
    [gen.id, url, outputUrl, watermarked, thumbnail, costUsdTicks ?? null, durationSeconds ? Math.round(durationSeconds) : null],
  );
  await track(EVENT.generation_done, { userId: gen.user_id, props: { generationId: gen.id, kind: gen.kind, costUsdTicks: costUsdTicks ?? null } });
  try {
    await query('UPDATE users SET bonus_first_creation = true WHERE id = $1 AND bonus_first_creation = false', [gen.user_id]);
    if (typeof referrals.onReferredConversion === 'function') await referrals.onReferredConversion(gen.user_id, 'creation');
  } catch (err) {
    console.error('[ai] referral conversion failed', { id: gen.id, error: err.message });
  }
  try {
    if (typeof notifications.notify === 'function') {
      await notifications.notify({
        userId: gen.user_id,
        journey: 'generation_ready',
        channel: 'inapp',
        dedupeKey: `generation_ready:generation:${gen.id}`,
        title: gen.kind === 'video' ? 'Your video is ready!' : 'Your image is ready!',
        body: 'Tap to see your creation and share it to the feed.',
        payload: { generationId: gen.id, deepLink: `${env.appScheme}://studio/${gen.id}` },
      });
    }
  } catch (err) {
    console.error('[ai] notify failed', { id: gen.id, error: err.message });
  }
  console.log('[ai] generation done', { id: gen.id });
  return row;
}

/** Mark failed and refund whatever was charged. */
export async function failGeneration(gen, errorMessage) {
  const row = await withTransaction(async (tx) => {
    const r = await tx.one(
      `UPDATE ai_generations SET status = 'failed', error = $2, finished_at = now() WHERE id = $1 RETURNING *`,
      [gen.id, String(errorMessage || 'Generation failed').slice(0, 500)],
    );
    const refunded = await refundGeneration(gen.id, tx);
    await track(EVENT.generation_failed, { userId: gen.user_id, props: { generationId: gen.id, kind: gen.kind, error: String(errorMessage).slice(0, 200), refunded } }, tx);
    return { ...r, points_refunded: r.points_refunded + refunded };
  });
  console.log('[ai] generation failed + refunded', { id: gen.id, refunded: row.points_refunded });
  return row;
}

/** If the generation is still in flight, ask the provider and update/finalize. Returns the current row. */
export async function pollGeneration(gen) {
  if (!gen || !['queued', 'running'].includes(gen.status)) return gen;
  if (!gen.provider_request_id) return gen; // image still being created by another request, or orphan handled by the cron
  let status;
  try {
    status = await xai.getVideo(gen.provider_request_id);
  } catch (err) {
    console.error('[ai] poll failed', { id: gen.id, error: err.message });
    return gen;
  }
  if (status.status === 'done' && status.url) {
    return finalizeDone(gen, { url: status.url, costUsdTicks: status.costUsdTicks, durationSeconds: status.durationSeconds });
  }
  if (status.status === 'failed') {
    return failGeneration(gen, status.error?.message || status.error?.code || 'Provider reported failure');
  }
  const progress = Math.max(gen.progress || 0, Math.min(99, Number(status.progress) || 0));
  return one(`UPDATE ai_generations SET status = 'running', progress = $2 WHERE id = $1 RETURNING *`, [gen.id, progress]);
}

/**
 * Cron: finish in-flight jobs the client stopped polling (older than `minAgeMs`) and fail + refund
 * anything that has been running longer than `timeoutMs`.
 */
export async function finalizeStale({ minAgeMs = 60_000, timeoutMs = 30 * 60_000 } = {}) {
  const rows = await many(
    `SELECT * FROM ai_generations WHERE status IN ('queued', 'running') AND created_at < now() - ($1::int * interval '1 millisecond') ORDER BY id`,
    [minAgeMs],
  );
  const summary = { checked: rows.length, done: 0, failed: 0, timedOut: 0, running: 0 };
  for (const gen of rows) {
    try {
      const age = Date.now() - new Date(gen.started_at || gen.created_at).getTime();
      if (age > timeoutMs) {
        await failGeneration(gen, 'Timed out waiting for the provider');
        summary.timedOut++;
        continue;
      }
      if (!gen.provider_request_id) {
        // Image whose provider call died with the process: nothing to poll.
        await failGeneration(gen, 'Generation was interrupted');
        summary.failed++;
        continue;
      }
      const updated = await pollGeneration(gen);
      if (updated.status === 'done') summary.done++;
      else if (updated.status === 'failed') summary.failed++;
      else summary.running++;
    } catch (err) {
      console.error('[ai] finalizeStale failed for generation', { id: gen.id, error: err.message });
    }
  }
  return summary;
}
