// Mirror Shopify orders into shop_orders and run the paid-order side effects (hold capture,
// points, packs, partner commission, inventory reservation) in one transaction.
//
// The side-effect collaborators are imported STATICALLY on purpose: a previous version loaded them
// through a dynamic import() of a computed path, which Vercel's file tracer dropped from the bundle,
// so in production awardOrderPoints, partner commission and inventory reservation were silently
// skipped (pointsEarned 0). Static imports guarantee bundling and make a missing module a hard
// import error instead of a quiet no-op.
import { withTransaction, one, many } from './db.js';
import { camelize } from './serialize.js';
import { track, EVENT } from './events.js';
import * as shopify from './shopify.js';
import * as mock from './shopify-mock.js';
import { RULES } from './points-rules.js';
import { captureHold, awardOrderPoints, grantPackPoints } from './points.js';
import { accrueCommission } from './partners.js';
import { reserveForOrder, releaseReservation } from './inventory/sync.js';

/** Statuses after which the depot no longer holds stock for the order. */
export const RELEASED_STATUSES = new Set(['shipped', 'delivered', 'picked_up', 'cancelled', 'refunded']);

export const money = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

// ---------------------------------------------------------------------------------------------
// Mapping helpers (pure, exported for tests)
// ---------------------------------------------------------------------------------------------

export function noteAttribute(payload, name) {
  const attrs = Array.isArray(payload?.note_attributes) ? payload.note_attributes : [];
  const hit = attrs.find((a) => String(a?.name || '').toLowerCase() === name.toLowerCase());
  return hit ? String(hit.value ?? '') : null;
}

export function detectFulfillmentType(payload) {
  const lines = Array.isArray(payload?.shipping_lines) ? payload.shipping_lines : [];
  const text = (l) => `${l?.code || ''} ${l?.title || ''} ${l?.source || ''}`;
  if (lines.some((l) => /pickup|pick-up|pick up/i.test(text(l)))) return 'pickup';
  const pickupAttr = noteAttribute(payload, 'pickup') || noteAttribute(payload, 'fulfillment_type');
  if (pickupAttr && /pickup|^true$|^yes$|^1$/i.test(pickupAttr)) return 'pickup';
  if (lines.some((l) => /local[\s_-]*delivery/i.test(text(l)))) return 'local_delivery';
  if (pickupAttr && /local[\s_-]*delivery/i.test(pickupAttr)) return 'local_delivery';
  return 'shipping';
}

export function packPointsForLine(li, tags = []) {
  const fromTags = shopify.pawPointsFromTags(tags || []);
  if (fromTags) return fromTags;
  const sku = String(li?.sku || '');
  const m = sku.match(/^PP-(\d+)$/i);
  if (m) return parseInt(m[1], 10);
  const pack = (RULES.packs || []).find((p) => p.sku && p.sku === sku);
  return pack ? pack.points : 0;
}

function mapStatus(payload, fulfillmentType) {
  const fin = payload.financial_status || null;
  const ful = payload.fulfillment_status || null;
  if (payload.cancelled_at || fin === 'voided') return { status: 'cancelled', fulfillmentStatus: ful || 'unfulfilled' };
  if (fin === 'refunded') return { status: 'refunded', fulfillmentStatus: ful || 'unfulfilled' };
  const fulfillments = Array.isArray(payload.fulfillments) ? payload.fulfillments : [];
  const latest = fulfillments.filter((f) => f?.status !== 'cancelled').slice(-1)[0];
  const shipment = latest?.shipment_status || null; // label_printed, in_transit, out_for_delivery, delivered, ready_for_pickup, picked_up …
  if (fulfillmentType === 'pickup') {
    if (shipment === 'picked_up' || (ful === 'fulfilled' && shipment === 'delivered')) return { status: 'picked_up', fulfillmentStatus: 'picked_up' };
    if (shipment === 'ready_for_pickup' || latest) return { status: 'ready_for_pickup', fulfillmentStatus: 'ready_for_pickup' };
    return { status: fin === 'paid' ? 'processing' : 'paid', fulfillmentStatus: ful || 'unfulfilled' };
  }
  if (ful === 'fulfilled' || latest) {
    if (shipment === 'delivered') return { status: 'delivered', fulfillmentStatus: 'fulfilled' };
    if (shipment === 'out_for_delivery') return { status: 'out_for_delivery', fulfillmentStatus: ful || 'partial' };
    return { status: 'shipped', fulfillmentStatus: ful || 'partial' };
  }
  if (ful === 'partial') return { status: 'processing', fulfillmentStatus: 'partial' };
  return { status: fin === 'paid' || fin === 'partially_refunded' ? 'paid' : 'processing', fulfillmentStatus: 'unfulfilled' };
}

