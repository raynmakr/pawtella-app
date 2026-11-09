# Subscribe & Save (app-managed subscriptions)

Auto-ship for supplies (dry food, wet food, litter) with a tiered discount, owned by **our** Shopify
app ("Pawtella API", client id `871721a395d4701c0a70afa9e9ffaead`) rather than the stock Shopify
Subscriptions app — because we need tiered pricing the stock app can't do.

**Everything is behind the `SUBSCRIPTIONS_ENABLED` flag (default off).** With the flag off the API routes
404, the webhook topics are acknowledged but ignored, the billing cron no-ops, and product pages never
show the Subscribe & Save toggle — so production is unaffected until the activation checklist below is
run.

## Business rules

- **Eligible products**: the `dog-food`, `cat-food` and `litter-hygiene` collections. Food is further
  classified dry vs wet from product type / tags / title (`lib/subscriptions/eligibility.js`) — both are
  eligible; the label is metadata for the UI.
- **Cadences**: every 2, 4, 6 or 8 weeks (`SUB_RULES.cadenceWeeks`).
- **Tiered discount**: 5% base on every subscription. When a customer's total active subscription spend,
  normalized to per-month (`Σ basePrice × qty × 4.345 / weeks`), **exceeds $100 CAD**, all of their active
  subscriptions move to 10%; they drop back to 5% when it falls to $100 or below. Recomputed on contract
  create/update/cancel/pause and before every billing run.
  - The tier keys off the **base (pre-discount) price**, not the discounted price. This is deliberate: if
    it keyed off the discounted price, applying the 10% tier could pull the customer back under $100 and
    oscillate 10% ⇄ 5%. See the "does not oscillate" test in `test/subscriptions-logic.test.js`.

## Architecture

```
lib/subscriptions/
  rules.js          SUB_RULES — every tunable constant (pure)
  tiers.js          normalize spend, pick tier, compute discounted prices (pure)
  cadence.js        validate/normalize 2/4/6/8-week cadences (pure)
  eligibility.js    collection + dry/wet classification (pure)
  dunning.js        billing-due predicate + retry/pause state machine (pure)
  offer.js          build the PDP Subscribe & Save offer (flag-gated)
  shopify-real.js   Admin GraphQL: selling plans, draft price edits, billing attempts, account actions
  shopify-mock.js   in-memory stand-in (same interface) so dev/tests run without Shopify
  shopify.js        facade: real when SHOPIFY Admin configured, else mock
  store.js          DB mirror (subscription_contracts/_lines/_billing_attempts, selling_plan_groups)
  service.js        orchestration used by the API, webhook and cron
  webhook.js        maps subscription webhook topics → service
  index.js          barrel
```

- **Selling plans**: `scripts/setup-selling-plans.mjs` creates one `sellingPlanGroupCreate` group
  (merchant code `pawtella-subscribe-save`) with four plans (2/4/6/8 weeks), each a 5% `PERCENTAGE`
  pricing policy, and attaches it to every eligible product. Idempotent (reuses the group by merchant
  code; re-attaching is a no-op). Plan ids are mirrored into `selling_plan_groups`.
- **Tier pricing**: `service.recomputeAndApplyTier()` sums the customer's active contracts, picks the
  tier, and for any contract whose tier changed sets each line's unit price via the SubscriptionDraft
  flow: `subscriptionContractUpdate` → `subscriptionDraftLineUpdate` (`currentPrice`) →
  `subscriptionDraftCommit` (`lib/subscriptions/shopify-real.js updateLinePrices`).
  - ⚠️ In API 2026-10 the SubscriptionDraft mutations are **deprecated** in favour of the newer
    `SubscriptionContractCalculation` API (`subscriptionContractUpdateCalculate` →
    `subscriptionContractCalculationCommit`). The draft flow still works; `updateLinePrices()` is the one
    function to swap when we migrate.
- **Billing**: because our app owns the contracts, Shopify does **not** bill them for us. The daily cron
  `api/cron/subscriptions-billing.js` → `service.processDueBilling()` recomputes each due customer's tier,
  then calls `subscriptionBillingAttemptCreate` with a **deterministic idempotency key**
  (`sub-bill:<contractId>:<cycleDate>:<attempt#>`) so a re-run never double-charges. A pending row is
  written to `subscription_billing_attempts` first (unique on `idempotency_key`).
