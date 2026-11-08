// TODO(stub): minimal stand-in created by Backend C; Backend G owns the real module.
import { query } from '../db.js';

export async function runSync() {
  console.log('[inventory:stub] runSync noop');
  return { ok: true, created: 0, updated: 0 };
}

/** Increment qty_reserved_online for each SKU on a paid order (best effort). */
export async function reserveForOrder(order, tx) {
  const run = tx ? tx.query : query;
  const items = Array.isArray(order?.line_items) ? order.line_items : [];
  for (const li of items) {
    if (!li?.sku) continue;
    await run('UPDATE inventory_items SET qty_reserved_online = qty_reserved_online + $2 WHERE sku = $1', [li.sku, li.quantity || 1]);
  }
}

export async function getStockState(handle) {
  const row = await query(
    `SELECT i.qty_on_hand, i.qty_reserved_online, s.policy, s.lead_days
       FROM inventory_items i LEFT JOIN product_sourcing s ON s.sku = i.sku
      WHERE i.shopify_handle = $1 LIMIT 1`,
    [handle],
  ).then((r) => r.rows[0]);
  if (!row) return { state: 'unknown', qty: null };
  const qty = Math.max(0, row.qty_on_hand - row.qty_reserved_online);
  if (qty > 0) return { state: 'in_stock', qty };
  if (row.policy === 'special_order') return { state: 'special_order', qty: 0, leadDays: row.lead_days ?? null };
  return { state: 'sold_out', qty: 0 };
}

export async function applyShopifyInventoryLevel(payload) {
  console.log('[inventory:stub] inventory_levels/update received', {
    inventoryItemId: payload?.inventory_item_id,
    available: payload?.available,
  });
  return { applied: false };
}
