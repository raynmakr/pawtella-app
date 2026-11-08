// Inventory sync: CSV parsing, import transitions, Shopify push + policies, stock state, reservations.
import '../scripts/load-env.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, one, many, closePool } from '../lib/db.js';
import { parseFranposCsv, moneyToCents, mapHeaders } from '../lib/inventory/franpos-csv.js';
import { getSource } from '../lib/inventory/source.js';
import { mockItems } from '../lib/inventory/mock.js';
import { createRecordingShopify } from '../lib/inventory/shopify-fallback.js';
import {
  importItems, pushToShopify, runSync, getStockState, reserveForOrder, releaseReservation,
  applyShopifyInventoryLevel, setSourcing, listSourcingQueue, discoveredSince, outOfStockSince, getStatus,
} from '../lib/inventory/sync.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const sampleCsv = fs.readFileSync(path.join(here, '..', 'scripts', 'sample-franpos-inventory.csv'), 'utf8');
const RUN = Math.random().toString(36).slice(2, 8).toUpperCase();
const sku = (s) => `T${RUN}-${s}`;
const madeSkus = new Set();
const SRC = `test-${RUN}`;

const item = (s, qty, extra = {}) => {
  madeSkus.add(sku(s));
  return { sku: sku(s), name: `Test ${s} ${RUN}`, category: 'Dog Food', brand: 'TestCo', priceCents: 1999, costCents: 1200, qtyOnHand: qty, ...extra };
};

after(async () => {
  if (madeSkus.size) await query('DELETE FROM inventory_items WHERE sku = ANY($1)', [[...madeSkus]]);
  await query('DELETE FROM inventory_imports WHERE source = $1', [SRC]);
  await query("DELETE FROM users WHERE handle LIKE $1", [`invtest_${RUN}%`]);
  await closePool();
});

// ---------------------------------------------------------------------------------------------
// Pure parsing
// ---------------------------------------------------------------------------------------------

test('parses the sample Franpos export (30 rows, $ prices, blank UPCs)', () => {
  const { items, errors, mapping, rowCount } = parseFranposCsv(sampleCsv);
  assert.equal(rowCount, 30);
  assert.equal(items.length, 30);
  assert.deepEqual(errors, []);
  assert.equal(mapping.sku, 'Item Number');
  assert.equal(mapping.qty, 'Quantity On Hand');
  const acana = items.find((i) => i.sku === 'PW-FOOD-001');
  assert.equal(acana.priceCents, 10999);
  assert.equal(acana.costCents, 7850);
  assert.equal(acana.qtyOnHand, 6);
  assert.equal(acana.barcode, '062786010014');
  assert.equal(acana.brand, 'Acana');
  assert.ok(acana.updatedAt instanceof Date);
  assert.equal(items.filter((i) => i.qtyOnHand === 0).length, 4);
  assert.equal(items.find((i) => i.sku === 'PW-TREAT-004').barcode, undefined);
});

test('accepts header variants and falls back to barcode when SKU is blank; collects row errors', () => {
  const csv = [
    'sku,Barcode,Description,Category,Brand,PRICE,Qty',
    'A-1,111,Thing One,Toys,Acme,"$1,234.50",3',
    ',222,Barcode Only,Toys,Acme,2.00,0',
    ',,No identifiers,Toys,Acme,2.00,1',
    'A-3,333,,Toys,Acme,2.00,1',
    'A-4,444,Bad qty,Toys,Acme,2.00,lots',
    'A-1,555,Duplicate,Toys,Acme,9.00,1',
  ].join('\n');
  const { items, errors } = parseFranposCsv(csv);
  assert.equal(items.length, 2);
  assert.equal(items[0].priceCents, 123450);
  assert.equal(items[1].sku, '222');
  assert.equal(items[1].barcode, '222');
  assert.equal(errors.length, 4);
  assert.match(errors[0].error, /Missing SKU/);
  assert.match(errors[1].error, /Missing item name/);
  assert.match(errors[2].error, /Unparsable quantity/);
  assert.match(errors[3].error, /Duplicate/);
});

