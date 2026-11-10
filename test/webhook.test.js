// Shopify webhook: HMAC verification, idempotent replay, orders/paid side effects, fulfillment detection,
// pack grants, GDPR redact. Runs the handler in-process with a fake req/res (no network).
import './helpers/shopify-webhook-env.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { query, one, many, closePool } from '../lib/db.js';
import { verifyWebhookHmac, signWebhookBody } from '../lib/shopify.js';
import * as mock from '../lib/shopify-mock.js';
import handler from '../api/webhooks/shopify.js';
import { RULES } from '../lib/points-rules.js';

const SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;
const suffix = () => Math.random().toString(36).slice(2, 9);
const createdUsers = [];
const createdOrders = [];

after(async () => {
  if (createdOrders.length) await query('DELETE FROM shop_orders WHERE shopify_order_id = ANY($1)', [createdOrders]);
  if (createdUsers.length) await query('DELETE FROM users WHERE id = ANY($1)', [createdUsers]);
  await closePool();
});

async function makeUser(extra = {}) {
  const s = suffix();
  const row = await one(`INSERT INTO users (email, handle, display_name, paw_points) VALUES ($1, $2, $3, $4) RETURNING *`, [
    extra.email ?? `wh-${s}@example.com`,
    `wh_${s}`,
    'Webhook Test',
    extra.pawPoints ?? 0,
  ]);
  createdUsers.push(row.id);
  return row;
}

/** Minimal Vercel-like req/res pair. */
function fakeReq({ body, topic = 'orders/paid', webhookId = `wh-${suffix()}`, hmac, secret = SECRET }) {
  const raw = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
  const headers = {
    'content-type': 'application/json',
    'x-shopify-topic': topic,
    'x-shopify-webhook-id': webhookId,
    'x-shopify-shop-domain': 'pawtella-test.myshopify.com',
    'x-shopify-hmac-sha256': hmac ?? signWebhookBody(raw, secret),
  };
  return { method: 'POST', url: '/api/webhooks/shopify', headers, rawBody: raw, query: {} };
}
function fakeRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    headersSent: false,
    writableEnded: false,
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    getHeader(k) {
      return this.headers[k.toLowerCase()];
    },
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(o) {
      this.body = o;
      this.headersSent = true;
      this.writableEnded = true;
      return this;
    },
    end(d) {
      if (d !== undefined && this.body === undefined) this.body = d;
      this.headersSent = true;
      this.writableEnded = true;
      return this;
    },
  };
  return res;
}
async function send(opts) {
  const res = fakeRes();
  await handler(fakeReq(opts), res);
  return res;
}

function orderPayload({ id = Date.now() + Math.floor(Math.random() * 1000), email, userId, lines, shippingLine, discountCodes = [], noteAttributes = [], financial = 'paid', extra = {} } = {}) {
  const subtotal = lines.reduce((s, l) => s + Math.round(parseFloat(l.price) * 100) * l.quantity, 0);
  const discount = discountCodes.reduce((s, d) => s + Math.round(parseFloat(d.amount || 0) * 100), 0);
  const net = subtotal - discount;
  const notes = [...noteAttributes];
  if (userId) notes.push({ name: 'pawtella_user_id', value: String(userId) });
  return {
    id,
    admin_graphql_api_id: `gid://shopify/Order/${id}`,
    name: `#T${id}`,
    order_number: id,
    email,
    currency: 'CAD',
    financial_status: financial,
    fulfillment_status: null,
    subtotal_price: (net / 100).toFixed(2),
    current_subtotal_price: (net / 100).toFixed(2),
    total_discounts: (discount / 100).toFixed(2),
    total_tax: (Math.round(net * 0.13) / 100).toFixed(2),
    total_shipping_price_set: { shop_money: { amount: shippingLine?.price ?? '0.00', currency_code: 'CAD' } },
    total_price: ((net + Math.round(net * 0.13) + Math.round(parseFloat(shippingLine?.price ?? 0) * 100)) / 100).toFixed(2),
    discount_codes: discountCodes,
    line_items: lines.map((l, i) => ({ id: id * 10 + i, ...l })),
    shipping_lines: shippingLine ? [shippingLine] : [],
    note_attributes: notes,
    customer: email ? { id: 1, email } : null,
    created_at: new Date().toISOString(),
    processed_at: new Date().toISOString(),
    cancelled_at: null,
    fulfillments: [],
    ...extra,
  };
}

