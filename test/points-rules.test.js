// Pure tests for lib/points-rules.js (no DB).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RULES,
  allowedDurations,
  pointsToCents,
  centsToPoints,
  nearestDuration,
  generationCost,
  maxRedeemablePoints,
  orderEarnPoints,
  validateRedeem,
  describeWays,
  findPack,
} from '../lib/points-rules.js';

test('core constants match the approved plan', () => {
  assert.equal(RULES.valueCents, 5);
  assert.equal(RULES.welcomeBonus, 30);
  assert.equal(RULES.referredSignupBonus, 10);
  assert.equal(RULES.referralConversionBonus, 20);
  assert.equal(RULES.minRedeem, 20);
  assert.equal(RULES.maxRedeemPercent, 50);
  assert.equal(RULES.expiryMonths, 12);
  assert.equal(RULES.dailyGenerationCap, 20);
  assert.deepEqual(allowedDurations, [6, 10, 15]);
  assert.equal(RULES.packs.length, 3);
  assert.ok(Object.isFrozen(RULES));
});

test('points <-> cents', () => {
  assert.equal(pointsToCents(1), 5);
  assert.equal(pointsToCents(100), 500);
  assert.equal(pointsToCents(-3), 0);
  assert.equal(centsToPoints(500), 100);
  assert.equal(centsToPoints(499), 99);
  assert.equal(centsToPoints(4), 0);
});

test('nearestDuration snaps to allowed values (ties go longer)', () => {
  assert.equal(nearestDuration(1), 6);
  assert.equal(nearestDuration(6), 6);
  assert.equal(nearestDuration(7), 6);
  assert.equal(nearestDuration(8), 10);
  assert.equal(nearestDuration(12), 10);
  assert.equal(nearestDuration(13), 15);
  assert.equal(nearestDuration(99), 15);
  assert.equal(nearestDuration(undefined), 10);
});

test('generationCost: image 2, video 8/12/16, HD x2', () => {
  assert.equal(generationCost({ kind: 'image' }), 2);
  assert.equal(generationCost({ kind: 'image', hd: true }), 4);
  assert.equal(generationCost({ kind: 'video', duration: 6 }), 8);
  assert.equal(generationCost({ kind: 'video', duration: 10 }), 12);
  assert.equal(generationCost({ kind: 'video', duration: 15 }), 16);
  assert.equal(generationCost({ kind: 'video', duration: 8 }), 12); // snapped to 10 s
  assert.equal(generationCost({ kind: 'video', duration: 15, hd: true }), 32);
  assert.throws(() => generationCost({ kind: 'gif' }));
});

test('maxRedeemablePoints = min(50% of subtotal / $0.05, balance)', () => {
  // $40.00 cart → 50% = $20.00 → 400 PP
  assert.equal(maxRedeemablePoints(4000, 1000), 400);
  assert.equal(maxRedeemablePoints(4000, 150), 150);
  assert.equal(maxRedeemablePoints(0, 150), 0);
  assert.equal(maxRedeemablePoints(999, 1000), 99); // 499.5 cents → 99 PP
  assert.equal(maxRedeemablePoints(4000, -5), 0);
});

test('orderEarnPoints: 1 PP per full dollar of cash subtotal', () => {
  assert.equal(orderEarnPoints(0), 0);
  assert.equal(orderEarnPoints(99), 0);
  assert.equal(orderEarnPoints(100), 1);
  assert.equal(orderEarnPoints(4599), 45);
});

test('validateRedeem enforces min, balance and cart cap', () => {
  assert.equal(validateRedeem({ points: 10, subtotalCents: 10000, balance: 500 }).ok, false);
  assert.match(validateRedeem({ points: 10, subtotalCents: 10000, balance: 500 }).error, /Minimum 20/);
  assert.equal(validateRedeem({ points: 600, subtotalCents: 10000, balance: 500 }).error, 'Not enough Paw Points');
  const capped = validateRedeem({ points: 500, subtotalCents: 2000, balance: 500 });
  assert.equal(capped.ok, false);
  assert.equal(capped.max, 200);
  assert.equal(validateRedeem({ points: 200, subtotalCents: 2000, balance: 500 }).ok, true);
  assert.equal(validateRedeem({ points: 20.5, subtotalCents: 2000, balance: 500 }).ok, false);
});

test('describeWays reflects one-time flags', () => {
  const generic = describeWays();
  assert.ok(generic.length >= 8);
  assert.ok(generic.every((w) => typeof w.id === 'string' && typeof w.title === 'string' && Number.isInteger(w.points) && typeof w.done === 'boolean'));
  const ways = describeWays({ bonus_welcome: true, bonus_first_post: true });
  assert.equal(ways.find((w) => w.id === 'welcome').done, true);
  assert.equal(ways.find((w) => w.id === 'first_post').done, true);
  assert.equal(ways.find((w) => w.id === 'first_order').done, false);
});

test('findPack by sku, handle or points', () => {
  assert.equal(findPack({ sku: 'PP-300' }).points, 300);
  assert.equal(findPack({ points: 1000 }).priceCents, 3499);
  assert.equal(findPack({ handle: 'paw-points-100' }).sku, 'PP-100');
  assert.equal(findPack({ sku: 'nope' }), null);
});