test('throws when required columns are missing', () => {
  assert.throws(() => parseFranposCsv('Foo,Bar\n1,2'), /missing required columns/i);
});

test('moneyToCents handles currency symbols, thousands and negatives', () => {
  assert.equal(moneyToCents('$12.99'), 1299);
  assert.equal(moneyToCents('CAD 1,099.00'), 109900);
  assert.equal(moneyToCents('12,99'), 1299);
  assert.equal(moneyToCents('(3.50)'), -350);
  assert.equal(moneyToCents(''), null);
  assert.equal(moneyToCents('n/a'), null);
  assert.deepEqual(mapHeaders(['Item #', 'UPC Code', 'Item Description', 'Dept', 'On Hand']), {
    sku: 'Item #', barcode: 'UPC Code', name: 'Item Description', category: 'Dept', qty: 'On Hand',
  });
});

test('mock source is deterministic by date and includes zero-stock items + a daily new SKU', async () => {
  const d = new Date('2026-11-08T12:00:00Z');
  const a = mockItems(d);
  const b = mockItems(d);
  assert.deepEqual(a, b);
  assert.equal(a.length, 26);
  assert.ok(a.filter((i) => i.qtyOnHand === 0).length >= 3);
  assert.notEqual(mockItems(new Date('2026-11-09T12:00:00Z')).at(-1).sku, a.at(-1).sku);
  assert.equal((await getSource('mock').listItems()).length, 26);
  assert.throws(() => getSource('nope'), /Unknown inventory source/);
  await assert.rejects(getSource('franpos-api').listItems(), /not configured/);
  await assert.rejects(getSource('csv').listItems(), /no file/);
});

// ---------------------------------------------------------------------------------------------
// DB-backed
// ---------------------------------------------------------------------------------------------

test('importItems upserts, records the import and tracks stock transitions', async () => {
  const first = await importItems([item('A', 5), item('B', 0), item('C', 2)], { source: SRC, filename: 'one.csv' });
  assert.equal(first.created, 3);
  assert.equal(first.updated, 0);
  assert.deepEqual(first.wentOutOfStock, [sku('B')]);
  assert.equal(first.status, 'ok');
  const imp = await one('SELECT * FROM inventory_imports WHERE id = $1', [first.importId]);
  assert.equal(imp.row_count, 3);
  assert.equal(imp.created_count, 3);
  const b = await one('SELECT * FROM inventory_items WHERE sku = $1', [sku('B')]);
  assert.ok(b.went_out_of_stock_at);
  assert.equal(b.price_cents, 1999);
  assert.equal(b.shopify_synced_at, null);

  const second = await importItems([item('A', 0), item('B', 4), item('C', 2, { priceCents: 2199 })], { source: SRC, errors: [{ row: 9, error: 'pre-parse' }] });
  assert.equal(second.created, 0);
  assert.equal(second.updated, 3);
  assert.equal(second.unchanged, 0);
  const third = await importItems([item('C', 2, { priceCents: 2199 })], { source: SRC });
  assert.equal(third.unchanged, 1);
  assert.equal(third.changedSkus.length, 0);
  assert.deepEqual(second.wentOutOfStock, [sku('A')]);
  assert.deepEqual(second.backInStock, [sku('B')]);
  assert.equal(second.status, 'partial');
  const a = await one('SELECT * FROM inventory_items WHERE sku = $1', [sku('A')]);
  assert.ok(a.went_out_of_stock_at);
  const b2 = await one('SELECT * FROM inventory_items WHERE sku = $1', [sku('B')]);
  assert.equal(b2.went_out_of_stock_at, null);
  assert.equal(b2.qty_on_hand, 4);
  const c = await one('SELECT price_cents FROM inventory_items WHERE sku = $1', [sku('C')]);
  assert.equal(c.price_cents, 2199);
});

