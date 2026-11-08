-- Shop: Shopify order mirror, webhook idempotency, addresses, reviews, back-in-stock subscriptions.

CREATE TABLE IF NOT EXISTS processed_webhooks (
  id            TEXT PRIMARY KEY,                   -- provider:webhook_id (Shopify X-Shopify-Webhook-Id)
  topic         TEXT NOT NULL,
  processed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shop_orders (
  id                   SERIAL PRIMARY KEY,
  user_id              INTEGER REFERENCES users(id) ON DELETE SET NULL,
  shopify_order_id     TEXT UNIQUE NOT NULL,
  order_number         TEXT,
  email                CITEXT,
  currency             TEXT NOT NULL DEFAULT 'CAD',
  subtotal_cents       INTEGER NOT NULL DEFAULT 0,   -- after discounts, before tax/shipping
  discount_cents       INTEGER NOT NULL DEFAULT 0,
  shipping_cents       INTEGER NOT NULL DEFAULT 0,
  tax_cents            INTEGER NOT NULL DEFAULT 0,
  total_cents          INTEGER NOT NULL DEFAULT 0,
  discount_codes       TEXT[] NOT NULL DEFAULT '{}',
  fulfillment_type     TEXT CHECK (fulfillment_type IN ('pickup', 'local_delivery', 'shipping')),
  financial_status     TEXT,
  fulfillment_status   TEXT,                         -- unfulfilled | partial | fulfilled | ready_for_pickup | picked_up
  status               TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'processing', 'ready_for_pickup', 'out_for_delivery', 'shipped', 'delivered', 'picked_up', 'cancelled', 'refunded')),
  points_earned        INTEGER NOT NULL DEFAULT 0,
  points_redeemed      INTEGER NOT NULL DEFAULT 0,
  pack_points_granted  INTEGER NOT NULL DEFAULT 0,   -- Paw Point packs bought in this order
  partner_id           INTEGER,                      -- attributed partner at time of order
  line_items           JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{sku, handle, title, quantity, price_cents, variant_id, product_id}]
  tracking_url         TEXT,
  raw                  JSONB,
  placed_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shop_orders_user_idx ON shop_orders(user_id, placed_at DESC);
CREATE INDEX IF NOT EXISTS shop_orders_email_idx ON shop_orders(email);
CREATE TRIGGER shop_orders_updated_at BEFORE UPDATE ON shop_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE point_holds ADD CONSTRAINT point_holds_order_fk FOREIGN KEY (order_id) REFERENCES shop_orders(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS saved_addresses (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label       TEXT,
  name        TEXT NOT NULL,
  street1     TEXT NOT NULL,
  street2     TEXT,
  city        TEXT NOT NULL,
  province    TEXT NOT NULL,                         -- state / province code
  postal_code TEXT NOT NULL,
  country     TEXT NOT NULL DEFAULT 'CA',
  phone       TEXT,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saved_addresses_user_idx ON saved_addresses(user_id);
CREATE TRIGGER saved_addresses_updated_at BEFORE UPDATE ON saved_addresses FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS product_reviews (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_handle  TEXT NOT NULL,
  order_id        INTEGER REFERENCES shop_orders(id) ON DELETE SET NULL,
  rating          INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body            TEXT,
  photo_url       TEXT,
  pet_id          INTEGER REFERENCES pets(id) ON DELETE SET NULL,
  points_awarded  INTEGER NOT NULL DEFAULT 0,
  is_hidden       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_handle, order_id)
);
CREATE INDEX IF NOT EXISTS product_reviews_handle_idx ON product_reviews(product_handle, created_at DESC);

CREATE TABLE IF NOT EXISTS product_subscriptions (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_handle  TEXT NOT NULL,
  sku             TEXT,
  notified_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_handle)
);
