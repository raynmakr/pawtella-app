// Neon Object Storage (S3-compatible, path-style). Lazy client so nothing is constructed — and no
// AWS SDK is imported — until storage is actually configured and used; mock mode (no keys) never
// touches the network, mirroring every other provider module.
import crypto from 'node:crypto';
import { env, flags } from './env.js';

export const isConfigured = flags.hasMediaStorage;

let _clientPromise = null;
function client() {
  if (!isConfigured) throw new Error('Object storage is not configured (MEDIA_S3_* env vars missing)');
  if (!_clientPromise) {
    _clientPromise = import('@aws-sdk/client-s3').then(({ S3Client }) =>
      new S3Client({
        region: env.media.region,
        endpoint: env.media.endpoint,
        forcePathStyle: true, // Neon requires path-style addressing
        credentials: { accessKeyId: env.media.accessKeyId, secretAccessKey: env.media.secretAccessKey },
      }),
    );
  }
  return _clientPromise;
}

const EXT_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

export function extForContentType(contentType) {
  return EXT_BY_TYPE[String(contentType || '').toLowerCase()] || 'bin';
}

/** A random, neutral object key that leaks nothing about the uploader or content. */
export function randomKey(ext) {
  const hex = crypto.randomBytes(16).toString('hex');
  const clean = String(ext || '').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 5);
  return `m/${hex.slice(0, 2)}/${hex}${clean ? `.${clean}` : ''}`;
}

/** Public, CDN-style URL for an object key. */
export function publicUrl(key) {
  const base = env.media.publicBaseUrl || `${env.media.endpoint}/${env.media.bucket}`;
  return `${base.replace(/\/$/, '')}/${key}`;
}

/** Reverse of publicUrl: the key for one of our URLs, or null if it isn't ours. */
export function keyFromUrl(url) {
  if (typeof url !== 'string') return null;
  const base = (env.media.publicBaseUrl || `${env.media.endpoint}/${env.media.bucket}`).replace(/\/$/, '');
  return url.startsWith(`${base}/`) ? url.slice(base.length + 1) : null;
}

const IMMUTABLE = 'public, max-age=31536000, immutable';

/** Short-lived presigned PUT URL. The client must send the same Content-Type. */
export async function presignPut(key, contentType, { expiresIn = 300 } = {}) {
  const [{ PutObjectCommand }, { getSignedUrl }] = await Promise.all([
    import('@aws-sdk/client-s3'),
    import('@aws-sdk/s3-request-presigner'),
  ]);
  const cmd = new PutObjectCommand({
    Bucket: env.media.bucket,
    Key: key,
    ContentType: contentType,
    CacheControl: IMMUTABLE,
  });
  return getSignedUrl(await client(), cmd, { expiresIn });
}

export async function putObject(key, body, contentType, { cacheControl = IMMUTABLE } = {}) {
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  await (await client()).send(
    new PutObjectCommand({ Bucket: env.media.bucket, Key: key, Body: body, ContentType: contentType, CacheControl: cacheControl }),
  );
  return publicUrl(key);
}

/** Download an object as a Buffer. */
export async function getObject(key) {
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const res = await (await client()).send(new GetObjectCommand({ Bucket: env.media.bucket, Key: key }));
  return Buffer.from(await res.Body.transformToByteArray());
}

export async function deleteObject(key) {
  if (!key) return;
  const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  await (await client()).send(new DeleteObjectCommand({ Bucket: env.media.bucket, Key: key }));
}

export default { isConfigured, randomKey, publicUrl, keyFromUrl, extForContentType, presignPut, putObject, getObject, deleteObject };
