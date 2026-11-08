// lib/points.js against the local Postgres: award/spend/402, holds, awardOnce under concurrency, expiry.
import '../scripts/load-env.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { one, many, query, closePool, withTransaction } from '../lib/db.js';
import { ApiError } from '../lib/http.js';
import { RULES } from '../lib/points-rules.js';
import {
  getBalance,
  awardPoints,
  awardOnce,
  spendPoints,
  createHold,
  captureHold,
  releaseHold,
  releaseExpiredHolds,
  awardOrderPoints,
  grantPackPoints,
  refundGeneration,
  expireInactivePoints,
  listTransactions,
} from '../lib/points.js';

const suffix = () => crypto.randomBytes(5).toString('hex');

async function makeUser(points = 0) {
  const s = suffix();
  return one(
    `INSERT INTO users (email, handle, display_name, paw_points) VALUES ($1, $2, $3, $4) RETURNING *`,
    [`pts-${s}@test.local`, `pts_${s}`, 'Points Tester', points],
  );
}

after(() => closePool());

test('awardPoints credits, bumps lifetime for earn/bonus/purchase and writes a ledger row', async () => {
  const u = await makeUser();
  const r = await awardPoints(u.id, 30, { type: 'bonus', source: 'welcome', description: 'Welcome!' });
  assert.equal(r.balanceAfter, 30);
  await awardPoints(u.id, 7, { type: 'refund', source: 'ai_image' });
  const b = await getBalance(u.id);
  assert.deepEqual(b, { pawPoints: 37, lifetimeEarned: 30, held: 0 });
  const rows = await many('SELECT * FROM point_transactions WHERE user_id = $1 ORDER BY id', [u.id]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].balance_after, 30);
  assert.equal(rows[1].balance_after, 37);
  assert.equal(rows[1].type, 'refund');
  await assert.rejects(() => awardPoints(u.id, 0, { source: 'x' }), /positive integer/);
  await assert.rejects(() => awardPoints(u.id, 5, { type: 'spend', source: 'x' }), /Invalid credit type/);
});

test('spendPoints debits and throws 402 with needed/balance when short', async () => {
  const u = await makeUser(10);
  const r = await spendPoints(u.id, 4, { source: 'ai_image', refType: 'generation', refId: 1 });
  assert.equal(r.balanceAfter, 6);
  let err;
  try {
    await spendPoints(u.id, 8, { source: 'ai_video' });
  } catch (e) {
    err = e;
  }
  assert.ok(err instanceof ApiError);
  assert.equal(err.status, 402);
  assert.equal(err.message, 'Not enough Paw Points');
  assert.deepEqual(err.extra, { needed: 8, balance: 6 });
  assert.equal((await getBalance(u.id)).pawPoints, 6);
  const spend = await one(`SELECT * FROM point_transactions WHERE user_id = $1 AND type = 'spend'`, [u.id]);
  assert.equal(spend.amount, -4);
  assert.equal(spend.ref_id, '1');
});

test('spendPoints composes inside a caller transaction and rolls back with it', async () => {
  const u = await makeUser(10);
  await assert.rejects(
    withTransaction(async (tx) => {
      await spendPoints(u.id, 5, { source: 'ai_image' }, tx);
      throw new Error('boom');
    }),
    /boom/,
  );
  assert.equal((await getBalance(u.id)).pawPoints, 10);
});

test('awardOnce is idempotent under 5 concurrent calls', async () => {
  const u = await makeUser();
  const results = await Promise.all(
    Array.from({ length: 5 }, () => awardOnce(u.id, 'bonus_first_post', RULES.firstPostBonus, { source: 'first_post' })),
  );
  assert.equal(results.filter((r) => r.awarded).length, 1);
  const b = await getBalance(u.id);
  assert.equal(b.pawPoints, RULES.firstPostBonus);
  assert.equal(b.lifetimeEarned, RULES.firstPostBonus);
  const rows = await many(`SELECT * FROM point_transactions WHERE user_id = $1`, [u.id]);
  assert.equal(rows.length, 1);
  const again = await awardOnce(u.id, 'bonus_first_post', 5, { source: 'first_post' });
  assert.equal(again.awarded, false);
  await assert.rejects(() => awardOnce(u.id, 'paw_points', 5, {}), /unknown flag column/);
});

