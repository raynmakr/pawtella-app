// Inventory sync: Franpos (depot POS, source of truth for stock) → inventory_items → Shopify.
// Owner: Backend G.
//
//   runSync({ source })            listItems → importItems → pushToShopify
//   importItems(items, meta)       upsert by SKU, detect out-of-stock / back-in-stock transitions
//   pushToShopify({ onlyChanged }) create missing products, set depot quantity, apply sourcing policy
//   getStockState(handle)          what the storefront shows for a product
//   reserveForOrder / releaseReservation  online orders awaiting pickup (never touch qty_on_hand)
//   applyShopifyInventoryLevel     inventory_levels/update webhook → shopify_available hint
//   setSourcing / listSourcingQueue / discoveredSince / outOfStockSince  owner decisions + digest
//
// "Needs a Shopify push" is modelled as inventory_items.shopify_synced_at IS NULL: importItems clears it
// when something Shopify cares about changed, setSourcing clears it, pushToShopify sets it.
import { env, flags } from '../env.js';
import { query, one, many, withTransaction } from '../db.js';
import { camelize } from '../serialize.js';
import { getSource } from './source.js';
import { createRecordingShopify } from './shopify-fallback.js';

export const POLICIES = ['stock_only', 'special_order', 'hidden'];
export const DEFAULT_POLICY = 'stock_only';
const DEFAULT_LEAD_DAYS = 7;
const NEW_OOS_WINDOW_DAYS = 7;

// ---------------------------------------------------------------------------------------------
// Optional peers (notifications/events) and the Shopify client
// ---------------------------------------------------------------------------------------------

async function optional(path) {
  try {
    return await import(path);
  } catch (err) {
    if (err?.code !== 'ERR_MODULE_NOT_FOUND') console.warn('[inventory] optional module failed to load', { path, error: err.message });
    return null;
  }
}

async function track(name, data, tx) {
  const events = await optional('../events.js');
  if (events?.track) return events.track(name, data, tx);
  console.log('[inventory] event (events.js absent)', name, data?.props ?? {});
}

async function notifyUser(args) {
  const n = await optional('../notifications.js');
  if (n?.notify) return n.notify(args);
  console.log('[inventory] notify (notifications.js absent)', args.journey, { userId: args.userId, dedupeKey: args.dedupeKey });
  return { created: false };
}

let fallbackShopify;
let injectedShopify;

/** Tests inject a recording client; pass null to go back to lib/shopify.js. */
export function _setShopifyClient(client) {
  injectedShopify = client || undefined;
}

const SHOPIFY_FNS = ['createProduct', 'updateProduct', 'setInventoryQuantity', 'setVariantInventoryPolicy'];

export async function getShopifyClient() {
  if (injectedShopify) return injectedShopify;
  const mod = await optional('../shopify.js');
  if (mod && SHOPIFY_FNS.every((f) => typeof mod[f] === 'function')) return mod;
  if (!fallbackShopify) {
    console.warn('[inventory] lib/shopify.js has no Admin product functions; using in-memory recording mock');
    fallbackShopify = createRecordingShopify();
  }
  return fallbackShopify;
}

export const isMock = !flags.hasShopifyAdmin;

// ---------------------------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------------------------

const toInt = (v, fallback = null) => (v === undefined || v === null || v === '' ? fallback : Math.trunc(Number(v)) || 0);

function normalizeItem(raw) {
  const sku = String(raw.sku ?? raw.barcode ?? '').trim();
  const name = String(raw.name ?? '').trim();
  return {
    sku,
    barcode: raw.barcode ? String(raw.barcode).trim() : null,
    name,
    category: raw.category ? String(raw.category).trim() : null,
    brand: raw.brand ? String(raw.brand).trim() : null,
    priceCents: toInt(raw.priceCents ?? raw.price_cents, null),
    costCents: toInt(raw.costCents ?? raw.cost_cents, null),
    qtyOnHand: Math.max(0, toInt(raw.qtyOnHand ?? raw.qty_on_hand, 0)),
    updatedAt: raw.updatedAt ?? raw.updated_at ?? null,
    shopify: raw.shopify ?? null,
  };
}

