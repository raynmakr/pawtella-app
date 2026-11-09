// Every 30 min: pull inventory from the configured source and push changes to Shopify.
// With INVENTORY_SOURCE=csv there is nothing to pull (the owner uploads exports to
// POST /api/inventory/import), so the cron only flushes pending Shopify pushes.
import { route, requireCron } from '../../lib/http.js';
import { env } from '../../lib/env.js';
import { runSync, pushToShopify } from '../../lib/inventory/sync.js';

async function handler(req) {
  requireCron(req, env.cronSecret);
  const source = env.inventory.source;
  if (['csv', 'franpos-csv', 'franpos'].includes(source)) {
    const pushed = await pushToShopify({ onlyChanged: true });
    return { ok: true, source, skipped: 'csv source: imports arrive via POST /api/inventory/import', pushed: pushed.created + pushed.updated, failed: pushed.failed, errors: pushed.errors };
  }
  const result = await runSync({ source });
  return {
    ok: result.errors.length === 0 || !!result.imported,
    source,
    imported: result.imported ? { rows: result.imported.rowCount, created: result.imported.created, updated: result.imported.updated, outOfStock: result.imported.wentOutOfStock.length, backInStock: result.imported.backInStock.length } : null,
    pushed: result.pushed ? { created: result.pushed.created ?? 0, updated: result.pushed.updated ?? 0, failed: result.pushed.failed ?? 0, skipped: result.pushed.skipped } : null,
    errors: result.errors,
  };
}

export default route({ GET: handler, POST: handler });