const kongLine = { sku: 'KONG-CL-L', title: 'KONG Classic Large', quantity: 2, price: '18.99', variant_id: 8000000018, product_id: 7000000018 };
const PICKUP = { code: 'Pickup', title: 'Pickup at Toronto Depot', price: '0.00' };
const LOCAL = { code: 'Local Delivery', title: 'Local Delivery (Toronto)', price: '7.99' };
const SHIP = { code: 'Standard', title: 'Standard Shipping', price: '12.99' };

test('verifyWebhookHmac: timing-safe base64 HMAC-SHA256 of the raw body', () => {
  const raw = Buffer.from('{"hello":"world"}');
  const good = signWebhookBody(raw, 'secret');
  assert.equal(verifyWebhookHmac(raw, good, 'secret'), true);
  assert.equal(verifyWebhookHmac(raw, good, 'other'), false);
  assert.equal(verifyWebhookHmac(Buffer.from('{"hello":"world!"}'), good, 'secret'), false);
  assert.equal(verifyWebhookHmac(raw, 'not-base64!!', 'secret'), false);
  assert.equal(verifyWebhookHmac(raw, '', 'secret'), false);
  assert.equal(verifyWebhookHmac(raw, good, ''), false, 'missing secret never verifies');
});

test('rejects a bad signature with 401 and does not record the webhook', async () => {
  const id = `wh-bad-${suffix()}`;
  const res = await send({ body: orderPayload({ lines: [kongLine] }), webhookId: id, hmac: 'AAAA' });
  assert.equal(res.statusCode, 401);
  assert.equal(await one('SELECT 1 FROM processed_webhooks WHERE id = $1', [`shopify:${id}`]), null);
});

test('orders/paid: creates the order, maps the user, awards points, idempotent on replay', async () => {
  const user = await makeUser();
  const payload = orderPayload({ userId: user.id, email: user.email, lines: [kongLine], shippingLine: PICKUP });
  createdOrders.push(String(payload.id));
  const webhookId = `wh-${suffix()}`;

  const res = await send({ body: payload, webhookId });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.ok, true);
  assert.equal(res.body.isNew, true);

  const order = await one('SELECT * FROM shop_orders WHERE shopify_order_id = $1', [String(payload.id)]);
  assert.ok(order);
  assert.equal(order.user_id, user.id);
  assert.equal(order.subtotal_cents, 3798);
  assert.equal(order.total_cents, Math.round(3798 * 1.13));
  assert.equal(order.fulfillment_type, 'pickup');
  assert.equal(order.status, 'processing');
  assert.equal(order.financial_status, 'paid');
  assert.equal(order.line_items[0].handle, 'kong-classic-large', 'handle resolved from the mock catalog by SKU');
  assert.equal(order.line_items[0].priceCents, 1899);
  assert.equal(order.points_earned, 37, '1 PP per full dollar of subtotal');

  const u = await one('SELECT paw_points, bonus_first_order FROM users WHERE id = $1', [user.id]);
  assert.ok(u.paw_points >= 37, `expected ≥37 points, got ${u.paw_points}`);
  const ev = await one(`SELECT * FROM events WHERE name = 'order_paid' AND user_id = $1 ORDER BY id DESC LIMIT 1`, [user.id]);
  assert.ok(ev, 'order_paid tracked');
  assert.equal(ev.props.orderId, order.id);

  // Replay with the same X-Shopify-Webhook-Id: acknowledged, nothing changes.
  const replay = await send({ body: payload, webhookId });
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.body.duplicate, true);
  const after1 = await one('SELECT paw_points FROM users WHERE id = $1', [user.id]);
  assert.equal(after1.paw_points, u.paw_points);

  // A *different* webhook id for the same order (orders/updated) must not re-award points.
  const upd = await send({ body: { ...payload, fulfillment_status: 'fulfilled', fulfillments: [{ status: 'success', shipment_status: 'ready_for_pickup' }] }, topic: 'orders/updated' });
  assert.equal(upd.statusCode, 200);
  assert.equal(upd.body.isNew, false);
  const after2 = await one('SELECT paw_points FROM users WHERE id = $1', [user.id]);
  assert.equal(after2.paw_points, u.paw_points, 'no double award');
  const o2 = await one('SELECT status, fulfillment_status FROM shop_orders WHERE id = $1', [order.id]);
  assert.equal(o2.status, 'ready_for_pickup');
  const n = await one('SELECT COUNT(*)::int AS c FROM shop_orders WHERE shopify_order_id = $1', [String(payload.id)]);
  assert.equal(n.c, 1);
});

