-- Legal acceptance, marketing consent (CASL) and AI health-information consent.
--
-- Terms/Privacy acceptance is recorded per user with the version accepted and a UTC timestamp, so a
-- material change can trigger re-acceptance. Marketing consent must be express opt-in under Canada's
-- Anti-Spam Legislation: new accounts are no longer opted in by default, and the opt-in moment is
-- timestamped. Pet health information in AI memory is stored only with separate express consent
-- (see migration 013 / lib/ai-memory.js).

ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version       TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at    TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_version      TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_opt_in_at  TIMESTAMPTZ;

-- CASL: no silent opt-in. Existing rows are left untouched; only the default for new rows changes.
ALTER TABLE users ALTER COLUMN marketing_opt_in SET DEFAULT false;

-- Express consent to store pet health information in AI memory (migration 013 table).
ALTER TABLE ai_user_memory ADD COLUMN IF NOT EXISTS health_consent    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE ai_user_memory ADD COLUMN IF NOT EXISTS health_consent_at TIMESTAMPTZ;
