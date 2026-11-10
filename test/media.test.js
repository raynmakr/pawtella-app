// Media processing + storage orchestration. Runs sharp and ffmpeg for real; the orchestration layer
// is exercised in mock mode (no MEDIA_S3_* keys), matching how the suite runs everywhere.
import '../scripts/load-env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';
import sharp from 'sharp';
import { processImage } from '../lib/images.js';
import { processVideo, probe } from '../lib/video.js';
import * as media from '../lib/media.js';

const exec = promisify(execFile);

test('processImage: feed variant downscales to <=1080 WebP + a 480 thumbnail, strips EXIF, auto-rotates', async () => {
  // 4000x2000 JPEG tagged orientation 6 (90deg) so rotate() must apply it before stripping.
  const src = await sharp({ create: { width: 4000, height: 2000, channels: 3, background: { r: 10, g: 120, b: 200 } } })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();

  const { variants } = await processImage(src, { variant: 'feed' });
  assert.equal(variants.length, 2);
  const [feed, thumb] = variants;
  assert.equal(feed.name, 'feed');
  assert.equal(feed.contentType, 'image/webp');
  assert.ok(feed.width <= 1080 && feed.width > 0, `feed width ${feed.width}`);
  assert.equal(thumb.name, 'thumb');
  assert.ok(thumb.width <= 480, `thumb width ${thumb.width}`);

  const meta = await sharp(feed.buffer).metadata();
  assert.equal(meta.format, 'webp');
  assert.equal(meta.exif, undefined, 'EXIF stripped');
});

test('processImage: avatar variant is a single 256px WebP', async () => {
  const src = await sharp({ create: { width: 1000, height: 1000, channels: 3, background: { r: 200, g: 50, b: 50 } } }).png().toBuffer();
  const { variants } = await processImage(src, { variant: 'avatar' });
  assert.equal(variants.length, 1);
  assert.equal(variants[0].name, 'avatar');
  assert.ok(variants[0].width <= 256);
});

test('processVideo: transcodes to <=720p faststart MP4 with a poster', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vidtest-'));
  try {
    const src = path.join(dir, 'src.mp4');
    await exec(ffmpegPath, ['-y', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=1920x1080:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', src]);
    const outMp4 = path.join(dir, 'out.mp4');
    const outPoster = path.join(dir, 'poster.jpg');
    const info = await processVideo(src, { outMp4, outPoster });
    assert.ok(info.height <= 720, `height ${info.height}`);
    assert.ok(info.width <= 1280, `width ${info.width}`);
    assert.ok(fs.statSync(outMp4).size > 0);
    assert.ok(fs.statSync(outPoster).size > 0);
    const head = fs.readFileSync(outMp4).subarray(0, 8192).toString('latin1');
    assert.ok(head.includes('moov') && head.indexOf('moov') < head.indexOf('mdat'), 'moov atom precedes mdat (faststart)');
    const posterMeta = await sharp(fs.readFileSync(outPoster)).metadata();
    assert.equal(posterMeta.format, 'jpeg');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('probe reads duration and dimensions', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vidprobe-'));
  try {
    const src = path.join(dir, 'src.mp4');
    await exec(ffmpegPath, ['-y', '-f', 'lavfi', '-i', 'testsrc=duration=1:size=640x480:rate=10', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', src]);
    const info = await probe(src);
    assert.equal(info.width, 640);
    assert.equal(info.height, 480);
    assert.ok(Math.abs(info.duration - 1) < 0.2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('media mock mode: presign points at the dev uploader, no network', async () => {
  assert.equal(media.isMock, true, 'tests run without MEDIA_S3_* keys');
  const sig = await media.presignUpload({ kind: 'video', contentType: 'video/mp4', size: 1000 });
  assert.equal(sig.mock, true);
  assert.ok(sig.uploadUrl.endsWith('/api/upload/mock'));
  assert.equal(sig.kind, 'video');

  const copied = await media.storeFromUrl('https://x/z.mp4', { kind: 'video' });
  assert.equal(copied.url, 'https://x/z.mp4');
  assert.equal(copied.thumbnailUrl, 'https://x/z.mp4');

  const del = await media.deleteAsset('https://x/z.mp4');
  assert.equal(del.ok, true);
});

test('validateUpload enforces type and size limits', () => {
  assert.throws(() => media.validateUpload({ kind: 'image', contentType: 'application/pdf' }), /Unsupported/);
  assert.throws(() => media.validateUpload({ kind: 'image', contentType: 'image/jpeg', size: media.IMAGE_MAX_BYTES + 1 }), /too large/i);
  assert.throws(() => media.validateUpload({ kind: 'video', contentType: 'video/mp4', size: media.VIDEO_MAX_BYTES + 1 }), /too large/i);
  assert.deepEqual(media.validateUpload({ kind: 'video', contentType: 'video/mp4; codecs=avc1', size: 10 }), { kind: 'video', contentType: 'video/mp4' });
});
