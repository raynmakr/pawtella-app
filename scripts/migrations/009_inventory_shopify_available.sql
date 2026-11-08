-- Shopify's own view of depot availability, recorded from the inventory_levels/update webhook.
-- Franpos stays the source of truth for qty_on_hand; this column is a hint so the depot can see
-- what Shopify thinks is sellable (after online sales decremented it) between POS exports.

ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS shopify_available INTEGER;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS shopify_available_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS inventory_items_shopify_inventory_item_idx ON inventory_items(shopify_inventory_item_id);
