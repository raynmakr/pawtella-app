// Pure subscription logic: tier math, cadence normalization, tier transitions, eligibility,
// billing-due selection, dunning. No DB; fast.
import '../scripts/load-env.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SUB_RULES } from '../lib/subscriptions/rules.js';
import {
  lineMonthlyCents,
  contractMonthlyCents,
  customerMonthlyCents,
  tierForMonthlyCents,
  tierForCustomer,
  discountedPriceCents,
} from '../lib/subscriptions/tiers.js';
import {
  isValidCadence,
  normalizeCadence,
  planNameForWeeks,
  weeksFromBillingPolicy,
} from '../lib/subscriptions/cadence.js';
import { classifyFood, eligibleCategory, isEligible } from '../lib/subscriptions/eligibility.js';
import { isDueForBilling, advanceBillingDate, nextDunningStep } from '../lib/subscriptions/dunning.js';

// ---- cadence normalization -------------------------------------------------------------------

test('cadence: accepts 2/4/6/8 weeks and rejects others', () => {
  for (const w of [2, 4, 6, 8]) assert.equal(isValidCadence(w), true);
  for (const w of [1, 3, 5, 7, 12, 0, -2]) assert.equal(isValidCadence(w), false);
});

test('cadence: normalizes loose input', () => {
  assert.equal(normalizeCadence(4), 4);
  assert.equal(normalizeCadence('6'), 6);
  assert.equal(normalizeCadence('every 8 weeks'), 8);
  assert.equal(normalizeCadence({ weeks: 2 }), 2);
  assert.equal(normalizeCadence({ intervalCount: 4 }), 4);
  assert.equal(normalizeCadence('3'), null); // unsupported cadence
  assert.equal(normalizeCadence('weekly'), null);
  assert.equal(normalizeCadence(null), null);
});

test('cadence: plan name and policy weeks', () => {
  assert.equal(planNameForWeeks(4), 'Deliver every 4 weeks');
  assert.equal(weeksFromBillingPolicy({ interval: 'WEEK', intervalCount: 6 }), 6);
  assert.equal(weeksFromBillingPolicy({ interval: 'DAY', intervalCount: 28 }), 4);
  assert.equal(weeksFromBillingPolicy({ interval: 'MONTH', intervalCount: 1 }), 4);
  assert.equal(weeksFromBillingPolicy(null), null);
});

// ---- tier math -------------------------------------------------------------------------------

test('tier: normalize a line to per-month cents', () => {
  // $50 every 2 weeks → 5000 * 4.345/2 = 10862.5
  assert.equal(lineMonthlyCents({ priceCents: 5000, quantity: 1, weeks: 2 }), 10862.5);
  // $20 x2 every 4 weeks → 2000*2*4.345/4 = 4345
  assert.equal(lineMonthlyCents({ priceCents: 2000, quantity: 2, weeks: 4 }), 4345);
  // invalid cadence → 0
  assert.equal(lineMonthlyCents({ priceCents: 5000, quantity: 1, weeks: 0 }), 0);
});

test('tier: discounted unit price rounds to integer cents', () => {
  assert.equal(discountedPriceCents(1999, 5), 1899); // 1999*0.95 = 1899.05 → 1899
  assert.equal(discountedPriceCents(1999, 10), 1799); // 1999*0.90 = 1799.1 → 1799
  assert.equal(discountedPriceCents(1000, 0), 1000);
});

test('tier: threshold is strictly-greater-than $100/month', () => {
  assert.equal(tierForMonthlyCents(9999), SUB_RULES.baseDiscountPercent);
  assert.equal(tierForMonthlyCents(10000), SUB_RULES.baseDiscountPercent); // "$100 or below" stays base
  assert.equal(tierForMonthlyCents(10001), SUB_RULES.tierDiscountPercent);
});

test('tier: contract + customer aggregation', () => {
  const c1 = { status: 'active', intervalWeeks: 4, lines: [{ basePriceCents: 4000, quantity: 1 }] };
  // 4000 * 4.345/4 = 4345/month
  assert.equal(contractMonthlyCents(c1), 4345);
  const c2 = { status: 'active', intervalWeeks: 4, lines: [{ basePriceCents: 6000, quantity: 1 }] };
  // 6000 * 4.345/4 = 6517.5 ; total 10862.5 > 10000 → tier 10
  assert.equal(customerMonthlyCents([c1, c2]) > SUB_RULES.tierThresholdCents, true);
  assert.equal(tierForCustomer([c1, c2]), 10);
  // c1 alone is below threshold → tier 5
  assert.equal(tierForCustomer([c1]), 5);
});