test('hold → capture: debits once, marks captured, links the order', async () => {
  const u = await makeUser(500);
  const hold = await createHold(u.id, { cartId: `gid://shopify/Cart/${suffix()}`, points: 100, subtotalCents: 4000 });
  assert.equal(hold.status, 'held');
  assert.equal(hold.points, 100);
  assert.equal(hold.discount_cents, 500);
  assert.match(hold.discount_code, /^PAW-[A-Z2-9]{6}$/);
  assert.ok(new Date(hold.expires_at) > new Date(Date.now() + 23 * 3600 * 1000));
  let b = await getBalance(u.id);
  assert.deepEqual(b, { pawPoints: 400, lifetimeEarned: 0, held: 100 });

  const order = await one(
    `INSERT INTO shop_orders (user_id, shopify_order_id, subtotal_cents, discount_codes) VALUES ($1, $2, 3500, $3) RETURNING *`,
    [u.id, `order-${suffix()}`, [hold.discount_code]],
  );
  const captured = await withTransaction((tx) => captureHold(hold.discount_code.toLowerCase(), { orderId: order.id }, tx));
  assert.equal(captured.status, 'captured');
  assert.equal(captured.order_id, order.id);
  b = await getBalance(u.id);
  assert.deepEqual(b, { pawPoints: 400, lifetimeEarned: 0, held: 0 }); // no second debit
  const o = await one('SELECT points_redeemed FROM shop_orders WHERE id = $1', [order.id]);
  assert.equal(o.points_redeemed, 100);
  const spend = await one(`SELECT * FROM point_transactions WHERE user_id = $1 AND type = 'spend'`, [u.id]);
  assert.equal(spend.amount, 0);
  assert.equal(spend.metadata.points, 100);
  // capturing again is a no-op that returns the captured hold
  const again = await withTransaction((tx) => captureHold(hold.discount_code, { orderId: order.id }, tx));
  assert.equal(again.status, 'captured');
  assert.equal(await withTransaction((tx) => captureHold('PAW-NOPE00', {}, tx)), null);
});

test('hold → release credits back; expired holds are released by the sweep', async () => {
  const u = await makeUser(300);
  const hold = await createHold(u.id, { cartId: `gid://shopify/Cart/${suffix()}`, points: 60, subtotalCents: 2000 });
  assert.equal((await getBalance(u.id)).pawPoints, 240);
  const released = await releaseHold(hold.id);
  assert.equal(released.status, 'released');
  const b = await getBalance(u.id);
  assert.deepEqual(b, { pawPoints: 300, lifetimeEarned: 0, held: 0 });
  assert.equal(await releaseHold(hold.id), null);
  const rel = await one(`SELECT * FROM point_transactions WHERE user_id = $1 AND type = 'release'`, [u.id]);
  assert.equal(rel.amount, 60);

  const hold2 = await createHold(u.id, { cartId: `gid://shopify/Cart/${suffix()}`, points: 40, subtotalCents: 2000 });
  await query(`UPDATE point_holds SET expires_at = now() - interval '1 minute' WHERE id = $1`, [hold2.id]);
  const count = await releaseExpiredHolds();
  assert.ok(count >= 1);
  assert.equal((await one('SELECT status FROM point_holds WHERE id = $1', [hold2.id])).status, 'released');
  assert.equal((await getBalance(u.id)).pawPoints, 300);
});

test('createHold validates min, cart cap and balance', async () => {
  const u = await makeUser(100);
  await assert.rejects(() => createHold(u.id, { cartId: 'c', points: 10, subtotalCents: 10000 }), /Minimum 20/);
  await assert.rejects(() => createHold(u.id, { cartId: 'c', points: 90, subtotalCents: 800 }), /Maximum 80 Paw Points/);
  let err;
  try {
    await createHold(u.id, { cartId: 'c', points: 150, subtotalCents: 100000 });
  } catch (e) {
    err = e;
  }
  assert.equal(err.status, 402);
  assert.equal((await getBalance(u.id)).pawPoints, 100);
  assert.equal(await one(`SELECT count(*)::int AS n FROM point_holds WHERE user_id = $1`, [u.id]).then((r) => r.n), 0);
});

