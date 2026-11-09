#!/usr/bin/env node
// Create (idempotently) the "Subscribe & Save" selling plan group with one plan per cadence
// (every 2/4/6/8 weeks, 5% base PERCENTAGE adjustment), persist the plan ids locally, and attach the
// group to every eligible product (dog-food, cat-food, litter-hygiene collections).
//
//   node scripts/setup-selling-plans.mjs [--dry-run]
//
// Idempotent: re-running reuses the existing group (matched by merchant code) and re-attaches
// products (Shopify ignores already-attached ones). SAFE to run repeatedly. NOT run against prod by
// this change — it is part of the activation checklist in docs/SUBSCRIPTIONS.md.
import './load-env.js';
import * as shopify from '../lib/shopify.js';
import * as subShopify from '../lib/subscriptions/shopify.js';
import { saveSellingPlanGroup } from '../lib/subscriptions/store.js';
import { SUB_RULES } from '../lib/subscriptions/rules.js';
import { closePool } from '../lib/db.js';

const dryRun = process.argv.includes('--dry-run');

async function eligibleProductIds() {
  const ids = new Set();
  for (const handle of SUB_RULES.eligibleCollections) {
    let cursor = null;
    // Paginate the collection.
    for (let page = 0; page < 50; page++) {
      const { products = [], nextCursor } = await shopify.getProducts({ collection: handle, first: 100, cursor });
      for (const p of products) if (p.id) ids.add(p.id);
      if (!nextCursor || !products.length) break;
      cursor = nextCursor;
    }
  }
  return [...ids];
}

async function main() {
  console.log(`[setup-selling-plans] ${dryRun ? 'DRY RUN — ' : ''}starting`);
  if (subShopify.isMock) {
    console.warn('[setup-selling-plans] Shopify Admin is in MOCK mode; this only exercises the flow locally.');
  }

  // 1. Find or create the group.
  let group = await subShopify.findGroupByMerchantCode(SUB_RULES.merchantCode);
  if (group) {
    console.log('[setup-selling-plans] reusing existing group', group.groupId, `(${group.plans.length} plans)`);
  } else if (dryRun) {
    console.log('[setup-selling-plans] would create group', SUB_RULES.merchantCode, 'with cadences', SUB_RULES.cadenceWeeks.join(', '));
  } else {
    group = await subShopify.createSellingPlanGroup({});
    console.log('[setup-selling-plans] created group', group.groupId, 'plans:', group.plans.map((p) => `${p.weeks}w=${p.planId}`).join(', '));
  }

  // 2. Persist plan ids locally so the app can expose cadence → sellingPlanId.
  if (group && !dryRun) {
    await saveSellingPlanGroup({ ...group, basePercent: SUB_RULES.baseDiscountPercent });
    console.log('[setup-selling-plans] saved plans to selling_plan_groups');
  }

  // 3. Attach eligible products.
  const productIds = await eligibleProductIds();
  console.log(`[setup-selling-plans] ${productIds.length} eligible product(s) across ${SUB_RULES.eligibleCollections.join(', ')}`);
  if (group && productIds.length && !dryRun) {
    const { count } = await subShopify.attachProducts(group.groupId, productIds);
    console.log('[setup-selling-plans] attached; group now covers', count, 'product(s)');
  } else if (dryRun) {
    console.log('[setup-selling-plans] would attach', productIds.length, 'product(s)');
  }

  console.log('[setup-selling-plans] done');
}

try {
  await main();
} catch (err) {
  console.error('[setup-selling-plans] failed', err);
  process.exitCode = 1;
} finally {
  await closePool();
}
