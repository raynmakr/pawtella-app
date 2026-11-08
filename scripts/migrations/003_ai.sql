-- AI generations (xAI Grok Imagine) and assistant conversations (Claude).

CREATE TABLE IF NOT EXISTS ai_generations (
  id                 SERIAL PRIMARY KEY,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pet_id             INTEGER REFERENCES pets(id) ON DELETE SET NULL,
  kind               TEXT NOT NULL CHECK (kind IN ('image', 'video')),
  provider           TEXT NOT NULL DEFAULT 'xai',
  model              TEXT NOT NULL,
  prompt             TEXT NOT NULL,
  preset_id          TEXT,
  source_image_url   TEXT,
  duration_seconds   INTEGER,
  resolution         TEXT,                           -- 720p | 1080p | 1k
  aspect_ratio       TEXT,
  hd                 BOOLEAN NOT NULL DEFAULT false,
  status             TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  progress           INTEGER NOT NULL DEFAULT 0,
  provider_request_id TEXT,
  provider_output_url TEXT,                          -- temporary URL from the provider
  output_url         TEXT,                           -- persisted (Cloudinary) URL
  thumbnail_url      TEXT,
  watermarked_url    TEXT,
  points_charged     INTEGER NOT NULL DEFAULT 0,
  points_refunded    INTEGER NOT NULL DEFAULT 0,
  cost_usd_ticks     BIGINT,                         -- provider-reported cost (1 tick = $0.0001)
  error              TEXT,
  challenge_id       INTEGER,
  post_id            INTEGER,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at         TIMESTAMPTZ,
  finished_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ai_generations_user_idx ON ai_generations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_generations_pending_idx ON ai_generations(status) WHERE status IN ('queued', 'running');

CREATE TABLE IF NOT EXISTS ai_conversations (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pet_id      INTEGER REFERENCES pets(id) ON DELETE SET NULL,
  title       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_conversations_user_idx ON ai_conversations(user_id, updated_at DESC);
CREATE TRIGGER ai_conversations_updated_at BEFORE UPDATE ON ai_conversations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS ai_messages (
  id               BIGSERIAL PRIMARY KEY,
  conversation_id  INTEGER NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content          JSONB NOT NULL,                  -- [{type:'text',text}, {type:'image',url}] ; assistant: {text, vet_alert, product_suggestions, pet_profile_updates, partner_results}
  model            TEXT,
  input_tokens     INTEGER,
  output_tokens    INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_messages_conv_idx ON ai_messages(conversation_id, created_at);