test('awardOrderPoints: 1 PP per $1 + first-order bonus, idempotent', async () => {
  const u = await makeUser();
  const order = await one(
    `INSERT INTO shop_orders (user_id, shopify_order_id, order_number, subtotal_cents) VALUES ($1, $2, '1001', 4599) RETURNING *`,
    [u.id, `order-${suffix()}`],
  );
  const pts = await withTransaction((tx) => awardOrderPoints(order, tx));
  assert.equal(pts, 45);
  const b = await getBalance(u.id);
  assert.equal(b.pawPoints, 45 + RULES.firstOrderBonus);
  assert.equal(b.lifetimeEarned, 45 + RULES.firstOrderBonus);
  assert.equal((await one('SELECT points_earned FROM shop_orders WHERE id = $1', [order.id])).points_earned, 45);
  // replay: nothing more
  const again = await withTransaction((tx) => awardOrderPoints({ ...order, points_earned: 45 }, tx));
  assert.equal(again, 45);
  assert.equal((await getBalance(u.id)).pawPoints, 45 + RULES.firstOrderBonus);
  // second order: no bonus
  const order2 = await one(`INSERT INTO shop_orders (user_id, shopify_order_id, subtotal_cents) VALUES ($1, $2, 250) RETURNING *`, [u.id, `order-${suffix()}`]);
  assert.equal(await withTransaction((tx) => awardOrderPoints(order2, tx)), 2);
  assert.equal((await getBalance(u.id)).pawPoints, 45 + RULES.firstOrderBonus + 2);
});

test('grantPackPoints credits type purchase and marks the order', async () => {
  const u = await makeUser();
  const order = await one(`INSERT INTO shop_orders (user_id, shopify_order_id, subtotal_cents) VALUES ($1, $2, 499) RETURNING *`, [u.id, `order-${suffix()}`]);
  await withTransaction((tx) => grantPackPoints(u.id, 100, { orderId: order.id }, tx));
  const b = await getBalance(u.id);
  assert.equal(b.pawPoints, 100);
  assert.equal(b.lifetimeEarned, 100);
  assert.equal((await one('SELECT pack_points_granted FROM shop_orders WHERE id = $1', [order.id])).pack_points_granted, 100);
  const row = await one(`SELECT type, source FROM point_transactions WHERE user_id = $1`, [u.id]);
  assert.deepEqual(row, { type: 'purchase', source: 'pack' });
});

test('refundGeneration refunds charged − refunded, once', async () => {
  const u = await makeUser(20);
  await spendPoints(u.id, 12, { source: 'ai_video' });
  const gen = await one(
    `INSERT INTO ai_generations (user_id, kind, model, prompt, status, points_charged) VALUES ($1, 'video', 'm', 'p', 'failed', 12) RETURNING *`,
    [u.id],
  );
  assert.equal(await refundGeneration(gen.id), 12);
  assert.equal(await refundGeneration(gen.id), 0);
  assert.equal((await getBalance(u.id)).pawPoints, 20);
  assert.equal((await one('SELECT points_refunded FROM ai_generations WHERE id = $1', [gen.id])).points_refunded, 12);
});

test('expireInactivePoints zeroes stale balances only', async () => {
  const stale = await makeUser(80);
  const fresh = await makeUser(80);
  await query(`UPDATE users SET points_last_activity_at = now() - interval '13 months' WHERE id = $1`, [stale.id]);
  const n = await expireInactivePoints();
  assert.ok(n >= 1);
  assert.equal((await getBalance(stale.id)).pawPoints, 0);
  assert.equal((await getBalance(fresh.id)).pawPoints, 80);
  const row = await one(`SELECT * FROM point_transactions WHERE user_id = $1`, [stale.id]);
  assert.equal(row.type, 'expire');
  assert.equal(row.amount, -80);
});

test('listTransactions paginates with human descriptions', async () => {
  const u = await makeUser();
  await awardPoints(u.id, 30, { type: 'bonus', source: 'welcome' });
  await spendPoints(u.id, 2, { source: 'ai_image' });
  const page = await listTransactions(u.id, { page: 1, limit: 1 });
  assert.equal(page.transactions.length, 1);
  assert.equal(page.hasMore, true);
  assert.equal(page.transactions[0].amount, -2);
  assert.match(page.transactions[0].description, /Spent 2 Paw Points/);
  const page2 = await listTransactions(u.id, { page: 2, limit: 1 });
  assert.equal(page2.transactions[0].amount, 30);
  assert.match(page2.transactions[0].description, /Welcome bonus/);
  assert.equal(page2.hasMore, false);
});
