-- Core: users, pets, events, referrals.
-- Conventions: SERIAL ids, TIMESTAMPTZ, snake_case, money in integer cents, soft enums as TEXT + CHECK.

CREATE EXTENSION IF NOT EXISTS citext;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS users (
  id                      SERIAL PRIMARY KEY,
  email                   CITEXT UNIQUE,
  email_verified_at       TIMESTAMPTZ,
  password_hash           TEXT,
  apple_id                TEXT UNIQUE,
  google_id               TEXT UNIQUE,
  handle                  CITEXT UNIQUE NOT NULL,
  display_name            TEXT,
  avatar_url              TEXT,
  bio                     TEXT,
  role                    TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status                  TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  country                 TEXT,                       -- ISO-3166 alpha-2, e.g. CA, US
  postal_code             TEXT,
  lat                     DOUBLE PRECISION,
  lng                     DOUBLE PRECISION,
  -- Paw Points balance (ledger in point_transactions; holds in point_holds)
  paw_points              INTEGER NOT NULL DEFAULT 0 CHECK (paw_points >= 0),
  points_lifetime_earned  INTEGER NOT NULL DEFAULT 0,
  points_last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- one-time reward flags
  bonus_welcome           BOOLEAN NOT NULL DEFAULT false,
  bonus_profile_pet       BOOLEAN NOT NULL DEFAULT false,
  bonus_first_post        BOOLEAN NOT NULL DEFAULT false,
  bonus_first_order       BOOLEAN NOT NULL DEFAULT false,
  bonus_first_creation    BOOLEAN NOT NULL DEFAULT false,
  -- Shopify / growth
  shopify_customer_id     TEXT,
  referred_by_user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  signup_source           TEXT,                       -- organic | share | invite | partner
  feature_consent_default BOOLEAN NOT NULL DEFAULT false,
  push_token              TEXT,
  marketing_opt_in        BOOLEAN NOT NULL DEFAULT true,
  last_seen_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS password_resets (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pets (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  species     TEXT NOT NULL CHECK (species IN ('dog', 'cat')),
  breed       TEXT,
  sex         TEXT CHECK (sex IN ('male', 'female', 'unknown')),
  birthday    DATE,
  weight_kg   NUMERIC(6,2),
  photo_url   TEXT,
  notes       TEXT,                                    -- allergies, meds, quirks (fed to the assistant)
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pets_user_idx ON pets(user_id);
CREATE TRIGGER pets_updated_at BEFORE UPDATE ON pets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Every key action emits an event: the backbone for automation, attribution and metrics.
CREATE TABLE IF NOT EXISTS events (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,                           -- signup, pet_added, generation_done, post_created, share_clicked, share_landing_view, checkout_started, order_paid, app_open, ...
  props       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_user_name_idx ON events(user_id, name, created_at DESC);
CREATE INDEX IF NOT EXISTS events_name_created_idx ON events(name, created_at DESC);

-- Referral codes: one per user (and one per partner, see 007). /r/<code>
CREATE TABLE IF NOT EXISTS referral_codes (
  code        TEXT PRIMARY KEY,
  user_id     INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS referrals (
  id                        SERIAL PRIMARY KEY,
  referrer_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_id               INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  source                    TEXT NOT NULL DEFAULT 'invite' CHECK (source IN ('invite', 'share')),
  shared_post_id            INTEGER,                   -- when source = share
  signup_bonus_awarded      BOOLEAN NOT NULL DEFAULT false,
  conversion_bonus_awarded  BOOLEAN NOT NULL DEFAULT false, -- referrer paid on friend's first creation/order
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals(referrer_id);
