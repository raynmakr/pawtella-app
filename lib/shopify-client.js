// Tiny GraphQL fetchers for the Shopify Storefront and Admin APIs.
//
//   const data = await storefront(`query { shop { name } }`);
//   const data = await admin(`mutation ($input: ...) { ... }`, { input });
//
// Both throw ApiError(502) on transport failures, GraphQL `errors`, or `userErrors` inside the
// first mutation payload, so callers can treat a returned value as a success.
// Field names used by callers were checked against shopify.dev for API version 2026-10.
import { env, flags } from './env.js';
import { ApiError } from './http.js';

const STOREFRONT_PATH = (v) => `/api/${v}/graphql.json`;
const ADMIN_PATH = (v) => `/admin/api/${v}/graphql.json`;

function endpoint(kind) {
  const domain = env.shopify.storeDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const version = env.shopify.apiVersion;
  return `https://${domain}${kind === 'admin' ? ADMIN_PATH(version) : STOREFRONT_PATH(version)}`;
}

/** Collect `userErrors` arrays from every top-level mutation payload. */
export function collectUserErrors(data) {
  const out = [];
  if (!data || typeof data !== 'object') return out;
  for (const [field, payload] of Object.entries(data)) {
    if (payload && typeof payload === 'object' && Array.isArray(payload.userErrors)) {
      for (const e of payload.userErrors) out.push({ ...e, mutation: field });
    }
  }
  return out;
}

async function graphql(kind, query, variables = {}, { headers = {}, operationName } = {}) {
  const url = endpoint(kind);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
      body: JSON.stringify({ query, variables, operationName }),
    });
  } catch (err) {
    console.error(`[shopify:${kind}] network error`, { error: err?.message });
    throw new ApiError(502, `Shopify ${kind} API unreachable`);
  }

  let json;
  try {
    json = await res.json();
  } catch {
    throw new ApiError(502, `Shopify ${kind} API returned a non-JSON response (${res.status})`);
  }

  if (!res.ok) {
    console.error(`[shopify:${kind}] HTTP ${res.status}`, { errors: json?.errors });
    const msg = typeof json?.errors === 'string' ? json.errors : `HTTP ${res.status}`;
    throw new ApiError(res.status === 429 ? 429 : 502, `Shopify ${kind} API error: ${msg}`);
  }
  if (Array.isArray(json.errors) && json.errors.length) {
    console.error(`[shopify:${kind}] GraphQL errors`, { errors: json.errors.map((e) => e.message) });
    throw new ApiError(502, `Shopify ${kind} API error: ${json.errors.map((e) => e.message).join('; ')}`);
  }
  const userErrors = collectUserErrors(json.data);
  if (userErrors.length) {
    console.error(`[shopify:${kind}] userErrors`, { userErrors });
    throw new ApiError(502, `Shopify ${kind} rejected the request: ${userErrors.map((e) => e.message).join('; ')}`, {
      userErrors,
    });
  }
  return json.data;
}

/** Storefront API (public token). */
export function storefront(query, variables, opts) {
  if (!flags.hasShopify) throw new ApiError(503, 'Shopify Storefront API is not configured');
  return graphql('storefront', query, variables, {
    ...opts,
    headers: { 'X-Shopify-Storefront-Access-Token': env.shopify.storefrontToken, ...(opts?.headers || {}) },
  });
}

/** Admin API (custom-app token). */
export function admin(query, variables, opts) {
  if (!flags.hasShopifyAdmin) throw new ApiError(503, 'Shopify Admin API is not configured');
  return graphql('admin', query, variables, {
    ...opts,
    headers: { 'X-Shopify-Access-Token': env.shopify.adminToken, ...(opts?.headers || {}) },
  });
}

// ---- GID helpers -----------------------------------------------------------------------------

export function gid(type, id) {
  const s = String(id ?? '');
  return s.startsWith('gid://') ? s : `gid://shopify/${type}/${s}`;
}

export function gidNumber(id) {
  const m = String(id ?? '').match(/\/(\d+)(\?.*)?$/);
  return m ? m[1] : String(id ?? '');
}

/** "12.34" | 12.34 → 1234 (integer cents). */
export function moneyToCents(amount) {
  if (amount === null || amount === undefined || amount === '') return 0;
  const n = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** 1234 → "12.34" (Shopify Money / Decimal scalar). */
export function centsToMoney(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}

export default { storefront, admin, gid, gidNumber, moneyToCents, centsToMoney, collectUserErrors };
