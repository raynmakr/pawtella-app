# Shopify setup for Pawtella

Shopify owns the catalog, cart, checkout, taxes, payments, local pickup / local delivery and
shipping. Our API (`lib/shopify.js`) talks to the **Storefront API** for catalog + cart and to the
**Admin API** for discount codes, gift cards, products and inventory. Until the tokens below are set,
every environment runs the in-memory mock (`lib/shopify-mock.js`) with a dev-only checkout page at
`/mock-checkout/<cartId>` that fires the same `orders/paid` flow as the real webhook.

API version: `2026-10` (`SHOPIFY_API_VERSION`). Field names in `lib/shopify-real.js` were checked
against shopify.dev for that version; see "What was verified" at the end.

## 1. Create the store

1. Go to <https://www.shopify.com/ca> → Start free trial → store name `pawtella` (the domain will be
   `pawtella.myshopify.com`; you can connect `shop.pawtella.app` later under Settings → Domains).
2. Settings → General: store currency **CAD**, timezone America/Toronto, unit system metric.
3. Settings → Payments: activate Shopify Payments (needed for Checkout Sheet Kit / Shop Pay) and
   enable Apple Pay + Google Pay.
4. Settings → Checkout: customer accounts "optional", require email (we match orders to app users
   by email when the cart attribute is missing), enable order status page.

## 2. Custom app, scopes and tokens

Settings → Apps and sales channels → **Develop apps** → Allow custom app development →
**Create an app** named `Pawtella API`.

### Admin API scopes (Configuration → Admin API integration)

| Scope | Used for |
| --- | --- |
| `read_products`, `write_products` | `productSet` / `productUpdate` / `productVariantsBulkUpdate` (inventory sync creates missing POS items, sets `inventoryPolicy`, tags, metafields) |
| `read_inventory`, `write_inventory` | `inventorySetQuantities` at the Toronto Depot location |
| `read_locations` | resolve the depot location GID |
| `read_orders` | order lookups when reconciling webhooks |
| `read_customers`, `write_customers` | `customers(query:"email:…")`, `customerId` on discounts / gift cards |
| `read_discounts`, `write_discounts` | `discountCodeBasicCreate` / `discountCodeDeactivate` (Paw Point holds, partner codes) |
| `read_gift_cards`, `write_gift_cards` | `giftCardCreate` (partner earnings redemption) — **Shopify plan or higher** |
| `write_metaobjects`/`read_metaobjects` | not needed today; metafields come with `write_products` |

Webhook subscriptions created in the admin UI do not need extra scopes.

### Storefront API scopes (Configuration → Storefront API integration)

`unauthenticated_read_product_listings`, `unauthenticated_read_product_inventory`
(`quantityAvailable`), `unauthenticated_read_product_tags`, `unauthenticated_write_checkouts`,
`unauthenticated_read_checkouts`, `unauthenticated_read_content`, `unauthenticated_read_customers`,
`unauthenticated_write_customers`, `unauthenticated_read_selling_plans`.

### Install and copy tokens

API credentials → **Install app**. Then set in Vercel (Project → Settings → Environment Variables)
and locally in `.env`:

```
SHOPIFY_STORE_DOMAIN=pawtella-app.myshopify.com
SHOPIFY_API_VERSION=2026-10
SHOPIFY_DEPOT_LOCATION_ID=gid://shopify/Location/<id>   (step 3)

# Admin API — Dev Dashboard app (current Shopify; legacy shpat_ tokens are no longer issued):
SHOPIFY_CLIENT_ID=<Dev Dashboard → app → Settings → Client ID>
SHOPIFY_CLIENT_SECRET=<Dev Dashboard → app → Settings → Client secret>
# …or, for an old custom app only: SHOPIFY_ADMIN_TOKEN=shpat_…

# Storefront API — server-side private token (preferred) or public token:
SHOPIFY_STOREFRONT_PRIVATE_TOKEN=<Headless sales channel → storefront → Private access token>
# SHOPIFY_STOREFRONT_TOKEN=<public token>   (only if no private token)

# Webhook HMAC secret. Optional: defaults to SHOPIFY_CLIENT_SECRET, which is what Dev Dashboard
# apps sign webhooks with. Set it only if your webhooks are signed with a different secret.
# SHOPIFY_WEBHOOK_SECRET=
```

