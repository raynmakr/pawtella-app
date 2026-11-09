#!/usr/bin/env node
// Re-apply the paid-order side effects (hold capture, points, packs, partner commission, depot
// reservation) for a single order. Idempotent: already-applied effects are no-ops, so it is safe to
// run more than once. Use it to repair an order whose effects were skipped.
//
//   node scripts/reapply-order-effects.js <orderId|shopifyOrderId>
//
// The order is matched by shop_orders.id OR shopify_order_id. Runs against whatever DATABASE_URL the
// environment points at, so to repair production set the production DATABASE_URL (and DATABASE_SSL)
// before running.
import './load-env.js';
import { reapplyPaidEffects } from '../lib/orders.js';
import { closePool } from '../lib/db.js';

const key = process.argv[2];
if (!key) {
  console.error('Usage: node scripts/reapply-order-effects.js <orderId|shopifyOrderId>');
  process.exit(1);
}

try {
  const result = await reapplyPaidEffects(key);
  console.log('[reapply] done');
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error('[reapply] failed:', err?.message || err);
  process.exitCode = 1;
} finally {
  await closePool();
}