- **Dunning**: on failure, `dunning.nextDunningStep()` schedules up to 3 retries over ~7 days (2, 3, 2
  days) by moving `next_billing_at` forward; after the 3rd retry the contract is paused and the customer
  gets a transactional `subscription_payment_failed` email. On success, failures reset and the next
  billing date advances by the cadence.
- **Webhooks** (`subscription_contracts/create|update`, `subscription_billing_attempts/success|failure|
  challenged`) are thin, so contract events re-read the full contract from the Admin API and refresh the
  mirror; billing events mark the attempt and run the dunning step. In **mock mode** the cron resolves a
  billing attempt synchronously (no webhook round-trip) so the whole loop is testable locally.
- **Paw Points**: subscription orders come through Shopify as normal `orders/paid` webhooks, so
  `lib/orders.js` already earns points on them — nothing extra needed.

## Data model (migration `011_subscriptions.sql`)

- `selling_plan_groups` — the plan ids we created, keyed by `shopify_plan_id`, with `interval_weeks`.
- `subscription_contracts` — mirror of each Shopify contract: `status`, `interval_weeks`, `tier_percent`,
  `monthly_value_cents` (this contract's normalized base spend), `next_billing_at`, `billing_failures`.
- `subscription_lines` — per line `base_price_cents` (one-time price) and `current_price_cents` (on the
  contract after the tier discount).
- `subscription_billing_attempts` — one row per attempt, unique on `idempotency_key`.

## HTTP surface

- `GET /api/subscriptions` → `{ subscriptions, tierProgress }`
- `GET /api/subscriptions/:id` → `{ subscription }`
- `POST /api/subscriptions/:id/{pause|resume|cancel|skip}`
- `POST /api/subscriptions/:id/cadence` `{ weeks }`

All require auth and 404 while the flag is off. Storefront: eligible product detail responses carry a
`subscription` offer; cart lines pass `sellingPlanId` through to `cartLinesAdd`; the account page lives at
`/subscriptions`.

## Local development

Mock mode needs no Shopify keys:

```
npm run migrate
node scripts/setup-selling-plans.mjs          # creates mock plans, attaches mock catalog
SUBSCRIPTIONS_ENABLED=true npm run dev         # API
# web: SUBSCRIPTIONS_ENABLED is read by the API; the PDP toggle appears on food/litter products
curl localhost:3000/api/cron/subscriptions-billing   # run the billing cron
```

Tests: `node --test test/subscriptions-logic.test.js test/subscriptions-service.test.js`.

## Activation checklist (production)

Do these in order. Steps 1–3 are one-time Shopify setup; nothing here has been done by the code change.

1. **Shopify Payments must be live** on the store (subscriptions require it). Confirm in Shopify admin →
   Settings → Payments.
2. **Accept the new API scopes.** `shopify.app.toml` now also requests `write_purchase_options`,
   `read_own_subscription_contracts`, `write_own_subscription_contracts`, `read_customer_payment_methods`.
   Deploy the app config and re-authorize: `shopify app deploy` (this also registers the new
   `subscription_contracts/*` and `subscription_billing_attempts/*` webhook topics). Reinstall/approve the
   scope grant in the admin.
3. **Create the selling plans**: `node scripts/setup-selling-plans.mjs` against production
   (`--dry-run` first to preview the eligible product count). Verify in Shopify admin that the "Subscribe &
   Save" group with 4 cadences is attached to the food + litter products.
4. **Verify the deprecated-vs-new mutations against the live API version.** Smoke-test one contract:
   `updateLinePrices` (draft flow), `subscriptionBillingAttemptCreate`, and the account mutations
   (`subscriptionContractPause/Activate/Cancel`, `subscriptionBillingCycleSkip`, cadence change via
   `subscriptionDraftUpdate`). If Shopify has removed the draft mutations by then, swap `updateLinePrices`
   /`setCadence` to the `SubscriptionContractCalculation` API — they are isolated for exactly this.
5. **Set the env flag**: `SUBSCRIPTIONS_ENABLED=true` on the Vercel project (API). Redeploy.
6. **Verify the cron**: `api/cron/subscriptions-billing` is in `vercel.json` (`0 10 * * *`). Crons need
   Vercel Pro. Confirm it appears in the Vercel dashboard and runs with the `CRON_SECRET` bearer.
7. **End-to-end check**: subscribe to a product on the storefront, confirm the contract appears under
   `/subscriptions`, force a due date, run the cron, and confirm an order is created and Paw Points are
   earned via the existing `orders/paid` path.

To roll back, set `SUBSCRIPTIONS_ENABLED=false` — the feature goes inert without removing any Shopify data.
