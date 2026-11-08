# Deploying Pawtella

Two deployables: the **API** (this repo's root → Vercel) and the **mobile app** (`mobile/` → EAS Build / app stores). Third parties: Neon (Postgres), Shopify (store), Cloudinary (media), Anthropic (Claude), xAI (Grok Imagine), Resend (email).

## 1. Database (Neon)

1. Create a Neon project (region: US East or AWS ca-central-1 if offered; closest to Vercel's default region).
2. Copy the pooled connection string (`...-pooler...`, `sslmode=require`) → `DATABASE_URL`.
3. Apply the schema from your machine:
   ```bash
   DATABASE_URL='postgresql://...' npm run migrate
   ```
   Migrations are idempotent and tracked in `schema_migrations`. Run again after every deploy that adds a file to `scripts/migrations/`.

## 2. API (Vercel)

1. `npm i -g vercel && vercel link` in the repo root (framework preset: Other). Root directory = repo root; `mobile/` is ignored by `.vercelignore`.
2. Add environment variables (Production + Preview) from `.env.example`. Minimum to boot: `DATABASE_URL`, `JWT_SECRET` (32+ random bytes), `APP_URL` (`https://<your-domain>`), `CRON_SECRET`, `ADMIN_EMAIL`. Everything else enables a feature; with a key missing the module runs in mock mode.
   ```bash
   vercel env add JWT_SECRET production
   ```
3. Deploy: `vercel --prod`. Verify `GET https://<domain>/api/shop/collections` returns the mock or real catalog.
4. **Crons** are declared in `vercel.json`. The Hobby plan allows daily crons only; the schedule here (every 5–30 min for generations, automations, inventory) needs **Vercel Pro**. Vercel sends `Authorization: Bearer $CRON_SECRET` automatically.
5. **Function duration:** `vercel.json` sets `maxDuration: 60`. Video generation never blocks a function (jobs are polled), so 60 s is plenty.
6. Custom domain: add it in Vercel, then set `APP_URL` to it and configure Shopify webhooks to `https://<domain>/api/webhooks/shopify`.
7. Landing routes served by the API: `/p/:id` (shared post), `/r/:code` (invite or partner), `/partners` on the API host and `/for-partners` on the web app (partner recruiting), `/mock-checkout/:cartId` (dev only; disabled in production).

## 3. Third-party setup checklist

| Service | Where | Env vars | Notes |
|---|---|---|---|
| Shopify | see `docs/SHOPIFY_SETUP.md` | `SHOPIFY_*` | Storefront token for catalog/cart, Admin token for discounts/gift cards/inventory, webhook secret |
| Cloudinary | cloudinary.com → Settings → API keys | `CLOUDINARY_*` | Upload the watermark PNG as `pawtella/watermark` |
| Anthropic | console.anthropic.com | `ANTHROPIC_API_KEY` | Models in `CLAUDE_MODEL_CHAT` / `CLAUDE_MODEL_FAST` |
| xAI | console.x.ai | `XAI_API_KEY` | Models in `XAI_*_MODEL` |
| Resend | resend.com → verify your sending domain | `RESEND_API_KEY`, `FROM_EMAIL` | Required for lifecycle emails and password reset |
| Apple Sign-In | developer.apple.com → Identifiers → Sign in with Apple | `APPLE_BUNDLE_ID` | Same bundle id as `mobile/app.json` |
| Google Sign-In | console.cloud.google.com → OAuth clients (iOS, Android, Web) | `GOOGLE_CLIENT_IDS` (server), `EXPO_PUBLIC_GOOGLE_*` (mobile) | |
| Franpos inventory | see `docs/INVENTORY_SYNC.md` | `INVENTORY_SOURCE`, `INVENTORY_IMPORT_SECRET` | CSV import until an API is available |

## 4. Mobile app (EAS)

```bash
cd mobile
npm install
npx eas-cli@latest login
npx eas-cli@latest build:configure         # creates eas.json profiles: development, preview, production
npx eas-cli@latest build --profile development --platform ios   # dev client for Apple Sign-In + Shopify checkout sheet
```
- `EXPO_PUBLIC_API_URL` must point at the deployed API (set per EAS profile in `eas.json` `env`).
- Expo Go runs everything except native-only modules (Apple Sign-In, `@shopify/checkout-sheet-kit`); those fall back to web flows in Expo Go.
- Store listing needs: privacy policy URL, account deletion (built in: Settings → Delete account), content moderation (report + block are built in), camera/photos/location usage strings (in `app.json`).

## 5. Local development

```bash
# API
cp .env.example .env            # fill DATABASE_URL (local Postgres works), DATABASE_SSL=false
npm install && npm run migrate && npm run dev   # http://localhost:3000, mock mode for every missing key
npm test

# Mobile
cd mobile && npm install
EXPO_PUBLIC_API_URL=http://<your-lan-ip>:3000 npx expo start
```
Mock mode gives a seeded catalog, fake AI replies, placeholder generations and a `/mock-checkout/:cartId` page that fires a synthetic `orders/paid` webhook, so the full Paw Points loop can be exercised without any account.

## 6. Operations

- **Admin role:** `UPDATE users SET role='admin' WHERE email='you@...'`. Admin routes live under `/api/admin/*`.
- **Daily digest** email (`/api/cron/admin-digest`) is the operator's inbox: new partner applications, payout requests, sourcing decisions, reports, top shareable posts.
- **Points liability** = `SUM(users.paw_points) × $0.05`; shown in the digest and `GET /api/admin/metrics`.
- **Backups:** Neon keeps point-in-time restore; export monthly with `pg_dump` for cold storage.
