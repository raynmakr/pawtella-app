-- Partner program: local service providers who send us customers.

CREATE TABLE IF NOT EXISTS partners (
  id                    SERIAL PRIMARY KEY,
  owner_user_id         INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  business_name         TEXT NOT NULL,
  type                  TEXT NOT NULL CHECK (type IN ('vet', 'groomer', 'walker', 'trainer', 'sitter', 'boarding', 'rescue', 'boutique', 'other')),
  description           TEXT,
  logo_url              TEXT,
  cover_url             TEXT,
  email                 CITEXT,
  phone                 TEXT,
  website               TEXT,
  booking_url           TEXT,
  instagram             TEXT,
  street1               TEXT,
  city                  TEXT,
  province              TEXT,
  postal_code           TEXT,
  country               TEXT NOT NULL DEFAULT 'CA',
  lat                   DOUBLE PRECISION,
  lng                   DOUBLE PRECISION,
  services              TEXT[] NOT NULL DEFAULT '{}',
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'suspended', 'rejected')),
  tier                  TEXT NOT NULL DEFAULT 'bronze' CHECK (tier IN ('bronze', 'silver', 'gold')),
  is_featured           BOOLEAN NOT NULL DEFAULT false,
  code                  TEXT UNIQUE NOT NULL,            -- referral / QR code, also valid in /r/<code>
  shopify_customer_id   TEXT,
  discount_code         TEXT,                            -- customer-locked % code for supplies
  shopify_discount_id   TEXT,
  discount_percent      INTEGER NOT NULL DEFAULT 10,
  active_referred_90d   INTEGER NOT NULL DEFAULT 0,
  total_referred        INTEGER NOT NULL DEFAULT 0,
  rating_avg            NUMERIC(3,2),
  rating_count          INTEGER NOT NULL DEFAULT 0,
  notes_admin           TEXT,
  applied_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS partners_status_type_idx ON partners(status, type);
CREATE INDEX IF NOT EXISTS partners_geo_idx ON partners(lat, lng) WHERE status = 'approved';
CREATE TRIGGER partners_updated_at BEFORE UPDATE ON partners FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE shop_orders ADD CONSTRAINT shop_orders_partner_fk FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL;

-- A customer is attributed to at most one partner at a time, for 12 months.
CREATE TABLE IF NOT EXISTS partner_attributions (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  partner_id     INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  source         TEXT NOT NULL CHECK (source IN ('signup', 'qr_scan', 'link', 'manual')),
  attributed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL,
  bonus_awarded  BOOLEAN NOT NULL DEFAULT false       -- +10 PP to the customer
);
CREATE INDEX IF NOT EXISTS partner_attributions_partner_idx ON partner_attributions(partner_id, attributed_at DESC);

CREATE TABLE IF NOT EXISTS partner_earnings (
  id            SERIAL PRIMARY KEY,
  partner_id    INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  order_id      INTEGER REFERENCES shop_orders(id) ON DELETE SET NULL,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,   -- referred customer
  type          TEXT NOT NULL CHECK (type IN ('commission', 'bonus', 'payout', 'redeem_points', 'redeem_gift_card', 'adjustment')),
  amount_cents  INTEGER NOT NULL,                     -- positive = earned, negative = paid out / redeemed
  currency      TEXT NOT NULL DEFAULT 'CAD',
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'available', 'paid', 'cancelled')),
  available_at  TIMESTAMPTZ,                          -- pending → available after the returns window
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,   -- gift card id, payout method, etc.
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS partner_earnings_partner_idx ON partner_earnings(partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS partner_earnings_maturing_idx ON partner_earnings(status, available_at) WHERE status = 'pending';
CREATE TRIGGER partner_earnings_updated_at BEFORE UPDATE ON partner_earnings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS partner_reviews (
  id          SERIAL PRIMARY KEY,
  partner_id  INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (partner_id, user_id)
);
