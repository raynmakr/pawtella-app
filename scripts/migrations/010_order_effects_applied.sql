-- Marks when a shop_orders row's paid-order side effects (hold capture, points, packs, partner
-- commission, depot reservation) completed. Self-idempotent effects re-run safely; the two that are
-- not self-idempotent (Paw Point packs and the depot reservation) run only while this is NULL, so
-- reapplyPaidEffects() can repair a half-applied order without double-crediting. NULL for all rows
-- that existed before this migration, so a repair run treats them as never-applied.

ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS effects_applied_at TIMESTAMPTZ;
