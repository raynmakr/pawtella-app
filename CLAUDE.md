# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Pawtella is a companion app for cat and dog owners (US and Canada first): a social feed of pet photos and AI-made videos, a Claude-powered advice assistant, a Shopify-backed supply store with pickup or local delivery from a Toronto depot, and a "Paw Points" credit economy that is spent on AI creations or as store discounts and earned from purchases, referrals, shares and challenges. Growth is built in: share landing pages, referrals, weekly challenges, a lifecycle automation engine, and a partner program for vets, groomers and walkers. The depot runs Franpos POS; its inventory is synced to Shopify.

Phase 1 ships a **web app** (`web/`, Next.js). The native app is rebuilt later. The approved product plan and business rules are summarized in `docs/CONVENTIONS.md` and `docs/AI.md`.

## Layout

```
api/            Vercel serverless functions (ESM). One file per route family (see vercel.json rewrites).
lib/            Shared server code: db, http, env, auth, points, claude, xai, shopify, orders, posts, partners,
                automation, notifications, email, inventory/, admin/ (delegated admin areas).
scripts/        migrate.js, dev-server.js, seed-challenges.js, migrations/*.sql, franpos-bot/ (Playwright export bot)
test/           node:test suites (*.test.js) against local Postgres
web/            Next.js app (App Router, Tailwind, shadcn/ui); BFF proxy at web/src/app/api/[...path]/route.ts
docs/           CONVENTIONS.md (rules + module contracts + HTTP surface), DEPLOY.md, AI.md, SHOPIFY_SETUP.md, INVENTORY_SYNC.md
```

## Commands

Backend (repo root):
- `npm install` · `npm run migrate` (applies `scripts/migrations/*.sql`, tracked in `schema_migrations`) · `npm run dev` (local stand-in for Vercel on :3000) · `npm test` (`node --test`; run one file with `node --test test/points.test.js`).
- Local DB: Postgres on localhost with `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pawtella` and `DATABASE_SSL=false` in `.env` (see `.env.example`). Tests use random suffixes and never truncate.
- Crons: `curl localhost:3000/api/cron/<name>` (no `CRON_SECRET` locally). Mock checkout for the full points loop: `/mock-checkout/<cartId>`.

Web (`web/`): `npm install` · `npm run dev -- --port 3100` (needs the API on `API_URL`, default :3000) · `npm run lint` · `npx tsc --noEmit` · `npm run build`.

Franpos bot: `node scripts/franpos-bot/export-inventory.mjs --record` (headed discovery); scheduled by `.github/workflows/franpos-inventory-sync.yml`.

## Architecture essentials

- **Every function uses `route()` from `lib/http.js`**; throw `ApiError`/helpers for expected failures. Route families get the remaining path via `segments(req, '/api/<area>')` (the `vercel.json` `:path*` rewrite fills `req.query.path`). Webhooks set `config.api.bodyParser = false` and read `rawBody(req)`.
- **Mock mode is a first-class feature.** `lib/env.js` exposes `flags` (`hasClaude`, `hasXai`, `hasShopify`, `hasShopifyAdmin`, `hasCloudinary`, `hasEmail`). Every provider module (`lib/claude.js`, `lib/xai.js`, `lib/shopify.js` → `shopify-real.js`/`shopify-mock.js`, `lib/media.js`, `lib/email.js`) works without keys and exposes `isMock`. Never throw at import time because a key is missing.
- **Money is integer cents; points are integers.** Balance lives on `users.paw_points`; every movement is a `point_transactions` row with `balance_after`. All balance changes lock the user row (`SELECT … FOR UPDATE`) inside `withTransaction`; one-time bonuses go through `awardOnce` (flag + credit under one lock). Business functions accept a trailing `tx` so callers compose them in one transaction. Rules and prices live only in `lib/points-rules.js` (`RULES`), partner rules in `lib/partner-rules.js`.
- **Store redemption** = `point_holds` + a single-use Shopify discount code (`PAW-…`), captured by the `orders/paid` webhook, released by `api/cron/release-holds.js` after 24 h. Partner codes (`PARTNER-…`) are unlimited-use and customer-locked.
- **Order ingestion** is `lib/orders.js upsertOrderFromWebhook` (idempotent via `processed_webhooks`), which in one transaction captures holds, awards points, grants packs (`paw-points:<n>` tags / `PP-` SKUs), accrues partner commission, reserves depot inventory and emits events. Pickup vs local delivery vs shipping is detected from shipping lines and note attributes.
- **Events drive growth.** `track()` from `lib/events.js` writes `events`; `lib/automation.js` journeys select from them every 15 min and write deduplicated `notifications` (email via Resend, in-app; push is a Phase 2 channel). `lib/metrics.js` and the daily `admin-digest` read the same table.
- **AI calls are server-only.** `lib/claude.js` uses `@anthropic-ai/sdk` (vision via URL image blocks, structured output via `output_config` json_schema, tool loop for `find_partners`); `lib/xai.js` uses plain fetch to `api.x.ai`. Video is async: `POST /api/ai/generate` charges points and starts the job; `GET …/:id` polls; `finalize-generations` cron refunds failures. Finished media is copied to Cloudinary (provider URLs are temporary); `watermarked_url` is for external sharing, `output_url` for the feed.
- **Inventory**: Franpos is the source of truth for depot quantities (`inventory_items.qty_on_hand`), Shopify for product content, `product_sourcing` for the owner's per-SKU policy (`stock_only` → inventory policy DENY, `special_order` → CONTINUE + lead-days metafield, `hidden` → DRAFT). Online sales only move `qty_reserved_online`; Franpos is never written back.
- **Admin routes** live under `/api/admin/*` (`requireAdmin`); `api/admin.js` dynamically delegates `challenges`, `partners`, `sourcing` to `lib/admin/<area>.js` when the file exists.
- **Schema**: migrations 001–009 define everything; add a new numbered file for changes, never edit applied ones. IDs are SERIAL; API JSON is camelCase via `lib/serialize.js camelize()`; DB is snake_case.
- **Web**: the browser only talks to the Next.js BFF (`/api/*` proxy injects the httpOnly `pawtella_token` cookie as a Bearer header; auth responses set it). Public pages (shop, product, post, profile, challenge) are server-rendered; authenticated pages are client-rendered. Landing pages `/p/:id`, `/r/:code`, `/partners`, `/mock-checkout/:cartId` are served by the API and proxied by `next.config` rewrites.

## Gotchas

- `vercel.json` has no `functions` block on purpose (Vercel rejects a glob that matches nothing); per-function limits can be re-added now that `api/` is populated.
- Cron schedules here require Vercel Pro (Hobby allows daily only).
- `npm test` must be bare `node --test` on Node 22; passing a directory fails.
- Several agents built areas in parallel; cross-module imports in `lib/orders.js` and the webhook are dynamic and tolerate missing exports. If you add a contract function, update `docs/CONVENTIONS.md`.
- Mock Shopify state is per process; restart `npm run dev` after editing `api/` files (modules are cached).
- `/home/user/nafisasz-closet` (sibling repo, if present) is the owner's earlier marketplace app; patterns were ported from it, including fixes for its known bugs (unverified Apple tokens, webhook metadata mismatch, coins debited before payment).
