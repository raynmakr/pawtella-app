# Inventory sync: Franpos → Pawtella → Shopify

The Toronto depot runs **Franpos** POS. Shopify is the online catalog. Rule: **every POS item exists
online**; the owner decides per SKU whether an item that is out of stock at the depot can still be
sold as a special order, or should be hidden.

| Concern | Source of truth |
|---|---|
| Depot stock quantities (`qty_on_hand`) | Franpos |
| Product content (title, images, description, online price) | Shopify |
| Sourcing decisions (`product_sourcing`) and online reservations | Pawtella DB |

Code: `lib/inventory/` (`source.js` adapters, `sync.js` logic), `api/inventory.js`, `api/cron/sync-inventory.js`,
`lib/admin/sourcing.js`, `scripts/franpos-bot/`.

## 1. Getting data out of Franpos

We could not find a public Franpos inventory API (Nov 2026). Three ways in, chosen with `INVENTORY_SOURCE`:

| `INVENTORY_SOURCE` | What it does |
|---|---|
| `csv` | Franpos back-office **CSV export**, uploaded to `POST /api/inventory/import` (manually, by the bot in section 2, or by a cloud-folder watcher in Phase 2). The cron only flushes pending Shopify pushes. |
| `franpos-api` | Stub. If Franpos grants API access, set `FRANPOS_API_URL` (+ `FRANPOS_API_KEY`); the endpoint must return a JSON array of `{ sku, barcode, name, category, brand, priceCents, costCents, qtyOnHand, updatedAt }` (snake_case accepted). Otherwise it throws "not configured". |
| `octopus-bridge` | Stub. If the owner licenses 24Seven Commerce **Octopus Bridge**, that middleware syncs Franpos → Shopify by itself. We then only *mirror* Shopify products tagged `franpos` (requires an admin product listing in `lib/shopify.js`; returns `[]` with a warning until then) and never write to Shopify. |
| `mock` (default in dev) | ~25 realistic items, a few at zero stock, one new SKU per day, deterministic by date. |

**Ask Franpos support** for (a) an inventory/stock API or webhook, or (b) a scheduled email/SFTP export of the
inventory report. Either removes the need for the browser bot.

### Exporting manually from the back office

Franpos back-office layouts vary by version, so generically: sign in to the back office → *Inventory* (or
*Reports → Inventory / Stock on hand*) → choose the Toronto location → *Export* → CSV. Keep the default columns;
our parser maps headers itself.

### Accepted CSV columns

Header matching is case-insensitive and tolerant of spacing/punctuation. Known synonyms:

| Field | Accepted headers |
|---|---|
| SKU (required unless barcode) | `SKU`, `Item Number`, `Item No`, `Item #`, `Item ID`, `PLU`, `Product Code`, `Item Code`, `Code` |
| Barcode | `UPC`, `Barcode`, `Bar Code`, `EAN`, `UPC Code`, `UPC/EAN`, `GTIN` |
| Name (required) | `Item Name`, `Name`, `Description`, `Item Description`, `Product Name`, `Product`, `Title`, `Item` |
| Category | `Category`, `Department`, `Dept`, `Product Category`, `Group`, `Item Group` |
| Brand | `Brand`, `Vendor`, `Manufacturer`, `Supplier` |
| Price | `Price`, `Retail Price`, `Retail`, `Sell Price`, `Selling Price`, `Unit Price`, `Sale Price`, `List Price` |
| Cost | `Cost`, `Unit Cost`, `Cost Price`, `Avg Cost`, `Average Cost`, `Purchase Price` |
| Quantity | `Qty`, `Quantity`, `Quantity On Hand`, `Qty On Hand`, `On Hand`, `In Stock`, `Stock`, `Stock Qty`, `Inventory`, `Available`, `QOH` |
| Updated | `Last Updated`, `Updated`, `Updated At`, `Modified`, `Last Modified`, `Date Modified` |

Money accepts `$12.99`, `CAD 1,099.00`, `12,99`, `(3.50)`; blank quantity = 0; rows with no SKU use the barcode as
SKU; rows with neither, no name, an unparsable quantity or a duplicate SKU are reported as row errors and skipped.
A sample export is in `scripts/sample-franpos-inventory.csv` (30 rows, Franpos-style headers).

### Uploading

```bash
curl -X POST "$API_URL/api/inventory/import" \
  -H "Content-Type: text/csv" \
  -H "X-Import-Secret: $INVENTORY_IMPORT_SECRET" \
  -H "X-Filename: inventory-2026-11-08.csv" \
  --data-binary @inventory-2026-11-08.csv
```

