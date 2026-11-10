// Out-of-stock hiding: the pure availability predicate and the shop browse/search endpoint that
// must never surface a sold-out product (continue-selling / special-order items stay visible).
import '../scripts/load-env.js';
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { closePool } from '../lib/db.js';
import * as shopify from '../lib/shopify.js';
import shopRoute from '../api/shop.js';
import { isVariantAvailable, isProductAvailable, filterAvailableProducts, availableVariants } from '../lib/catalog.js';

beforeEach(() => shopify.__reset());
after(() => closePool());

// ---------------------------------------------------------------------------------------------
// Pure predicate
// ---------------------------------------------------------------------------------------------

test('isVariantAvailable: sellable units, continue-selling, or untracked are available', () => {
  assert.equal(isVariantAvailable({ availableForSale: true, quantityAvailable: 5 }), true);
  assert.equal(isVariantAvailable({ availableForSale: true, quantityAvailable: 0 }), true, 'continue-selling at 0 qty stays available');
  assert.equal(isVariantAvailable({ availableForSale: true, quantityAvailable: null }), true, 'untracked stays available');
  assert.equal(isVariantAvailable({ availableForSale: false, quantityAvailable: 0 }), false);
  assert.equal(isVariantAvailable({ availableForSale: false, quantityAvailable: 3 }), true, 'stale flag falls back to qty');
  assert.equal(isVariantAvailable(null), false);
});

test('isProductAvailable: a product shows when any variant is purchasable', () => {
  assert.equal(isProductAvailable({ variants: [{ availableForSale: false }, { availableForSale: true }] }), true);
  assert.equal(isProductAvailable({ variants: [{ availableForSale: false, quantityAvailable: 0 }] }), false);
  assert.equal(isProductAvailable({ variants: [], availableForSale: true }), true, 'no variant detail falls back to product flag');
  assert.equal(isProductAvailable({ variants: [], availableForSale: false }), false);
});

test('availableVariants keeps only purchasable variants', () => {
  const p = { variants: [{ id: 'a', availableForSale: true }, { id: 'b', availableForSale: false }] };
  assert.deepEqual(availableVariants(p).map((v) => v.id), ['a']);
});

// ---------------------------------------------------------------------------------------------
// Shop browse / search endpoint
// ---------------------------------------------------------------------------------------------

function makeRes() {
  return {
    statusCode: 200, headers: {}, body: '', headersSent: false, writableEnded: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = JSON.stringify(o); this.headersSent = true; this.writableEnded = true; return this; },
    end(d) { if (d !== undefined) this.body = String(d); this.headersSent = true; this.writableEnded = true; return this; },
  };
}

async function getProductsApi(query = {}) {
  const req = { method: 'GET', url: '/api/shop/products', headers: {}, query: { path: 'products', ...query }, cookies: {}, socket: {} };
  const res = makeRes();
  await shopRoute(req, res);
  return JSON.parse(res.body);
}

test('GET /api/shop/products hides out-of-stock products but keeps special-order', async () => {
  const data = await getProductsApi({ first: '100' });
  const handles = new Set(data.products.map((p) => p.handle));
  // DENY-policy, zero stock → hidden.
  for (const oos of ['blue-wilderness-chicken-10kg', 'zukes-mini-naturals-pb', 'dr-elseys-ultra-18kg', 'sherpa-carrier-medium']) {
    assert.equal(handles.has(oos), false, `${oos} should be hidden`);
  }
  // In stock / continue-selling → visible.
  assert.equal(handles.has('acana-grasslands-dog-11kg'), true);
  assert.equal(handles.has('smalls-fresh-cat-sampler'), true, 'special-order (continue selling) stays visible');
  // Every returned product is actually purchasable.
  assert.ok(data.products.every(isProductAvailable));
});

test('GET /api/shop/products?q= search also hides sold-out matches', async () => {
  const data = await getProductsApi({ q: 'litter' });
  const handles = new Set(data.products.map((p) => p.handle));
  assert.equal(handles.has('dr-elseys-ultra-18kg'), false, 'sold-out litter is hidden from search');
  assert.ok(handles.size > 0, 'other litter products still returned');
});

test('filterAvailableProducts drops the sold-out entries from a mixed list', () => {
  const list = [
    { handle: 'a', variants: [{ availableForSale: true }] },
    { handle: 'b', variants: [{ availableForSale: false, quantityAvailable: 0 }] },
  ];
  assert.deepEqual(filterAvailableProducts(list).map((p) => p.handle), ['a']);
});