test('fulfillment type detection: pickup / local delivery / shipping / pickup via note attribute', async () => {
  const user = await makeUser();
  const cases = [
    [{ shippingLine: PICKUP }, 'pickup'],
    [{ shippingLine: LOCAL }, 'local_delivery'],
    [{ shippingLine: SHIP }, 'shipping'],
    [{ shippingLine: SHIP, noteAttributes: [{ name: 'pickup', value: 'true' }] }, 'pickup'],
    [{}, 'shipping'],
  ];
  for (const [opts, expected] of cases) {
    const payload = orderPayload({ userId: user.id, email: user.email, lines: [kongLine], ...opts });
    createdOrders.push(String(payload.id));
    const res = await send({ body: payload });
    assert.equal(res.statusCode, 200);
    const order = await one('SELECT fulfillment_type FROM shop_orders WHERE shopify_order_id = $1', [String(payload.id)]);
    assert.equal(order.fulfillment_type, expected, JSON.stringify(opts));
  }
});

test('orders/paid with a Paw Points pack grants the pack and does not earn points on it', async () => {
  const user = await makeUser();
  const pack = { sku: 'PP-300', title: 'Paw Points Pack · 300', quantity: 1, price: '14.25', variant_id: 8000000044, product_id: 7000000044 };
  const payload = orderPayload({ userId: user.id, email: user.email, lines: [pack, { ...kongLine, quantity: 1 }], shippingLine: PICKUP });
  createdOrders.push(String(payload.id));
  const res = await send({ body: payload });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const order = await one('SELECT * FROM shop_orders WHERE shopify_order_id = $1', [String(payload.id)]);
  assert.equal(order.pack_points_granted, 300);
  assert.equal(order.line_items.find((l) => l.sku === 'PP-300').pawPointsPack, 300);
  assert.equal(order.points_earned, 18, 'cash subtotal excludes the pack: $18.99 → 18 PP');
  const u = await one('SELECT paw_points FROM users WHERE id = $1', [user.id]);
  assert.ok(u.paw_points >= 318, `expected ≥318, got ${u.paw_points}`);
  const tx = await many(`SELECT type, source, amount FROM point_transactions WHERE user_id = $1 ORDER BY id`, [user.id]);
  assert.ok(tx.some((t) => t.source === 'pack' && t.amount === 300), JSON.stringify(tx));
});

test('orders/paid with a PAW- discount code captures the hold and records points_redeemed', async () => {
  const user = await makeUser({ pawPoints: 500 });
  const code = `PAW-${suffix().toUpperCase()}`;
  await query(
    `INSERT INTO point_holds (user_id, cart_id, points, discount_cents, discount_code, status, expires_at)
     VALUES ($1, 'gid://shopify/Cart/test', 100, 500, $2, 'held', now() + interval '1 day')`,
    [user.id, code],
  );
  const payload = orderPayload({
    userId: user.id,
    email: user.email,
    lines: [kongLine],
    shippingLine: SHIP,
    discountCodes: [{ code, amount: '5.00', type: 'fixed_amount' }],
  });
  createdOrders.push(String(payload.id));
  const res = await send({ body: payload });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const order = await one('SELECT * FROM shop_orders WHERE shopify_order_id = $1', [String(payload.id)]);
  assert.deepEqual(order.discount_codes, [code]);
  assert.equal(order.discount_cents, 500);
  assert.equal(order.subtotal_cents, 3298, 'subtotal is net of the discount');
  assert.equal(order.points_redeemed, 100);
  const hold = await one('SELECT status, order_id FROM point_holds WHERE discount_code = $1', [code]);
  assert.equal(hold.status, 'captured');
  assert.equal(hold.order_id, order.id);
  await query('DELETE FROM point_holds WHERE discount_code = $1', [code]);
});