async function resolveLineMeta(li) {
  // Mock: catalog lookup. Real: Admin product lookup (handle + tags), best effort.
  if (shopify.isMock) {
    const p = mock.findProductBySku(li.sku) || (li.product_id ? mock.findProductById(li.product_id) : null);
    return p ? { handle: p.handle, tags: p.tags } : { handle: null, tags: [] };
  }
  if (!li.product_id) return { handle: null, tags: [] };
  try {
    const meta = await shopify.getProductMetaById(li.product_id);
    return meta ? { handle: meta.handle, tags: meta.tags } : { handle: null, tags: [] };
  } catch (err) {
    console.warn('[orders] product meta lookup failed', { productId: li.product_id, error: err?.message });
    return { handle: null, tags: [] };
  }
}

export async function mapLineItems(payload) {
  const items = Array.isArray(payload?.line_items) ? payload.line_items : [];
  const cache = new Map();
  const out = [];
  for (const li of items) {
    const key = `${li.product_id || ''}|${li.sku || ''}`;
    if (!cache.has(key)) cache.set(key, resolveLineMeta(li));
    const meta = await cache.get(key);
    const quantity = parseInt(li.quantity ?? 1, 10) || 1;
    out.push({
      sku: li.sku || null,
      handle: meta.handle,
      title: li.title || li.name || '',
      quantity,
      priceCents: money(li.price),
      variantId: li.variant_id != null ? String(li.variant_id) : null,
      productId: li.product_id != null ? String(li.product_id) : null,
      tags: meta.tags || [],
      pawPointsPack: packPointsForLine(li, meta.tags) || undefined,
    });
  }
  return out;
}

/** Shopify order JSON → shop_orders column values (snake_case). */
export async function mapOrder(payload) {
  const fulfillmentType = detectFulfillmentType(payload);
  const { status, fulfillmentStatus } = mapStatus(payload, fulfillmentType);
  const lineItems = await mapLineItems(payload);
  const codes = (Array.isArray(payload.discount_codes) ? payload.discount_codes : []).map((d) => String(d?.code || '')).filter(Boolean);
  const discountCents = money(payload.total_discounts);
  const grossSubtotal = money(payload.subtotal_price ?? payload.current_subtotal_price);
  // Shopify's subtotal_price is already net of discounts; be defensive if a payload reports gross.
  const subtotalCents = Math.max(0, grossSubtotal);
  const shippingCents = money(payload.total_shipping_price_set?.shop_money?.amount ?? payload.shipping_lines?.reduce((s, l) => s + parseFloat(l?.price || 0), 0));
  const tracking = (payload.fulfillments || []).map((f) => f?.tracking_url || f?.tracking_urls?.[0]).filter(Boolean).slice(-1)[0] || null;
  return {
    shopify_order_id: String(payload.id ?? payload.admin_graphql_api_id ?? ''),
    order_number: payload.name || (payload.order_number != null ? `#${payload.order_number}` : null),
    email: payload.email || payload.contact_email || payload.customer?.email || null,
    currency: payload.currency || payload.presentment_currency || 'CAD',
    subtotal_cents: subtotalCents,
    discount_cents: discountCents,
    shipping_cents: shippingCents,
    tax_cents: money(payload.total_tax ?? payload.current_total_tax),
    total_cents: money(payload.total_price ?? payload.current_total_price),
    discount_codes: codes,
    fulfillment_type: fulfillmentType,
    financial_status: payload.financial_status || null,
    fulfillment_status: fulfillmentStatus,
    status,
    line_items: lineItems,
    tracking_url: tracking,
    placed_at: payload.processed_at || payload.created_at || new Date().toISOString(),
    pawtella_user_id: noteAttribute(payload, 'pawtella_user_id'),
    customer_id: payload.customer?.id != null ? String(payload.customer.id) : null,
  };
}

