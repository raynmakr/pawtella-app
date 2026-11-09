# Pawtella engineering conventions and module contracts

Read this before touching `api/`, `lib/` or `mobile/`. The approved product plan is in
`/root/.claude/plans/jaunty-zooming-sunbeam.md` (business rules, screens, phases).

## Layout

```
api/            Vercel serverless functions (ESM). One file = one route (or one route family).
lib/            Shared server code. No HTTP in here except lib/http.js helpers.
scripts/        migrate.js, dev-server.js, seed.js, migrations/*.sql
test/           node:test files (*.test.js). `npm test`
docs/           Operator docs.
mobile/         Expo SDK 58 app (TypeScript). Routes in mobile/src/app.
```

## Backend rules

- **ESM everywhere** (`"type": "module"`): `import x from '../lib/x.js'` with the `.js` extension.
- **Every function uses `route()` from `lib/http.js`.** Return a value to send JSON 200, or write to
  `res` yourself. Throw `ApiError` (or the helpers `badRequest`, `unauthorized`, `forbidden`,
  `notFound`, `conflict`) for expected failures. Never `res.status(500)` by hand.
- **Route families:** `vercel.json` rewrites `/api/<area>/:path*` → `/api/<area>`. Inside
  `api/<area>.js` use `segments(req, '/api/<area>')` to get the remaining path parts and dispatch
  on `[method, segments]`. One file per area listed in `vercel.json`. If you need a new family,
  add the rewrite to `vercel.json`.
- **Cron functions** live in `api/cron/<name>.js`, call `requireCron(req, env.cronSecret)`
  first, and return a JSON summary `{ ok: true, ...counts }`.
- **Webhooks** export `config = { api: { bodyParser: false } }` and read `await rawBody(req)`.
- **Auth:** `const { userId, role } = await requireAuth(req)` (throws 401). `optionalAuth` returns
  `null` when absent. `requireAdmin(req)` throws 403 for non-admins.
- **DB:** `query/one/many/withTransaction` from `lib/db.js`. Parameterised SQL only. Any read-modify-
  write of a balance or counter runs inside `withTransaction` with `SELECT ... FOR UPDATE`.
  Multi-step business operations accept an optional trailing `tx` argument so callers can compose
  them in one transaction: `awardPoints(userId, amount, opts, tx?)`.
- **Money** is integer cents. **Points** are integers. Currency defaults to `CAD`.
- **API JSON is camelCase**; DB is snake_case. Use `camelize()` from `lib/serialize.js` on rows at
  the boundary. Never leak `password_hash`, tokens, `raw` webhook payloads or admin notes.
- **Events:** emit `track(name, { userId, props }, tx?)` (from `lib/events.js`) for every key
  action. Names are lower snake_case, listed in `lib/events.js`.
- **Feature flags / mocks:** import `{ env, flags }` from `lib/env.js`. When a provider key is
  missing, the module must work in **mock mode** (deterministic fake data, console logging). Never
  throw at import time because a key is missing. Expose `isMock` on each provider module.
- **Schema:** all tables exist in `scripts/migrations/001–008`. Add a new migration file
  (`009_<area>_<what>.sql`, next free number, check the folder first) only when you need a column
  or table that is missing; never edit applied migrations.
- **Tests:** `test/<area>.test.js` with `node:test` + `node:assert/strict`. Tests run against the
  local Postgres (`DATABASE_URL` in `.env`). Use random suffixes for emails/handles/SKUs; never
  truncate tables (other suites run concurrently). Pure-logic tests must not need the DB.
- **Local run:** `npm run dev` serves `api/` on `PORT` (default 3000). Agents working in parallel
  use their assigned port. `curl` your endpoints before reporting done.
- **Logging:** `console.log('[area] message', { ids })`. No secrets in logs.
- **Rate limiting:** not in Phase 1 except AI generation (per-user daily cap in points rules).

## Web app rules (`web/`, Next.js) — the client for Phase 1; the native app is rebuilt later

- Next.js (App Router, latest stable), TypeScript strict, Tailwind CSS, shadcn/ui primitives.
  `@/` → `web/src/`. Routes in `web/src/app/`; everything else in
  `web/src/{components,hooks,services,stores,lib,types}`.
- **BFF proxy:** the browser never calls the API host directly. `web/src/app/api/[...path]/route.ts`
  forwards `/api/*` to `${API_URL}/api/*`, injecting `Authorization: Bearer <token>` from the
  httpOnly cookie `pawtella_token`. Auth responses (`/api/auth/login|register|apple|google`) set
  that cookie; `/api/auth/logout` clears it. Server components call `serverApi()` (same injection
  from `cookies()`); client components call `api()` from `src/services/api.ts` (relative `/api`).
