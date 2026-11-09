// Franpos API adapter (stub). Franpos does not publish a public inventory API as of Nov 2026; if the
// owner is granted access (or an export schedule that lands JSON on a URL), set FRANPOS_API_URL and
// FRANPOS_API_KEY. The endpoint must answer GET with `Authorization: Bearer <key>` and a JSON array of
// items shaped like Item ({ sku, barcode?, name, category?, brand?, priceCents, costCents?, qtyOnHand,
// updatedAt? }) or an object { items: [...] }. snake_case keys (price_cents, qty_on_hand) are accepted.
import { env } from '../env.js';

export const isConfigured = () => !!env.inventory.franposApiUrl;

function normalize(raw) {
  const pick = (...keys) => keys.map((k) => raw[k]).find((v) => v !== undefined && v !== null);
  return {
    sku: String(pick('sku', 'itemNumber', 'item_number') ?? pick('barcode', 'upc') ?? '').trim(),
    barcode: pick('barcode', 'upc') ? String(pick('barcode', 'upc')) : undefined,
    name: String(pick('name', 'itemName', 'item_name', 'description') ?? '').trim(),
    category: pick('category', 'department') || undefined,
    brand: pick('brand', 'vendor') || undefined,
    priceCents: Number(pick('priceCents', 'price_cents') ?? Math.round(Number(pick('price') || 0) * 100)) || 0,
    costCents: pick('costCents', 'cost_cents') != null ? Number(pick('costCents', 'cost_cents')) : undefined,
    qtyOnHand: Number(pick('qtyOnHand', 'qty_on_hand', 'quantity', 'qty') ?? 0) || 0,
    updatedAt: pick('updatedAt', 'updated_at') ? new Date(pick('updatedAt', 'updated_at')) : undefined,
  };
}

export function createFranposApiSource() {
  return {
    name: 'franpos-api',
    async listItems() {
      if (!isConfigured()) {
        throw new Error(
          'Franpos API source is not configured: set FRANPOS_API_URL (and FRANPOS_API_KEY), or use INVENTORY_SOURCE=csv and upload exports to /api/inventory/import',
        );
      }
      const headers = { Accept: 'application/json' };
      if (env.inventory.franposApiKey) headers.Authorization = `Bearer ${env.inventory.franposApiKey}`;
      const res = await fetch(env.inventory.franposApiUrl, { headers });
      if (!res.ok) throw new Error(`Franpos API responded ${res.status}`);
      const data = await res.json();
      const rows = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : null;
      if (!rows) throw new Error('Franpos API response is not a JSON array of items');
      return rows.map(normalize).filter((i) => i.sku && i.name);
    },
  };
}
