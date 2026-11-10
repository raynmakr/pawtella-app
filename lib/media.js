// Media orchestration: issues presigned uploads to Neon Object Storage and processes what lands
// there (sharp for photos, ffmpeg for videos). Mock mode (no MEDIA_S3_* keys) never touches the
// network or a provider binary — the dev/test uploader echoes a data URL back instead, so the app
// and the test suite run with zero configuration. Replaces the old Cloudinary wrapper.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { env } from './env.js';
import * as storage from './storage.js';

// sharp and ffmpeg-static (and their large native binaries) are loaded lazily so that lightweight
// callers of this module — api/pets.js and api/users.js only need MOCK_UPLOAD_MAX_BYTES — don't drag
// them into every serverless bundle. They load only inside the functions that actually process media.
const loadImages = () => import('./images.js');
const loadVideo = () => import('./video.js');

export const isMock = !storage.isConfigured;

// Mock mode stores an uploaded photo inline as a data URL in a TEXT column; cap it so one asset
// can never bloat a row or an API response. Real uploads go to object storage and are never inlined.
export const MOCK_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;

// Upload policy lives here (not in the processing modules) so it is readable without loading sharp/ffmpeg.
export const IMAGE_MAX_BYTES = 15 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024;
export const VIDEO_MAX_SECONDS = 60;

export const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']);
export const ALLOWED_VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);

if (isMock) console.log('[media] object storage not configured: running in mock mode');

export function maxBytesFor(kind) {
  return kind === 'video' ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
}

/** Validate a requested upload. Returns a normalised { kind, contentType } or throws a plain Error. */
export function validateUpload({ kind, contentType, size } = {}) {
  const k = kind === 'video' ? 'video' : 'image';
  const ct = String(contentType || '').toLowerCase().split(';')[0].trim();
  const allowed = k === 'video' ? ALLOWED_VIDEO_TYPES : ALLOWED_IMAGE_TYPES;
  if (!allowed.has(ct)) {
    const err = new Error(`Unsupported ${k} type "${ct || 'unknown'}"`);
    err.code = 'bad_type';
    throw err;
  }
  const max = maxBytesFor(k);
  if (size !== undefined && size !== null && Number(size) > max) {
    const err = new Error(`File is too large (max ${Math.round(max / 1024 / 1024)} MB)`);
    err.code = 'too_large';
    throw err;
  }
  return { kind: k, contentType: ct };
}

/**
 * Parameters a client needs to upload directly to storage via a presigned PUT.
 * Mock: points the client at the dev data-URL uploader instead.
 */
export async function presignUpload({ kind, contentType, size } = {}) {
  const { kind: k, contentType: ct } = validateUpload({ kind, contentType, size });
  if (isMock) {
    return { mock: true, isMock: true, kind: k, uploadUrl: `${env.appUrl}/api/upload/mock`, maxBytes: maxBytesFor(k) };
  }
  const key = storage.randomKey(storage.extForContentType(ct));
  const uploadUrl = await storage.presignPut(key, ct);
  return { mock: false, isMock: false, kind: k, key, uploadUrl, publicUrl: storage.publicUrl(key), contentType: ct, maxBytes: maxBytesFor(k) };
}

/** Process an already-uploaded original photo into WebP variants; returns the stored URLs. */
export async function completeImageUpload({ key, variant = 'feed' } = {}) {
  if (isMock) throw new Error('completeImageUpload called in mock mode');
  const original = await storage.getObject(key);
  if (original.length > IMAGE_MAX_BYTES) {
    await storage.deleteObject(key).catch(() => {});
    const err = new Error('Image is too large');
    err.code = 'too_large';
    throw err;
  }
  const { processImage } = await loadImages();
  const { variants } = await processImage(original, { variant });
  const stored = {};
  for (const v of variants) {
    const vkey = storage.randomKey('webp');
    await storage.putObject(vkey, v.buffer, v.contentType);
    stored[v.name] = { url: storage.publicUrl(vkey), width: v.width, height: v.height };
  }
  await storage.deleteObject(key).catch(() => {}); // the original is no longer needed
  const primary = variants[0].name;
  const thumb = variants[1]?.name;
  return {
    url: stored[primary].url,
    thumbnailUrl: thumb ? stored[thumb].url : null,
    width: stored[primary].width,
    height: stored[primary].height,
  };
}

async function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawmedia-'));
  try {
    return await fn(dir);
  } finally {
    fs.rm(dir, { recursive: true, force: true }, () => {});
  }
}

/** Transcode an already-uploaded original video (by key) and write MP4 + poster back to storage. */
export async function processVideoKey(key) {
  if (isMock) throw new Error('processVideoKey called in mock mode');
  const original = await storage.getObject(key);
  if (original.length > VIDEO_MAX_BYTES) {
    await storage.deleteObject(key).catch(() => {});
    const err = new Error('Video is too large');
    err.code = 'too_large';
    throw err;
  }
  const { processVideo } = await loadVideo();
  return withTempDir(async (dir) => {
    const src = path.join(dir, 'src');
    fs.writeFileSync(src, original);
    const outMp4 = path.join(dir, 'out.mp4');
    const outPoster = path.join(dir, 'poster.jpg');
    const info = await processVideo(src, { outMp4, outPoster });
    const mp4Key = storage.randomKey('mp4');
    const posterKey = storage.randomKey('jpg');
    const [url] = await Promise.all([
      storage.putObject(mp4Key, fs.readFileSync(outMp4), 'video/mp4'),
      storage.putObject(posterKey, fs.readFileSync(outPoster), 'image/jpeg'),
    ]);
    await storage.deleteObject(key).catch(() => {});
    return { url, thumbnailUrl: storage.publicUrl(posterKey), width: info.width, height: info.height, duration: info.duration };
  });
}