- Server state via `@tanstack/react-query` in client components (keys in `src/lib/query-keys.ts`);
  `zustand` only for the session snapshot and cart badge. Invalidate after mutations.
- One `src/services/<area>.ts` per API area with typed functions; types in `src/types/<area>.ts`
  mirroring the API JSON (camelCase).
- Design tokens as CSS variables in `src/app/globals.css` (light + dark via `class="dark"` and
  `prefers-color-scheme`), mapped into the Tailwind theme; no hard-coded colors in pages.
- Responsive: bottom tab bar under 768px, left sidebar at ≥768px; content max-width 1100px.
- Every list: loading skeleton, empty state, error state with retry.
- Public pages (shop, product, challenge, user profile, post) are server-rendered with metadata
  for SEO; authenticated pages are client-rendered behind the session.
- Run `npm run lint`, `npx tsc --noEmit` and `npm run build` before reporting done.

## Cross-module contracts (exported function signatures)

Owners must export exactly these. Consumers import them. If a module you depend on does not
exist yet when you need to run code, create a **minimal stub** with these exports marked
`// TODO(stub)` only if the file is absent at that instant, and say so in your report; the owner
will replace it. Never overwrite a file owned by someone else.

### lib/auth.js (Backend A)
- `requireAuth(req) → Promise<{ userId: number, role: 'user'|'admin' }>` throws 401
- `optionalAuth(req) → Promise<{ userId, role } | null>`
- `requireAdmin(req) → Promise<{ userId, role }>` throws 403
- `signToken({ id, role }) → string` (JWT, 30d)
- `hashPassword(pw)`, `verifyPassword(pw, hash)`

### lib/users.js (Backend A)
- `getUserById(id, tx?) → row | null`
- `getUserByEmail(email)`, `getUserByHandle(handle)`
- `toPublicUser(row) → { id, handle, displayName, avatarUrl, bio, createdAt }`
- `toPrivateUser(row) → public + { email, role, pawPoints, pointsLifetimeEarned, country, marketingOptIn, featureConsentDefault, shopifyCustomerId? }`
- `ensureHandle(base) → unique handle string`
- `touchLastSeen(userId)`

### lib/events.js (Backend A)
- `track(name, { userId?, props? } = {}, tx?) → Promise<void>` (never throws; logs on failure)
- `EVENT` constant object of allowed names: `signup, login, app_open, pet_added, profile_completed,
  generation_started, generation_done, generation_failed, post_created, post_liked, comment_created,
  share_clicked, share_landing_view, referral_signup, checkout_started, hold_created, order_paid,
  order_fulfilled, review_created, points_awarded, points_spent, pack_purchased, partner_applied,
  partner_approved, partner_attributed, challenge_entered, challenge_won, notification_sent,
  inventory_synced, back_in_stock`

### lib/referrals.js (Backend A)
- `getOrCreateReferralCode(userId, tx?) → string`
- `resolveCode(code) → { kind: 'user', userId } | { kind: 'partner', partnerId } | null` (partner codes via lib/partners.js `findPartnerByCode`)
- `attributeSignup(newUserId, { code?, source? }, tx) → Promise<void>` (creates referrals row or partner attribution; awards signup bonuses via lib/points.js)
- `onReferredConversion(userId, kind: 'creation'|'order', tx?) → Promise<void>` (pays referrer once)

### lib/media.js (Backend A) — Cloudinary wrapper, mock when no keys
- `isMock`
- `signUpload({ folder, resourceType }) → { cloudName, apiKey, timestamp, signature, folder, uploadUrl }`
- `uploadFromUrl(url, { folder, resourceType: 'image'|'video', publicId? }) → { publicId, url, secureUrl, width, height, duration?, format }`
- `watermarkedUrl({ publicId, resourceType, handle }) → string` (logo overlay + "@handle" text)
- `thumbnailUrl({ publicId, resourceType }) → string`
- `deleteAsset(publicId, resourceType)`

