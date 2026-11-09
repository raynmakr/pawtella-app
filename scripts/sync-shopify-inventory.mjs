#!/usr/bin/env node
// Backfill / refresh the inventory_items mirror from Shopify (the source of truth for depot stock).
// Pages the whole Shopify catalog and upserts every SKU'd variant: qty_on_hand = Shopify
// quantityAvailable, and links the Shopify product/variant/handle so stock state and order
// reservations have rows to work against.
//
// Usage: node scripts/sync-shopify-inventory.mjs
// Needs SHOPIFY_STORE_DOMAIN + SHOPIFY_STOREFRONT_TOKEN in the environment (otherwise the mock
// catalog is synced, which is only useful locally). Safe to run repeatedly; it is idempotent.
import './load-env.js';
import { syncFromShopify } from '../lib/inventory/sync.js';
import * as shopify from '../lib/shopify.js';
import { closePool } from '../lib/db.js';

try {
  if (shopify.isMock) {
    console.warn('[sync-shopify] Shopify storefront is in MOCK mode (no SHOPIFY_STOREFRONT_TOKEN); syncing the mock catalog.');
  }
  const summary = await syncFromShopify();
  console.log('[sync-shopify] done', summary);
} catch (err) {
  console.error('[sync-shopify] failed', err);
  process.exitCode = 1;
} finally {
  await closePool();
}