test('back in stock notifies product_subscriptions once', async () => {
  const u = await one(
    `INSERT INTO users (email, handle, display_name) VALUES ($1, $2, 'Inv Tester') RETURNING id`,
    [`invtest_${RUN}@example.com`, `invtest_${RUN}`],
  );
  await importItems([item('N', 0)], { source: SRC });
  await query('INSERT INTO product_subscriptions (user_id, product_handle, sku) VALUES ($1, $2, $3)', [u.id, `handle-${RUN}`, sku('N')]);
  const res = await importItems([item('N', 3)], { source: SRC });
  assert.deepEqual(res.backInStock, [sku('N')]);
  const sub = await one('SELECT notified_at FROM product_subscriptions WHERE user_id = $1', [u.id]);
  assert.ok(sub.notified_at);
  const n = await one(`SELECT * FROM notifications WHERE user_id = $1 AND journey = 'back_in_stock'`, [u.id]);
  assert.ok(n, 'notification queued');
  assert.equal(n.payload.sku, sku('N'));
  await query('DELETE FROM notifications WHERE user_id = $1', [u.id]);
});

test('pushToShopify creates products once, sets sellable quantity and applies policies', async () => {
  const shopify = createRecordingShopify();
  await importItems([item('P1', 5), item('P2', 0), item('P3', 0), item('P4', 7)], { source: SRC });
  const skus = ['P1', 'P2', 'P3', 'P4'].map(sku);

  const first = await pushToShopify({ skus, shopify });
  assert.equal(first.created, 4);
  assert.equal(first.failed, 0);
  assert.equal(shopify.calls.filter((c) => c.fn === 'createProduct').length, 4);
  const p1 = await one('SELECT * FROM inventory_items WHERE sku = $1', [sku('P1')]);
  assert.ok(p1.shopify_product_id && p1.shopify_variant_id && p1.shopify_inventory_item_id && p1.shopify_handle);
  assert.ok(p1.shopify_synced_at);
  const createdP1 = shopify.calls.find((c) => c.fn === 'createProduct' && c.args.sku === sku('P1'));
  assert.deepEqual(createdP1.args.tags, ['franpos', 'needs-review', 'category:dog-food']);
  assert.equal(createdP1.args.status, 'ACTIVE');
  assert.equal(createdP1.args.vendor, 'TestCo');
  const qtyCall = shopify.calls.find((c) => c.fn === 'setInventoryQuantity' && c.args.inventoryItemId === p1.shopify_inventory_item_id);
  assert.equal(qtyCall.args.quantity, 5);
  assert.equal(qtyCall.args.locationId, 'mock-location');
  assert.equal(shopify.calls.find((c) => c.fn === 'setVariantInventoryPolicy' && c.args.variantId === p1.shopify_variant_id).args.policy, 'DENY');

  // nothing pending → onlyChanged pushes none of ours again
  shopify.calls.length = 0;
  const again = await pushToShopify({ onlyChanged: true, shopify });
  assert.equal(shopify.calls.filter((c) => c.fn === 'createProduct' && skus.includes(c.args.sku)).length, 0);
  assert.ok(again.attempted >= 0);

  // policies
  await setSourcing(sku('P2'), { policy: 'special_order', supplier: 'Acme Dist', leadDays: 10 }, null);
  await setSourcing(sku('P3'), { policy: 'hidden' }, null);
  await setSourcing(sku('P4'), { policy: 'stock_only' }, null);
  shopify.calls.length = 0;
  const pushed = await pushToShopify({ onlyChanged: true, shopify });
  assert.equal(pushed.failed, 0);
  assert.equal(shopify.calls.filter((c) => c.fn === 'createProduct').length, 0, 'no duplicate products');

  const p2 = await one('SELECT * FROM inventory_items WHERE sku = $1', [sku('P2')]);
  const p3 = await one('SELECT * FROM inventory_items WHERE sku = $1', [sku('P3')]);
  const p4 = await one('SELECT * FROM inventory_items WHERE sku = $1', [sku('P4')]);
  assert.equal(shopify.calls.find((c) => c.fn === 'setVariantInventoryPolicy' && c.args.variantId === p2.shopify_variant_id).args.policy, 'CONTINUE');
  const up2 = shopify.calls.find((c) => c.fn === 'updateProduct' && c.args.productId === p2.shopify_product_id);
  assert.ok(up2.args.tags.includes('special-order'));
  assert.equal(up2.args.status, 'ACTIVE');
  assert.deepEqual(up2.args.metafields[0], { namespace: 'pawtella', key: 'lead_days', type: 'number_integer', value: '10' });
  const up3 = shopify.calls.find((c) => c.fn === 'updateProduct' && c.args.productId === p3.shopify_product_id);
  assert.equal(up3.args.status, 'DRAFT');
  assert.equal(shopify.calls.find((c) => c.fn === 'setVariantInventoryPolicy' && c.args.variantId === p4.shopify_variant_id).args.policy, 'DENY');
  assert.ok(shopify.products.get(p3.shopify_product_id).status === 'DRAFT');

  // failure is recorded per item and retried on the next changed push
  const broken = { ...createRecordingShopify(), setInventoryQuantity: async () => { throw new Error('boom'); } };
  await importItems([item('P1', 6)], { source: SRC });
  const bad = await pushToShopify({ skus: [sku('P1')], shopify: broken });
  assert.equal(bad.failed, 1);
  const p1b = await one('SELECT shopify_sync_error, shopify_synced_at FROM inventory_items WHERE sku = $1', [sku('P1')]);
  assert.equal(p1b.shopify_sync_error, 'boom');
  assert.equal(p1b.shopify_synced_at, null);
  const fixed = await pushToShopify({ skus: [sku('P1')], shopify });
  assert.equal(fixed.failed, 0);
  assert.equal((await one('SELECT shopify_sync_error FROM inventory_items WHERE sku = $1', [sku('P1')])).shopify_sync_error, null);
});