### lib/points-rules.js and lib/points.js (Backend B)
- `RULES` (values, prices, bonuses, caps) exported from points-rules; helpers `pointsToCents(p)`, `centsToPoints(c)`, `generationCost({ kind, duration, hd })`, `maxRedeemablePoints(subtotalCents, balance)`
- `getBalance(userId, tx?) → { pawPoints, lifetimeEarned, held }`
- `awardPoints(userId, amount, { type?: 'earn'|'bonus'|'purchase'|'refund'|'admin', source, refType?, refId?, description?, metadata? }, tx?) → { balanceAfter }`
- `awardOnce(userId, flagColumn, amount, opts, tx?) → { awarded: boolean }` (atomic flag + award)
- `spendPoints(userId, amount, { source, refType?, refId?, description? }, tx?) → { balanceAfter }` throws 402-style `ApiError(402, 'Not enough Paw Points')`
- `createHold(userId, { cartId, points, subtotalCents, currency }) → hold row` (validates rules, mints code via lib/shopify.js `createDiscountCode`, debits balance)
- `captureHold(discountCode, { orderId }, tx) → hold | null`
- `releaseHold(holdId, tx?)`, `releaseExpiredHolds() → count`
- `awardOrderPoints(order, tx) → points` (1 PP per $1 cash subtotal; marks first-order bonus)
- `grantPackPoints(userId, points, { orderId }, tx)`
- `refundGeneration(generationId, tx?)`
- `expireInactivePoints() → count`

### lib/claude.js (Backend B)
- `isMock`
- `chat({ system, messages, model?, maxTokens?, temperature?, tools?, toolChoice? }) → { text, toolCalls?, usage: { inputTokens, outputTokens }, stopReason }`
- `json({ system, prompt, schema?, model? }) → parsed object` (robust JSON extraction)

### lib/xai.js (Backend B)
- `isMock`
- `generateImage({ prompt, aspectRatio?, resolution? }) → { url, costUsdTicks? }`
- `startVideo({ prompt?, imageUrl?, duration, resolution, model }) → { requestId }`
- `getVideo(requestId) → { status: 'pending'|'done'|'failed', progress, url?, durationSeconds?, costUsdTicks?, error? }`

### lib/shopify.js (Backend C) — same interface implemented by lib/shopify-mock.js; `lib/shopify.js` re-exports the right one based on `flags.hasShopify`
- `isMock`
- `getCollections() → [{ id, handle, title, imageUrl, productCount }]`
- `getProducts({ collection?, query?, cursor?, first? }) → { products: Product[], nextCursor }`
- `getProduct(handle) → Product | null` — `Product = { id, handle, title, description, vendor, tags, images: [{url,alt}], priceCents, compareAtPriceCents?, currency, variants: [{ id, title, sku, priceCents, availableForSale, quantityAvailable }], availableForSale, pawPointsPack?: number }`
- `cartCreate({ lines, buyerEmail?, attributes? }) → Cart`, `cartGet(id)`, `cartLinesAdd(id, lines)`, `cartLinesUpdate(id, lines)`, `cartLinesRemove(id, lineIds)`, `cartDiscountCodesUpdate(id, codes)` — `Cart = { id, checkoutUrl, lines: [{ id, quantity, merchandiseId, title, variantTitle, imageUrl, priceCents }], subtotalCents, totalCents, discountCodes: [{code, applicable}], currency }`. Cart ids are full Storefront gids that carry a `?key=…` (`gid://shopify/Cart/<token>?key=<key>`); the web BFF re-encodes path segments so the key survives the proxy hop.
- `isCartId(id)` (`lib/shopify-client.js`) — true only for a well-formed `gid://shopify/Cart/…` (optional `?key=…`). `api/shop.js` cart endpoints are **self-healing**: a malformed / stale / checked-out id (via `isStaleCartError` for the Storefront `ID!` coercion error or a 404, never a 429/503 outage) is discarded and the response is a fresh empty cart with `reset: true`; the web client adopts the new id so the badge count stays correct.
- Admin: `createDiscountCode({ code, amountCents?, percent?, customerId?, usageLimit?, endsAt?, title }) → { id, code }`, `deactivateDiscountCode(id)`, `createGiftCard({ amountCents, note, customerId? }) → { id, code, lastCharacters }`, `findCustomerByEmail(email) → { id } | null`, `createProduct({ title, sku, barcode, priceCents, vendor?, tags, status }) → { productId, variantId, inventoryItemId, handle }`, `updateProduct(productId, { status?, tags?, metafields? })`, `setInventoryQuantity(inventoryItemId, locationId, quantity)`, `setVariantInventoryPolicy(variantId, 'DENY'|'CONTINUE')`
- `verifyWebhookHmac(rawBodyBuffer, hmacHeader) → boolean`

