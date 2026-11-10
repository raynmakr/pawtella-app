// /api/shop/* — catalog, cart, orders, fulfillment info. Catalog + cart proxy lib/shopify.js
// (real Storefront API or the mock). Orders come from the shop_orders mirror.
import { route, segments, body, badRequest, notFound, pagination, pathname } from '../lib/http.js';
import { optionalAuth, requireAuth } from '../lib/auth.js';
import { one, many } from '../lib/db.js';
import * as shopify from '../lib/shopify.js';
import { listOrdersForUser, getOrderForUser, toApiOrder } from '../lib/orders.js';
import { getStockState } from '../lib/inventory/sync.js';
import { track, EVENT } from '../lib/events.js';
import { env } from '../lib/env.js';
import { gid, isCartId, decodeCartToken } from '../lib/shopify-client.js';
import { subscriptionOfferForProduct } from '../lib/subscriptions/offer.js';
import { filterAvailableProducts } from '../lib/catalog.js';

// Real Toronto depot (891 College St). Prefer the configured location, fall back to the known id.
const DEPOT_LOCATION_ID = gid('Location', env.shopify.depotLocationId || '115648397619');

const BASE = '/api/shop';

export const DEFAULT_FULFILLMENT = {
  depot: {
    name: 'Pawtella Toronto Depot',
    street1: '891 College St',
    city: 'Toronto',
    province: 'ON',
    postalCode: 'M6H 1A1',
    country: 'CA',
    phone: '+1 (647) 438-8323',
    // Approximate (College St at Ossington). Confirm and override via app_settings 'fulfillment'.
    lat: 43.6545,
    lng: -79.4228,
    shopifyLocationId: DEPOT_LOCATION_ID,
    mapsUrl: 'https://maps.google.com/?q=891+College+St,+Toronto,+ON+M6H+1A1',
  },
  // Opening hours, fees and delivery windows are set in Shopify and not yet confirmed here.
  // Admins override this whole object with PATCH /api/admin/settings { key: 'fulfillment', value }.
  hours: [],
  pickup: {
    title: 'Free pickup at our Toronto depot',
    instructions: 'Choose "Pickup" at checkout. We let you know when your order is ready. Bring your order number.',
    readyWithinText: 'We notify you when it is ready',
  },
  localDelivery: {
    title: 'Local delivery in Toronto',
    radiusText: 'Within 15 km of our College St depot.',
    feeText: 'Delivery fee shown at checkout',
    windowText: 'Delivery timing shown at checkout',
    minOrderCents: 0,
  },
  shipping: {
    title: 'Shipping across Canada and the US',
    text: 'Rates, and duties for US orders, are shown at checkout.',
  },
  notes: 'Paw Point packs are digital and do not need a fulfillment method.',
};

async function getFulfillment() {
  const row = await one("SELECT value FROM app_settings WHERE key = 'fulfillment'");
  const value = row?.value && typeof row.value === 'object' ? row.value : {};
  return { ...DEFAULT_FULFILLMENT, ...value, depot: { ...DEFAULT_FULFILLMENT.depot, ...(value.depot || {}) } };
}

async function reviewsSummary(handle) {
  const row = await one(
    `SELECT COUNT(*)::int AS count, COALESCE(AVG(rating), 0)::float AS avg FROM product_reviews WHERE product_handle = $1 AND is_hidden = false`,
    [handle],
  );
  return { avg: Math.round((row?.avg || 0) * 10) / 10, count: row?.count || 0 };
}

async function stockState(handle, product = null) {
  try {
    return (await getStockState(handle, product)) || { state: 'unknown' };
  } catch (err) {
    console.warn('[shop] stock lookup failed', { handle, error: err?.message });
  }
  return { state: 'unknown' };
}