**Admin token exchange.** With `SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET`, `lib/shopify-client.js`
uses Shopify's client credentials grant (`POST https://<shop>/admin/oauth/access_token`,
`grant_type=client_credentials`) to get an Admin token valid 24 hours, caches it per function
instance, renews it 5 minutes before expiry and retries once on a 401. This only works when the app
and the store are in the **same Shopify organization** and the app is installed on the store;
otherwise Shopify answers `shop_not_permitted`.

**Storefront private token.** Install the **Headless** sales channel in the Shopify admin, create a
storefront, and copy its *private* access token. It is sent as `Shopify-Storefront-Private-Token`
and must stay server-side (it never reaches the browser here — the web app talks to our API).

The Storefront token alone switches the catalog/cart to the real store; the Admin credentials switch
discounts, gift cards, products and inventory. Missing pieces fall back to the mock (`isMock`,
`isAdminMock` in `lib/shopify.js`).

## 3. Locations: Toronto Depot

Settings → Locations → Add location **Toronto Depot** with the depot's street address, phone and
"Fulfill online orders from this location" on. Make it the default location. Deactivate the
placeholder "Shop location" or keep it but exclude it from online fulfillment.

Get the GID: Settings → Locations → open the depot and read the numeric id from the URL
(`/settings/locations/1234567890`) → `SHOPIFY_DEPOT_LOCATION_ID=gid://shopify/Location/1234567890`.
Or run in the Admin GraphiQL app: `{ locations(first: 5) { nodes { id name } } }`.

Inventory sync (`lib/inventory/sync.js`) writes Franpos stock to this location only.

## 4. Local pickup and local delivery

Settings → Shipping and delivery:

- **Local pickup** → Toronto Depot → Set up: expected pickup time "Usually ready in 2 hours",
  pickup instructions (same text as `GET /api/shop/fulfillment` → `pickup.instructions`), price
  free. The checkout then offers "Pick up" and Shopify adds a shipping line titled *Pickup* /
  *Local pickup*; `lib/orders.js` detects `/pickup/i` on the shipping line (or a `pickup` note
  attribute) → `fulfillment_type = 'pickup'`. When staff mark the order ready in Shopify, the
  `fulfillments/update` webhook arrives with `shipment_status: ready_for_pickup` → the app shows
  "Ready for pickup"; marking it picked up sends `picked_up`.
- **Local delivery** → Toronto Depot → Set up: delivery radius **15 km** (or postal codes), minimum
  order $0, delivery fee $7.99 free over $49, delivery information text. Shopify names the shipping
  line *Local Delivery*; detected by `/local[\s_-]*delivery/i`.
- Keep the depot address, hours and delivery text in sync with `app_settings` key `fulfillment`
  (admin `PATCH /api/admin/fulfillment` once available; defaults live in `api/shop.js`).

## 5. Shipping profiles (Canada + US)

Settings → Shipping and delivery → General shipping rates → Manage:

- Zone **Canada**: Canada Post / UPS calculated rates (requires Advanced plan or the Shopify
  Shipping carrier integration), or flat $12.99 and free over $79.
- Zone **United States**: flat $14.99 USD (via Markets, step 10), free over $99; mark duties/taxes
  "collected at checkout" (Managed Markets) or "paid by customer on delivery".
- Create a second profile **Digital** with no rates and assign the three Paw Point pack products to
  it so they never require shipping. Also set each pack's variant to "This is a digital product or
  service" (unchecks *requires shipping*). Orders that contain only packs carry no shipping line and
  are mapped to `fulfillment_type = 'shipping'` with nothing to fulfill.

## 6. Products, collections and Paw Point packs

Collections (manual or automated by tag): Dog Food, Cat Food, Treats, Toys, Litter & Hygiene,
Grooming, Health & Supplements, Beds & Travel, Paw Points. The app lists collections via the
Storefront API and filters by collection handle.

Inventory sync creates products for every Franpos SKU automatically (tags `franpos`,
`needs-review`). For hand-made products set **SKU** and **barcode** on the variant so webhooks and
the depot can match them.

**Paw Point packs** (digital products, Admin → Products → Add product):

| Title | Handle | SKU | Price | Tag |
| --- | --- | --- | --- | --- |
| Paw Points Pack · 100 | `paw-points-100` | `PP-100` | $4.99 | `paw-points:100` |
| Paw Points Pack · 300 | `paw-points-300` | `PP-300` | $14.25 | `paw-points:300` |
| Paw Points Pack · 1000 | `paw-points-1000` | `PP-1000` | $45.00 | `paw-points:1000` |