/**
 * Copy a remote asset (e.g. a temporary AI-provider URL) into storage, processing it on the way.
 * Mock: echoes the URL back so generations still work without storage configured.
 */
export async function storeFromUrl(url, { kind = 'image', variant = 'feed' } = {}) {
  if (isMock) return { url, thumbnailUrl: url, width: null, height: null, duration: kind === 'video' ? null : undefined };
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch source media (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  return storeBuffer(buf, { kind, variant });
}

/**
 * Presigned PUT destination for a provider-rendered video (xAI `output.upload_url`, required when the
 * xAI team has Zero Data Retention). Returns { key, uploadUrl, publicUrl }, or null in mock mode.
 */
export async function presignProviderVideoUpload({ expiresIn } = {}) {
  if (isMock) return null;
  const key = storage.randomKey('mp4');
  const uploadUrl = await storage.presignProviderPut(key, expiresIn ? { expiresIn } : undefined);
  return { key, uploadUrl, publicUrl: storage.publicUrl(key) };
}

/** Storage key for one of our public URLs (null for foreign URLs or in mock mode). */
export function keyFromUrl(url) {
  return isMock ? null : storage.keyFromUrl(url);
}

/**
 * Process an object a provider uploaded straight into our storage (e.g. an xAI ZDR video): store the
 * processed copy with proper headers + poster, then delete the raw upload. Throws err.code='missing'
 * when the object is not there (the provider's PUT never landed).
 */
export async function storeFromKey(key, { kind = 'video', variant = 'feed' } = {}) {
  if (isMock) throw new Error('storeFromKey called in mock mode');
  let buf;
  try {
    buf = await storage.getObject(key);
  } catch (err) {
    if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) {
      const e = new Error('Provider upload not found in storage');
      e.code = 'missing';
      throw e;
    }
    throw err;
  }
  if (!buf.length) {
    const e = new Error('Provider upload is empty');
    e.code = 'missing';
    throw e;
  }
  const out = await storeBuffer(buf, { kind, variant });
  await storage.deleteObject(key).catch(() => {});
  return out;
}

/** Store raw media bytes (a provider output) — video copied verbatim + poster; images → WebP variants. */
export async function storeBuffer(buf, { kind = 'image', variant = 'feed' } = {}) {
  if (isMock) throw new Error('storeBuffer called in mock mode');
  if (kind === 'video') {
    // AI provider videos are already web-friendly MP4 — copy verbatim (keeping the quality the user
    // paid for) and just extract a poster, rather than re-encoding and downscaling.
    const { extractPoster } = await loadVideo();
    return withTempDir(async (dir) => {
      const src = path.join(dir, 'src');
      fs.writeFileSync(src, buf);
      const outPoster = path.join(dir, 'poster.jpg');
      const info = await extractPoster(src, outPoster);
      const mp4Key = storage.randomKey('mp4');
      const posterKey = storage.randomKey('jpg');
      const [out] = await Promise.all([
        storage.putObject(mp4Key, buf, 'video/mp4'),
        storage.putObject(posterKey, fs.readFileSync(outPoster), 'image/jpeg'),
      ]);
      return { url: out, thumbnailUrl: storage.publicUrl(posterKey), width: info.width, height: info.height, duration: info.duration };
    });
  }
  const { processImage } = await loadImages();
  const { variants } = await processImage(buf, { variant });
  const stored = {};
  for (const v of variants) {
    const vkey = storage.randomKey('webp');
    await storage.putObject(vkey, v.buffer, v.contentType);
    stored[v.name] = { url: storage.publicUrl(vkey), width: v.width, height: v.height };
  }
  const primary = variants[0];
  const thumb = variants[1];
  return { url: stored[primary.name].url, thumbnailUrl: thumb ? stored[thumb.name].url : null, width: primary.width, height: primary.height };
}

/** Delete an asset by its public URL or raw key. No-op in mock mode or for foreign URLs. */
export async function deleteAsset(urlOrKey) {
  if (isMock || !urlOrKey) return { ok: true, mock: isMock };
  const key = storage.keyFromUrl(urlOrKey) || (urlOrKey.includes('://') ? null : urlOrKey);
  if (!key) return { ok: false, reason: 'not-ours' };
  await storage.deleteObject(key);
  return { ok: true };
}

export default {
  isMock,
  MOCK_UPLOAD_MAX_BYTES,
  IMAGE_MAX_BYTES,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_SECONDS,
  presignUpload,
  completeImageUpload,
  processVideoKey,
  storeFromUrl,
  storeFromKey,
  storeBuffer,
  presignProviderVideoUpload,
  keyFromUrl,
  deleteAsset,
  validateUpload,
  maxBytesFor,
};