/**
 * Upsert items into inventory_items. Returns the import summary (also written to inventory_imports).
 * @param {Item[]} items
 * @param {{ source?: string, filename?: string, errors?: Array }} meta  pre-parse errors are merged in
 */
export async function importItems(items, { source = env.inventory.source, filename = null, errors: preErrors = [] } = {}) {
  const errors = [...preErrors];
  const summary = {
    source,
    filename,
    rowCount: items.length,
    created: 0,
    updated: 0,
    unchanged: 0,
    wentOutOfStock: [],
    backInStock: [],
    newSkus: [],
    changedSkus: [],
    errors,
  };

  const normalized = [];
  for (const [i, raw] of items.entries()) {
    const it = normalizeItem(raw);
    if (!it.sku) errors.push({ row: i + 1, error: 'Missing SKU/barcode' });
    else if (!it.name) errors.push({ row: i + 1, sku: it.sku, error: 'Missing name' });
    else normalized.push(it);
  }

  const backInStockSkus = await withTransaction(async (tx) => {
    const skus = normalized.map((i) => i.sku);
    const existingRows = skus.length
      ? await tx.many(
          `SELECT sku, name, barcode, category, brand, price_cents, qty_on_hand, went_out_of_stock_at, shopify_product_id
             FROM inventory_items WHERE sku = ANY($1) FOR UPDATE`,
          [skus],
        )
      : [];
    const existing = new Map(existingRows.map((r) => [r.sku, r]));
    const back = [];

    for (const it of normalized) {
      const prev = existing.get(it.sku);
      const nowZero = it.qtyOnHand === 0;
      if (!prev) {
        await tx.query(
          `INSERT INTO inventory_items
             (sku, barcode, name, category, brand, price_cents, cost_cents, qty_on_hand, source, source_updated_at,
              last_seen_at, went_out_of_stock_at,
              shopify_product_id, shopify_variant_id, shopify_inventory_item_id, shopify_handle, shopify_synced_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::int,$9,$10, now(), CASE WHEN $8::int = 0 THEN now() END,
                   $11::text,$12::text,$13::text,$14::text, CASE WHEN $11::text IS NOT NULL THEN now() END)`,
          [
            it.sku, it.barcode, it.name, it.category, it.brand, it.priceCents, it.costCents, it.qtyOnHand, source, it.updatedAt,
            it.shopify?.productId ?? null, it.shopify?.variantId ?? null, it.shopify?.inventoryItemId ?? null, it.shopify?.handle ?? null,
          ],
        );
        summary.created++;
        summary.newSkus.push(it.sku);
        summary.changedSkus.push(it.sku);
        if (nowZero) summary.wentOutOfStock.push(it.sku);
        continue;
      }

      const wasZero = Number(prev.qty_on_hand) === 0;
      const changed =
        Number(prev.qty_on_hand) !== it.qtyOnHand ||
        (it.priceCents !== null && Number(prev.price_cents) !== it.priceCents) ||
        prev.name !== it.name ||
        (it.barcode && prev.barcode !== it.barcode) ||
        (it.category && prev.category !== it.category) ||
        (it.brand && prev.brand !== it.brand);

      await tx.query(
        `UPDATE inventory_items SET
           barcode = COALESCE($2, barcode), name = $3, category = COALESCE($4, category), brand = COALESCE($5, brand),
           price_cents = COALESCE($6, price_cents), cost_cents = COALESCE($7, cost_cents),
           qty_on_hand = $8::int, source = $9, source_updated_at = COALESCE($10::timestamptz, source_updated_at), last_seen_at = now(),
           went_out_of_stock_at = CASE WHEN $8::int = 0 THEN COALESCE(went_out_of_stock_at, now()) ELSE NULL END,
           shopify_product_id = COALESCE($11::text, shopify_product_id), shopify_variant_id = COALESCE($12::text, shopify_variant_id),
           shopify_inventory_item_id = COALESCE($13::text, shopify_inventory_item_id), shopify_handle = COALESCE($14::text, shopify_handle),
           shopify_synced_at = CASE WHEN $15::boolean THEN NULL ELSE shopify_synced_at END
         WHERE sku = $1`,
        [
          it.sku, it.barcode, it.name, it.category, it.brand, it.priceCents, it.costCents, it.qtyOnHand, source, it.updatedAt,
          it.shopify?.productId ?? null, it.shopify?.variantId ?? null, it.shopify?.inventoryItemId ?? null, it.shopify?.handle ?? null,
          changed && !it.shopify,
        ],
      );
      if (changed) {
        summary.updated++;
        summary.changedSkus.push(it.sku);
      } else summary.unchanged++;
      if (!wasZero && nowZero) summary.wentOutOfStock.push(it.sku);
      if (wasZero && !nowZero) {
        summary.backInStock.push(it.sku);
        back.push(it.sku);
      }
    }

    const status = errors.length === 0 ? 'ok' : normalized.length ? 'partial' : 'failed';
    const imp = await tx.one(
      `INSERT INTO inventory_imports (source, filename, row_count, created_count, updated_count, error_count, errors, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING id, created_at`,
      [source, filename, items.length, summary.created, summary.updated, errors.length, JSON.stringify(errors.slice(0, 200)), status],
    );
    summary.importId = imp.id;
    summary.status = status;
    return back;
  });

  for (const sku of backInStockSkus) await notifyBackInStock(sku);

  console.log('[inventory] import', {
    source, filename, rows: items.length, created: summary.created, updated: summary.updated,
    oos: summary.wentOutOfStock.length, back: summary.backInStock.length, errors: errors.length,
  });
  return summary;
}

