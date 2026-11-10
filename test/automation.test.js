// DB tests for lib/automation.js: idempotent journeys, birthday points once, abandoned_hold window.
import '../scripts/load-env.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { query, one, many, closePool } from '../lib/db.js';
import { runAutomations, runJourney, journeyById, localDate, JOURNEYS } from '../lib/automation.js';
import { RULES } from '../lib/points-rules.js';
import { env } from '../lib/env.js';

const suffix = Math.random().toString(36).slice(2, 10);
const NOW = new Date();

async function makeUser(opts = {}) {
  // Marketing journeys only deliver to opted-in users (CASL); default these test users to opted in
  // so the delivery-mechanics assertions exercise the "sent" path.
  const row = await one(
    `INSERT INTO users (email, handle, display_name, paw_points, created_at, last_seen_at, marketing_opt_in) VALUES ($1, $2, $3, $4, $5, $5, $6) RETURNING id`,
    [`auto-${suffix}-${Math.random().toString(36).slice(2, 6)}@test.local`, `auto_${suffix}_${Math.random().toString(36).slice(2, 6)}`, 'Auto Tester', opts.pawPoints ?? 30, opts.createdAt ?? NOW, opts.marketingOptIn ?? true],
  );
  return row.id;
}

const hoursAgo = (h) => new Date(NOW.getTime() - h * 3_600_000);

async function signupEvent(userId, at) {
  await query(`INSERT INTO events (user_id, name, props, created_at) VALUES ($1, 'signup', '{}', $2)`, [userId, at]);
}

const rowsFor = (userId, journey) =>
  many(`SELECT channel, status, dedupe_key, payload FROM notifications WHERE user_id = $1 AND journey = $2 ORDER BY channel`, [userId, journey]);

after(async () => {
  await query(`DELETE FROM users WHERE email LIKE $1`, [`auto-${suffix}-%`]);
  await closePool();
});

test('every journey has the required shape', () => {
  for (const j of JOURNEYS) {
    assert.ok(j.id, 'id');
    assert.ok(Array.isArray(j.channels) && j.channels.length, `${j.id} channels`);
    assert.equal(typeof j.select, 'function', `${j.id} select`);
    assert.equal(typeof j.dedupeKey, 'function', `${j.id} dedupeKey`);
    assert.equal(typeof j.build, 'function', `${j.id} build`);
  }
  const ids = JOURNEYS.map((j) => j.id);
  for (const id of ['welcome_d0', 'welcome_d1', 'welcome_d3', 'first_creation_nudge', 'pet_birthday', 'replenishment', 'winback_30d', 'points_expiring_30d', 'post_purchase_review_request', 'abandoned_hold', 'partner_inactive_60d', 'partner_monthly_statement']) {
    assert.ok(ids.includes(id), `journey ${id} implemented`);
  }
});

test('welcome_d0: signup event within 24h → one email + one inapp, idempotent across two runs', async () => {
  const userId = await makeUser();
  await signupEvent(userId, hoursAgo(1));

  const r1 = await runAutomations(NOW, { only: ['welcome_d0', 'welcome_d1', 'welcome_d3', 'first_creation_nudge'] });
  assert.ok(r1.journeys.welcome_d0 >= 1, 'created on first run');
  assert.ok(r1.delivered, 'delivery ran');

  const r2 = await runAutomations(NOW, { only: ['welcome_d0'] });
  const rows = await rowsFor(userId, 'welcome_d0');
  assert.equal(rows.length, 2, 'exactly email + inapp');
  assert.deepEqual(rows.map((r) => r.channel), ['email', 'inapp']);
  assert.equal(rows.find((r) => r.channel === 'email').status, 'sent', 'email delivered (mock)');
  assert.equal(rows.find((r) => r.channel === 'inapp').status, 'queued', 'inapp row stays for the inbox');
  assert.equal(rows[0].payload.pawPoints, 30);
  assert.ok(rows[0].dedupe_key.startsWith(`welcome_d0:user:${userId}`));

  // Second run must create nothing new for this user, in any journey
  const total = await one(`SELECT count(*)::int AS c FROM notifications WHERE user_id = $1`, [userId]);
  assert.equal(total.c, 2);
  assert.ok(r2.journeys.welcome_d0 === 0 || (await rowsFor(userId, 'welcome_d0')).length === 2);

  // Too fresh for d1/d3/nudge
  assert.equal((await rowsFor(userId, 'welcome_d1')).length, 0);
  assert.equal((await rowsFor(userId, 'welcome_d3')).length, 0);
  assert.equal((await rowsFor(userId, 'first_creation_nudge')).length, 0);
});