### lib/orders.js (Backend C)
- `upsertOrderFromWebhook(payload, { topic }) → { order, isNew }` — runs in one transaction and, when `isNew && financial_status === 'paid'`: `captureHold` for matched discount codes, `awardOrderPoints`, `grantPackPoints` (line items whose product tags include `paw-points:<n>`), `accrueCommission` (lib/partners.js), `reserveForOrder` (lib/inventory/sync.js), `track(order_paid)`. The side-effect modules are **statically imported** (not `import()`d) so Vercel's file tracer always bundles them; a missing module is a hard error, never a silent skip.
- `reapplyPaidEffects(idOrShopifyId) → { orderId, firstApplication, before, after }` — idempotent maintenance re-run of the paid-order effects for one order (matched by `shop_orders.id` or `shopify_order_id`). Hold capture, order points and commission are self-idempotent; packs and the depot reservation run only while `shop_orders.effects_applied_at IS NULL`. Throws if the order is missing or not paid. Invoked by `scripts/reapply-order-effects.js`.
- `toApiOrder(row)`

### lib/partners.js (Backend F)
- `findPartnerByCode(code) → row | null`
- `getActiveAttribution(userId, tx?) → row | null`
- `attributeUser(userId, partnerId, source, tx) → attribution` (awards +10 PP once)
- `accrueCommission(order, tx) → earning | null`
- `recomputeTiers() → count`, `matureEarnings() → count`

### lib/inventory/sync.js (Backend G)
- **Shopify is the source of truth for depot stock.** `syncFromShopify({ shopify? }) → summary` backfills/refreshes the `inventory_items` mirror from the Shopify catalog (`qty_on_hand` ← storefront `quantityAvailable`, links product/variant/handle; packs skipped). Run via `node scripts/sync-shopify-inventory.mjs` or `POST /api/inventory/sync-shopify` (`X-Import-Secret`).
- `runSync({ source? }) → summary` (Franpos → mirror → push to Shopify)
- `reserveForOrder(order, tx)` (increments qty_reserved_online by SKU; needs a mirror row — backfill from Shopify first)
- `getStockState(handle, product?) → { state: 'in_stock'|'low'|'special_order'|'sold_out'|'unknown', qty, leadDays? }` — prefers the live Shopify `product` (source of truth) when given; else the mirror.
- `stockStateFromShopify(product, { policy?, leadDays?, sku? }) → stockState` — pure; derives state from storefront `availableForSale` + `variants[].quantityAvailable` (`low` at ≤ `LOW_STOCK_THRESHOLD`).

### lib/notifications.js and lib/email.js (Backend E)
- `notify({ userId, journey, channel, dedupeKey, title, body, payload? }) → { created: boolean }` (inserts queued; ignores duplicate dedupeKey)
- `sendEmail({ to, subject, html, text? }) → { id } | { mock: true }`
- `enqueueAdmin({ journey, title, body, payload })` (userId NULL → admin digest picks it up)

### lib/posts.js (Backend D)
- `createPost(userId, { petId?, generationId?, challengeId?, caption?, mediaUrl, mediaType, thumbnailUrl?, featureConsent? }, tx?) → post` (awards first-post bonus, tracks, referral conversion)
- `getPostForLanding(id) → { post, user, pet } | null`

## HTTP API surface (Phase 1)

Auth (`api/auth.js`, family `/api/auth/*`, all JSON):
- `POST /api/auth/register { email, password, handle?, displayName?, referralCode?, partnerCode? }` → `{ token, user, isNew: true }`
- `POST /api/auth/login { email, password }` → `{ token, user }`
- `POST /api/auth/apple { identityToken, fullName?, referralCode? }`, `POST /api/auth/google { idToken, referralCode? }` → `{ token, user, isNew }`
- `GET /api/auth/me` → `{ user, pets }` ; `POST /api/auth/forgot { email }` ; `POST /api/auth/reset { token, password }` ; `DELETE /api/auth/account` (required by App Store)
- `user` is `toPrivateUser` + `referralCode`.

Users/pets (`api/users.js`, `api/pets.js`): `GET/PATCH /api/users/me`, `POST /api/users/me/push-token`, `GET /api/users/:handle` (public profile + counts + isFollowing), `GET /api/users/:handle/posts`; `GET/POST /api/pets`, `GET/PATCH/DELETE /api/pets/:id`.

Upload (`api/upload.js`): `POST /api/upload { kind: 'image'|'video', folder? }` → signed Cloudinary params (or mock `{ mock: true, uploadUrl: '/api/upload/mock' }`); `POST /api/upload/mock` accepts a base64 data URL in dev.

