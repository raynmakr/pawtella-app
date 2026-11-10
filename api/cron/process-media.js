// Every minute: transcode freshly uploaded post videos to a web-friendly MP4 + poster. Posts are
// created with the original (which plays fine) and media_status = 'processing'; this swaps in the
// compressed media and sets 'ready'. Failures keep the original and mark 'failed' so the feed never
// breaks. Images are processed synchronously at upload time and never reach this cron.
import { route, requireCron } from '../../lib/http.js';
import { env } from '../../lib/env.js';
import { many, one } from '../../lib/db.js';
import * as media from '../../lib/media.js';

const BATCH = 3; // bounded so one invocation stays well under the function time limit

async function run(req) {
  requireCron(req, env.cronSecret);
  const summary = { checked: 0, processed: 0, failed: 0 };
  if (media.isMock) {
    console.log('[cron] process-media skipped (storage not configured)');
    return { ok: true, skipped: true, ...summary };
  }

  const rows = await many(
    `SELECT id, media_key FROM posts
      WHERE media_type = 'video' AND media_status = 'processing' AND media_key IS NOT NULL
      ORDER BY id ASC LIMIT $1`,
    [BATCH],
  );
  summary.checked = rows.length;

  for (const post of rows) {
    try {
      const out = await media.processVideoKey(post.media_key);
      await one(
        `UPDATE posts
            SET media_url = $2, thumbnail_url = $3, media_status = 'ready', media_key = NULL,
                width = COALESCE($4, width), height = COALESCE($5, height),
                duration_seconds = COALESCE($6, duration_seconds)
          WHERE id = $1 RETURNING id`,
        [post.id, out.url, out.thumbnailUrl, out.width, out.height, out.duration ? Math.round(out.duration * 100) / 100 : null],
      );
      summary.processed++;
      console.log('[cron] process-media transcoded', { postId: post.id });
    } catch (err) {
      // Keep the playable original; stop retrying this post.
      await one(`UPDATE posts SET media_status = 'failed', media_key = NULL WHERE id = $1 RETURNING id`, [post.id]).catch(() => {});
      summary.failed++;
      console.error('[cron] process-media failed', { postId: post.id, error: err.message });
    }
  }

  console.log('[cron] process-media', summary);
  return { ok: true, ...summary };
}

export default route({ GET: run, POST: run });
