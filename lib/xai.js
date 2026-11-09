// xAI Grok Imagine client (images + image-to-video / text-to-video). Plain fetch, Bearer auth.
// Mock mode when XAI_API_KEY is missing: placeholder images and a fake video job that completes
// about 10 seconds after it starts (or fails when the prompt contains "FAIL").
// Owner: Backend B. Contract in docs/CONVENTIONS.md.
//
// API facts (docs.x.ai):
//   POST /v1/images/generations  { model, prompt, n, response_format:'url', aspect_ratio, resolution }
//        → { data: [{ url }], usage: { cost_in_usd_ticks } }
//   POST /v1/videos/generations  { model, prompt?, image:{ url }, duration, resolution, aspect_ratio }
//        → { request_id }
//   GET  /v1/videos/{request_id} → { status:'pending'|'done'|'failed', progress, video:{ url, duration },
//                                    usage:{ cost_in_usd_ticks }, error:{ code, message } }
import { env, flags } from './env.js';

export const isMock = !flags.hasXai;
export const BASE_URL = 'https://api.x.ai/v1';

export const ASPECT_RATIOS = ['1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2'];
export const IMAGE_RESOLUTIONS = ['1k', '2k'];
export const VIDEO_RESOLUTIONS = ['480p', '720p', '1080p'];

if (isMock) console.log('[xai] XAI_API_KEY missing: running in mock mode');

export class XaiError extends Error {
  constructor(message, { status, code, body } = {}) {
    super(message);
    this.name = 'XaiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

async function request(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.xai.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(120_000),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.error?.message || data?.error || data?.message || `xAI ${method} ${path} failed (${res.status})`;
    console.error('[xai] request failed', { path, status: res.status, message: msg });
    throw new XaiError(typeof msg === 'string' ? msg : JSON.stringify(msg), { status: res.status, code: data?.error?.code, body: data });
  }
  return data;
}

function pick(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

// ------------------------------------------------------------------------------------------------
// Images
// ------------------------------------------------------------------------------------------------

/** Generate one image. Returns { url, costUsdTicks? } (the URL is temporary: persist it). */
export async function generateImage({ prompt, aspectRatio = '1:1', resolution = '1k', model } = {}) {
  if (!prompt) throw new Error('prompt is required');
  const ar = pick(aspectRatio, ASPECT_RATIOS, '1:1');
  const resn = pick(resolution, IMAGE_RESOLUTIONS, '1k');
  if (isMock) return mockImage({ prompt, aspectRatio: ar });
  const data = await request('POST', '/images/generations', {
    model: model || env.xai.imageModel,
    prompt,
    n: 1,
    response_format: 'url',
    aspect_ratio: ar,
    resolution: resn,
  });
  const url = data?.data?.[0]?.url;
  if (!url) throw new XaiError('xAI returned no image URL', { body: data });
  return { url, costUsdTicks: data?.usage?.cost_in_usd_ticks ?? null, model: model || env.xai.imageModel };
}

// ------------------------------------------------------------------------------------------------
// Videos
// ------------------------------------------------------------------------------------------------

/** Start a video job (image-to-video when imageUrl is given). Returns { requestId }. */
export async function startVideo({ prompt, imageUrl, duration = 8, resolution = '720p', aspectRatio, model } = {}) {
  if (!prompt && !imageUrl) throw new Error('prompt or imageUrl is required');
  const dur = Math.min(15, Math.max(1, Math.round(Number(duration) || 8)));
  const resn = pick(resolution, VIDEO_RESOLUTIONS, '720p');
  const useModel = model || env.xai.videoModel;
  if (isMock) return mockStartVideo({ prompt, duration: dur });
  const body = { model: useModel, duration: dur, resolution: resn };
  if (prompt) body.prompt = prompt;
  if (imageUrl) body.image = { url: imageUrl };
  if (aspectRatio) body.aspect_ratio = pick(aspectRatio, ASPECT_RATIOS, '9:16');
  const data = await request('POST', '/videos/generations', body);
  if (!data?.request_id) throw new XaiError('xAI returned no request_id', { body: data });
  return { requestId: data.request_id, model: useModel };
}

/** Poll a video job. Returns { status, progress, url?, durationSeconds?, costUsdTicks?, error? }. */
export async function getVideo(requestId) {
  if (!requestId) throw new Error('requestId is required');
  if (isMock || String(requestId).startsWith('mock-')) return mockGetVideo(requestId);
  const data = await request('GET', `/videos/${encodeURIComponent(requestId)}`);
  const status = ['pending', 'done', 'failed'].includes(data?.status) ? data.status : 'pending';
  return {
    status,
    progress: status === 'done' ? 100 : Math.max(0, Math.min(99, Number(data?.progress) || 0)),
    url: data?.video?.url ?? undefined,
    durationSeconds: data?.video?.duration ?? undefined,
    costUsdTicks: data?.usage?.cost_in_usd_ticks ?? undefined,
    error: data?.error ? { code: data.error.code, message: data.error.message } : undefined,
  };
}

// ------------------------------------------------------------------------------------------------
// Mock mode
// ------------------------------------------------------------------------------------------------

export const MOCK_VIDEO_URL = 'https://www.w3schools.com/html/mov_bbb.mp4';
export const MOCK_VIDEO_SECONDS = 10; // how long a mock job stays pending

function hash(s) {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

function mockImage({ prompt, aspectRatio }) {
  const [w, h] = { '1:1': [1024, 1024], '3:4': [768, 1024], '4:3': [1024, 768], '9:16': [720, 1280], '16:9': [1280, 720], '2:3': [683, 1024], '3:2': [1024, 683] }[aspectRatio] || [1024, 1024];
  const n = hash(prompt) % 1000;
  const url = /\bcat\b|kitten|feline/i.test(prompt)
    ? `https://cataas.com/cat?width=${w}&height=${h}&r=${n}`
    : `https://placedog.net/${w}/${h}?random=${n}`;
  console.log('[xai:mock] generateImage', { prompt: prompt.slice(0, 60), url });
  return { url, costUsdTicks: 0, model: 'mock-image' };
}

function mockStartVideo({ prompt, duration }) {
  const fail = /\bFAIL\b/.test(prompt || '');
  const requestId = `mock-${Date.now()}-${duration}${fail ? '-fail' : ''}`;
  console.log('[xai:mock] startVideo', { requestId, prompt: (prompt || '').slice(0, 60) });
  return { requestId, model: 'mock-video' };
}

function mockGetVideo(requestId) {
  const m = /^mock-(\d+)-(\d+)(-fail)?$/.exec(requestId);
  if (!m) return { status: 'failed', progress: 0, error: { code: 'not_found', message: 'Unknown mock request' } };
  const started = Number(m[1]);
  const duration = Number(m[2]);
  const elapsed = (Date.now() - started) / 1000;
  const ttl = process.env.XAI_MOCK_VIDEO_SECONDS ? Number(process.env.XAI_MOCK_VIDEO_SECONDS) : MOCK_VIDEO_SECONDS;
  if (elapsed < ttl) return { status: 'pending', progress: Math.min(99, Math.floor((elapsed / ttl) * 100)) };
  if (m[3]) return { status: 'failed', progress: 100, error: { code: 'mock_failure', message: 'Mock generation failed as requested' } };
  return { status: 'done', progress: 100, url: MOCK_VIDEO_URL, durationSeconds: duration, costUsdTicks: 0 };
}

export default { isMock, generateImage, startVideo, getVideo };
