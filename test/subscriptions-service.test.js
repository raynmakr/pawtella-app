// Subscription service against local Postgres + the in-memory Shopify mock: mirror upsert, tier
// recompute/apply, tier transitions, billing-due selection + dunning, idempotent billing.
import '../scripts/load-env.js';
import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { one, many, query, closePool } from '../lib/db.js';
import * as shopify from '../lib/subscriptions/shopify.js';
import * as store from '../lib/subscriptions/store.js';
import * as service from '../lib/subscriptions/service.js';
import { dispatchSubscriptionWebhook } from '../lib/subscriptions/webhook.js';

const suffix = () => crypto.randomBytes(5).toString('hex');
const userIds = [];

async function makeUser() {
  const s = suffix();
  const u = await one(
    `INSERT INTO users (email, handle, display_name, shopify_customer_id) VALUES ($1,$2,$3,$4) RETURNING *`,
    [`sub-${s}@test.local`, `sub_${s}`, 'Sub Tester', `cust-${s}`],
  );
  userIds.push(u.id);
  return u;
}

async function cleanupUserContracts(userId) {
  await query('DELETE FROM subscription_contracts WHERE user_id = $1', [userId]);
}

beforeEach(() => shopify.__reset());

after(async () => {
  if (userIds.length) {
    await query('DELETE FROM subscription_contracts WHERE user_id = ANY($1)', [userIds]);
    await query('DELETE FROM users WHERE id = ANY($1)', [userIds]);
  }
  await closePool();
});

// Seed a Shopify mock contract and mirror it into the DB.
async function seedAndMirror(user, { weeks, lines, status = 'active', nextBillingAt = null }) {
  const normalized = shopify.__seedContract({
    customerId: user.shopify_customer_id,
    status,
    intervalWeeks: weeks,
    nextBillingAt,
    lines: lines.map((l) => ({ ...l, currentPriceCents: l.basePriceCents })),
  });
  const row = await store.upsertContractFromShopify(normalized);
  return row;
}

test('mirror upsert stores contract + lines and computes monthly value', async () => {
  const user = await makeUser();
  const row = await seedAndMirror(user, { weeks: 4, lines: [{ basePriceCents: 4000, quantity: 1, title: 'Kibble' }] });
  assert.equal(row.user_id, user.id);
  assert.equal(row.lines.length, 1);
  assert.equal(row.monthly_value_cents, Math.round(4000 * 4.345 / 4)); // 4345
  await cleanupUserContracts(user.id);
});

test('tier stays at 5% below threshold and the contract is unchanged', async () => {
  const user = await makeUser();
  await seedAndMirror(user, { weeks: 4, lines: [{ basePriceCents: 4000, quantity: 1 }] }); // 4345/mo
  const { tier, changed } = await service.recomputeAndApplyTier({ userId: user.id, shopifyCustomerId: user.shopify_customer_id });
  assert.equal(tier, 5);
  assert.equal(changed.length, 0); // already at base tier, no price edit pushed
  await cleanupUserContracts(user.id);
});

test('crossing $100/mo promotes all the customer contracts to 10% and edits line prices', async () => {
  const user = await makeUser();
  // Two contracts totalling > $100/mo: 6000 + 6000 every 4 weeks = (6000+6000)*4.345/4 = 13035/mo
  const c1 = await seedAndMirror(user, { weeks: 4, lines: [{ basePriceCents: 6000, quantity: 1 }] });
  const c2 = await seedAndMirror(user, { weeks: 4, lines: [{ basePriceCents: 6000, quantity: 1 }] });

  const { tier, changed } = await service.recomputeAndApplyTier({ userId: user.id, shopifyCustomerId: user.shopify_customer_id });
  assert.equal(tier, 10);
  assert.equal(changed.length, 2);

  // DB reflects the new tier and discounted unit prices (6000 * 0.90 = 5400).
  const rows = await many('SELECT tier_percent FROM subscription_contracts WHERE id = ANY($1)', [[c1.id, c2.id]]);
  assert.ok(rows.every((r) => Number(r.tier_percent) === 10));
  const line = await one('SELECT current_price_cents FROM subscription_lines WHERE contract_id = $1', [c1.id]);
  assert.equal(line.current_price_cents, 5400);

  // The Shopify adapter was asked to edit both contracts' line prices.
  const edits = shopify._calls.filter((c) => c.op === 'updateLinePrices');
  assert.equal(edits.length, 2);
  await cleanupUserContracts(user.id);
});

test('cancelling a contract can drop the customer back to 5%', async () => {
  const user = await makeUser();
  const big = await seedAndMirror(user, { weeks: 2, lines: [{ basePriceCents: 5000, quantity: 1 }] }); // 10862/mo → 10%
  await service.recomputeAndApplyTier({ userId: user.id, shopifyCustomerId: user.shopify_customer_id });
  let row = await store.getByShopifyContractId(big.shopify_contract_id);
  assert.equal(Number(row.tier_percent), 10);

  const small = await seedAndMirror(user, { weeks: 4, lines: [{ basePriceCents: 3000, quantity: 1 }] }); // 3258/mo alone
  // Cancel the big one → remaining monthly (3258) <= threshold → tier 5
  await service.cancelForUser(row);
  const after = await service.recomputeAndApplyTier({ userId: user.id, shopifyCustomerId: user.shopify_customer_id });
  assert.equal(after.tier, 5);
  const smallRow = await store.getByShopifyContractId(small.shopify_contract_id);
  assert.equal(Number(smallRow.tier_percent), 5);
  await cleanupUserContracts(user.id);
});

