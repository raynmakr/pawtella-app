# Product

<!-- impeccable:product-schema 1 -->

<!--
  Written during an Impeccable UX/brand upgrade. The owner (KC) supplied a complete
  execution brief rather than sitting a product interview, so the facts below are
  inferred from that brief, CLAUDE.md, docs/CONVENTIONS.md and the shipped code.
  Inferences the owner has not explicitly confirmed are marked (inferred).
-->

## Platform

web

## Users

Primary: cat and dog owners in the US and Canada, Toronto first. They are on a phone
more often than a desktop, dipping in between parts of daily pet life — a vet question
at 11pm, reordering food before it runs out, sharing a photo of their pet, spending or
earning Paw Points. They are not power users; they want warmth, speed and a little fun,
not a dashboard. (inferred from CLAUDE.md + feature set)

Secondary: local pet-care businesses (vets, groomers, walkers) who join the partner
program to refer customers and earn commission.

## Product Purpose

Pawtella is a companion app for pet owners that bundles four things most owners juggle
across separate apps into one warm place:

1. A **social feed** of pet photos and AI-made videos.
2. A **Claude-powered advice assistant** ("Ask") for pet health and habits.
3. A **Shopify-backed supply store** with pickup or local delivery from a Toronto depot.
4. A **"Paw Points" credit economy** earned from purchases, referrals, shares and
   challenges, and spent on AI creations or as store discounts.

Success is habit: an owner who returns weekly because the app is useful (reorders,
answers), expressive (feed, AI studio) and rewarding (points), and who brings other
owners in through referrals and shares.

## Positioning

The defensible mechanism is the **Paw Points loop joined to a real local depot**: points
are earned and spent across commerce, AI creation and social growth, and orders fulfil by
pickup or local delivery from a Toronto depot whose Franpos POS inventory is the source of
truth, synced to Shopify. A pure-online pet store or a pure-social pet app cannot copy the
closed loop between buying, creating, sharing and redeeming against local stock.

## Operating Context

- Mobile-web first; the browser only ever talks to a Next.js BFF proxy, never the API
  directly. Public pages (shop, product, post, profile, challenge) are server-rendered;
  authenticated pages are client-rendered.
- Money is integer cents; Paw Points are integers. Every point movement is an auditable
  transaction row. Store redemption places a point hold + a single-use Shopify discount
  code, captured by the order webhook.
- Inventory truth flows Franpos → Shopify → app; online sales only reserve, never write
  back to Franpos.
- AI is first-class and server-only: Claude for advice/vision/structured output, xAI for
  generation; video generation is async (charge points, poll, refund failures).
- Growth is built in: share landing pages, referrals, weekly challenges, a lifecycle
  automation engine, and a partner program.
- Phase 1 ships the web app only; a native app is rebuilt later.

## Capabilities and Constraints

- Auth (email + Google), pet profiles, social feed with posts/likes/comments, AI "Ask"
  chat, AI "Studio" video generation, Shopify shop with cart + Paw Points redemption
  slider, orders with pickup/delivery/shipping, Paw Points balance + history, weekly
  challenges, invite/referrals, partner directory + apply + dashboard, inbox/notifications,
  profile + settings, onboarding (add a pet), and a newer **Subscribe & Save** flow
  (app-managed tiered subscriptions) gated behind `SUBSCRIPTIONS_ENABLED`.
- Mock mode is first-class: every provider (Claude, xAI, Shopify, media, email) runs
  without keys. Never throw at import time because a key is missing.
- Terminology that is product truth and must not be renamed casually: **Paw Points**,
  **Ask** (advice assistant), **Studio** (AI creation), **depot**, **pickup / local
  delivery**, **Subscribe & Save**, **partner**, **challenge**.
- Constraint for this engagement: do not change API behaviour, keep `SUBSCRIPTIONS_ENABLED`
  behaviour unchanged, keep all tests + web checks passing.

## Brand Commitments

- Name: **Pawtella** (a warm play on a beloved spread; pet + comfort + treat).
- Existing palette is a binding constraint the owner likes and wants kept: coral primary
  `#ff6b4a`, teal secondary `#0e7c7b`, amber "points" `#f5a623`, green success `#2bb673`
  on a warm cream `#fff8f1` ground. Build on these tokens, do not replace them.
- Typography already chosen: Inter (body) + Nunito (rounded display/headings).
- New commitment from this engagement: a friendly **cat-dog hybrid mascot**, identifiable
  as a hybrid by its ears (one pointy cat ear, one floppy dog ear), appearing throughout
  the product. Named and specified in docs/BRAND_GUIDE.md.

## Evidence on Hand

- Real, working product code (API in repo root, web app in `web/`), docs in `docs/`
  (CONVENTIONS.md, AI.md, DEPLOY.md, SHOPIFY_SETUP.md, INVENTORY_SYNC.md), node test suite.
- Live deploy at https://pawtella.com (Vercel).
- No original logo or mascot artwork exists: the only images ever committed are default
  Expo scaffold icons (an "A" chevron) from the earlier native build. Future brand work
  must treat the mascot and logo as newly authored, not restored.
- No fabricated testimonials, customers, benchmarks or pricing: none exist in the repo and
  none should be invented in UI or brand copy.

## Product Principles

1. **Warm, not corporate.** Pawtella is the friendly companion in a pet owner's day; the
   interface should feel soft, rounded and encouraging, never clinical.
2. **One loop, four jobs.** Buy, create, share and redeem are one connected economy; design
   should make the Paw Points thread visible and rewarding across every surface.
3. **Local is the moat.** Pickup and local delivery from the Toronto depot are features to
   celebrate, not hide behind generic e-commerce patterns.
4. **Delight earns retention.** Small moments — points earned, a pet saved, an order placed —
   are the hooks that bring owners back; invest craft there.
5. **Fast and honest.** Mobile-first performance and truthful copy (real stock, real points,
   no dark patterns) are part of the brand, not separate from it.

## Accessibility & Inclusion

- Respect `prefers-reduced-motion` for all animation (owner requirement).
- Maintain WCAG AA contrast on text and interactive states across light and dark themes
  (the app already ships a dark theme via next-themes). (inferred standard)