Rules: tag exactly `paw-points:<n>` (that is how `pawPointsPack` is detected in the app and how the
`orders/paid` handler decides how many points to grant; the SKU `PP-<n>` is the fallback), untick
"Track quantity" (or set inventory policy *Continue selling*), untick "This is a physical product",
add tag `digital`, put them in the *Paw Points* collection and the *Digital* shipping profile. Prices
must match `RULES.packs` in `lib/points-rules.js`.

Customers may use a Paw Points discount code on a pack purchase; the app does not earn points on the
pack portion of an order (`lib/orders.js` subtracts pack lines from the cash subtotal).

## 7. Webhook subscriptions

Webhook (and compliance) subscriptions are now **app-managed**: they live in the repo-root
`shopify.app.toml` (`[webhooks]` block, API version 2026-10, all pointing at
`https://pawtella-app.vercel.app/api/webhooks/shopify`) and are published with `shopify app deploy`
(currently version `pawtella-api-3`). Editing them there and redeploying is the source of truth —
you no longer need to create them by hand in the admin UI. The manual steps below remain valid if you
ever manage subscriptions outside the app config.

Settings → Notifications → **Webhooks** → Create webhook, format JSON, API version 2026-10, URL
`https://<APP_URL>/api/webhooks/shopify` for each topic:

- `orders/paid` (points, holds, packs, commission, reservation)
- `orders/updated`, `orders/fulfilled`, `orders/cancelled`
- `fulfillments/update` (ready for pickup / picked up / in transit / delivered)
- `inventory_levels/update` (online sales decrement the depot mirror)

Below the list Shopify shows "Your webhooks will be signed with **<secret>**" → set that value as
`SHOPIFY_WEBHOOK_SECRET`. Our handler verifies `X-Shopify-Hmac-Sha256` = base64(HMAC-SHA256(raw body,
secret)) with a timing-safe compare, deduplicates on `X-Shopify-Webhook-Id` (`processed_webhooks`),
and always answers 200 within Shopify's 5-second limit (work is done inline but is small; a failed
handler releases the idempotency claim so Shopify's retry re-runs it).