/** Attach the user id attribute (+ buyer email) to a cart when a session is present. */
async function buyerContext(req) {
  const auth = await optionalAuth(req);
  if (!auth) return { attributes: {}, buyerEmail: undefined, userId: null };
  const user = await one('SELECT email FROM users WHERE id = $1', [auth.userId]);
  return { attributes: { pawtella_user_id: String(auth.userId) }, buyerEmail: user?.email || undefined, userId: auth.userId };
}

/**
 * Cart ids are GIDs (`gid://shopify/Cart/<token>?key=…`) full of reserved URL characters. The web
 * client carries the id as a single base64url token segment — `/api/shop/cart/<token>[/lines]` —
 * because a percent-encoded gid gets mangled by Vercel/Next path normalization (308 on `%2F`). The
 * token has no reserved chars, so it arrives intact; `decodeCartToken` also accepts legacy raw or
 * percent-encoded gids for back-compat.
 */
function cartIdFromUrl(req) {
  const p = pathname(req);
  const m = p.match(/\/api\/shop\/cart\/(.+?)(\/lines)?$/);
  if (!m) throw badRequest('Missing cart id');
  return decodeCartToken(m[1]);
}

/**
 * A cart lookup/mutation failure that means the id no longer resolves (malformed, expired, or
 * consumed by a completed checkout) — as opposed to a transient outage we must not paper over by
 * silently discarding a real cart. Covers the mock's 404 and the Storefront `ID!` coercion error.
 */
export function isStaleCartError(err) {
  const status = err?.status;
  if (status === 429 || status === 503) return false;
  if (status === 404) return true;
  return /invalid value|invalid id|not found|does not exist|no such cart/i.test(err?.message || '');
}

/** Start a brand-new cart (empty unless `lines` are given), carrying over the buyer context. */
async function newCart(req, lines = [], ctx) {
  ctx = ctx || (await buyerContext(req));
  const cart = await shopify.cartCreate({ lines, buyerEmail: ctx.buyerEmail, attributes: ctx.attributes });
  if (lines.length) {
    await track(EVENT.checkout_started, { userId: ctx.userId, props: { cartId: cart.id, lines: lines.length, subtotalCents: cart.subtotalCents } });
  }
  return cart;
}

function normalizeLines(lines) {
  if (!Array.isArray(lines)) throw badRequest('lines must be an array');
  return lines.map((l) => {
    const merchandiseId = l?.merchandiseId || l?.variantId;
    if (!merchandiseId) throw badRequest('Each line needs merchandiseId');
    return {
      merchandiseId,
      quantity: Math.max(1, parseInt(l.quantity ?? 1, 10) || 1),
      attributes: l.attributes,
      ...(l.sellingPlanId ? { sellingPlanId: String(l.sellingPlanId) } : {}),
    };
  });
}

async function get(req) {
  const seg = segments(req, BASE);
  const [head, second] = seg;

  if (head === 'collections' && seg.length === 1) {
    return { collections: await shopify.getCollections(), isMock: shopify.isMock };
  }
  if (head === 'products' && seg.length === 1) {
    const { collection, q, query, cursor, first } = req.query || {};
    const result = await shopify.getProducts({ collection, query: q || query, cursor, first });
    // Hide out-of-stock products from browse, collections and search (Shopify is the source of
    // truth; continue-selling / special-order items stay visible). Restocked items reappear.
    return { ...result, products: filterAvailableProducts(result.products), isMock: shopify.isMock };
  }
  if (head === 'products' && seg.length === 2) {
    const handle = decodeURIComponent(second);
    const product = await shopify.getProduct(handle);
    if (!product) throw notFound('Product not found');
    const [stock, reviews] = await Promise.all([stockState(handle, product), reviewsSummary(handle)]);
    const subscription = await subscriptionOfferForProduct(product).catch(() => null);
    return { product: { ...product, stock, reviews, subscription } };
  }
  if (head === 'cart' && seg.length >= 2) {
    const id = cartIdFromUrl(req);
    let cart = null;
    if (isCartId(id)) {
      try {
        cart = await shopify.cartGet(id);
      } catch (err) {
        if (!isStaleCartError(err)) throw err;
        console.warn('[shop] cart lookup failed; issuing a fresh cart', { error: err?.message });
      }
    }
    if (cart) return { cart };
    // Self-heal: a missing/invalid/checked-out cart becomes a fresh empty cart, never an error.
    return { cart: await newCart(req), reset: true };
  }
  if (head === 'orders') {
    const { userId } = await requireAuth(req);
    if (seg.length === 1) {
      const { limit, offset, page } = pagination(req);
      const rows = await listOrdersForUser(userId, { limit, offset });
      return { orders: rows.map(toApiOrder), page, limit };
    }
    if (seg.length === 2) {
      const id = parseInt(second, 10);
      if (!Number.isInteger(id)) throw badRequest('Invalid order id');
      const row = await getOrderForUser(id, userId);
      if (!row) throw notFound('Order not found');
      const reviewed = await many('SELECT product_handle FROM product_reviews WHERE order_id = $1 AND user_id = $2', [id, userId]);
      return { order: { ...toApiOrder(row), reviewedHandles: reviewed.map((r) => r.product_handle) } };
    }
  }
  if (head === 'fulfillment' && seg.length === 1) {
    return { fulfillment: await getFulfillment() };
  }
  throw notFound();
}

