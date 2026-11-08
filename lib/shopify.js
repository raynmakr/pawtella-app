// Shopify facade: picks the real Storefront/Admin adapter or the in-memory mock per env flags.
// Storefront functions follow flags.hasShopify; Admin functions follow flags.hasShopifyAdmin and
// fall back to the mock when only the Storefront token is present. `isMock` reflects the Storefront
// side (the catalog + cart the app sees). HMAC verification lives here because it is provider-level.
import crypto from 'node:crypto';
import { env, flags } from './env.js';
import * as real from './shopify-real.js';
import * as mock from './shopify-mock.js';

const store = flags.hasShopify ? real : mock;
const adminImpl = flags.hasShopifyAdmin ? real : mock;

export const isMock = !flags.hasShopify;
export const isAdminMock = !flags.hasShopifyAdmin;

if (isMock) console.log('[shopify] Storefront token missing → mock catalog + mock checkout');
if (isAdminMock && flags.hasShopify) console.log('[shopify] Admin token missing → mock discount codes / gift cards / products');

// Storefront
export const getCollections = (...a) => store.getCollections(...a);
export const getProducts = (...a) => store.getProducts(...a);
export const getProduct = (...a) => store.getProduct(...a);
export const cartCreate = (...a) => store.cartCreate(...a);
export const cartGet = (...a) => store.cartGet(...a);
export const cartLinesAdd = (...a) => store.cartLinesAdd(...a);
export const cartLinesUpdate = (...a) => store.cartLinesUpdate(...a);
export const cartLinesRemove = (...a) => store.cartLinesRemove(...a);
export const cartDiscountCodesUpdate = (...a) => store.cartDiscountCodesUpdate(...a);
export const cartBuyerIdentityUpdate = (...a) => store.cartBuyerIdentityUpdate(...a);
export const cartAttributesUpdate = (...a) => store.cartAttributesUpdate(...a);

// Admin
export const createDiscountCode = (...a) => adminImpl.createDiscountCode(...a);
export const deactivateDiscountCode = (...a) => adminImpl.deactivateDiscountCode(...a);
export const createGiftCard = (...a) => adminImpl.createGiftCard(...a);
export const findCustomerByEmail = (...a) => adminImpl.findCustomerByEmail(...a);
export const createProduct = (...a) => adminImpl.createProduct(...a);
export const updateProduct = (...a) => adminImpl.updateProduct(...a);
export const setInventoryQuantity = (...a) => adminImpl.setInventoryQuantity(...a);
export const setVariantInventoryPolicy = (...a) => adminImpl.setVariantInventoryPolicy(...a);
/** product id → { id, handle, tags } (Admin in real mode, catalog in mock). Used by the order mapper. */
export const getProductMetaById = (...a) => (flags.hasShopifyAdmin ? real : mock).getProductMetaById(...a);

export { pawPointsFromTags, PAW_POINTS_TAG_RE } from './shopify-real.js';

/** Reset mock state (tests). No-op in real mode. */
export function __reset() {
  mock.__reset();
}

/**
 * Verify X-Shopify-Hmac-Sha256: base64(HMAC-SHA256(rawBody, SHOPIFY_WEBHOOK_SECRET)), timing-safe.
 * Returns false when the secret is missing (callers decide whether dev may skip).
 */
export function verifyWebhookHmac(rawBodyBuffer, hmacHeader, secret = env.shopify.webhookSecret) {
  if (!secret || !hmacHeader) return false;
  const body = Buffer.isBuffer(rawBodyBuffer) ? rawBodyBuffer : Buffer.from(String(rawBodyBuffer ?? ''), 'utf8');
  const digest = crypto.createHmac('sha256', secret).update(body).digest();
  let given;
  try {
    given = Buffer.from(String(hmacHeader).trim(), 'base64');
  } catch {
    return false;
  }
  if (given.length !== digest.length) return false;
  return crypto.timingSafeEqual(given, digest);
}

/** Compute the header value for a body (tests, mock checkout). */
export function signWebhookBody(rawBody, secret = env.shopify.webhookSecret) {
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
  return crypto.createHmac('sha256', secret || '').update(body).digest('base64');
}