/** Queue back_in_stock notifications for everyone subscribed to this SKU / its product handle. */
export async function notifyBackInStock(sku) {
  const item = await one('SELECT sku, name, shopify_handle FROM inventory_items WHERE sku = $1', [sku]);
  if (!item) return 0;
  const subs = await many(
    `SELECT id, user_id, product_handle FROM product_subscriptions
      WHERE notified_at IS NULL AND (sku = $1 OR ($2::text IS NOT NULL AND product_handle = $2))`,
    [sku, item.shopify_handle],
  );
  let sent = 0;
  for (const s of subs) {
    const day = Math.floor(Date.now() / 86_400_000);
    const { created } = await notifyUser({
      userId: s.user_id,
      journey: 'back_in_stock',
      channel: 'push',
      dedupeKey: `back_in_stock:${sku}:user:${s.user_id}:${day}`,
      title: `${item.name} is back in stock`,
      body: 'Grab it before it sells out again. Pickup today at the Toronto depot.',
      payload: { sku, handle: item.shopify_handle ?? s.product_handle, deepLink: `${env.appScheme}://shop/products/${item.shopify_handle ?? s.product_handle}` },
    });
    await query('UPDATE product_subscriptions SET notified_at = now() WHERE id = $1', [s.id]);
    if (created) sent++;
    await track('back_in_stock', { userId: s.user_id, props: { sku, handle: item.shopify_handle } });
  }
  if (subs.length) console.log('[inventory] back_in_stock', { sku, subscribers: subs.length, sent });
  return sent;
}

// ---------------------------------------------------------------------------------------------
// Push to Shopify
// ---------------------------------------------------------------------------------------------

const slug = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function tagsFor(row, policy, { isNew }) {
  const tags = new Set(['franpos']);
  if (isNew) tags.add('needs-review');
  if (row.category) tags.add(`category:${slug(row.category)}`);
  if (policy === 'special_order') tags.add('special-order');
  return [...tags];
}

const sellableQty = (row) => Math.max(0, Number(row.qty_on_hand) - Number(row.qty_reserved_online || 0));

/**
 * Push items to Shopify. onlyChanged=true pushes rows with shopify_synced_at IS NULL (new, changed,
 * re-decided or previously failed); pass skus to target specific items.
 */
