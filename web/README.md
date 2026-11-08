# Pawtella web

The Phase 1 client: a Next.js (App Router) app in `web/`. It talks to the Pawtella API (`api/` + `lib/`
at the repo root) only through its own BFF proxy, so the browser never sees the API host or the JWT.

## Run

```bash
# 1. API (repo root), mock mode works without provider keys
cd .. && PORT=3000 npm run dev

# 2. Web
cp .env.example .env.local      # API_URL=http://localhost:3000
npm install
npm run dev -- --port 3100
```

Checks: `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## Layout

```
src/app/                 routes (App Router)
  page.tsx               / → redirect to /home or /welcome
  (auth)/                welcome, login, register, forgot, reset   (public; signed-in users → /home)
  onboarding/add-pet     first pet + Paw Points celebration
  (app)/                 authenticated shell: home, ask, create, shop, profile, inbox, points, settings
  api/[...path]/route.ts BFF proxy → ${API_URL}/api/*  (cookie ↔ Bearer token)
  api/session/route.ts   GET { user, pets }
src/components/          app-shell, logo, points-pill, page-header, empty/error states, skeletons, avatars
src/components/ui/       shadcn/ui primitives (Base UI flavour), tuned to the Pawtella tokens
src/lib/                 api.ts (client fetch), server-api.ts, session.ts (server), query-keys, format, referral
src/services/            one typed module per API area (auth, users, pets, upload, notifications, points)
src/stores/session.ts    zustand session snapshot + useSession()
src/hooks/               use-me, use-points, use-notifications
src/types/               API JSON shapes (camelCase)
```

## Conventions

- Design tokens live in `src/app/globals.css` (light on `:root`, dark on `.dark`), mapped into Tailwind
  (`bg-primary`, `text-points`, `bg-coral-soft`, `rounded-card`, `shadow-soft`, `font-heading`…). No hard-coded colors in pages.
- Client components fetch with `api()` + React Query (`queryKeys`). Server components use `serverApi()` / `getServerSession()`.
- Every list shows a skeleton, an empty state and an error state with retry (`ListSkeleton`, `EmptyState`, `ErrorState`).
- Auth state: `useSession()` (zustand). After a login/register call `hydrate()` or `refresh()`.
- Landing pages the API renders (`/p/:id`, `/r/:code`, `/partners`, `/mock-checkout/:cartId`) are rewritten to the API in `next.config.ts`.
