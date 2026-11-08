// Pure in-memory tests for the mock Shopify adapter: catalog, cart math, discounts, admin stubs.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as mock from '../lib/shopify-mock.js';
import { mapProduct, mapCart, pawPointsFromTags } from '../lib/shopify-real.js';
import { collectUserErrors, moneyToCents, centsToMoney, gid, gidNumber } from '../lib/shopify-client.js';

beforeEach(() => mock.__reset());

test('catalog: collections cover the plan and every product maps to one', async () => {
  const collections = await mock.getCollections();
  const handles = collections.map((c) => c.handle);
  for (const h of ['dog-food', 'cat-food', 'treats', 'toys', 'litter-hygiene', 'grooming', 'health-supplements', 'beds-travel', 'paw-points']) {
    assert.ok(handles.includes(h), `missing collection ${h}`);
  }
  const total = collections.reduce((s, c) => s + c.productCount, 0);
  const { products } = await mock.getProducts({ first: 100 });
  assert.equal(total, products.length);
  assert.ok(products.length >= 40, `expected ~40 products, got ${products.length}`);
  for (const p of products) {
    assert.match(p.id, /^gid:\/\/shopify\/Product\/\d+$/);
    assert.equal(p.currency, 'CAD');
    assert.ok(p.priceCents > 0);
    assert.ok(p.variants[0].sku);
    assert.ok(p.vendor);
    assert.ok(p.images[0].url.startsWith('https://'));
    assert.equal('collection' in p, false, 'mock-only field leaked');
  }
  const skus = products.map((p) => p.variants[0].sku);
  assert.equal(new Set(skus).size, skus.length, 'SKUs must be unique');
});

test('catalog: paw point packs are detected from tags', async () => {
  const { products } = await mock.getProducts({ collection: 'paw-points' });
  assert.deepEqual(products.map((p) => p.pawPointsPack).sort((a, b) => a - b), [100, 300, 1000]);
  assert.deepEqual(products.map((p) => p.variants[0].sku).sort(), ['PP-100', 'PP-1000', 'PP-300']);
  assert.equal(pawPointsFromTags(['dog', 'paw-points:300']), 300);
  assert.equal(pawPointsFromTags(['dog']), undefined);
});

test('catalog: search, pagination and getProduct', async () => {
  const kong = await mock.getProducts({ query: 'kong' });
  assert.equal(kong.products.length, 1);
  assert.equal(kong.products[0].handle, 'kong-classic-large');
  const page1 = await mock.getProducts({ first: 10 });
  assert.equal(page1.products.length, 10);
  assert.ok(page1.nextCursor);
  const page2 = await mock.getProducts({ first: 10, cursor: page1.nextCursor });
  assert.notEqual(page2.products[0].handle, page1.products[0].handle);
  const p = await mock.getProduct('orijen-original-cat-5kg');
  assert.equal(p.title, 'Orijen Original Cat Food 5.4 kg');
  assert.equal(await mock.getProduct('nope'), null);
  const soldOut = await mock.getProduct('dr-elseys-ultra-18kg');
  assert.equal(soldOut.availableForSale, false);
});

