// Upload: POST /api/upload → signed Cloudinary params (or mock); POST /api/upload/mock (dev only)
import crypto from 'node:crypto';
import { route, segments, body, badRequest, notFound } from '../lib/http.js';
import { env } from '../lib/env.js';
import { requireAuth } from '../lib/auth.js';
import * as media from '../lib/media.js';

export const config = { api: { bodyParser: { sizeLimit: '25mb' } } };

const MAX_MOCK_BYTES = 20 * 1024 * 1024;
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

/** Dev-only stand-in for Cloudinary: echoes a data URL back as the "hosted" url. */
async function mockUpload(req) {
  if (env.isProd) throw notFound();
  await requireAuth(req);
  const b = body(req);
  const dataUrl = typeof b.dataUrl === 'string' ? b.dataUrl.trim() : '';
  if (!dataUrl) throw badRequest('dataUrl is required');
  if (dataUrl.length > MAX_MOCK_BYTES) throw badRequest('File too large for the mock uploader');
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
