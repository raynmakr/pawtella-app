// Admin sourcing decisions. Dispatched from api/admin.js (Backend E): `default(req, res, segments)`
// where segments are the path parts after /api/admin/sourcing.
//   GET   /api/admin/sourcing?policy=undecided|stock_only|special_order|hidden|all&q=&all=1
//   GET   /api/admin/sourcing/:sku
//   PATCH /api/admin/sourcing/:sku   { policy, supplier?, leadDays?, minOrderQty?, notes? }
//   POST  /api/admin/sourcing/bulk   CSV body "sku,policy,supplier,lead_days" or JSON { rows: [...] }
import { parse } from 'csv-parse/sync';
import { badRequest, notFound, ApiError } from '../http.js';
import { env } from '../env.js';
import { POLICIES, setSourcing, getSourcing, listSourcingQueue, pushToShopify } from '../inventory/sync.js';

async function adminId(req) {
  try {
    const auth = await import('../auth.js');
    if (auth?.requireAdmin) return (await auth.requireAdmin(req)).userId;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err?.code !== 'ERR_MODULE_NOT_FOUND') throw err;
  }
  if (env.isProd) throw new ApiError(403, 'Admin auth unavailable');
  return null; // lib/auth.js absent in dev
}

function parseBody(req) {
  const b = req.body;
  if (b === undefined || b === null || b === '') return {};
  if (typeof b === 'string') {
    try {
      return JSON.parse(b);
    } catch {
      throw badRequest('Invalid JSON body');
    }
  }
  return b;
}

function validateDecision(input) {
  const policy = String(input.policy ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!POLICIES.includes(policy)) throw badRequest(`policy must be one of ${POLICIES.join(', ')}`);
  const leadDays = input.leadDays ?? input.lead_days;
  const minOrderQty = input.minOrderQty ?? input.min_order_qty;
  if (policy === 'special_order' && leadDays !== undefined && leadDays !== null && leadDays !== '' && !(Number(leadDays) >= 0)) {
    throw badRequest('leadDays must be a non-negative number');
  }
  return {
    policy,
    supplier: input.supplier ? String(input.supplier).trim() : undefined,
    leadDays: leadDays === '' || leadDays === undefined || leadDays === null ? undefined : Number(leadDays),
    minOrderQty: minOrderQty === '' || minOrderQty === undefined || minOrderQty === null ? undefined : Number(minOrderQty),
    notes: input.notes ? String(input.notes) : undefined,
  };
}

function bulkRows(req) {
  const b = req.body;
  if (b && typeof b === 'object' && !Buffer.isBuffer(b)) {
    const rows = Array.isArray(b) ? b : b.rows;
    if (!Array.isArray(rows)) throw badRequest('JSON body must be { rows: [{ sku, policy, supplier?, leadDays? }] }');
    return rows;
  }
  const text = typeof b === 'string' ? b : req.rawBody ? Buffer.from(req.rawBody).toString('utf8') : '';
  if (!text.trim()) throw badRequest('Empty body');
  if (text.trimStart().startsWith('{') || text.trimStart().startsWith('[')) {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : parsed.rows ?? [];
  }
  return parse(text.replace(/^﻿/, ''), { columns: (h) => h.map((c) => c.trim().toLowerCase().replace(/\s+/g, '_')), skip_empty_lines: true, trim: true, bom: true, relax_column_count: true });
}

export default async function sourcing(req, res, segs = []) {
  const userId = await adminId(req);
  const [sku, ...rest] = segs;
  const method = req.method;

  if (method === 'GET' && !sku) {
    const { policy, q, all, limit, offset } = req.query || {};
    const items = await listSourcingQueue({
      policy,
      q,
      all: all === '1' || all === 'true',
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    return { items, policies: POLICIES, count: items.length };
  }

  if (method === 'GET' && sku && !rest.length) {
    const item = await getSourcing(decodeURIComponent(sku));
    if (!item) throw notFound('Unknown SKU');
    return { item };
  }

  if (method === 'POST' && sku === 'bulk') {
    const rows = bulkRows(req);
    const results = { applied: 0, skipped: [], errors: [] };
    const skus = [];
    for (const [i, row] of rows.entries()) {
      const rowSku = String(row.sku ?? row.item_number ?? '').trim();
      if (!rowSku) {
        results.errors.push({ row: i + 1, error: 'Missing sku' });
        continue;
      }
      try {
        const saved = await setSourcing(rowSku, validateDecision(row), userId);
        if (!saved) results.skipped.push({ row: i + 1, sku: rowSku, reason: 'unknown SKU' });
        else {
          results.applied++;
          skus.push(rowSku);
        }
      } catch (err) {
        results.errors.push({ row: i + 1, sku: rowSku, error: err.message });
      }
    }
    const pushed = skus.length ? await pushToShopify({ skus }) : null;
    return { ok: true, ...results, pushed };
  }

  if (method === 'PATCH' && sku) {
    const decodedSku = decodeURIComponent(sku);
    const decision = validateDecision(parseBody(req));
    const saved = await setSourcing(decodedSku, decision, userId);
    if (!saved) throw notFound('Unknown SKU');
    const pushed = await pushToShopify({ skus: [decodedSku] });
    const item = await getSourcing(decodedSku);
    return { item, sourcing: saved, pushed };
  }

  throw notFound();
}