test('billing cron: charges due contracts once (idempotent) and advances the next date on success', async () => {
  const user = await makeUser();
  const past = new Date(Date.now() - 24 * 3600 * 1000);
  const c = await seedAndMirror(user, { weeks: 4, lines: [{ basePriceCents: 3000, quantity: 1 }], nextBillingAt: past });

  const r1 = await service.processDueBilling({ asOf: new Date() });
  assert.equal(r1.attempted, 1);
  assert.equal(r1.succeeded, 1);

  // Next billing date advanced into the future → not due anymore.
  const r2 = await service.processDueBilling({ asOf: new Date() });
  assert.equal(r2.due, 0);

  // Exactly one successful attempt recorded.
  const attempts = await many('SELECT * FROM subscription_billing_attempts WHERE contract_id = $1', [c.id]);
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].status, 'success');
  await cleanupUserContracts(user.id);
});

test('billing cron: repeated failures walk the dunning ladder and finally pause', async () => {
  const user = await makeUser();
  const c = await seedAndMirror(user, {
    weeks: 4,
    lines: [{ basePriceCents: 3000, quantity: 1 }],
    nextBillingAt: new Date(Date.now() - 24 * 3600 * 1000),
  });
  shopify.__forceFailure(c.shopify_contract_id, 'PAYMENT_METHOD_DECLINED');

  // Attempt 1 (initial) → retry scheduled, failures = 1
  await service.processDueBilling({ asOf: new Date() });
  let row = await store.getByShopifyContractId(c.shopify_contract_id);
  assert.equal(row.billing_failures, 1);
  assert.equal(row.status, 'active');

  // Force-due again and run through the ladder: failures 2, 3, then pause on 4.
  for (const expected of [2, 3]) {
    await store.setNextBilling(c.id, new Date(Date.now() - 3600 * 1000));
    await service.processDueBilling({ asOf: new Date() });
    row = await store.getByShopifyContractId(c.shopify_contract_id);
    assert.equal(row.billing_failures, expected);
    assert.equal(row.status, 'active');
  }
  await store.setNextBilling(c.id, new Date(Date.now() - 3600 * 1000));
  await service.processDueBilling({ asOf: new Date() });
  row = await store.getByShopifyContractId(c.shopify_contract_id);
  assert.equal(row.billing_failures, 4);
  assert.equal(row.status, 'paused');

  // A pause notification was queued for the user.
  const notif = await one(
    `SELECT * FROM notifications WHERE user_id = $1 AND journey = 'subscription_payment_failed'`,
    [user.id],
  );
  assert.ok(notif);
  await query('DELETE FROM notifications WHERE user_id = $1', [user.id]);
  await cleanupUserContracts(user.id);
});

test('webhook: subscription_contracts/create mirrors the contract from Shopify', async () => {
  const user = await makeUser();
  const normalized = shopify.__seedContract({
    customerId: user.shopify_customer_id,
    intervalWeeks: 4,
    lines: [{ basePriceCents: 2500, quantity: 1, title: 'Litter' }],
  });
  const res = await dispatchSubscriptionWebhook('subscription_contracts/create', {
    admin_graphql_api_id: normalized.contractId,
    id: 123,
  });
  assert.ok(res.contractId);
  const row = await store.getByShopifyContractId(normalized.contractId);
  assert.equal(row.user_id, user.id);
  assert.equal(row.lines[0].title, 'Litter');
  await cleanupUserContracts(user.id);
});

test('webhook: billing_attempts/failure marks the attempt and applies dunning', async () => {
  const user = await makeUser();
  const c = await seedAndMirror(user, {
    weeks: 4,
    lines: [{ basePriceCents: 3000, quantity: 1 }],
    nextBillingAt: new Date(Date.now() - 3600 * 1000),
  });
  // Simulate the pending attempt the cron would have recorded.
  const key = `sub-bill:${c.shopify_contract_id}:cycle:1`;
  await store.recordAttempt({ contractId: c.id, shopifyContractId: c.shopify_contract_id, idempotencyKey: key, attemptNumber: 1 });

  await dispatchSubscriptionWebhook('subscription_billing_attempts/failure', {
    admin_graphql_api_id: 'gid://shopify/SubscriptionBillingAttempt/999',
    subscription_contract_id: c.shopify_contract_id.split('/').pop(),
    idempotency_key: key,
    error_code: 'INSUFFICIENT_FUNDS',
  });

  const attempt = await one('SELECT * FROM subscription_billing_attempts WHERE idempotency_key = $1', [key]);
  assert.equal(attempt.status, 'failure');
  assert.equal(attempt.error_code, 'INSUFFICIENT_FUNDS');
  const row = await store.getByShopifyContractId(c.shopify_contract_id);
  assert.equal(row.billing_failures, 1);
  await cleanupUserContracts(user.id);
});