Points (`api/points.js`): `GET /api/points` → `{ balance, lifetimeEarned, held, rules: { valueCents, minRedeem, maxRedeemPercent, prices }, ways: [...] }`, `GET /api/points/transactions?page`, `POST /api/points/hold { cartId, points }` → `{ hold, cart }`, `DELETE /api/points/hold/:id`, `GET /api/points/packs`.

AI (`api/ai/*.js`): `POST /api/ai/chat { conversationId?, petId?, message, imageUrl?, location? }` → `{ conversationId, reply: { text, vetAlert?, productSuggestions?, petProfileUpdates?, partnerResults? } }`, `GET /api/ai/chat` (list conversations), `GET /api/ai/chat/:id` (messages); `POST /api/ai/caption { imageUrl, petName? }` → `{ captions: string[] }`; `GET /api/ai/presets`; `POST /api/ai/generate { kind, prompt?, presetId?, petId?, sourceImageUrl?, duration?, hd?, challengeId? }` → generation; `GET /api/ai/generate` (mine), `GET /api/ai/generate/:id` (polls provider when pending), `POST /api/ai/generate/:id/post { caption?, featureConsent? }` → creates feed post; `POST /api/ai/shop-assist { message, petId? }` → `{ intent, query, productHandles, reply }`.

Shop (`api/shop.js`): `GET /api/shop/collections`, `GET /api/shop/products?collection&q&cursor`, `GET /api/shop/products/:handle` (+ `stock`, `reviews` summary), `POST /api/shop/cart { cartId?, lines }`, `GET /api/shop/cart/:id`, `PATCH /api/shop/cart/:id { lines }`, `DELETE /api/shop/cart/:id/lines { lineIds }`, `GET /api/shop/orders`, `GET /api/shop/orders/:id`, `GET /api/shop/fulfillment` (depot address/hours, delivery zone text). Reviews (`api/reviews.js`): `GET /api/reviews?handle`, `POST /api/reviews { productHandle, orderId?, rating, body?, photoUrl?, petId? }`.

Webhooks: `POST /api/webhooks/shopify` (topics: orders/paid, orders/updated, orders/fulfilled, orders/cancelled, fulfillments/update, inventory_levels/update, customers/data_request, customers/redact, shop/redact).

Social (`api/posts.js`): `GET /api/posts?mode=following|discover|challenge&challengeId&cursor`, `POST /api/posts`, `GET /api/posts/:id`, `DELETE /api/posts/:id`, `POST/DELETE /api/posts/:id/like`, `GET/POST /api/posts/:id/comments`, `DELETE /api/posts/:id/comments/:cid`, `POST /api/posts/:id/share` (increments share_count, returns `{ shareUrl, watermarkedUrl }`). `api/follows.js`: `POST/DELETE /api/follows { handle }`. `api/reports.js`: `POST /api/reports`. `api/blocks.js`: `GET/POST/DELETE /api/blocks`. `api/challenges.js`: `GET /api/challenges` (active + upcoming + recent), `GET /api/challenges/:id`. Landing: `GET /p/:id`, `GET /r/:code`.

Notifications (`api/notifications.js`): `GET /api/notifications` (inapp, unread count), `POST /api/notifications/read { ids? }`.

Partners (`api/partners.js`): `GET /api/partners?lat&lng&type&q`, `GET /api/partners/:id`, `POST /api/partners/apply`, `GET /api/partners/me`, `GET /api/partners/me/qr` (PNG), `GET /api/partners/me/poster` (HTML), `POST /api/partners/me/redeem { type: 'points'|'gift_card', amountCents }`, `POST /api/partners/me/payout { amountCents, method, details }`, `POST /api/partners/attribute { code }`, `POST /api/partners/:id/reviews`. Landing `GET /partners`.

Inventory (`api/inventory.js`): `POST /api/inventory/import` (CSV body or `{ rows }`, header `X-Import-Secret`), `GET /api/inventory/status`.

Admin (`api/admin.js`, role admin): `GET /api/admin/metrics`, `GET/POST/PATCH /api/admin/challenges`, `GET/PATCH /api/admin/partners`, `GET/PATCH /api/admin/sourcing`, `GET/PATCH /api/admin/reports`, `POST /api/admin/points { userId, amount, reason }`.

Cron (`api/cron/*.js`): finalize-generations, run-automations, sync-inventory, release-holds, close-challenges, partner-tiers, expire-points, admin-digest.

## Ports for parallel local testing
Backend A 3001 · B 3002 · C 3003 · D 3004 · E 3005 · F 3006 · G 3007 · integration 3000.
