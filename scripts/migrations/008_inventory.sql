-- Depot inventory mirrored from Franpos and pushed to Shopify, plus per-SKU sourcing decisions.

CREATE TABLE IF NOT EXISTS inventory_items (
  id                         SERIAL PRIMARY KEY,
  sku                        TEXT UNIQUE NOT NULL,
  barcode                    TEXT,
  name                       TEXT NOT NULL,
  category                   TEXT,
  brand                      TEXT,
  price_cents                INTEGER,
  cost_cents                 INTEGER,
  qty_on_hand                INTEGER NOT NULL DEFAULT 0,   -- depot stock from Franpos
  qty_reserved_online        INTEGER NOT NULL DEFAULT 0,   -- paid online orders awaiting pickup/dispatch
  source                     TEXT NOT NULL DEFAULT 'franpos',
  source_updated_at          TIMESTAMPTZ,
  first_seen_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  shopify_product_id         TEXT,
  shopify_variant_id         TEXT,
  shopify_inventory_item_id  TEXT,
  shopify_handle             TEXT,
  shopify_synced_at          TIMESTAMPTZ,
  shopify_sync_error         TEXT,
  went_out_of_stock_at       TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_items_handle_idx ON inventory_items(shopify_handle);
CREATE INDEX IF NOT EXISTS inventory_items_stock_idx ON inventory_items(qty_on_hand);
CREATE TRIGGER inventory_items_updated_at BEFORE UPDATE ON inventory_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Owner's decision per SKU: sell only from stock, allow special orders from a supplier, or hide online.
CREATE TABLE IF NOT EXISTS product_sourcing (
  sku           TEXT PRIMARY KEY REFERENCES inventory_items(sku) ON DELETE CASCADE,
  policy        TEXT NOT NULL DEFAULT 'stock_only' CHECK (policy IN ('stock_only', 'special_order', 'hidden')),
  supplier      TEXT,
  lead_days     INTEGER,
  min_order_qty INTEGER,
  notes         TEXT,
  decided_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER product_sourcing_updated_at BEFORE UPDATE ON product_sourcing FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS inventory_imports (
  id            SERIAL PRIMARY KEY,
  source        TEXT NOT NULL,
  filename      TEXT,
  row_count     INTEGER NOT NULL DEFAULT 0,
  created_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  error_count   INTEGER NOT NULL DEFAULT 0,
  errors        JSONB NOT NULL DEFAULT '[]'::jsonb,
  status        TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'partial', 'failed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
