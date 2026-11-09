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

/** Storefront API. Prefers the private (server-side) token; falls back to the public one. */
export function storefront(query, variables, opts) {
  if (!flags.hasShopify) throw new ApiError(503, 'Shopify Storefront API is not configured');
  const auth = env.shopify.storefrontPrivateToken
    ? { 'Shopify-Storefront-Private-Token': env.shopify.storefrontPrivateToken }
    : { 'X-Shopify-Storefront-Access-Token': env.shopify.storefrontToken };
  return graphql('storefront', query, variables, {
    ...opts,
    headers: { ...auth, ...(opts?.headers || {}) },
  });
}

// ---- Admin token (client credentials grant) --------------------------------------------------
// Dev Dashboard apps installed on a store in the same organization exchange client id + secret
// for an Admin token valid 24 h (expires_in 86399). Cached per process; refreshed 5 min early.

let cachedAdminToken = null; // { token, expiresAt }
let inflightTokenRequest = null;

function shopDomain() {
  return env.shopify.storeDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

async function requestAdminToken(fetchImpl = fetch) {
  const res = await fetchImpl(`https://${shopDomain()}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.shopify.clientId,
      client_secret: env.shopify.clientSecret,
    }).toString(),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* handled below */
  }
  if (!res.ok || !json?.access_token) {
    const detail = json?.error_description || json?.error || json?.errors || `HTTP ${res.status}`;
    console.error('[shopify:auth] client credentials grant failed', { status: res.status, detail });
    throw new ApiError(502, `Shopify Admin authentication failed: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
  }
  const ttlSeconds = Number(json.expires_in) > 0 ? Number(json.expires_in) : 86399;
  return { token: json.access_token, expiresAt: Date.now() + ttlSeconds * 1000, scope: json.scope };
}

/** Current Admin token: the static SHOPIFY_ADMIN_TOKEN, or a cached client-credentials token. */
export async function getAdminToken({ fetchImpl, force = false } = {}) {
  if (env.shopify.adminToken) return env.shopify.adminToken;
  const fresh = cachedAdminToken && cachedAdminToken.expiresAt - Date.now() > 5 * 60 * 1000;
  if (fresh && !force) return cachedAdminToken.token;
  if (!inflightTokenRequest) {
    inflightTokenRequest = requestAdminToken(fetchImpl)
      .then((t) => {
        cachedAdminToken = t;
        return t;
      })
      .finally(() => {
        inflightTokenRequest = null;
      });
  }
  return (await inflightTokenRequest).token;
}

/** Test hook: drop the cached token. */
export function __resetAdminToken() {
  cachedAdminToken = null;
  inflightTokenRequest = null;
}

/** Admin API. Retries once with a fresh token if a cached client-credentials token was rejected. */
export async function admin(query, variables, opts) {
  if (!flags.hasShopifyAdmin) throw new ApiError(503, 'Shopify Admin API is not configured');
  const call = async (token) =>
    graphql('admin', query, variables, {
      ...opts,
      headers: { 'X-Shopify-Access-Token': token, ...(opts?.headers || {}) },
    });
  try {
    return await call(await getAdminToken());
  } catch (err) {
    const rejected = err instanceof ApiError && /HTTP 401|Invalid API key|access token/i.test(err.message);
    if (!rejected || env.shopify.adminToken) throw err;
    return call(await getAdminToken({ force: true }));
  }
}

// ---- GID helpers -----------------------------------------------------------------------------

export function gid(type, id) {
  const s = String(id ?? '');
  return s.startsWith('gid://') ? s : `gid://shopify/${type}/${s}`;
}

/**
 * A well-formed Storefront cart id: `gid://shopify/Cart/<token>` with the optional `?key=<key>`
 * that the Storefront API returns (e.g. `gid://shopify/Cart/c1-abc?key=def`). Anything else — an
 * empty string, a non-string, a percent-encoded leftover, `"undefined"`, or a cart id minted by a
 * different provider/mode — is treated as "no cart" so callers start fresh instead of handing the
 * Storefront `cart(id: ID!)` query a value it rejects ("Variable $id ... was provided invalid value").
 */
export function isCartId(id) {
  return typeof id === 'string' && /^gid:\/\/shopify\/Cart\/[^?\s]+(\?key=[^\s?]+)?$/.test(id.trim());
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

export default { storefront, admin, getAdminToken, gid, gidNumber, isCartId, moneyToCents, centsToMoney, collectUserErrors };