test('cart: create, add, update, remove, totals and checkoutUrl', async () => {
  const kong = await mock.getProduct('kong-classic-large');
  const ball = await mock.getProduct('chuckit-ultra-ball-m-2');
  const cart = await mock.cartCreate({
    lines: [{ merchandiseId: kong.variants[0].id, quantity: 2 }],
    buyerEmail: 'buyer@example.com',
    attributes: { pawtella_user_id: 42 },
  });
  assert.match(cart.id, /^gid:\/\/shopify\/Cart\//);
  assert.match(cart.checkoutUrl, /\/mock-checkout\//);
  assert.equal(cart.subtotalCents, 1899 * 2);
  assert.equal(cart.totalCents, 1899 * 2);
  assert.equal(cart.attributes.pawtella_user_id, '42');
  assert.equal(cart.buyerEmail, 'buyer@example.com');
  assert.equal(cart.currency, 'CAD');

  let c = await mock.cartLinesAdd(cart.id, [{ merchandiseId: ball.variants[0].id }, { merchandiseId: kong.variants[0].id, quantity: 1 }]);
  assert.equal(c.lines.length, 2, 'same merchandise merges into one line');
  assert.equal(c.lines.find((l) => l.sku === 'KONG-CL-L').quantity, 3);
  assert.equal(c.subtotalCents, 1899 * 3 + 1299);

  const ballLine = c.lines.find((l) => l.sku === 'CHK-ULTRA-M2');
  c = await mock.cartLinesUpdate(cart.id, [{ id: ballLine.id, quantity: 4 }]);
  assert.equal(c.lines.find((l) => l.sku === 'CHK-ULTRA-M2').quantity, 4);
  c = await mock.cartLinesUpdate(cart.id, [{ id: ballLine.id, quantity: 0 }]);
  assert.equal(c.lines.length, 1, 'quantity 0 removes the line');

  c = await mock.cartLinesRemove(cart.id, [c.lines[0].id]);
  assert.equal(c.lines.length, 0);
  assert.equal(c.subtotalCents, 0);

  assert.equal(await mock.cartGet('gid://shopify/Cart/missing'), null);
  await assert.rejects(() => mock.cartLinesAdd(cart.id, [{ merchandiseId: 'gid://shopify/ProductVariant/0' }]), /Unknown merchandise/);
});

test('cart: sold-out variants are refused', async () => {
  const soldOut = await mock.getProduct('blue-wilderness-chicken-10kg');
  await assert.rejects(() => mock.cartCreate({ lines: [{ merchandiseId: soldOut.variants[0].id }] }), /sold out/);
});

test('discount codes: minted codes apply, unknown codes do not, deactivation removes them', async () => {
  const kong = await mock.getProduct('kong-classic-large');
  const cart = await mock.cartCreate({ lines: [{ merchandiseId: kong.variants[0].id, quantity: 2 }] }); // 3798
  const d = await mock.createDiscountCode({ code: 'PAW-TEST1', amountCents: 500, title: 'test' });
  assert.equal(d.code, 'PAW-TEST1');
  let c = await mock.cartDiscountCodesUpdate(cart.id, ['PAW-TEST1', 'NOPE']);
  assert.deepEqual(c.discountCodes, [
    { code: 'PAW-TEST1', applicable: true },
    { code: 'NOPE', applicable: false },
  ]);
  assert.equal(c.totalCents, 3798 - 500);
  assert.equal(c.discountCents, 500);

  await mock.deactivateDiscountCode(d.id);
  c = await mock.cartGet(cart.id);
  assert.equal(c.discountCents, 0);
  assert.equal(c.totalCents, 3798);

  const pct = await mock.createDiscountCode({ code: 'TEN', percent: 10 });
  c = await mock.cartDiscountCodesUpdate(cart.id, [pct.code]);
  assert.equal(c.discountCents, Math.round(3798 * 0.1));
});

test('admin stubs: gift card, customer lookup, product create / inventory / policy', async () => {
  const gc = await mock.createGiftCard({ amountCents: 2500, note: 'test' });
  assert.ok(gc.id && gc.code && gc.lastCharacters.length === 4);
  assert.equal(await mock.findCustomerByEmail('x@example.com'), null);

  const created = await mock.createProduct({ title: 'Test Widget', sku: 'TW-1', barcode: '123', priceCents: 999, vendor: 'TestCo', tags: ['franpos'] });
  assert.ok(created.productId && created.variantId && created.inventoryItemId);
  assert.equal(created.handle, 'test-widget');
  let p = await mock.getProduct('test-widget');
  assert.equal(p.availableForSale, false);
  await mock.setInventoryQuantity(created.inventoryItemId, 'gid://shopify/Location/1', 5);
  p = await mock.getProduct('test-widget');
  assert.equal(p.availableForSale, true);
  assert.equal(p.variants[0].quantityAvailable, 5);
  await mock.setInventoryQuantity(created.inventoryItemId, 'gid://shopify/Location/1', 0);
  await mock.setVariantInventoryPolicy(created.variantId, 'CONTINUE');
  p = await mock.getProduct('test-widget');
  assert.equal(p.availableForSale, true, 'CONTINUE policy keeps it sellable at 0');
  await mock.updateProduct(created.productId, { tags: ['special-order'], metafields: { lead_days: 7 } });
  assert.deepEqual((await mock.getProductMetaById(created.productId)).tags, ['special-order']);
});

test('real-adapter mappers and client helpers (pure)', () => {
  const node = {
    id: 'gid://shopify/Product/1',
    handle: 'h',
    title: 'T',
    description: 'd',
    vendor: 'V',
    tags: ['paw-points:100'],
    availableForSale: true,
    images: { nodes: [{ url: 'https://x/1.jpg', altText: null }] },
    priceRange: { minVariantPrice: { amount: '4.99', currencyCode: 'CAD' } },
    compareAtPriceRange: { minVariantPrice: { amount: '5.99', currencyCode: 'CAD' } },
    variants: { nodes: [{ id: 'gid://shopify/ProductVariant/2', title: 'Default Title', sku: 'PP-100', availableForSale: true, quantityAvailable: 3, price: { amount: '4.99' }, compareAtPrice: null }] },
  };
  const p = mapProduct(node);
  assert.equal(p.priceCents, 499);
  assert.equal(p.compareAtPriceCents, 599);
  assert.equal(p.pawPointsPack, 100);
  assert.equal(p.images[0].alt, 'T');
  assert.equal(p.variants[0].priceCents, 499);

  const cart = mapCart({
    id: 'gid://shopify/Cart/abc',
    checkoutUrl: 'https://shop/checkout',
    attributes: [{ key: 'pawtella_user_id', value: '7' }],
    buyerIdentity: { email: 'a@b.c' },
    cost: { subtotalAmount: { amount: '10.00', currencyCode: 'CAD' }, totalAmount: { amount: '9.00', currencyCode: 'CAD' } },
    discountCodes: [{ code: 'PAW-X', applicable: true }],
    lines: { nodes: [{ id: 'l1', quantity: 2, cost: { totalAmount: { amount: '10.00' }, amountPerQuantity: { amount: '5.00' } }, merchandise: { id: 'v1', title: 'Default Title', sku: 'S', image: { url: 'u' }, price: { amount: '5.00' }, product: { title: 'P', handle: 'p', tags: [] } } }] },
  });
  assert.equal(cart.subtotalCents, 1000);
  assert.equal(cart.totalCents, 900);
  assert.equal(cart.lines[0].priceCents, 500);
  assert.equal(cart.lines[0].title, 'P');
  assert.equal(cart.attributes.pawtella_user_id, '7');
  assert.equal(cart.buyerEmail, 'a@b.c');

  assert.deepEqual(collectUserErrors({ cartCreate: { userErrors: [{ message: 'x' }] }, other: { userErrors: [] } }), [{ message: 'x', mutation: 'cartCreate' }]);
  assert.equal(moneyToCents('12.34'), 1234);
  assert.equal(moneyToCents(null), 0);
  assert.equal(centsToMoney(1234), '12.34');
  assert.equal(gid('Product', 5), 'gid://shopify/Product/5');
  assert.equal(gid('Product', 'gid://shopify/Product/5'), 'gid://shopify/Product/5');
  assert.equal(gidNumber('gid://shopify/Product/55'), '55');
});
