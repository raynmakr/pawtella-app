// Upload:
//   POST /api/upload           → presigned PUT to object storage (or a mock descriptor)
//   POST /api/upload/complete  → process an uploaded photo into WebP variants, return their URLs
//   POST /api/upload/mock      → dev/test fallback: echo a data URL back as the "hosted" url
// Videos skip /complete: the client posts the original key with the post and a cron transcodes it.
import crypto from 'node:crypto';
import { route, segments, body, badRequest, notFound, payloadTooLarge } from '../lib/http.js';
import { requireAuth } from '../lib/auth.js';
import * as media from '../lib/media.js';

// Tiny body: presign requests and data-URL fallback. Real bytes go straight to storage, not here.
export const config = { api: { bodyParser: { sizeLimit: '3mb' } } };

const DATA_URL_RE = /^data:(image|video)\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+$/;

async function presign(req) {
  await requireAuth(req);
  const b = body(req);
  const kind = b.kind === 'video' ? 'video' : b.kind === 'image' || b.kind === undefined ? 'image' : null;
  if (!kind) throw badRequest('kind must be "image" or "video"');
  try {
    const params = await media.presignUpload({ kind, contentType: b.contentType, size: b.size });
    return params;
  } catch (err) {
    if (err.code === 'too_large') throw payloadTooLarge(err.message);
    if (err.code === 'bad_type') throw badRequest(err.message);
    throw err;
  }
}

async function complete(req) {
  await requireAuth(req);
  if (media.isMock) throw notFound();
  const b = body(req);
  if (typeof b.key !== 'string' || !b.key) throw badRequest('key is required');
  const variant = b.variant === 'avatar' ? 'avatar' : 'feed';
  try {
    return await media.completeImageUpload({ key: b.key, variant });
  } catch (err) {
    if (err.code === 'too_large') throw payloadTooLarge(err.message);
    throw err;
  }
}

/**
 * Stand-in for object storage when it is not configured: echoes a data URL back as the "hosted"
 * url. A 404 once storage IS configured, so the real presigned-upload path wins.
 */
async function mockUpload(req) {
  if (!media.isMock) throw notFound();
  await requireAuth(req);
  const b = body(req);
  const dataUrl = typeof b.dataUrl === 'string' ? b.dataUrl.trim() : '';
  if (!dataUrl) throw badRequest('dataUrl is required');
  if (dataUrl.length > media.MOCK_UPLOAD_MAX_BYTES)
    throw payloadTooLarge('That image is too large (max 2 MB). Please choose a smaller photo.');
  if (!DATA_URL_RE.test(dataUrl)) throw badRequest('dataUrl must be a base64 image/video data URL');
  const resourceType = dataUrl.startsWith('data:video/') ? 'video' : 'image';
  const publicId = `mock/${crypto.randomBytes(8).toString('hex')}`;
  return { url: dataUrl, secureUrl: dataUrl, thumbnailUrl: dataUrl, publicId, resourceType, mock: true };
}

export default route({
  POST: async (req) => {
    const [first, ...rest] = segments(req, '/api/upload');
    if (!first) return presign(req);
    if (first === 'complete' && !rest.length) return complete(req);
    if (first === 'mock' && !rest.length) return mockUpload(req);
    throw notFound();
  },
});
