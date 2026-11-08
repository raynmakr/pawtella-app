// lib/orders.js: pure mapping helpers (no DB) + upsert behaviour through the mock checkout path.
import '../scripts/load-env.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { query, one, closePool } from '../lib/db.js';
import { detectFulfillmentType, packPointsForLine, noteAttribute, money, mapOrder, toApiOrder, upsertOrderFromWebhook, listOrdersForUser, getOrderForUser } from '../lib/orders.js';
import * as mock from '../lib/shopify-mock.js';
import { buildOrderPayload } from '../api/mock-checkout/[cartId].js';

const suffix = () => Math.random().toString(36).slice(2, 9);
const users = [];
const orders = [];
after(async () => {
  if (orders.length) await query('DELETE FROM shop_orders WHERE shopify_order_id = ANY($1)', [orders]);
  if (users.length) await query('DELETE FROM users WHERE id = ANY($1)', [users]);
  await closePool();
});

test('detectFulfillmentType (pure)', () => {
  assert.equal(detectFulfillmentType({ shipping_lines: [{ code: 'Pickup', title: 'Pick up in store' }] }), 'pickup');
  assert.equal(detectFulfillmentType({ shipping_lines: [{ title: 'Local Delivery' }] }), 'local_delivery');
  assert.equal(detectFulfillmentType({ shipping_lines: [{ code: 'local-delivery', title: 'Toronto' }] }), 'local_delivery');
  assert.equal(detectFulfillmentType({ shipping_lines: [{ title: 'Canada Post Expedited' }] }), 'shipping');
  assert.equal(detectFulfillmentType({ shipping_lines: [], note_attributes: [{ name: 'pickup', value: 'yes' }] }), 'pickup');
  assert.equal(detectFulfillmentType({ note_attributes: [{ name: 'fulfillment_type', value: 'local_delivery' }] }), 'local_delivery');
  assert.equal(detectFulfillmentType({}), 'shipping');
});

test('packPointsForLine / noteAttribute / money (pure)', () => {
  assert.equal(packPointsForLine({ sku: 'X' }, ['paw-points:300']), 300);
  assert.equal(packPointsForLine({ sku: 'PP-1000' }, []), 1000);
  assert.equal(packPointsForLine({ sku: 'KONG-CL-L' }, ['dog']), 0);
  assert.equal(noteAttribute({ note_attributes: [{ name: 'Pawtella_User_Id', value: 9 }] }, 'pawtella_user_id'), '9');
  assert.equal(noteAttribute({}, 'x'), null);
  assert.equal(money('18.99'), 1899);
  assert.equal(money(0.1), 10);
  assert.equal(money(undefined), 0);
});

test('mapOrder maps money, codes, lines and statuses', async () => {
  const mapped = await mapOrder({
    id: 1,
    name: '#1001',
    email: 'A@Example.com',
    currency: 'CAD',
    financial_status: 'paid',
    fulfillment_status: null,
    subtotal_price: '32.98',
    total_discounts: '5.00',
    total_tax: '4.29',
    total_shipping_price_set: { shop_money: { amount: '12.99' } },
    total_price: '50.26',
    discount_codes: [{ code: 'PAW-ABC', amount: '5.00' }],
    line_items: [{ sku: 'KONG-CL-L', title: 'KONG', quantity: 2, price: '18.99', variant_id: 1, product_id: 7000000018 }],
    shipping_lines: [{ title: 'Standard Shipping' }],
    note_attributes: [{ name: 'pawtella_user_id', value: '5' }],
    processed_at: '2026-01-02T03:04:05Z',
  });
  assert.equal(mapped.shopify_order_id, '1');
  assert.equal(mapped.order_number, '#1001');
  assert.equal(mapped.subtotal_cents, 3298);
  assert.equal(mapped.discount_cents, 500);
  assert.equal(mapped.shipping_cents, 1299);
  assert.equal(mapped.tax_cents, 429);
  assert.equal(mapped.total_cents, 5026);
  assert.deepEqual(mapped.discount_codes, ['PAW-ABC']);
  assert.equal(mapped.fulfillment_type, 'shipping');
  assert.equal(mapped.status, 'paid');
  assert.equal(mapped.pawtella_user_id, '5');
  assert.equal(mapped.line_items[0].handle, 'kong-classic-large');
  assert.equal(mapped.line_items[0].variantId, '1');
  assert.equal(mapped.placed_at, '2026-01-02T03:04:05Z');

  const pickupDone = await mapOrder({ id: 2, financial_status: 'paid', fulfillment_status: 'fulfilled', shipping_lines: [{ title: 'Pickup' }], fulfillments: [{ status: 'success', shipment_status: 'picked_up' }], line_items: [] });
  assert.equal(pickupDone.status, 'picked_up');
  const refunded = await mapOrder({ id: 3, financial_status: 'refunded', line_items: [] });
  assert.equal(refunded.status, 'refunded');
});