export async function pushToShopify({ onlyChanged = true, skus = null, shopify = null } = {}) {
  const client = shopify || (await getShopifyClient());
  const locationId = env.shopify.depotLocationId || 'mock-location';
  const where = [];
  const params = [];
  if (skus?.length) {
    params.push(skus);
    where.push(`i.sku = ANY($${params.length})`);
  } else if (onlyChanged) {
    where.push('i.shopify_synced_at IS NULL');
  }
  const rows = await many(
    `SELECT i.*, s.policy, s.lead_days
       FROM inventory_items i LEFT JOIN product_sourcing s ON s.sku = i.sku
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY i.id`,
    params,
  );

  const summary = { attempted: rows.length, created: 0, updated: 0, failed: 0, errors: [], mock: !!(client.isMock || client.isAdminMock) };
  for (const row of rows) {
    const policy = row.policy || DEFAULT_POLICY;
    try {
      let { shopify_product_id: productId, shopify_variant_id: variantId, shopify_inventory_item_id: inventoryItemId, shopify_handle: handle } = row;
      const isNew = !productId;
      const status = policy === 'hidden' ? 'DRAFT' : 'ACTIVE';
      const tags = tagsFor(row, policy, { isNew });

      if (isNew) {
        const input = {
          title: row.name,
          sku: row.sku,
          barcode: row.barcode || undefined,
          priceCents: Number(row.price_cents || 0),
          vendor: row.brand || undefined,
          tags,
          status,
        };
        let created;
        try {
          created = await client.createProduct(input);
        } catch (err) {
          // Real Shopify dedupes handles itself; the mock (and a pre-existing product) may not.
          if (!/already exists|handle/i.test(err.message)) throw err;
          created = await client.createProduct({ ...input, handle: `${slug(row.name)}-${slug(row.sku)}` });
        }
        ({ productId, variantId, inventoryItemId, handle } = created);
        await query(
          `UPDATE inventory_items SET shopify_product_id = $2, shopify_variant_id = $3, shopify_inventory_item_id = $4, shopify_handle = $5
            WHERE sku = $1`,
          [row.sku, productId, variantId, inventoryItemId, handle],
        );
        summary.created++;
      }

      if (inventoryItemId) await client.setInventoryQuantity(inventoryItemId, locationId, sellableQty(row));

      if (variantId) await client.setVariantInventoryPolicy(variantId, policy === 'special_order' ? 'CONTINUE' : 'DENY');

      const update = { status, tags };
      if (policy === 'special_order') {
        update.metafields = [{ namespace: 'pawtella', key: 'lead_days', type: 'number_integer', value: String(row.lead_days ?? DEFAULT_LEAD_DAYS) }];
      }
      if (!isNew || policy === 'special_order') await client.updateProduct(productId, update);
      if (!isNew) summary.updated++;

      await query('UPDATE inventory_items SET shopify_synced_at = now(), shopify_sync_error = NULL WHERE sku = $1', [row.sku]);
    } catch (err) {
      summary.failed++;
      summary.errors.push({ sku: row.sku, error: err.message });
      await query('UPDATE inventory_items SET shopify_sync_error = $2 WHERE sku = $1', [row.sku, String(err.message).slice(0, 500)]);
      console.error('[inventory] shopify push failed', { sku: row.sku, error: err.message });
    }
  }
  console.log('[inventory] pushToShopify', { attempted: summary.attempted, created: summary.created, updated: summary.updated, failed: summary.failed, mock: summary.mock });
  return summary;
}

// ---------------------------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------------------------

/** listItems → importItems → pushToShopify. Returns { source, imported, pushed, errors }. */
export async function runSync({ source = env.inventory.source, csvText, filename, shopify } = {}) {
  const src = typeof source === 'string' ? getSource(source, { csvText, filename }) : source;
  const errors = [];
  let imported = null;
  let pushed = null;

  if (src.pushOnly) {
    // CSV source with nothing to read on this run: just flush pending Shopify changes.
    pushed = await pushToShopify({ onlyChanged: true, shopify });
    return { source: src.name, skipped: 'csv arrives via POST /api/inventory/import', imported, pushed, errors: pushed.errors };
  }

  let items;
  try {
    items = await src.listItems();
  } catch (err) {
    console.error('[inventory] listItems failed', { source: src.name, error: err.message });
    return { source: src.name, imported, pushed, errors: [{ stage: 'listItems', error: err.message }] };
  }
  imported = await importItems(items, { source: src.name, filename });
  errors.push(...imported.errors.map((e) => ({ stage: 'import', ...e })));

  if (src.readOnlyShopify) {
    pushed = { skipped: 'middleware (Octopus Bridge) writes to Shopify; mirroring only', attempted: 0, created: 0, updated: 0, failed: 0, errors: [] };
  } else {
    pushed = await pushToShopify({ onlyChanged: true, shopify });
    errors.push(...pushed.errors.map((e) => ({ stage: 'shopify', ...e })));
  }

  await track('inventory_synced', {
    props: { source: src.name, rows: imported.rowCount, created: imported.created, updated: imported.updated, pushed: pushed.created + pushed.updated, errors: errors.length },
  });
  return { source: src.name, imported, pushed, errors };
}

