// Upload: POST /api/upload → signed Cloudinary params (or mock); POST /api/upload/mock (mock mode)
import crypto from 'node:crypto';
import { route, segments, body, badRequest, notFound, payloadTooLarge } from '../lib/http.js';
import { requireAuth } from '../lib/auth.js';
import * as media from '../lib/media.js';

export const config = { api: { bodyParser: { sizeLimit: '25mb' } } };

const DATA_URL_RE = /^data:(image|video)\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+$/;

async function sign(req) {
  const { userId } = await requireAuth(req);
  const b = body(req);
  const kind = b.kind === 'video' ? 'video' : b.kind === 'image' || b.kind === undefined ? 'image' : null;
  if (!kind) throw badRequest('kind must be "image" or "video"');
  const sub = typeof b.folder === 'string' ? b.folder.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) : '';
  const folder = `pawtella/users/${userId}${sub ? `/${sub}` : ''}`;
  const params = media.signUpload({ folder, resourceType: kind });
  return { ...params, kind, isMock: media.isMock };
}

/**
 * Stand-in for Cloudinary when it is not configured: echoes a data URL back as the "hosted" url.
 * Available whenever media runs in mock mode (including production, where it is the only way to
 * save an uploaded photo); a 404 when Cloudinary IS configured, so the real signed-upload path wins.
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
  return { url: dataUrl, secureUrl: dataUrl, publicId, resourceType, mock: true };
}

export default route({
  POST: async (req) => {
    const [first, ...rest] = segments(req, '/api/upload');
    if (!first) return sign(req);
    if (first === 'mock' && !rest.length) return mockUpload(req);
    throw notFound();
  },
});
