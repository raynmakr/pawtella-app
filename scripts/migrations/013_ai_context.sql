-- AI per-user context memory: a structured, user-editable profile the assistant remembers across
-- conversations (owner profile, per-pet profiles, health-advice summary, third-party vendors).
-- Order history is computed from the orders tables at prompt time, never duplicated here.
--
-- Privacy (Canada / PIPEDA): never store payment data or passwords. Facts are deduped by
-- (user, category, key, pet) and updated in place rather than piled up. Users can view, edit and
-- delete individual facts, clear everything, or turn memory off. Everything cascades on account
-- (or pet) deletion.

CREATE TABLE IF NOT EXISTS ai_user_memory (
  user_id              INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled              BOOLEAN NOT NULL DEFAULT true,
  health_summary       TEXT,
  last_conversation_id INTEGER,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER ai_user_memory_updated_at BEFORE UPDATE ON ai_user_memory FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS ai_user_facts (
  id                     SERIAL PRIMARY KEY,
  user_id                INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pet_id                 INTEGER REFERENCES pets(id) ON DELETE CASCADE,
  category               TEXT NOT NULL CHECK (category IN ('owner', 'pet', 'health', 'vendor')),
  fact_key               TEXT NOT NULL,
  fact_value             TEXT NOT NULL,
  source_conversation_id INTEGER REFERENCES ai_conversations(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One row per (user, category, key, pet): re-stating a fact updates it instead of piling up.
CREATE UNIQUE INDEX IF NOT EXISTS ai_user_facts_dedupe_idx ON ai_user_facts (user_id, category, fact_key, COALESCE(pet_id, 0));
CREATE INDEX IF NOT EXISTS ai_user_facts_user_idx ON ai_user_facts (user_id, category);

CREATE TRIGGER ai_user_facts_updated_at BEFORE UPDATE ON ai_user_facts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- High-water mark so the extraction job only processes conversations with new activity.
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS memory_extracted_at TIMESTAMPTZ;
