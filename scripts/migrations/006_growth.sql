-- Automation engine output: notifications across channels, deduplicated per journey.

CREATE TABLE IF NOT EXISTS notifications (
  id           BIGSERIAL PRIMARY KEY,
  user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,   -- NULL for admin notifications
  journey      TEXT NOT NULL,                                     -- welcome_d0, generation_ready, pet_birthday, winback_30d, ...
  channel      TEXT NOT NULL CHECK (channel IN ('email', 'push', 'inapp')),
  dedupe_key   TEXT NOT NULL UNIQUE,                              -- e.g. welcome_d1:user:42 ; pet_birthday:pet:7:2026
  title        TEXT,
  body         TEXT,
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,                -- deep link, cta, template vars
  status       TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
  error        TEXT,
  read_at      TIMESTAMPTZ,
  sent_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_inapp_idx ON notifications(user_id, created_at DESC) WHERE channel = 'inapp';
CREATE INDEX IF NOT EXISTS notifications_queue_idx ON notifications(status, channel) WHERE status = 'queued';

-- Generic key/value for engine state (last cron run, cursors) and admin-tunable settings.
CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