test('user mapping falls back to email; unknown buyers get no points but the order is mirrored', async () => {
  const user = await makeUser();
  const byEmail = orderPayload({ email: user.email, lines: [kongLine], shippingLine: SHIP });
  createdOrders.push(String(byEmail.id));
  await send({ body: byEmail });
  assert.equal((await one('SELECT user_id FROM shop_orders WHERE shopify_order_id = $1', [String(byEmail.id)])).user_id, user.id);

  const anon = orderPayload({ email: `nobody-${suffix()}@example.com`, lines: [kongLine], shippingLine: SHIP });
  createdOrders.push(String(anon.id));
  const res = await send({ body: anon });
  assert.equal(res.statusCode, 200);
  const o = await one('SELECT user_id, points_earned FROM shop_orders WHERE shopify_order_id = $1', [String(anon.id)]);
  assert.equal(o.user_id, null);
  assert.equal(o.points_earned, 0);
});

test('orders/cancelled marks the order cancelled; fulfillments/update maps shipping statuses', async () => {
  const user = await makeUser();
  const payload = orderPayload({ userId: user.id, email: user.email, lines: [kongLine], shippingLine: SHIP });
  createdOrders.push(String(payload.id));
  await send({ body: payload });
  await send({ topic: 'fulfillments/update', body: { id: 1, order_id: payload.id, status: 'success', shipment_status: 'in_transit', tracking_url: 'https://track/1' } });
  let o = await one('SELECT status, tracking_url FROM shop_orders WHERE shopify_order_id = $1', [String(payload.id)]);
  assert.equal(o.status, 'shipped');
  assert.equal(o.tracking_url, 'https://track/1');
  await send({ topic: 'fulfillments/update', body: { id: 1, order_id: payload.id, status: 'success', shipment_status: 'delivered' } });
  o = await one('SELECT status FROM shop_orders WHERE shopify_order_id = $1', [String(payload.id)]);
  assert.equal(o.status, 'delivered');

  const p2 = orderPayload({ userId: user.id, email: user.email, lines: [kongLine], shippingLine: SHIP });
  createdOrders.push(String(p2.id));
  await send({ body: p2 });
  await send({ topic: 'orders/cancelled', body: { ...p2, cancelled_at: new Date().toISOString(), financial_status: 'voided' } });
  o = await one('SELECT status FROM shop_orders WHERE shopify_order_id = $1', [String(p2.id)]);
  assert.equal(o.status, 'cancelled');
});

test('GDPR: customers/redact anonymizes the matching user; shop/redact and data_request are acknowledged', async () => {
  const user = await makeUser();
  const res = await send({ topic: 'customers/redact', body: { shop_domain: 'x.myshopify.com', customer: { id: 123, email: user.email }, orders_to_redact: [] } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.anonymized, 1);
  const u = await one('SELECT email, status, handle FROM users WHERE id = $1', [user.id]);
  assert.equal(u.email, null);
  assert.equal(u.status, 'deleted');
  assert.equal(u.handle, `deleted-${user.id}`);
  assert.equal((await send({ topic: 'shop/redact', body: { shop_domain: 'x.myshopify.com' } })).body.gdpr, 'ack');
  const dr = await send({ topic: 'customers/data_request', body: { customer: { id: 1, email: 'a@b.c' }, orders_requested: [1, 2] } });
  assert.equal(dr.statusCode, 200);
  assert.equal(dr.body.gdpr, 'queued');
});

test('inventory_levels/update is routed and acknowledged', async () => {
  const res = await send({ topic: 'inventory_levels/update', body: { inventory_item_id: 1, location_id: 2, available: 3, updated_at: new Date().toISOString() } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
});

test('mock catalog agrees with RULES.packs', () => {
  for (const pack of RULES.packs) {
    const p = mock.findProductBySku(pack.sku);
    assert.ok(p, `pack ${pack.sku} in mock catalog`);
    assert.equal(p.pawPointsPack, pack.points);
    assert.equal(p.priceCents, pack.priceCents);
  }
});