test('welcome_d1 / welcome_d3 / first_creation_nudge select by signup age', async () => {
  const d1 = await makeUser();
  await signupEvent(d1, hoursAgo(30));
  const d3 = await makeUser();
  await signupEvent(d3, hoursAgo(80));
  const withGen = await makeUser();
  await signupEvent(withGen, hoursAgo(80));
  await query(`INSERT INTO ai_generations (user_id, kind, model, prompt, status) VALUES ($1, 'image', 'm', 'p', 'done')`, [withGen]);

  await runAutomations(NOW, { only: ['welcome_d0', 'welcome_d1', 'welcome_d3', 'first_creation_nudge'], deliver: false });

  assert.equal((await rowsFor(d1, 'welcome_d1')).length, 2);
  assert.equal((await rowsFor(d1, 'welcome_d0')).length, 0);
  assert.equal((await rowsFor(d1, 'first_creation_nudge')).length, 0, 'd1 user is under 48h');

  assert.equal((await rowsFor(d3, 'welcome_d3')).length, 2);
  assert.equal((await rowsFor(d3, 'first_creation_nudge')).length, 2, 'no generation after 48h → nudge');
  assert.equal((await rowsFor(withGen, 'first_creation_nudge')).length, 0, 'has a generation → no nudge');
  assert.equal((await rowsFor(withGen, 'welcome_d3')).length, 2);
});