// ---------------------------------------------------------------------------------------------
// Storefront stock state
// ---------------------------------------------------------------------------------------------

/**
 * Stock state for a product handle:
 *   in_stock       sellable depot qty (on hand − reserved online) > 0
 *   special_order  qty ≤ 0 and policy special_order → { leadDays }
 *   sold_out       qty ≤ 0, stock_only (or hidden)
 *   unknown        no inventory row for this handle
 */
export async function getStockState(handle) {
  const row = await one(
    `SELECT i.sku, i.qty_on_hand, i.qty_reserved_online, s.policy, s.lead_days
       FROM inventory_items i LEFT JOIN product_sourcing s ON s.sku = i.sku
      WHERE i.shopify_handle = $1 OR i.sku = $1
      ORDER BY (i.shopify_handle = $1) DESC LIMIT 1`,
    [handle],
  );
  if (!row) return { state: 'unknown', qty: null };
  const qty = sellableQty(row);
  const policy = row.policy || DEFAULT_POLICY;
  if (qty > 0) return { state: 'in_stock', qty, sku: row.sku, policy };
  if (policy === 'special_order') return { state: 'special_order', qty: 0, sku: row.sku, policy, leadDays: row.lead_days ?? DEFAULT_LEAD_DAYS };
  return { state: 'sold_out', qty: 0, sku: row.sku, policy };
}

// ---------------------------------------------------------------------------------------------
// Reservations (online orders awaiting pickup / dispatch)
// ---------------------------------------------------------------------------------------------

function lineItemsOf(order) {
  let lines = order?.line_items ?? order?.lineItems ?? [];
  if (typeof lines === 'string') {
    try {
      lines = JSON.parse(lines);
    } catch {
      lines = [];
    }
  }
  const bySku = new Map();
  for (const l of lines) {
    const sku = String(l?.sku ?? '').trim();
    const qty = Math.trunc(Number(l?.quantity ?? 0));
    if (!sku || qty <= 0) continue;
    bySku.set(sku, (bySku.get(sku) || 0) + qty);
  }
  return bySku;
}

/**
 * Paid online order: bump qty_reserved_online per SKU so the storefront and depot see the units as
 * spoken for until Franpos's next export reflects the sale. qty_on_hand is never touched here:
 * Franpos is the source of truth and the next import overwrites it.
 */
export async function reserveForOrder(order, tx) {
  const run = tx ? tx.query : query;
  const lines = lineItemsOf(order);
  let reserved = 0;
  for (const [sku, qty] of lines) {
    const { rowCount } = await run(
      'UPDATE inventory_items SET qty_reserved_online = qty_reserved_online + $2 WHERE sku = $1',
      [sku, qty],
    );
    if (rowCount) reserved += qty;
  }
  if (lines.size) console.log('[inventory] reserveForOrder', { orderId: order?.id ?? order?.shopify_order_id, skus: lines.size, reserved });
  return { reserved, skus: [...lines.keys()] };
}

/**
 * Order fulfilled / picked up / cancelled: release the reservation (never below 0). We deliberately do
 * NOT decrement qty_on_hand: the depot rings the pickup through Franpos (or Franpos is adjusted
 * manually), and the next export carries the real on-hand count. Adjusting here would double count.
 */
export async function releaseReservation(order, tx) {
  const run = tx ? tx.query : query;
  const lines = lineItemsOf(order);
  let released = 0;
  for (const [sku, qty] of lines) {
    const { rowCount } = await run(
      'UPDATE inventory_items SET qty_reserved_online = GREATEST(0, qty_reserved_online - $2) WHERE sku = $1',
      [sku, qty],
    );
    if (rowCount) released += qty;
  }
  if (lines.size) console.log('[inventory] releaseReservation', { orderId: order?.id ?? order?.shopify_order_id, skus: lines.size, released });
  return { released, skus: [...lines.keys()] };
}