test('tier: paused/cancelled contracts do not count toward the tier', () => {
  const active = { status: 'active', intervalWeeks: 2, lines: [{ basePriceCents: 4000, quantity: 1 }] };
  const paused = { status: 'paused', intervalWeeks: 2, lines: [{ basePriceCents: 9000, quantity: 1 }] };
  // active alone: 4000 * 4.345/2 = 8690 < 10000 → tier 5 even though the paused one is huge
  assert.equal(tierForCustomer([active, paused]), 5);
});

test('tier: transition does not oscillate (base price drives tier, not discounted price)', () => {
  // Base monthly just over the line → tier 10. The 10% discount must NOT drop us back to tier 5.
  const base = { status: 'active', intervalWeeks: 4, lines: [{ basePriceCents: 9300, quantity: 1 }] };
  // 9300 * 4.345/4 = 10102.125 > 10000 → tier 10
  assert.equal(tierForCustomer([base]), 10);
  // Even if a naive engine recomputed on the discounted price, our engine keys off base, so re-running
  // with the same base keeps tier 10 (stable).
  assert.equal(tierForCustomer([base]), 10);
});

// ---- eligibility -----------------------------------------------------------------------------

test('eligibility: food + litter collections are eligible, others are not', () => {
  assert.equal(eligibleCategory({ collections: ['dog-food'], title: 'Kibble' }), 'dry');
  assert.equal(eligibleCategory({ collections: ['cat-food'], title: 'Wet pate dinner' }), 'wet');
  assert.equal(eligibleCategory({ collections: ['litter-hygiene'], title: 'Clumping litter' }), 'litter');
  assert.equal(eligibleCategory({ collections: ['toys'], title: 'Rope toy' }), null);
  assert.equal(isEligible({ collections: ['dog-food'], title: 'Anything' }), true);
  assert.equal(isEligible({ collections: ['accessories'] }), false);
});

test('eligibility: collections may be {handle} objects', () => {
  assert.equal(eligibleCategory({ collections: [{ handle: 'cat-food' }], productType: 'Dry Food' }), 'dry');
});

test('eligibility: dry/wet classification best-effort, defaults to dry', () => {
  assert.equal(classifyFood({ title: 'Chicken Kibble 2kg' }), 'dry');
  assert.equal(classifyFood({ title: 'Salmon Pâté', tags: ['canned'] }), 'wet');
  assert.equal(classifyFood({ productType: 'Wet Food' }), 'wet');
  assert.equal(classifyFood({ title: 'Mystery Food' }), 'dry');
});

// ---- billing-due selection -------------------------------------------------------------------

test('billing: due only for active contracts with a past next_billing_at', () => {
  const now = new Date('2026-11-09T12:00:00Z');
  assert.equal(isDueForBilling({ status: 'active', nextBillingAt: '2026-11-09T00:00:00Z' }, now), true);
  assert.equal(isDueForBilling({ status: 'active', nextBillingAt: '2026-11-10T00:00:00Z' }, now), false);
  assert.equal(isDueForBilling({ status: 'paused', nextBillingAt: '2026-01-01T00:00:00Z' }, now), false);
  assert.equal(isDueForBilling({ status: 'active', nextBillingAt: null }, now), false);
  assert.equal(isDueForBilling({ status: 'active', next_billing_at: '2026-11-08T00:00:00Z' }, now), true);
});

test('billing: advance date adds whole weeks', () => {
  const from = new Date('2026-11-09T00:00:00Z');
  assert.equal(advanceBillingDate(4, from).toISOString(), '2026-12-07T00:00:00.000Z');
  assert.equal(advanceBillingDate(2, from).toISOString(), '2026-11-23T00:00:00.000Z');
});

// ---- dunning ---------------------------------------------------------------------------------

test('dunning: success resets failures', () => {
  assert.deepEqual(nextDunningStep({ succeeded: true, failures: 2 }), { action: 'success', failures: 0 });
});

test('dunning: 3 retries over ~7 days then pause', () => {
  // first failure → retry #2 in 2 days
  assert.deepEqual(nextDunningStep({ succeeded: false, failures: 0 }), {
    action: 'retry', attemptNumber: 2, retryInDays: 2, failures: 1,
  });
  // second failure → retry #3 in 3 days
  assert.deepEqual(nextDunningStep({ succeeded: false, failures: 1 }), {
    action: 'retry', attemptNumber: 3, retryInDays: 3, failures: 2,
  });
  // third failure → retry #4 in 2 days
  assert.deepEqual(nextDunningStep({ succeeded: false, failures: 2 }), {
    action: 'retry', attemptNumber: 4, retryInDays: 2, failures: 3,
  });
  // fourth failure → pause
  assert.deepEqual(nextDunningStep({ succeeded: false, failures: 3 }), { action: 'pause', failures: 4 });
  // total retry window sums to ~7 days
  assert.equal(SUB_RULES.retryIntervalDays.reduce((a, b) => a + b, 0), 7);
});