test('getStockState per policy, reservations adjust sellable qty but never qty_on_hand', async () => {
  const shopify = createRecordingShopify();
  await importItems([item('S1', 3), item('S2', 0), item('S3', 0), item('S4', 0)], { source: SRC });
  await setSourcing(sku('S2'), { policy: 'special_order', leadDays: 5 }, null);
  await setSourcing(sku('S3'), { policy: 'stock_only' }, null);
  await setSourcing(sku('S4'), { policy: 'hidden' }, null);
  await pushToShopify({ skus: ['S1', 'S2', 'S3', 'S4'].map(sku), shopify });
  const handle = (s) => one('SELECT shopify_handle FROM inventory_items WHERE sku = $1', [sku(s)]).then((r) => r.shopify_handle);

  assert.deepEqual(await getStockState(await handle('S1')), { state: 'in_stock', qty: 3, sku: sku('S1'), policy: 'stock_only' });
  assert.deepEqual(await getStockState(await handle('S2')), { state: 'special_order', qty: 0, sku: sku('S2'), policy: 'special_order', leadDays: 5 });
  assert.equal((await getStockState(await handle('S3'))).state, 'sold_out');
  assert.equal((await getStockState(await handle('S4'))).state, 'sold_out');
  assert.deepEqual(await getStockState(`nope-${RUN}`), { state: 'unknown', qty: null });
  // undecided + zero stock → sold_out (defaults to stock_only)
  await importItems([item('S5', 0)], { source: SRC });
  assert.equal((await getStockState(sku('S5'))).state, 'sold_out');

  const order = { id: 1, line_items: [{ sku: sku('S1'), quantity: 2 }, { sku: sku('S1'), quantity: 1 }, { sku: 'UNKNOWN-SKU', quantity: 1 }, { handle: 'x', quantity: 2 }] };
  const r = await reserveForOrder(order);
  assert.equal(r.reserved, 3);
  let row = await one('SELECT qty_on_hand, qty_reserved_online FROM inventory_items WHERE sku = $1', [sku('S1')]);
  assert.equal(row.qty_on_hand, 3);
  assert.equal(row.qty_reserved_online, 3);
  assert.equal((await getStockState(await handle('S1'))).state, 'sold_out');

  // push sends sellable (on hand − reserved) to Shopify
  shopify.calls.length = 0;
  await pushToShopify({ skus: [sku('S1')], shopify });
  assert.equal(shopify.calls.find((c) => c.fn === 'setInventoryQuantity').args.quantity, 0);

  await releaseReservation({ lineItems: [{ sku: sku('S1'), quantity: 5 }] });
  row = await one('SELECT qty_on_hand, qty_reserved_online FROM inventory_items WHERE sku = $1', [sku('S1')]);
  assert.equal(row.qty_reserved_online, 0, 'never below zero');
  assert.equal(row.qty_on_hand, 3, 'on hand untouched');
  assert.equal((await getStockState(await handle('S1'))).state, 'in_stock');

  // inventory_levels/update webhook → shopify_available hint (numeric id matches the gid tail)
  const inv = await one('SELECT shopify_inventory_item_id FROM inventory_items WHERE sku = $1', [sku('S1')]);
  const applied = await applyShopifyInventoryLevel({ inventory_item_id: inv.shopify_inventory_item_id.split('/').pop(), location_id: 123, available: 2 });
  assert.equal(applied.sku, sku('S1'));
  assert.equal(applied.shopify_available, 2);
});

