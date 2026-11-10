-- Media processing state for posts.
--
-- Uploads go straight to object storage; photos are processed synchronously at upload time, but
-- videos are transcoded asynchronously by the process-media cron so posting never blocks. A video
-- post is created with its ORIGINAL url and media_status = 'processing'; the cron swaps in the
-- compressed MP4 + poster and sets 'ready'. media_key is the original object key the cron reads.
-- Photos (processed before the post exists) default to 'ready'.

ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_status TEXT NOT NULL DEFAULT 'ready'
  CHECK (media_status IN ('ready', 'processing', 'failed'));
ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_key TEXT;

-- The cron scans for pending videos; keep that scan cheap.
CREATE INDEX IF NOT EXISTS posts_media_processing_idx ON posts (id) WHERE media_status = 'processing';
