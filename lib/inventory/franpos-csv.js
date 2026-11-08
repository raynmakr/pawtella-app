// Franpos back-office inventory export (CSV) → Item[].
// Franpos has no public API we could find; the owner exports a CSV from the back office and
// uploads it to POST /api/inventory/import (or drops it where the cron can read it, Phase 2).
// Header names vary by export template and Franpos version, so matching is case/space-insensitive
// over a list of known synonyms.
import { parse } from 'csv-parse/sync';

const COLUMNS = {
  sku: ['sku', 'item number', 'item no', 'item #', 'item id', 'itemid', 'plu', 'product code', 'item code', 'code'],
  barcode: ['upc', 'barcode', 'bar code', 'ean', 'upc code', 'upc/ean', 'gtin'],
  name: ['item name', 'name', 'description', 'item description', 'product name', 'product', 'title', 'item'],
  category: ['category', 'department', 'dept', 'product category', 'group', 'item group'],
  brand: ['brand', 'vendor', 'manufacturer', 'supplier'],
  price: ['price', 'retail price', 'retail', 'sell price', 'selling price', 'unit price', 'sale price', 'list price'],
  cost: ['cost', 'unit cost', 'cost price', 'avg cost', 'average cost', 'purchase price'],
  qty: ['qty', 'quantity', 'quantity on hand', 'qty on hand', 'on hand', 'onhand', 'in stock', 'stock', 'stock qty', 'inventory', 'available', 'qoh'],
  updatedAt: ['last updated', 'updated', 'updated at', 'modified', 'last modified', 'date modified', 'last sold'],
};

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9#/]+/g, ' ').trim();

/** Map actual CSV headers to our field names. Returns { field: header } for the fields found. */
export function mapHeaders(headers) {
  const mapping = {};
  const used = new Set();
  for (const [field, synonyms] of Object.entries(COLUMNS)) {
    for (const syn of synonyms) {
      const hit = headers.find((h) => !used.has(h) && norm(h) === syn);
      if (hit) {
        mapping[field] = hit;
        used.add(hit);
        break;
      }
    }
  }
  return mapping;
}

/** "$12.99" / "12,99" / "CAD 12.99" / "(3.50)" → integer cents. null when blank or unparsable. */
export function moneyToCents(value) {
  if (value === null || value === undefined) return null;
  let s = String(value).trim();
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[^0-9.,]/g, '');
  if (!s) return null;
  // "1.234,56" (comma decimal) vs "1,234.56" (comma thousands)
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    const parts = s.split(',');
    s = parts[parts.length - 1].length === 2 && parts.length === 2 ? `${parts[0]}.${parts[1]}` : parts.join('');
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) * (negative ? -1 : 1);
}

/** "12" / "12.0" / "-3" / "" → integer (blank → 0). NaN → null (caller reports an error). */
export function toQty(value) {
  if (value === null || value === undefined || String(value).trim() === '') return 0;
  const n = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toDate(value) {
  if (!value || !String(value).trim()) return undefined;
  const d = new Date(String(value).trim().replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Parse a Franpos CSV export.
 * @returns {{ items: Item[], errors: [{ row, error }], mapping, rowCount }}
 */
export function parseFranposCsv(text) {
  const input = String(text ?? '').replace(/^﻿/, '');
  const records = parse(input, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    relax_quotes: true,
  });
  const headers = records.length ? Object.keys(records[0]) : [];
  const mapping = mapHeaders(headers);
  if (!mapping.name || (!mapping.sku && !mapping.barcode)) {
    throw new Error(
      `CSV is missing required columns (need a name column and a SKU or barcode column). Headers: ${headers.join(', ') || '(none)'}`,
    );
  }
  const items = [];
  const errors = [];
  const seen = new Set();
  records.forEach((rec, idx) => {
    const row = idx + 2; // 1-based, after header
    const get = (field) => (mapping[field] ? rec[mapping[field]] : undefined);
    let sku = String(get('sku') ?? '').trim();
    const barcode = String(get('barcode') ?? '').trim() || undefined;
    if (!sku && barcode) sku = barcode;
    if (!sku) return errors.push({ row, error: 'Missing SKU and barcode' });
    const name = String(get('name') ?? '').trim();
    if (!name) return errors.push({ row, sku, error: 'Missing item name' });
    if (seen.has(sku)) return errors.push({ row, sku, error: 'Duplicate SKU in file (later row ignored)' });
    const priceCents = moneyToCents(get('price'));
    if (priceCents === null && mapping.price && String(get('price') ?? '').trim()) {
      return errors.push({ row, sku, error: `Unparsable price "${get('price')}"` });
    }
    const qtyOnHand = toQty(get('qty'));
    if (qtyOnHand === null) return errors.push({ row, sku, error: `Unparsable quantity "${get('qty')}"` });
    seen.add(sku);
    items.push({
      sku,
      barcode,
      name,
      category: String(get('category') ?? '').trim() || undefined,
      brand: String(get('brand') ?? '').trim() || undefined,
      priceCents: priceCents ?? 0,
      costCents: moneyToCents(get('cost')) ?? undefined,
      qtyOnHand,
      updatedAt: toDate(get('updatedAt')),
    });
  });
  return { items, errors, mapping, rowCount: records.length };
}

/** InventorySource adapter. `getSource('csv')` is only meaningful with a CSV string supplied. */
export function createCsvSource({ csvText, filename } = {}) {
  return {
    name: 'csv',
    filename,
    pushOnly: !csvText,
    async listItems() {
      if (!csvText) {
        throw new Error('The csv source has no file to read: upload a Franpos export to POST /api/inventory/import');
      }
      return parseFranposCsv(csvText).items;
    },
  };
}