test('sourcing queue, digest helpers and status', async () => {
  await importItems([item('Q1', 0), item('Q2', 4)], { source: SRC });
  const since = new Date(Date.now() - 60_000);
  const queue = await listSourcingQueue({ q: RUN });
  const q1 = queue.find((i) => i.sku === sku('Q1'));
  assert.ok(q1);
  assert.equal(q1.queueReason, 'new');
  assert.equal(q1.effectivePolicy, 'stock_only');
  assert.equal(q1.decided, false);
  assert.ok(queue.find((i) => i.sku === sku('Q2')));

  await setSourcing(sku('Q2'), { policy: 'special_order', leadDays: 3 }, null);
  const undecided = await listSourcingQueue({ policy: 'undecided', q: RUN });
  assert.ok(!undecided.find((i) => i.sku === sku('Q2')));
  const special = await listSourcingQueue({ policy: 'special_order', q: RUN });
  assert.ok(special.find((i) => i.sku === sku('Q2')));

  // decided + recently out of stock still shows in the queue
  await importItems([item('Q2', 0)], { source: SRC });
  const q2 = (await listSourcingQueue({ q: RUN })).find((i) => i.sku === sku('Q2'));
  assert.equal(q2.queueReason, 'out_of_stock');

  const disc = await discoveredSince(since);
  assert.ok(disc.find((i) => i.sku === sku('Q1')));
  const oos = await outOfStockSince(since);
  assert.ok(oos.find((i) => i.sku === sku('Q1')));
  assert.ok(oos.find((i) => i.sku === sku('Q2')));

  await assert.rejects(setSourcing(sku('Q1'), { policy: 'nope' }), /Invalid policy/);
  assert.equal(await setSourcing(`missing-${RUN}`, { policy: 'hidden' }), null);

  const status = await getStatus();
  assert.ok(status.counts.items >= 2);
  assert.ok(status.lastImport);
  assert.ok(Array.isArray(status.syncErrors));
});

test('runSync with an injected source imports and pushes', async () => {
  const shopify = createRecordingShopify();
  const source = { name: SRC, async listItems() { return [item('R1', 2), item('R2', 0)]; } };
  const res = await runSync({ source, shopify });
  assert.equal(res.imported.created, 2);
  assert.ok(res.pushed.created >= 2);
  assert.equal(res.errors.length, 0);
  assert.equal(shopify.calls.filter((c) => c.fn === 'createProduct' && [sku('R1'), sku('R2')].includes(c.args.sku)).length, 2);

  const ro = await runSync({ source: { name: 'octopus-bridge', readOnlyShopify: true, async listItems() { return [item('R3', 1, { shopify: { productId: 'gid://shopify/Product/9', variantId: 'v9', inventoryItemId: 'i9', handle: `octo-${RUN}` } })]; } }, shopify });
  assert.ok(ro.pushed.skipped);
  const r3 = await one('SELECT shopify_handle, shopify_synced_at FROM inventory_items WHERE sku = $1', [sku('R3')]);
  assert.equal(r3.shopify_handle, `octo-${RUN}`);
  assert.ok(r3.shopify_synced_at);

  const failing = await runSync({ source: { name: 'x', async listItems() { throw new Error('down'); } }, shopify });
  assert.equal(failing.errors[0].stage, 'listItems');
});
