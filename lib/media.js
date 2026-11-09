// Cloudinary wrapper. Mock mode (no CLOUDINARY_* keys) returns deterministic fake data and
// never touches the network.
import crypto from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { env, flags } from './env.js';

export const isMock = !flags.hasCloudinary;

if (!isMock) {
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
    secure: true,
  });
} else {
  console.log('[media] Cloudinary keys missing: running in mock mode');
}

const RESOURCE_TYPES = new Set(['image', 'video']);
function normaliseResourceType(t) {
  return RESOURCE_TYPES.has(t) ? t : 'image';
}
function sanitizeFolder(folder) {
  const f = String(folder || 'pawtella/uploads')
    .replace(/[^a-zA-Z0-9_\-/]/g, '')
    .replace(/\/+/g, '/')
    .replace(/^\/|\/$/g, '');
  return f || 'pawtella/uploads';
}
function fakeId(folder) {
  return `${sanitizeFolder(folder)}/${crypto.randomBytes(8).toString('hex')}`;
}
/** Sanitise a handle for use inside a Cloudinary text overlay (`l_text:` segment). */
function overlayText(handle) {
  const h = String(handle || 'pawtella').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20) || 'pawtella';
  return `@${h}`; // the SDK URL-encodes overlay text itself
}

/**
 * Parameters a client needs to upload directly to Cloudinary (signed upload).
 * Mock: `{ mock: true, uploadUrl: '<APP_URL>/api/upload/mock' }`.
 */
export function signUpload({ folder, resourceType = 'image' } = {}) {
  const rt = normaliseResourceType(resourceType);
  const f = sanitizeFolder(folder);
  if (isMock) {
    return {
      mock: true,
      cloudName: 'mock',
      apiKey: 'mock',
      timestamp: Math.floor(Date.now() / 1000),
      signature: 'mock',
      folder: f,
      resourceType: rt,
      uploadUrl: `${env.appUrl}/api/upload/mock`,
    };
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { timestamp, folder: f };
  const signature = cloudinary.utils.api_sign_request(params, env.cloudinary.apiSecret);
  return {
    mock: false,
    cloudName: env.cloudinary.cloudName,
    apiKey: env.cloudinary.apiKey,
    timestamp,
    signature,
    folder: f,
    resourceType: rt,
    uploadUrl: `https://api.cloudinary.com/v1_1/${env.cloudinary.cloudName}/${rt}/upload`,
  };
}

/** Server-side upload by URL (xAI outputs are temporary, so we copy them). */
export async function uploadFromUrl(url, { folder, resourceType = 'image', publicId } = {}) {
  const rt = normaliseResourceType(resourceType);
  const f = sanitizeFolder(folder);
  if (isMock) {
    const id = publicId ? `${f}/${publicId}` : fakeId(f);
    return {
      publicId: id,
      url,
      secureUrl: url,
      width: rt === 'video' ? 720 : 1024,
      height: rt === 'video' ? 1280 : 1024,
      duration: rt === 'video' ? 6 : undefined,
      format: rt === 'video' ? 'mp4' : 'jpg',
      mock: true,
    };
  }
  const opts = { folder: f, resource_type: rt, overwrite: true };
  if (publicId) opts.public_id = publicId;
  const result = await cloudinary.uploader.upload(url, opts);
  return {
    publicId: result.public_id,
    url: result.url,
    secureUrl: result.secure_url,
    width: result.width,
    height: result.height,
    duration: result.duration,
    format: result.format,
  };
}

/**
 * Share-ready URL: logo overlay bottom-right (opacity 80, 18% of width) + "@handle" text
 * bottom-left. Works for images and videos. Mock: returns the input unchanged when it is a URL.
 */
export function watermarkedUrl({ publicId, resourceType = 'image', handle } = {}) {
  const rt = normaliseResourceType(resourceType);
  if (isMock) return publicId;
  const logoId = env.cloudinary.watermarkId.replace(/\//g, ':');
  const transformation = [
    { quality: 'auto', fetch_format: rt === 'video' ? 'mp4' : 'auto' },
    { overlay: logoId, width: '0.18', flags: 'relative', opacity: 80, gravity: 'south_east', x: 20, y: 20 },
    {
      overlay: { font_family: 'Arial', font_size: 28, font_weight: 'bold', text: overlayText(handle) },
      color: 'white',
      gravity: 'south_west',
      x: 20,
      y: 20,
    },
  ];
  return cloudinary.url(publicId, { resource_type: rt, secure: true, transformation });
}

/** Thumbnail: images get a 600px auto-format version; videos a jpg frame at second 1. */
export function thumbnailUrl({ publicId, resourceType = 'image' } = {}) {
  const rt = normaliseResourceType(resourceType);
  if (isMock) return publicId;
  if (rt === 'video') {
    return cloudinary.url(publicId, {
      resource_type: 'video',
      secure: true,
      format: 'jpg',
      transformation: [{ start_offset: '1' }, { width: 600, crop: 'limit', quality: 'auto' }],
    });
  }
  return cloudinary.url(publicId, {
    resource_type: 'image',
    secure: true,
    transformation: [{ width: 600, crop: 'limit', quality: 'auto', fetch_format: 'auto' }],
  });
}

export async function deleteAsset(publicId, resourceType = 'image') {
  const rt = normaliseResourceType(resourceType);
  if (isMock) {
    console.log('[media] mock deleteAsset', { publicId, resourceType: rt });
    return { result: 'ok', mock: true };
  }
  return cloudinary.uploader.destroy(publicId, { resource_type: rt });
}

export default { isMock, signUpload, uploadFromUrl, watermarkedUrl, thumbnailUrl, deleteAsset };
