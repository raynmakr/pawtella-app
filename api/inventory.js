// Inventory import + status.  /api/inventory/:path* → this file (vercel.json).
//   POST /api/inventory/import   CSV body (text/csv) or JSON { rows: Item[] }; header X-Import-Secret
//   GET  /api/inventory/status   last import, counts, Shopify sync errors
import { route, segments, badRequest, unauthorized, notFound, rawBody } from '../lib/http.js';
import { env } from '../lib/env.js';
import { parseFranposCsv } from '../lib/inventory/franpos-csv.js';
import { importItems, pushToShopify, getStatus } from '../lib/inventory/sync.js';

const BASE = '/api/inventory';

function checkSecret(req) {
  const expected = env.inventory.importSecret;
  const given = req.headers['x-import-secret'] || (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (expected) {
    if (given !== expected) throw unauthorized('Invalid X-Import-Secret');
    return;
  }
  if (env.isProd) throw unauthorized('INVENTORY_IMPORT_SECRET is not configured');
}

/** Body as a string, whether the runtime parsed it or not (dev-server leaves non-JSON as a string). */
async function textBody(req) {
  if (typeof req.body === 'string' && req.body.length) return req.body;
  if (req.rawBody) return Buffer.isBuffer(req.rawBody) ? req.rawBody.toString('utf8') : String(req.rawBody);
  if (req.body && typeof req.body === 'object') return null;
  const buf = await rawBody(req);
  return buf.toString('utf8');
}

async function handleImport(req) {
  checkSecret(req);
  const ct = String(req.headers['content-type'] || '').toLowerCase();
  const filename = req.headers['x-filename'] || req.query?.filename || null;
  const push = String(req.query?.push ?? '1') !== '0';

  let items;
  let errors = [];
  let source = 'franpos-csv';

  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    const rows = Array.isArray(req.body) ? req.body : req.body.rows ?? req.body.items;
    if (!Array.isArray(rows)) throw badRequest('JSON body must be { rows: [...] }');
    items = rows;
    source = req.body.source || 'json';
  } else {
    const text = await textBody(req);
    if (!text || !text.trim()) throw badRequest('Empty body: send a CSV (text/csv) or JSON { rows }');
    if (ct.includes('application/json') || text.trimStart().startsWith('{') || text.trimStart().startsWith('[')) {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw badRequest('Invalid JSON body');
      }
      const rows = Array.isArray(parsed) ? parsed : parsed.rows ?? parsed.items;
      if (!Array.isArray(rows)) throw badRequest('JSON body must be { rows: [...] }');
      items = rows;
      source = parsed.source || 'json';
    } else {
      let parsed;
      try {
        parsed = parseFranposCsv(text);
      } catch (err) {
        throw badRequest(`Could not parse CSV: ${err.message}`);
      }
      items = parsed.items;
      errors = parsed.errors;
    }
  }
  if (!items.length && !errors.length) throw badRequest('No rows found');

  const imported = await importItems(items, { source, filename, errors });
  const pushed = push ? await pushToShopify({ onlyChanged: true }) : { skipped: 'push=0' };
  return { ok: true, imported, pushed };
}

export default route({
  POST: async (req) => {
    const [first] = segments(req, BASE);
    if (first === 'import') return handleImport(req);
    throw notFound();
  },
  GET: async (req) => {
    const [first] = segments(req, BASE);
    if (first === 'status') {
      checkSecret(req);
      return getStatus();
    }
    throw notFound();
  },
});