test('pet_birthday: awards petBirthdayBonus exactly once even when run twice', async () => {
  const userId = await makeUser({ pawPoints: 10 });
  const { year, month, day } = localDate(NOW, env.timezone);
  const birthday = `${year - 3}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const pet = await one(`INSERT INTO pets (user_id, name, species, birthday) VALUES ($1, 'Milo', 'dog', $2::date) RETURNING id`, [userId, birthday]);

  const j = journeyById('pet_birthday');
  const r1 = await runJourney(j, NOW);
  assert.ok(r1.created >= 1);
  const r2 = await runJourney(j, NOW);
  await runJourney(j, NOW);

  const rows = await rowsFor(userId, 'pet_birthday');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].payload.petName, 'Milo');
  assert.equal(rows[0].payload.age, 3);
  assert.ok(rows[0].dedupe_key.startsWith(`pet_birthday:pet:${pet.id}:${year}`));

  const user = await one(`SELECT paw_points FROM users WHERE id = $1`, [userId]);
  assert.equal(user.paw_points, 10 + RULES.petBirthdayBonus, 'bonus awarded once');
  const ledger = await many(`SELECT amount, type, source, ref_id FROM point_transactions WHERE user_id = $1`, [userId]);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].ref_id, `birthday:${pet.id}:${year}`);
  assert.equal(ledger[0].type, 'bonus');
  assert.equal(r2.created, 0);
});

test('abandoned_hold: selects holds held for 2h–24h only', async () => {
  const userId = await makeUser();
  const mk = (hours, status = 'held') =>
    one(
      `INSERT INTO point_holds (user_id, cart_id, points, discount_cents, discount_code, status, expires_at, created_at)
       VALUES ($1, 'gid://cart/' || $2, 100, 500, $2, $3, $4, $5) RETURNING id`,
      [userId, `HOLD-${suffix}-${hours}-${status}`, status, hoursAgo(-24), hoursAgo(hours)],
    );
  const fresh = await mk(1);
  const due = await mk(3);
  const stale = await mk(30);
  const captured = await mk(5, 'captured');

  const j = journeyById('abandoned_hold');
  const rows = await j.select(NOW);
  const ids = rows.filter((r) => r.user_id === userId).map((r) => r.hold_id);
  assert.deepEqual(ids, [due.id]);
  assert.ok(!ids.includes(fresh.id) && !ids.includes(stale.id) && !ids.includes(captured.id));

  await runJourney(j, NOW);
  await runJourney(j, NOW);
  const notes = await rowsFor(userId, 'abandoned_hold');
  assert.equal(notes.length, 2);
  assert.equal(notes[0].payload.holdId, due.id);
  assert.equal(notes[0].payload.points, 100);
});

test('replenishment: two orders of the same SKU → due estimate from the interval', async () => {
  const userId = await makeUser();
  const order = (daysAgo, n) =>
    query(
      `INSERT INTO shop_orders (user_id, shopify_order_id, order_number, subtotal_cents, total_cents, status, line_items, placed_at)
       VALUES ($1, $2, $3, 5000, 5650, 'delivered', $4::jsonb, $5)`,
      [userId, `so-${suffix}-${n}`, `${n}`, JSON.stringify([{ sku: `FOOD-${suffix}`, handle: 'food', title: 'Dog Food 11kg', quantity: 1, price_cents: 5000 }]), hoursAgo(daysAgo * 24)],
    );
  // 30-day cycle: last order 26 days ago → runs out in 4 days → inside the −5 day window.
  await order(56, 1);
  await order(26, 2);

  const j = journeyById('replenishment');
  const mine = (await j.select(NOW)).filter((r) => r.user_id === userId);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].sku, `FOOD-${suffix}`);
  assert.equal(Math.round(Number(mine[0].interval_days)), 30);

  await runJourney(j, NOW);
  await runJourney(j, NOW);
  const notes = await rowsFor(userId, 'replenishment');
  assert.equal(notes.length, 2);
  assert.ok(notes[0].payload.daysLeft >= 3 && notes[0].payload.daysLeft <= 5, `daysLeft ${notes[0].payload.daysLeft}`);
});

test('winback_30d: inactive 30–45 days → offer once, points awarded once', async () => {
  const userId = await makeUser({ pawPoints: 0, createdAt: hoursAgo(24 * 35) });
  const j = journeyById('winback_30d');
  await runJourney(j, NOW);
  await runJourney(j, NOW);
  const notes = await rowsFor(userId, 'winback_30d');
  assert.equal(notes.length, 2);
  const user = await one(`SELECT paw_points FROM users WHERE id = $1`, [userId]);
  assert.equal(user.paw_points, RULES.winbackBonus ?? 15);

  const active = await makeUser({ pawPoints: 0, createdAt: hoursAgo(24 * 10) });
  await runJourney(j, NOW);
  assert.equal((await rowsFor(active, 'winback_30d')).length, 0);
});

test('post_purchase_review_request: delivered 3–5 days ago without review', async () => {
  const userId = await makeUser();
  const ins = (daysAgo, n, status = 'delivered') =>
    one(
      `INSERT INTO shop_orders (user_id, shopify_order_id, order_number, status, line_items, placed_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, '[{"sku":"X","handle":"x","title":"Treats"}]'::jsonb, $5, $5, $5) RETURNING id`,
      [userId, `rv-${suffix}-${n}`, `${n}`, status, hoursAgo(daysAgo * 24)],
    );
  const due = await ins(4, 1);
  const tooNew = await ins(1, 2);
  const paidOnly = await ins(4, 3, 'paid');
  const reviewed = await ins(4, 4);
  await query(`INSERT INTO product_reviews (user_id, product_handle, order_id, rating) VALUES ($1, 'x', $2, 5)`, [userId, reviewed.id]);

  const j = journeyById('post_purchase_review_request');
  const ids = (await j.select(NOW)).filter((r) => r.user_id === userId).map((r) => r.order_id);
  assert.deepEqual(ids, [due.id]);
  assert.ok(!ids.includes(tooNew.id) && !ids.includes(paidOnly.id) && !ids.includes(reviewed.id));
});

test('runAutomations records the last run in app_settings', async () => {
  await runAutomations(NOW, { only: ['abandoned_hold'], deliver: false });
  const row = await one(`SELECT value FROM app_settings WHERE key = 'automation.last_run'`);
  assert.ok(row);
  assert.ok(row.value.at);
  assert.equal(typeof row.value.journeys.abandoned_hold, 'number');
});