JSON is accepted too: `Content-Type: application/json` with `{ "rows": [{ "sku", "name", "priceCents", "qtyOnHand", ... }] }`.
Add `?push=0` to import without pushing to Shopify. The response is `{ ok, imported: { rowCount, created, updated,
unchanged, wentOutOfStock[], backInStock[], newSkus[], errors[], importId, status }, pushed: { attempted, created,
updated, failed, errors[] } }`. `GET /api/inventory/status` (same header) returns the last import, counts
(items, outOfStock, notOnShopify, pendingPush, syncErrors, undecided, stale) and the latest Shopify errors.

`INVENTORY_IMPORT_SECRET` must be set in production (requests without it are rejected). In development with no
secret configured the endpoint is open.

Phase 2: a watcher on a shared cloud folder (Google Drive / Dropbox) so the owner can simply drop the export there.

## 2. Automated export bot (`scripts/franpos-bot/`)

Since Franpos has no API, `scripts/franpos-bot/export-inventory.mjs` is a Playwright script that logs into the
back office, exports the inventory report and posts the CSV to the import endpoint. Everything DOM-specific is in a
JSON config so it can be adjusted without code changes.

Env: `FRANPOS_LOGIN_URL`, `FRANPOS_USERNAME`, `FRANPOS_PASSWORD`, `FRANPOS_EXPORT_CONFIG` (default
`scripts/franpos-bot/config.example.json`), `API_URL`, `INVENTORY_IMPORT_SECRET`.

Config (`config.example.json`, copy to `config.json` which is git-ignored):

- `login.usernameSelector / passwordSelector / submitSelector / successSelector` — comma-separated CSS/Playwright
  selectors tried in order; `successSelector` must appear after login.
- `report.url` — the inventory report page. `report.steps` — optional actions before exporting:
  `{ action: 'click'|'fill'|'select'|'check'|'waitFor'|'wait'|'goto', selector, value, ms, url }`
  (e.g. select the Toronto location).
- `report.mode: "download"` — `report.downloadSelector` is clicked and the resulting file download is saved
  (`page.waitForEvent('download')`). Only CSV downloads are supported.
- `report.mode: "table"` — scrape `report.table.selector` (an HTML table) into CSV; `report.table.columnMap`
  renames header text to the columns above.

Running:

```bash
# discover selectors: opens a headed browser (screenshots + element dumps in CI), saves out/elements-*.json and out/step-*.png
FRANPOS_LOGIN_URL=https://… FRANPOS_USERNAME=… FRANPOS_PASSWORD=… \
  node scripts/franpos-bot/export-inventory.mjs --record

# export only (no upload)
node scripts/franpos-bot/export-inventory.mjs --dry-run

# full run (what the schedule does)
API_URL=https://api.pawtella.app INVENTORY_IMPORT_SECRET=… node scripts/franpos-bot/export-inventory.mjs
```

The bot prints the import summary, exits non-zero on failure and writes `out/last-error.png` + `out/last-error.txt`
(step name, URL, stack). `out/last-export.csv` is always the last CSV it produced.

Scheduling: `.github/workflows/franpos-inventory-sync.yml` runs hourly (and on demand) with the repository secrets
`FRANPOS_LOGIN_URL`, `FRANPOS_USERNAME`, `FRANPOS_PASSWORD`, `API_URL`, `INVENTORY_IMPORT_SECRET` (optional
repository variable `FRANPOS_EXPORT_CONFIG` for a committed config path) and uploads `out/` as an artifact on
failure. Alternative: a **Railway cron service** running `node scripts/franpos-bot/export-inventory.mjs` from the
same repo image (`npx playwright install --with-deps chromium` in the build step) if GitHub Actions minutes are a
concern or the back office blocks GitHub IP ranges.

Caveats: 2FA on the Franpos account will block the bot (use a dedicated read-only staff login without 2FA, or
an app password if Franpos offers one); keep `--record` output private, it contains page screenshots.
Tests: `test/franpos-bot.test.js` runs the bot against a local fixture site.

## 3. What happens on import (`lib/inventory/sync.js`)

1. `importItems` upserts `inventory_items` by SKU (name, barcode, category, brand, price, cost, `qty_on_hand`,
   `last_seen_at`) inside one transaction and records an `inventory_imports` row.
2. Transitions: qty → 0 sets `went_out_of_stock_at`; 0 → >0 clears it and queues a `back_in_stock`
   notification for every `product_subscriptions` row on that SKU/handle (`notified_at` set once).
3. Items whose Shopify-relevant fields changed (or that are new, or whose sourcing decision changed) are flagged
   `shopify_synced_at = NULL` and pushed by `pushToShopify({ onlyChanged: true })`:
   - no `shopify_product_id` yet → `createProduct` (title, SKU, barcode, price, vendor = brand, tags
     `franpos`, `needs-review`, `category:<slug>`; status `ACTIVE`, or `DRAFT` when hidden) and the ids/handle are stored;
   - `setInventoryQuantity(inventoryItemId, SHOPIFY_DEPOT_LOCATION_ID, qty_on_hand − qty_reserved_online)`;
   - policy mapping (below); failures are stored in `shopify_sync_error` and retried on the next push.