async function resolveUserId(tx, mapped) {
  if (mapped.pawtella_user_id && /^\d+$/.test(mapped.pawtella_user_id)) {
    const u = await tx.one('SELECT id FROM users WHERE id = $1', [parseInt(mapped.pawtella_user_id, 10)]);
    if (u) return u.id;
  }
  if (mapped.customer_id) {
    const u = await tx.one('SELECT id FROM users WHERE shopify_customer_id = $1', [mapped.customer_id]);
    if (u) return u.id;
  }
  if (mapped.email) {
    const u = await tx.one('SELECT id FROM users WHERE email = $1', [mapped.email]);
    if (u) return u.id;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Upsert + side effects
// ---------------------------------------------------------------------------------------------

/**
 * Insert or update the mirrored order. Runs in one transaction. On a NEW paid order:
 * captureHold (PAW- codes) → awardOrderPoints → grantPackPoints → accrueCommission → reserveForOrder
 * → track(order_paid). Later topics only update statuses (and run the paid effects if the order
 * was first seen unpaid and is now paid).
 */
export async function upsertOrderFromWebhook(payload, { topic = 'orders/paid' } = {}) {
  if (!payload || payload.id === undefined || payload.id === null) throw new Error('Order payload missing id');
  const mapped = await mapOrder(payload);

  return withTransaction(async (tx) => {
    const existing = await tx.one('SELECT * FROM shop_orders WHERE shopify_order_id = $1 FOR UPDATE', [mapped.shopify_order_id]);
    const userId = existing?.user_id ?? (await resolveUserId(tx, mapped));
    let order;
    let isNew = false;

    if (!existing) {
      isNew = true;
      order = await tx.one(
        `INSERT INTO shop_orders (user_id, shopify_order_id, order_number, email, currency, subtotal_cents, discount_cents,
           shipping_cents, tax_cents, total_cents, discount_codes, fulfillment_type, financial_status, fulfillment_status,
           status, line_items, tracking_url, raw, placed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18::jsonb,$19)
         RETURNING *`,
        [
          userId,
          mapped.shopify_order_id,
          mapped.order_number,
          mapped.email,
          mapped.currency,
          mapped.subtotal_cents,
          mapped.discount_cents,
          mapped.shipping_cents,
          mapped.tax_cents,
          mapped.total_cents,
          mapped.discount_codes,
          mapped.fulfillment_type,
          mapped.financial_status,
          mapped.fulfillment_status,
          mapped.status,
          JSON.stringify(mapped.line_items),
          mapped.tracking_url,
          JSON.stringify(payload),
          mapped.placed_at,
        ],
      );
    } else {
      // Never regress a terminal status from an out-of-order webhook, and keep money fields fresh.
      const keepStatus = ['picked_up', 'delivered', 'refunded'].includes(existing.status) && !['cancelled', 'refunded'].includes(mapped.status);
      order = await tx.one(
        `UPDATE shop_orders SET
           user_id = COALESCE(user_id, $2), order_number = COALESCE($3, order_number), email = COALESCE($4, email),
           subtotal_cents = $5, discount_cents = $6, shipping_cents = $7, tax_cents = $8, total_cents = $9,
           discount_codes = CASE WHEN cardinality($10::text[]) > 0 THEN $10::text[] ELSE discount_codes END,
           fulfillment_type = COALESCE($11, fulfillment_type), financial_status = COALESCE($12, financial_status),
           fulfillment_status = $13, status = CASE WHEN $14::boolean THEN status ELSE $15 END,
           line_items = CASE WHEN jsonb_array_length($16::jsonb) > 0 THEN $16::jsonb ELSE line_items END,
           tracking_url = COALESCE($17, tracking_url), raw = $18::jsonb
         WHERE id = $1 RETURNING *`,
        [
          existing.id,
          userId,
          mapped.order_number,
          mapped.email,
          mapped.subtotal_cents,
          mapped.discount_cents,
          mapped.shipping_cents,
          mapped.tax_cents,
          mapped.total_cents,
          mapped.discount_codes,
          mapped.fulfillment_type,
          mapped.financial_status,
          mapped.fulfillment_status,
          keepStatus,
          mapped.status,
          JSON.stringify(mapped.line_items),
          mapped.tracking_url,
          JSON.stringify(payload),
        ],
      );
    }

    const paidNow = ['paid', 'partially_refunded'].includes(mapped.financial_status) && !payload.cancelled_at;
    const effectsPending = paidNow && (isNew || (existing && !['paid', 'partially_refunded'].includes(existing.financial_status)));
    if (effectsPending) {
      order = await applyPaidEffects(order, tx);
    }

    // Fulfilled / picked up / cancelled: release the depot reservation exactly once (on the transition).
    const wasReleased = existing ? RELEASED_STATUSES.has(existing.status) : false;
    const everPaid = ['paid', 'partially_refunded', 'refunded'].includes(order.financial_status) || !!existing;
    if (RELEASED_STATUSES.has(order.status) && !wasReleased && everPaid) {
      await releaseReservation(order, tx);
    }

    if (!isNew && (topic === 'orders/fulfilled' || topic === 'fulfillments/update') && ['shipped', 'delivered', 'ready_for_pickup', 'picked_up'].includes(order.status)) {
      await track(EVENT.order_fulfilled, { userId: order.user_id, props: { orderId: order.id, status: order.status, fulfillmentType: order.fulfillment_type } }, tx);
    }

    console.log('[orders] upsert', { topic, orderId: order.id, shopifyOrderId: order.shopify_order_id, isNew, status: order.status, userId: order.user_id });
    return { order, isNew };
  });
}

async function applyPaidEffects(order, tx) {
  // effects_applied_at marks a completed run. Hold capture, order points and partner commission are
  // each self-idempotent (guarded by their own ledger rows), so they always run and are safe to
  // re-run. Paw Point packs and the depot reservation are NOT self-idempotent, so they run only on
  // the first application — this lets reapplyPaidEffects fill gaps without double-crediting.
  const alreadyApplied = !!order.effects_applied_at;
  let pointsRedeemed = 0;
  let pointsEarned = 0;
  let packPoints = order.pack_points_granted || 0;
  const effects = [];

  // 1. Capture Paw Point holds for PAW- discount codes (idempotent: only 'held' rows are captured).
  for (const code of order.discount_codes || []) {
    if (!/^PAW-/i.test(code)) continue;
    try {
      const hold = await captureHold(code, { orderId: order.id }, tx);
      if (hold) {
        pointsRedeemed += hold.points || 0;
        effects.push(`captured ${code}`);
      }
    } catch (err) {
      console.error('[orders] captureHold failed', { code, orderId: order.id, error: err?.message });
      throw err;
    }
  }

  if (order.user_id) {
    const packLines = (order.line_items || []).filter((li) => li.pawPointsPack);
    // 2. Earn 1 PP per $1 of cash subtotal (+ first-order bonus inside awardOrderPoints). Packs are
    //    not "cash spend": pass the subtotal net of pack lines. Idempotent per order.
    const cashSubtotal = Math.max(0, order.subtotal_cents - packLines.reduce((s, li) => s + li.priceCents * li.quantity, 0));
    pointsEarned = (await awardOrderPoints({ ...order, subtotal_cents: cashSubtotal }, tx)) || 0;
    if (pointsEarned) effects.push(`earned ${pointsEarned}`);

    // 3. Paw Point packs (not self-idempotent — first application only).
    if (!alreadyApplied) {
      packPoints = 0;
      for (const li of packLines) {
        const pts = li.pawPointsPack * li.quantity;
        await grantPackPoints(order.user_id, pts, { orderId: order.id }, tx); // tracks pack_purchased itself
        packPoints += pts;
      }
    }
    if (packPoints) effects.push(`pack ${packPoints}`);
  } else {
    console.log('[orders] paid order without a matched user; points skipped', { orderId: order.id, email: order.email });
  }

  // 4. Partner commission (idempotent: deduped by order_id in partner_earnings).
  let partnerId = null;
  if (order.user_id) {
    const earning = await accrueCommission(order, tx);
    if (earning?.partner_id) {
      partnerId = earning.partner_id;
      effects.push(`commission ${earning.amount_cents}`);
    }
  }

  // 5. Reserve depot stock for the SKUs on this order (not self-idempotent — first application only).
  if (!alreadyApplied) await reserveForOrder(order, tx);

  const updated = await tx.one(
    `UPDATE shop_orders SET points_earned = $2, points_redeemed = $3, pack_points_granted = $4,
       partner_id = COALESCE($5, partner_id), effects_applied_at = COALESCE(effects_applied_at, now())
     WHERE id = $1 RETURNING *`,
    [order.id, pointsEarned, pointsRedeemed, packPoints, partnerId],
  );

  // Emit order_paid only on the first application so a re-run does not double-count the funnel.
  if (!alreadyApplied) {
    await track(
      EVENT.order_paid,
      {
        userId: order.user_id,
        props: {
          orderId: order.id,
          shopifyOrderId: order.shopify_order_id,
          subtotalCents: order.subtotal_cents,
          totalCents: order.total_cents,
          fulfillmentType: order.fulfillment_type,
          pointsEarned,
          pointsRedeemed,
          packPoints,
          discountCodes: order.discount_codes,
        },
      },
      tx,
    );
  }
  console.log('[orders] paid effects', { orderId: order.id, effects, reapplied: alreadyApplied });
  return updated;
}

/**
 * Idempotent maintenance re-run of the paid-order side effects for a single order, looked up by
 * shop_orders.id or shopify_order_id. Use this to repair an order whose effects were skipped (e.g.
 * the production bug where the side-effect modules were dropped from the serverless bundle). Safe to
 * run repeatedly: already-applied effects are no-ops. Throws if the order is missing or not paid.
 */
export async function reapplyPaidEffects(idOrShopifyId) {
  const key = String(idOrShopifyId ?? '').trim();
  if (!key) throw new Error('reapplyPaidEffects requires an order id or shopify_order_id');
  return withTransaction(async (tx) => {
    const order = await tx.one(
      'SELECT * FROM shop_orders WHERE id::text = $1 OR shopify_order_id = $1 FOR UPDATE',
      [key],
    );
    if (!order) throw new Error(`Order not found: ${key}`);
    if (!['paid', 'partially_refunded'].includes(order.financial_status)) {
      throw new Error(`Order ${order.id} (${order.order_number || order.shopify_order_id}) is not paid (financial_status=${order.financial_status ?? 'null'}); refusing to apply paid effects`);
    }
    const before = {
      pointsEarned: order.points_earned,
      pointsRedeemed: order.points_redeemed,
      packPoints: order.pack_points_granted,
      effectsAppliedAt: order.effects_applied_at,
    };
    const updated = await applyPaidEffects(order, tx);
    return {
      orderId: updated.id,
      shopifyOrderId: updated.shopify_order_id,
      orderNumber: updated.order_number,
      firstApplication: !before.effectsAppliedAt,
      before,
      after: {
        pointsEarned: updated.points_earned,
        pointsRedeemed: updated.points_redeemed,
        packPoints: updated.pack_points_granted,
        effectsAppliedAt: updated.effects_applied_at,
      },
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------

const API_COLUMNS = [
  'id', 'order_number', 'currency', 'subtotal_cents', 'discount_cents', 'shipping_cents', 'tax_cents', 'total_cents',
  'discount_codes', 'fulfillment_type', 'financial_status', 'fulfillment_status', 'status', 'points_earned',
  'points_redeemed', 'pack_points_granted', 'line_items', 'tracking_url', 'placed_at', 'created_at', 'updated_at',
];

/** API shape: camelCase, no raw payload / email / partner internals. */
export function toApiOrder(row) {
  if (!row) return null;
  const picked = {};
  for (const c of API_COLUMNS) if (row[c] !== undefined) picked[c] = row[c];
  const out = camelize(picked);
  out.shopifyOrderId = row.shopify_order_id;
  out.itemCount = (row.line_items || []).reduce((s, li) => s + (li.quantity || 0), 0);
  return out;
}

export async function listOrdersForUser(userId, { limit = 20, offset = 0 } = {}) {
  return many('SELECT * FROM shop_orders WHERE user_id = $1 ORDER BY placed_at DESC LIMIT $2 OFFSET $3', [userId, limit, offset]);
}

export async function getOrderForUser(id, userId) {
  return one('SELECT * FROM shop_orders WHERE id = $1 AND user_id = $2', [id, userId]);
}

export async function getOrderById(id) {
  return one('SELECT * FROM shop_orders WHERE id = $1', [id]);
}
