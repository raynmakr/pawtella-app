// Request/response plumbing shared by every function in api/.
//
//   import { route, ApiError, segments } from '../lib/http.js';
//   export default route({
//     GET: async (req) => ({ ok: true }),             // returned value is sent as JSON 200
//     POST: async (req, res) => { res.status(201).json(...) }, // or write the response yourself
//   });
//
// Multi-route files: vercel.json rewrites `/api/points/:path*` to `/api/points`, so the
// remaining path arrives as `req.query.path`. `segments(req, '/api/points')` returns
// e.g. ['transactions'] for /api/points/transactions, both on Vercel and in scripts/dev-server.js.

export class ApiError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const badRequest = (msg = 'Bad request', extra) => new ApiError(400, msg, extra);
export const unauthorized = (msg = 'Unauthorized') => new ApiError(401, msg);
export const forbidden = (msg = 'Forbidden') => new ApiError(403, msg);
export const notFound = (msg = 'Not found') => new ApiError(404, msg);
export const conflict = (msg = 'Conflict') => new ApiError(409, msg);
export const payloadTooLarge = (msg = 'Payload too large') => new ApiError(413, msg);
export const tooMany = (msg = 'Too many requests') => new ApiError(429, msg);
export const serviceUnavailable = (msg = 'Service unavailable') => new ApiError(503, msg);

export function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');
}

/**
 * Wrap per-method handlers with CORS, 405, error mapping and JSON serialisation.
 * A handler may return a value (sent as JSON, status 200) or write the response itself.
 */
export function route(handlers, { cors = true } = {}) {
  return async function handler(req, res) {
    if (cors) setCors(res);
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      return res.end();
    }
    const fn = handlers[req.method];
    if (!fn) {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    try {
      const result = await fn(req, res);
      if (!res.writableEnded && !res.headersSent && result !== undefined) {
        res.status(200).json(result);
      } else if (!res.writableEnded && !res.headersSent && result === undefined) {
        res.status(204).end();
      }
    } catch (err) {
      if (res.headersSent) {
        console.error('[http] error after headers sent', err);
        return res.end();
      }
      if (err instanceof ApiError) {
        const body = { error: err.message };
        if (err.extra) Object.assign(body, err.extra);
        return res.status(err.status).json(body);
      }
      console.error('[http] unhandled error', req.method, req.url, err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/** Pathname of the request without the query string. */
export function pathname(req) {
  return (req.url || '/').split('?')[0];
}

/**
 * Remaining path segments after `base`. Prefers `req.query.path` (filled by the vercel.json
 * `:path*` rewrite) and falls back to parsing the URL.
 */
export function segments(req, base) {
  const q = req.query?.path;
  if (typeof q === 'string' && q.length) return q.split('/').filter(Boolean);
  if (Array.isArray(q)) return q.filter(Boolean);
  const p = pathname(req);
  const rest = p.startsWith(base) ? p.slice(base.length) : p;
  return rest.split('/').filter(Boolean);
}

/** Query-string helpers. */
export function intParam(value, fallback, { min = -Infinity, max = Infinity } = {}) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Parse pagination: ?page=1&limit=20 → { page, limit, offset }. */
export function pagination(req, { defaultLimit = 20, maxLimit = 50 } = {}) {
  const page = intParam(req.query?.page, 1, { min: 1 });
  const limit = intParam(req.query?.limit, defaultLimit, { min: 1, max: maxLimit });
  return { page, limit, offset: (page - 1) * limit };
}

/** JSON body (already parsed by Vercel / dev-server). Throws 400 if not an object. */
export function body(req) {
  const b = req.body;
  if (b === undefined || b === null || b === '') return {};
  if (typeof b === 'string') {
    try {
      return JSON.parse(b);
    } catch {
      throw badRequest('Invalid JSON body');
    }
  }
  if (typeof b !== 'object') throw badRequest('Invalid JSON body');
  return b;
}

/** Require fields on a body object: require(b, ['email', 'password']). */
export function requireFields(obj, fields) {
  const missing = fields.filter((f) => obj[f] === undefined || obj[f] === null || obj[f] === '');
  if (missing.length) throw badRequest(`Missing required field(s): ${missing.join(', ')}`, { missing });
  return obj;
}

/**
 * Raw request body as a Buffer. For webhook handlers that export
 * `export const config = { api: { bodyParser: false } }`. Works on Vercel and in dev-server
 * (which stores the buffer on req.rawBody).
 */
export async function rawBody(req) {
  if (req.rawBody) return Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(req.rawBody);
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const buf = Buffer.concat(chunks);
  req.rawBody = buf;
  return buf;
}

/** Verify the Vercel cron bearer secret (or allow when no secret is configured, dev only). */
export function requireCron(req, cronSecret) {
  if (!cronSecret) return;
  const header = req.headers['authorization'] || '';
  if (header !== `Bearer ${cronSecret}`) throw unauthorized('Invalid cron secret');
}

/** Send an HTML page. */
export function html(res, markup, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
  res.end(markup);
}

/** Escape text for HTML interpolation. */
export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Client IP (for rate limiting / logging). */
export function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf) return xf.split(',')[0].trim();
  return req.socket?.remoteAddress || '';
}
