// Cart HTTP surface: the cart must be self-healing. A stored cart id that is malformed, stale, or
// no longer resolves on Shopify (e.g. after a completed checkout) must never surface as an error —
// the endpoint discards it and hands back a fresh empty cart so the badge count stays correct.
import '../scripts/load-env.js';
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { closePool } from '../lib/db.js';
import { isCartId } from '../lib/shopify-client.js';
import * as shopify from '../lib/shopify.js';
import shopRoute, { isStaleCartError } from '../api/shop.js';

beforeEach(() => shopify.__reset());
after(() => closePool());

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    headersSent: false,
    writableEnded: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = JSON.stringify(o); this.headersSent = true; this.writableEnded = true; return this; },
    end(d) { if (d !== undefined) this.body = String(d); this.headersSent = true; this.writableEnded = true; return this; },
  };
}

/** Invoke api/shop.js the way the vercel.json rewrite + the web BFF deliver a request. */
async function call({ method = 'GET', seg, body }) {
  // `seg` is the path after /api/shop, e.g. ['cart', '<id>'] or ['cart']. The id is one URL segment.
  const path = seg.join('/');
  const url = `/api/shop/${seg.map((s, i) => (i === 0 ? s : encodeURIComponent(s))).join('/')}`;
  const req = { method, url, headers: {}, query: { path }, body, cookies: {}, socket: {} };
  const res = makeRes();
  await shopRoute(req, res);
  return { status: res.statusCode, data: res.body ? JSON.parse(res.body) : undefined };
}

const cartSeg = (id, suffix) => ['cart', id, ...(suffix ? [suffix] : [])];

async function firstVariantId(handle = 'kong-classic-large') {
  const p = await shopify.getProduct(handle);
  return p.variants[0].id;
}

test('isCartId accepts real + mock cart gids and rejects everything else (pure)', () => {
  assert.equal(isCartId('gid://shopify/Cart/c1-36e8477271a658e2ec3ebd1bf2506686?key=ba72b8f664bfb53a09522a0e789123de'), true);
  assert.equal(isCartId('gid://shopify/Cart/123456789'), true);
  assert.equal(isCartId('gid://shopify/Cart/missing'), true);
  // Rejected: empties, non-strings, leftovers from another provider/mode, percent-encoded, junk.
  assert.equal(isCartId(''), false);
  assert.equal(isCartId('   '), false);
  assert.equal(isCartId(undefined), false);
  assert.equal(isCartId(null), false);
  assert.equal(isCartId('undefined'), false);
  assert.equal(isCartId('gid://shopify/Product/42'), false);
  assert.equal(isCartId('gid%3A%2F%2Fshopify%2FCart%2Fc1-ABC'), false);
  assert.equal(isCartId('local-cart-123'), false);
});

test('isStaleCartError flags unresolvable carts but not transient outages (pure)', () => {
  assert.equal(isStaleCartError({ status: 404, message: 'Cart not found' }), true);
  assert.equal(isStaleCartError({ status: 502, message: 'Shopify storefront API error: Variable $id of type ID! was provided invalid value' }), true);
  assert.equal(isStaleCartError({ status: 502, message: 'Shopify storefront rejected the request: cart does not exist' }), true);
  // Transient: a rate-limit or unavailable upstream must NOT wipe a real cart.
  assert.equal(isStaleCartError({ status: 429, message: 'Too many requests' }), false);
  assert.equal(isStaleCartError({ status: 503, message: 'Shopify Storefront API is not configured' }), false);
});

test('GET cart with a malformed id self-heals to a fresh empty cart (no error)', async () => {
  const { status, data } = await call({ seg: cartSeg('undefined') });
  assert.equal(status, 200);
  assert.ok(data.cart, 'a cart is returned');
  assert.equal(data.reset, true, 'client is told the id was replaced');
  assert.ok(isCartId(data.cart.id), 'the fresh id is a valid cart gid');
  assert.equal(data.cart.lines.length, 0);
  assert.equal(data.cart.totalQuantity, 0, 'badge count is zero for the empty cart');
});

test('GET cart with a well-formed but unknown id self-heals (covers post-checkout + mock restart)', async () => {
  const { status, data } = await call({ seg: cartSeg('gid://shopify/Cart/gone-after-checkout') });
  assert.equal(status, 200);
  assert.equal(data.reset, true);
  assert.equal(data.cart.lines.length, 0);
  assert.notEqual(data.cart.id, 'gid://shopify/Cart/gone-after-checkout');
});

test('GET cart with a valid existing id returns that cart unchanged', async () => {
  const variantId = await firstVariantId();
  const created = await shopify.cartCreate({ lines: [{ merchandiseId: variantId, quantity: 2 }] });
  const { status, data } = await call({ seg: cartSeg(created.id) });
  assert.equal(status, 200);
  assert.equal(data.reset, undefined, 'no reset for a healthy cart');
  assert.equal(data.cart.id, created.id);
  assert.equal(data.cart.totalQuantity, 2);
});

test('POST add to a stale cart id self-heals: a fresh cart is created with the line', async () => {
  const variantId = await firstVariantId();
  const { status, data } = await call({
    method: 'POST',
    seg: ['cart'],
    body: { cartId: 'gid://shopify/Cart/stale-and-gone', lines: [{ merchandiseId: variantId, quantity: 1 }] },
  });
  assert.equal(status, 200);
  assert.equal(data.reset, true, 'the stale id was replaced');
  assert.notEqual(data.cart.id, 'gid://shopify/Cart/stale-and-gone');
  assert.equal(data.cart.lines.length, 1);
  assert.equal(data.cart.totalQuantity, 1);
});

test('POST add with no cart id creates a cart (unchanged happy path)', async () => {
  const variantId = await firstVariantId();
  const { status, data } = await call({ method: 'POST', seg: ['cart'], body: { lines: [{ merchandiseId: variantId, quantity: 1 }] } });
  assert.equal(status, 200);
  assert.equal(data.reset, undefined);
  assert.ok(isCartId(data.cart.id));
  assert.equal(data.cart.lines.length, 1);
});

test('PATCH lines on a malformed cart id self-heals instead of erroring', async () => {
  const { status, data } = await call({ method: 'PATCH', seg: cartSeg('undefined'), body: { lines: [{ id: 'gid://shopify/CartLine/1', quantity: 2 }] } });
  assert.equal(status, 200);
  assert.equal(data.reset, true);
  assert.equal(data.cart.lines.length, 0);
});

test('DELETE lines on a malformed cart id self-heals instead of erroring', async () => {
  const { status, data } = await call({ method: 'DELETE', seg: cartSeg('undefined', 'lines'), body: { lineIds: ['gid://shopify/CartLine/1'] } });
  assert.equal(status, 200);
  assert.equal(data.reset, true);
  assert.equal(data.cart.lines.length, 0);
});
