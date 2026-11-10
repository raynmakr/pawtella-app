// Video processing with the bundled static ffmpeg. Operates on file paths (videos are too large to
// hold two copies in memory comfortably) so callers stage input/outputs in a temp dir. Produces a
// web-friendly H.264/AAC MP4 (faststart, <=720p, ~2 Mbps) plus a poster frame.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';

const exec = promisify(execFile);

function parseInfo(text) {
  const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
  const duration = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + parseFloat(d[3]) : null;
  const v = /Video:.*?\b(\d{2,5})x(\d{2,5})\b/.exec(text);
  return { duration, width: v ? Number(v[1]) : null, height: v ? Number(v[2]) : null };
}

/** Read duration/dimensions by letting `ffmpeg -i` print them to stderr (it exits non-zero). */
export async function probe(inputPath) {
  try {
    const { stderr } = await exec(ffmpegPath, ['-i', inputPath, '-hide_banner']);
    return parseInfo(stderr || '');
  } catch (err) {
    return parseInfo(String(err.stderr || ''));
  }
}

// Fit inside 1280x720 preserving aspect ratio, and force even dimensions (H.264 requirement).
const SCALE = 'scale=w=min(1280\\,iw):h=min(720\\,ih):force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2';

/**
 * Transcode `inputPath` to `outMp4` and write a poster to `outPoster`.
 * @returns {{ duration, width, height }} of the produced MP4.
 */
export async function processVideo(inputPath, { outMp4, outPoster }) {
  const info = await probe(inputPath);
  await exec(
    ffmpegPath,
    [
      '-y', '-i', inputPath,
      '-vf', SCALE,
      '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
      '-b:v', '2M', '-maxrate', '2500k', '-bufsize', '5M',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      outMp4,
    ],
    { maxBuffer: 1 << 26 },
  );
  const seek = info.duration && info.duration > 1 ? '1' : '0';
  await exec(ffmpegPath, ['-y', '-ss', seek, '-i', outMp4, '-frames:v', '1', '-q:v', '3', outPoster], { maxBuffer: 1 << 26 });
  const out = await probe(outMp4);
  return { duration: info.duration, width: out.width, height: out.height };
}

export default { probe, processVideo };
