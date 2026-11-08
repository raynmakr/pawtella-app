-- Paw Points ledger and store-discount holds. Balance lives on users.paw_points.

CREATE TABLE IF NOT EXISTS point_transactions (
  id             BIGSERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount         INTEGER NOT NULL,                 -- positive = credit, negative = debit
  type           TEXT NOT NULL CHECK (type IN ('earn', 'spend', 'purchase', 'refund', 'bonus', 'hold', 'release', 'expire', 'admin')),
  source         TEXT NOT NULL,                    -- welcome, order, pack, ai_image, ai_video, store_discount, referral, share, challenge, review, birthday, partner_redeem, ...
  ref_type       TEXT,                             -- generation | order | hold | post | challenge | referral | partner_earning | ...
  ref_id         TEXT,
  balance_after  INTEGER NOT NULL,
  description    TEXT,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS point_tx_user_idx ON point_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS point_tx_ref_idx ON point_transactions(ref_type, ref_id);

-- Points reserved for a Shopify discount code while the customer checks out.
CREATE TABLE IF NOT EXISTS point_holds (
  id                   SERIAL PRIMARY KEY,
  user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cart_id              TEXT NOT NULL,                -- Shopify cart GID
  points               INTEGER NOT NULL CHECK (points > 0),
  discount_cents       INTEGER NOT NULL,
  currency             TEXT NOT NULL DEFAULT 'CAD',
  discount_code        TEXT NOT NULL UNIQUE,
  shopify_discount_id  TEXT,                         -- Admin API DiscountCodeNode GID
  status               TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'captured', 'released')),
  order_id             INTEGER,                      -- shop_orders.id once captured
  expires_at           TIMESTAMPTZ NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS point_holds_user_idx ON point_holds(user_id, status);
CREATE INDEX IF NOT EXISTS point_holds_expiry_idx ON point_holds(status, expires_at);
CREATE TRIGGER point_holds_updated_at BEFORE UPDATE ON point_holds FOR EACH ROW EXECUTE FUNCTION set_updated_at();