// ---------------------------------------------------------------------------------------------
// Shopify inventory_levels/update webhook
// ---------------------------------------------------------------------------------------------

const idTail = (v) => String(v ?? '').split('/').pop();

/**
 * Record Shopify's `available` for the depot location as a hint (shopify_available). Returns the
 * updated row or null when the location is another one / no item matches.
 */
export async function applyShopifyInventoryLevel(payload) {
  if (!payload) return null;
  const locationId = idTail(payload.location_id ?? payload.locationId);
  const depot = idTail(env.shopify.depotLocationId);
  if (depot && locationId && depot !== locationId) return null;
  const inventoryItemId = idTail(payload.inventory_item_id ?? payload.inventoryItemId);
  if (!inventoryItemId) return null;
  const available = payload.available === null || payload.available === undefined ? null : Math.trunc(Number(payload.available));
  const row = await one(
    `UPDATE inventory_items SET shopify_available = $2, shopify_available_at = COALESCE($3::timestamptz, now())
      WHERE shopify_inventory_item_id = $1 OR shopify_inventory_item_id LIKE '%/' || $1
      RETURNING sku, qty_on_hand, qty_reserved_online, shopify_available`,
    [inventoryItemId, available, payload.updated_at ?? null],
  );
  if (row) console.log('[inventory] shopify level', { sku: row.sku, available: row.shopify_available, onHand: row.qty_on_hand });
  return row;
}

// ---------------------------------------------------------------------------------------------
// Sourcing decisions
// ---------------------------------------------------------------------------------------------

/** Upsert the owner's sourcing decision for a SKU and flag the item for a Shopify re-push. */
export async function setSourcing(sku, { policy, supplier, leadDays, minOrderQty, notes } = {}, adminId = null, tx) {
  const run = tx ?? { one, query };
  if (!POLICIES.includes(policy)) throw new Error(`Invalid policy "${policy}". Expected ${POLICIES.join(' | ')}`);
  const item = await run.one('SELECT sku FROM inventory_items WHERE sku = $1', [sku]);
  if (!item) return null;
  const row = await run.one(
    `INSERT INTO product_sourcing (sku, policy, supplier, lead_days, min_order_qty, notes, decided_by, decided_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now())
     ON CONFLICT (sku) DO UPDATE SET
       policy = EXCLUDED.policy,
       supplier = COALESCE(EXCLUDED.supplier, product_sourcing.supplier),
       lead_days = COALESCE(EXCLUDED.lead_days, product_sourcing.lead_days),
       min_order_qty = COALESCE(EXCLUDED.min_order_qty, product_sourcing.min_order_qty),
       notes = COALESCE(EXCLUDED.notes, product_sourcing.notes),
       decided_by = EXCLUDED.decided_by, decided_at = now()
     RETURNING *`,
    [sku, policy, supplier ?? null, toInt(leadDays, null), toInt(minOrderQty, null), notes ?? null, adminId],
  );
  await run.query('UPDATE inventory_items SET shopify_synced_at = NULL WHERE sku = $1', [sku]);
  console.log('[inventory] setSourcing', { sku, policy, adminId });
  return camelize(row);
}

export async function getSourcing(sku) {
  const row = await one(
    `SELECT i.*, s.policy, s.supplier, s.lead_days, s.min_order_qty, s.notes, s.decided_by, s.decided_at
       FROM inventory_items i LEFT JOIN product_sourcing s ON s.sku = i.sku WHERE i.sku = $1`,
    [sku],
  );
  return row ? decorate(row) : null;
}

function decorate(row) {
  const out = camelize(row);
  out.effectivePolicy = row.policy || DEFAULT_POLICY;
  out.decided = !!row.policy;
  out.sellableQty = sellableQty(row);
  const recentOos = row.went_out_of_stock_at && Date.now() - new Date(row.went_out_of_stock_at).getTime() < NEW_OOS_WINDOW_DAYS * 86_400_000;
  out.queueReason = !row.policy ? 'new' : recentOos ? 'out_of_stock' : null;
  return out;
}