async function post(req) {
  const seg = segments(req, BASE);
  if (seg[0] === 'cart' && seg.length === 1) {
    const b = body(req);
    const lines = normalizeLines(b.lines ?? []);
    const ctx = await buyerContext(req);
    let cart = null;
    if (b.cartId && isCartId(b.cartId)) {
      try {
        cart = await shopify.cartLinesAdd(b.cartId, lines);
      } catch (err) {
        if (!isStaleCartError(err)) throw err;
        cart = null; // the saved cart is gone — fall through and start a new one with the same lines
      }
      if (cart && ctx.userId && !cart.attributes?.pawtella_user_id) {
        cart = await shopify.cartAttributesUpdate(b.cartId, ctx.attributes);
        if (ctx.buyerEmail && !cart.buyerEmail) cart = await shopify.cartBuyerIdentityUpdate(b.cartId, { email: ctx.buyerEmail });
      }
    }
    if (cart) return { cart };
    // No cart, or the given one no longer resolves: create one carrying the requested lines.
    cart = await newCart(req, lines, ctx);
    return b.cartId ? { cart, reset: true } : { cart };
  }
  throw notFound();
}

async function patch(req) {
  const seg = segments(req, BASE);
  if (seg[0] === 'cart' && seg.length >= 2) {
    const b = body(req);
    if (!Array.isArray(b.lines)) throw badRequest('lines must be an array of { id, quantity }');
    const cartId = cartIdFromUrl(req);
    const lines = b.lines.map((l) => {
      if (!l?.id) throw badRequest('Each line needs id');
      return { id: l.id, quantity: parseInt(l.quantity, 10) };
    });
    if (isCartId(cartId)) {
      try {
        return { cart: await shopify.cartLinesUpdate(cartId, lines) };
      } catch (err) {
        if (!isStaleCartError(err)) throw err;
      }
    }
    return { cart: await newCart(req), reset: true };
  }
  throw notFound();
}

async function del(req) {
  const seg = segments(req, BASE);
  if (seg[0] === 'cart' && seg.length >= 3 && seg[seg.length - 1] === 'lines') {
    const b = body(req);
    if (!Array.isArray(b.lineIds) || !b.lineIds.length) throw badRequest('lineIds required');
    const cartId = cartIdFromUrl(req);
    if (isCartId(cartId)) {
      try {
        return { cart: await shopify.cartLinesRemove(cartId, b.lineIds) };
      } catch (err) {
        if (!isStaleCartError(err)) throw err;
      }
    }
    return { cart: await newCart(req), reset: true };
  }
  throw notFound();
}

export default route({ GET: get, POST: post, PATCH: patch, DELETE: del });