**Mandatory compliance webhooks** for the custom app (Configuration → Compliance webhooks or the
app's `shopify.app.toml`): `customers/data_request`, `customers/redact`, `shop/redact` → same URL.
`customers/redact` anonymizes the matching Pawtella user exactly like `DELETE /api/auth/account`.

> **Which secret signs?** Subscriptions owned by the Dev Dashboard app (created via the app's
> `shopify.app.toml` or the Admin API `webhookSubscriptionCreate`) are signed with the **app's client
> secret** — the default here, so nothing extra to set. Webhooks created by hand in the admin UI
> (Settings → Notifications → Webhooks) use the store's own signing secret shown on that page; if you
> go that route, set that value as `SHOPIFY_WEBHOOK_SECRET`. Don't mix the two.

Test locally: `PORT=3003 npm run dev`, then either complete a cart on `/mock-checkout/<cartId>`
(mock mode) or forward a real dev-store webhook with `shopify app webhook trigger --topic orders/paid
--address http://localhost:3003/api/webhooks/shopify --client-secret <secret>`.

## 8. Checkout Sheet Kit (mobile)

The app opens `cart.checkoutUrl` with `@shopify/checkout-sheet-kit` (Expo config plugin, iOS 13+,
Android API 23+). Requirements:

- Storefront API cart created by our server with `buyerIdentity.email` and attribute
  `pawtella_user_id` (done in `POST /api/shop/cart` when the request is authenticated). Those become
  `note_attributes` on the order and are the primary user match.
- Checkout → Settings → Checkout → "Checkout customization": brand colors (coral `#FF6B5A`), logo,
  and the **Checkout Sheet Kit** preload setting left on. Shop Pay needs Shopify Payments.
- Settings → Checkout → Order status page: add the deep link `pawtella://orders` as a "Continue
  shopping" link so buyers return to the app; the kit's `onComplete` event already closes the sheet.
- Under Settings → Apps → Checkout Sheet Kit, allow the app's bundle id / package name if your plan
  shows that panel.
- Discount codes applied by the app (`cartDiscountCodesUpdate` for Paw Point holds, partner codes)
  stay on the cart into checkout. The hold code is single-use and customer-locked; the webhook
  captures it on `orders/paid`.

## 9. Discount codes and gift cards

- Paw Point holds: `discountCodeBasicCreate` with `usageLimit: 1`, `appliesOncePerCustomer: true`,
  `customerSelection.customers.add[customerId]` when the user has a Shopify customer, otherwise
  `all`. `api/cron/release-holds` deactivates expired codes with `discountCodeDeactivate`.
- Partner codes: created with `usageLimit: null` → no limit and `appliesOncePerCustomer: false`
  (reusable by any customer).
- Partner gift cards: `giftCardCreate` (needs `write_gift_cards`; gift cards are available on the
  Shopify plan and up). We store only `id` and `lastCharacters`; the full code is e-mailed once.

## 10. Markets: USD for US customers

Settings → Markets → Add market **United States**: currency USD with automatic exchange rates (or
fixed), price rounding on, duties and import taxes collected at checkout if using Managed Markets.
Storefront prices are returned in the buyer's context when the cart has
`buyerIdentity.countryCode`; our API currently creates carts in the store currency (CAD) and shows
USD only inside the Shopify checkout. Multi-currency display in the app is Phase 2.

## 11. Test with a development store

1. Partners dashboard (<https://partners.shopify.com>) → Stores → Add store → **Development
   store** → "Create a store to test and build" → name `pawtella-dev`, data: "Start with test data".
2. Repeat steps 2–7 on the dev store and point your local `.env` at it (`SHOPIFY_STORE_DOMAIN=
   pawtella-dev.myshopify.com`).
3. Settings → Payments → enable **Bogus Gateway** (test mode). Card `1` = success, `2` = declined,
   `3` = exception.
4. Expose your dev server with `cloudflared tunnel --url http://localhost:3003` (or ngrok) and use
   that URL in the dev store's webhook subscriptions.
5. Walk the loop: register in the app → add KONG + a Paw Points pack → hold 20 PP → pay with card
   `1` → `orders/paid` arrives → `shop_orders` row, hold `captured`, `point_transactions` rows
   (`spend`, `earn`, `purchase`) → mark the order ready for pickup in Shopify → app shows "Ready for
   pickup".
6. Run `npm test` (webhook tests sign payloads with `SHOPIFY_WEBHOOK_SECRET` or a test secret).

## What was verified against shopify.dev (2026-10)

Verified: `CartInput { lines, buyerIdentity, attributes, discountCodes }`, `CartLineInput
{ merchandiseId, quantity, attributes }`, `CartBuyerIdentityInput { email, countryCode, … }`,
`CartLineUpdateInput { id, quantity }`, `cartLinesUpdate(cartId, lines)`, `Cart { id, checkoutUrl,
attributes, buyerIdentity, cost, discountCodes, lines, totalQuantity }`, `CartCost { subtotalAmount,
totalAmount }`, `CartDiscountCode { code, applicable }`, `BaseCartLine { id, quantity, merchandise,
cost, attributes }`, `CartLineCost { amountPerQuantity, subtotalAmount, totalAmount }`,
`discountCodeBasicCreate(basicCodeDiscount)` input fields, `discountCodeDeactivate(id)`,
`giftCardCreate(input { initialValue, note, customerId }) → giftCardCode`, `customers(query:
"email:\"…\"")` with `defaultEmailAddress.emailAddress`, `productSet(input, synchronous)` and
`ProductVariantSetInput { sku, barcode, price, inventoryPolicy, inventoryItem, inventoryQuantities,
optionValues! }`, `ProductVariantsBulkInput.inventoryPolicy` (`DENY|CONTINUE`),
`inventorySetQuantities` with `name: available`, `reason: correction` and `changeFromQuantity` (must
be present; `null` skips the compare), `metafieldsSet` (≤25), webhook headers `X-Shopify-Topic`,
`X-Shopify-Hmac-Sha256`, `X-Shopify-Webhook-Id`, topics `orders/paid|fulfilled|cancelled`,
`fulfillments/update`, `inventory_levels/update`, `customers/data_request`, `customers/redact`, order
payload fields (`subtotal_price`, `total_discounts`, `line_items[].sku`, `shipping_lines[].code|title`,
`note_attributes`, `customer.email`).

Not re-verified this round (long-standing, treat as "check on first real call"): Storefront
`Product.{images,featuredImage,priceRange,compareAtPriceRange,tags}`, `ProductVariant.quantityAvailable`
(needs the inventory Storefront scope), `Collection.image`, `products(query:, sortKey: TITLE)`,
`productUpdate(product: ProductUpdateInput)` argument name, `GiftCard.lastCharacters`,
`DiscountCodeBasicInput.combinesWith`, `cartAttributesUpdate` / `cartBuyerIdentityUpdate` argument
names, `orders/updated` and `shop/redact` topic listings, `X-Shopify-Shop-Domain` header. If a call
fails with a GraphQL error, `lib/shopify-client.js` surfaces the message as a 502.