/**
 * Items awaiting a decision: SKUs with no product_sourcing row, plus SKUs that went out of stock in the
 * last 7 days. Filters: policy ('undecided' | one of POLICIES | 'all'), q (sku/name/brand search),
 * all (list every item, not just the queue).
 */
export async function listSourcingQueue({ policy, q, limit = 200, offset = 0, all = false } = {}) {
  const where = [];
  const params = [];
  if (policy && policy !== 'all') {
    if (policy === 'undecided') where.push('s.policy IS NULL');
    else if (POLICIES.includes(policy)) {
      params.push(policy);
      where.push(`s.policy = $${params.length}`);
    }
  } else if (!all) {
    where.push(`(s.policy IS NULL OR i.went_out_of_stock_at > now() - interval '${NEW_OOS_WINDOW_DAYS} days')`);
  }
  if (q) {
    params.push(`%${q}%`);
    where.push(`(i.sku ILIKE $${params.length} OR i.name ILIKE $${params.length} OR i.brand ILIKE $${params.length} OR i.barcode ILIKE $${params.length})`);
  }
  params.push(Math.min(500, Math.max(1, limit)), Math.max(0, offset));
  const rows = await many(
    `SELECT i.*, s.policy, s.supplier, s.lead_days, s.min_order_qty, s.notes, s.decided_by, s.decided_at
       FROM inventory_items i LEFT JOIN product_sourcing s ON s.sku = i.sku
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY (s.policy IS NULL) DESC, i.went_out_of_stock_at DESC NULLS LAST, i.first_seen_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows.map(decorate);
}

/** SKUs first seen after `date` (for the admin digest). */
export async function discoveredSince(date) {
  const rows = await many(
    `SELECT i.*, s.policy FROM inventory_items i LEFT JOIN product_sourcing s ON s.sku = i.sku
      WHERE i.first_seen_at > $1 ORDER BY i.first_seen_at DESC LIMIT 200`,
    [new Date(date)],
  );
  return rows.map(decorate);
}

/** SKUs that went out of stock after `date` and are still at zero (for the admin digest). */
export async function outOfStockSince(date) {
  const rows = await many(
    `SELECT i.*, s.policy, s.lead_days FROM inventory_items i LEFT JOIN product_sourcing s ON s.sku = i.sku
      WHERE i.went_out_of_stock_at > $1 AND i.qty_on_hand <= 0 ORDER BY i.went_out_of_stock_at DESC LIMIT 200`,
    [new Date(date)],
  );
  return rows.map(decorate);
}

/** Counters + last import for GET /api/inventory/status. */
export async function getStatus() {
  const counts = await one(
    `SELECT count(*)::int AS items,
            count(*) FILTER (WHERE qty_on_hand <= 0)::int AS out_of_stock,
            count(*) FILTER (WHERE shopify_product_id IS NULL)::int AS not_on_shopify,
            count(*) FILTER (WHERE shopify_synced_at IS NULL)::int AS pending_push,
            count(*) FILTER (WHERE shopify_sync_error IS NOT NULL)::int AS sync_errors,
            count(*) FILTER (WHERE last_seen_at < now() - interval '3 days')::int AS stale,
            max(last_seen_at) AS last_seen_at
       FROM inventory_items`,
  );
  const undecided = await one(
    `SELECT count(*)::int AS n FROM inventory_items i LEFT JOIN product_sourcing s ON s.sku = i.sku WHERE s.policy IS NULL`,
  );
  const lastImport = await one('SELECT * FROM inventory_imports ORDER BY created_at DESC LIMIT 1');
  const errors = await many(
    'SELECT sku, name, shopify_sync_error FROM inventory_items WHERE shopify_sync_error IS NOT NULL ORDER BY updated_at DESC LIMIT 20',
  );
  return {
    source: env.inventory.source,
    shopifyMock: isMock,
    counts: { ...camelize(counts), undecided: undecided.n },
    lastImport: lastImport ? camelize(lastImport) : null,
    syncErrors: camelize(errors),
  };
}