test('toApiOrder hides raw/email and camelizes', () => {
  const api = toApiOrder({ id: 1, shopify_order_id: '9', email: 'x@y.z', raw: { secret: true }, subtotal_cents: 100, line_items: [{ sku: 'A', quantity: 2 }, { sku: 'B', quantity: 1 }], status: 'paid', partner_id: 4 });
  assert.equal(api.raw, undefined);
  assert.equal(api.email, undefined);
  assert.equal(api.partnerId, undefined);
  assert.equal(api.subtotalCents, 100);
  assert.equal(api.shopifyOrderId, '9');
  assert.equal(api.itemCount, 3);
});

test('mock checkout → orders/paid payload → upsert → listOrdersForUser', async () => {
  mock.__reset();
  const s = suffix();
  const user = await one(`INSERT INTO users (email, handle, display_name) VALUES ($1, $2, 'Orders Test') RETURNING *`, [`ord-${s}@example.com`, `ord_${s}`]);
  users.push(user.id);
  const kong = await mock.getProduct('kong-classic-large');
  const pack = await mock.getProduct('paw-points-100');
  const cart = await mock.cartCreate({
    lines: [{ merchandiseId: kong.variants[0].id, quantity: 1 }, { merchandiseId: pack.variants[0].id, quantity: 2 }],
    buyerEmail: user.email,
    attributes: { pawtella_user_id: user.id },
  });
  const payload = await buildOrderPayload(cart, { fulfillment: 'local_delivery' });
  orders.push(String(payload.id));
  assert.equal(payload.financial_status, 'paid');
  assert.equal(payload.note_attributes[0].name, 'pawtella_user_id');
  assert.equal(payload.shipping_lines[0].code, 'Local Delivery');

  const { order, isNew } = await upsertOrderFromWebhook(payload, { topic: 'orders/paid' });
  assert.equal(isNew, true);
  assert.equal(order.user_id, user.id);
  assert.equal(order.fulfillment_type, 'local_delivery');
  assert.equal(order.subtotal_cents, 1899 + 2 * 499);
  assert.equal(order.pack_points_granted, 200);
  assert.equal(order.points_earned, 18);
  assert.equal(order.line_items.length, 2);

  const again = await upsertOrderFromWebhook(payload, { topic: 'orders/updated' });
  assert.equal(again.isNew, false);
  assert.equal(again.order.points_earned, 18);

  const mine = await listOrdersForUser(user.id);
  assert.equal(mine.length, 1);
  assert.equal((await getOrderForUser(order.id, user.id)).id, order.id);
  assert.equal(await getOrderForUser(order.id, user.id + 1_000_000), null);
  const bal = await one('SELECT paw_points FROM users WHERE id = $1', [user.id]);
  assert.ok(bal.paw_points >= 218, `expected ≥218, got ${bal.paw_points}`);
});