4. `api/cron/sync-inventory.js` (every 30 min) runs `runSync()` for pull sources, or only the push for `csv`.

`needs-review` stays on auto-created products so the owner can add photos/description in Shopify and remove the tag.
Reviewing content happens in Shopify; we never overwrite titles after creation.

## 4. Policies and what customers see

Set per SKU in the admin sourcing screen (`/api/admin/sourcing`). Undecided SKUs behave as `stock_only`.

| Policy | Shopify | Customer sees at qty 0 |
|---|---|---|
| `stock_only` (default) | variant `inventoryPolicy: DENY` | **Sold out** – "Notify me" (back_in_stock) |
| `special_order` | `inventoryPolicy: CONTINUE`, tag `special-order`, metafield `pawtella.lead_days` | **Ships in N days** (special order; `leadDays`, default 7) |
| `hidden` | product status `DRAFT` | not visible online |

`getStockState(handle)` → `in_stock` (sellable qty > 0, "In stock at Toronto depot – pickup today") ·
`special_order` (+ `leadDays`) · `sold_out` · `unknown` (no inventory row, e.g. online-only products).
Sellable qty = `qty_on_hand − qty_reserved_online`.

Admin API (role admin): `GET /api/admin/sourcing?policy=undecided|stock_only|special_order|hidden|all&q=&all=1`
(queue = undecided SKUs + SKUs that went out of stock in the last 7 days, with `queueReason`),
`GET /api/admin/sourcing/:sku`, `PATCH /api/admin/sourcing/:sku { policy, supplier, leadDays, minOrderQty, notes }`
(re-pushes that item to Shopify immediately), `POST /api/admin/sourcing/bulk` with CSV
`sku,policy,supplier,lead_days` or `{ rows }`. The daily admin digest uses `discoveredSince()` / `outOfStockSince()`.

## 5. Reservations and the Shopify webhook

- `orders/paid` → `reserveForOrder(order, tx)`: `qty_reserved_online += quantity` per line-item SKU. The units are
  physically still at the depot (Franpos still counts them) but are spoken for, so the storefront and the pushed
  Shopify quantity exclude them.
- `orders/fulfilled` / picked up / cancelled → `releaseReservation(order, tx)`: `qty_reserved_online −= quantity`
  (never below 0). **`qty_on_hand` is never changed by us**: the depot rings the pickup through Franpos (or adjusts
  Franpos manually), and the next export carries the real count. Decrementing here too would double count.
- `inventory_levels/update` → `applyShopifyInventoryLevel(payload)`: when the location is the depot, Shopify's
  `available` is stored in `inventory_items.shopify_available` (+ `_at`) as a hint, so the depot can compare
  "Shopify thinks N are sellable" with the POS count between exports. It does not override Franpos.

## 6. Limitations

- **Franpos is not written back.** Online sales do not reduce Franpos stock automatically; until an API exists the
  depot must process pickups/deliveries through the POS (or import adjustments in Franpos). Between exports the
  POS count can be higher than the sellable quantity shown online; reservations cover that gap.
- Freshness equals export frequency (hourly with the bot). `GET /api/inventory/status` reports `stale` items not
  seen for 3 days; items missing from an export are **not** deleted or zeroed (an export may be partial).
- Only one depot location is modelled (`SHOPIFY_DEPOT_LOCATION_ID`).
- Product content is created once with a placeholder; photos and descriptions are managed in Shopify.
- The bot depends on the back-office DOM; a Franpos redesign means re-running `--record` and updating the config.

## 7. Octopus Bridge alternative

24Seven Commerce's Octopus Bridge is paid middleware that connects Franpos to Shopify (products, prices, stock,
and optionally orders back into the POS). If licensed: set `INVENTORY_SOURCE=octopus-bridge`, let the middleware own
product creation and quantities, and we only mirror Shopify's `franpos`-tagged products into `inventory_items` so
policies, reservations and the digest keep working (`pushToShopify` is skipped). It would also solve the
"write back to Franpos" limitation above. Compare its monthly cost against the free bot before deciding.

## Environment variables

`INVENTORY_SOURCE`, `INVENTORY_IMPORT_SECRET`, `FRANPOS_API_URL`, `FRANPOS_API_KEY`, `SHOPIFY_DEPOT_LOCATION_ID`
(server); `FRANPOS_LOGIN_URL`, `FRANPOS_USERNAME`, `FRANPOS_PASSWORD`, `FRANPOS_EXPORT_CONFIG`, `API_URL`,
`INVENTORY_IMPORT_SECRET` (bot).
