# Pawtella Brand Guide

_The source of truth for how Pawtella looks, sounds and behaves. Pairs with the machine-readable
design system in `/DESIGN.md` and the product record in `/PRODUCT.md`. Rendered visually at
`/brand` in the web app._

---

## 1. Brand story

Pawtella is the companion app for cat and dog owners — Toronto first, US & Canada next. It bundles
what pet people juggle across a dozen apps into one warm place: a feed of pet photos and AI-made
videos, a Claude-powered advice assistant ("Ask"), a Shopify-backed supply store with pickup or
local delivery from a Toronto depot, and **Paw Points** — a reward currency you earn from buying,
posting, inviting and winning challenges, and spend on AI creations or store discounts.

The name is a wink: _paw_ + the warmth of a beloved spread. Pawtella should feel like the
neighbourhood pet shop run by someone who genuinely loves animals — cream walls, a coral awning, a
friendly face at the counter, a treat jar by the register.

**Positioning in one line:** The one loop where buying, creating, sharing and redeeming all run on
Paw Points, fulfilled by a real local depot.

## 2. Personality

Pawtella is **warm, encouraging, playful and trustworthy** — a knowledgeable friend, never a
clinical dashboard or a hype machine.

| We are | We are not |
|---|---|
| Warm, human | Corporate, sterile |
| Encouraging | Pushy / salesy |
| Playful | Childish or silly |
| Honest & clear | Vague, jargon-heavy |
| Calm & confident | Loud, urgent, dark-pattern |

Our emotional range runs from quietly reassuring (health advice, errors) to genuinely celebratory
(points earned, order placed, first pet saved). We dial intensity to the moment — a routine save
feels _certain_; a milestone gets to _party_.

## 3. Voice & tone

**Voice** (constant): friendly, plain-spoken, a little witty, Toronto-proud, pro-pet.
**Tone** (varies by moment):

- **Onboarding / success:** warm and celebratory. _"You've got 30 Paw Points. Spend them in the Studio or at checkout."_
- **Advice / health:** calm, careful, never alarmist. _"A friendly assistant that knows your pet and when to call the vet."_
- **Errors:** lead with the problem and the fix, add warmth, never joke about loss or money. _"This page wandered off. We looked under the couch and behind the food bowl — nothing here."_
- **Commerce:** clear and honest about stock, price and points. No fake urgency.

### Writing rules
- Use the product's own words: **Paw Points**, **Ask**, **Studio**, **depot**, **pickup**, **local delivery**, **Subscribe & Save**, **challenge**, **partner**.
- Sentence case everywhere except the small uppercase label style.
- Second person ("you", "your pet"). Prefer the pet's name when known.
- Canadian-friendly spelling ("favourite", "personalise") — already in the product.
- Say the number: "+5 Paw Points", "1 PP = 5¢ in store". Never hide the maths.

### Do / Don't copy
- ✅ "Order placed! Points land as soon as payment clears."  ❌ "Success! Transaction complete."
- ✅ "Nothing matches 'grain-free' — try another word or ask the AI."  ❌ "No results found."
- ✅ "The assistant is napping. Try again in a moment."  ❌ "Error 500: service unavailable."

## 4. Mascot — Pip

**Name:** **Pip.** Short, warm, easy to say, ownable.

**Who Pip is:** a cat-dog hybrid — the embodiment of a feed that serves both cat people and dog
people. Pip is unmistakably a hybrid because of the **ears: one pointy cat ear (left) and one folded
dog ear (right)**. A thick, round-capped Depot-Teal outline, a warm cream face, simple oval eyes, a
rounded nose, a cat "‿‿" smile, whiskers, freckles and a small coral dot by the dog ear. Personality:
curious, encouraging, a little playful — the friend who celebrates your pet's small wins and nudges
you to earn a few more points.

**Reference & build:** a hand-authored vector, faithful to the original reference mark
(`web/public/brand/pawtella-mascot-original.png`) and recoloured to the palette tokens — outline and
ears in Depot Teal, the dot in Pawtella Coral. Shipped as the `<Mascot>` React component
(`web/src/components/mascot.tsx`). Two variants — `full` (the face framed with room for a pose's
small prop) and `mark` (head only, used in the logo and app icons).

### Poses
| Pose | Feeling | Use |
|---|---|---|
| `happy` | content, friendly | default; empty states that invite action |
| `wave` | welcoming | welcome/auth hero, rewards hero |
| `thinking` | working, patient | loading, AI generation in progress |
| `sleeping` | quiet, nothing here | "all caught up" / dormant empty states |
| `celebrating` | joyful | success: pet saved, order placed, big wins |
| `sad` | empathetic | errors, 404, failed generations |

### Idle life
Blink and ear twitch run subtly and loop; the `wave` pose waves its paw; `float` adds a gentle bob
for loading/hero. All idle motion is removed under `prefers-reduced-motion`.

### Do / Don't
- **Do** match the pose to the emotion of the moment.
- **Do** give Pip room; keep the teal-and-cream silhouette clean.
- **Do** use the `mark` (head) at small sizes and for icons.
- **Don't** recolour Pip off the palette, restyle the outline, or rotate/squish the face.
- **Don't** put Pip on every card — personality at meaningful moments only.
- **Don't** swap the ears; the one-cat-one-dog ear pairing _is_ the identity.

## 5. Logo

The lockup is **Pip's head mark + the lowercase "pawtella" wordmark**, set in the rounded display
face (Nunito, extra-bold) in Depot Teal to echo the reference mark. Built as the `<Logo>` component
with `sm`/`md`/`lg`/`xl` sizes and a `markOnly` option.

- **Clear space:** keep at least the height of the mark's cat ear clear on all sides.
- **Minimum size:** mark ≥ 24px; show the wordmark only when it renders ≥ 16px tall.
- **Compact mark:** use `markOnly` (the head) in tight spaces, favicons and app icons.
- **Backgrounds:** prefer cream or white. On coral or photography, use the mark with its built-in
  soft shadow for separation.
- **Don't:** recolour the wordmark, change its case or font, stretch, add effects, or box the mark in
  a tile (the head is the mark).

App icons and the favicon are generated from the mark (`web/src/app/icon.png`, `apple-icon.png`,
`favicon.ico`); the email header uses `web/public/pip-mark.png`.

## 6. Colour palette

All values are CSS tokens in `web/src/app/globals.css` (light `:root`, dark `.dark`).

| Token | Light hex | Role |
|---|---|---|
| `--primary` | `#ff6b4a` | Pawtella Coral — the brand accent, primary buttons, links, Pip |
| `--coral-soft` | `#ffe6df` | Coral tint — icon tiles, soft coral surfaces |
| `--secondary` | `#0e7c7b` | Depot Teal — secondary actions, Ask surfaces, Pip's outline & ears, the wordmark |
| `--teal-soft` | `#dff3f2` | Teal tint |
| `--points` | `#f5a623` | Paw Points Amber — **points economy only** |
| `--points-foreground` | `#3a2a05` | Text on amber |
| `--success` | `#2bb673` | Confirmed / in-stock / delivered |
| `--destructive` | `#e5484d` | Errors, destructive actions |
| `--background` | `#fff8f1` | Cream app ground |
| `--foreground` | `#1f1b16` | Ink — primary text (warm near-black) |
| `--card` | `#ffffff` | Raised surfaces |
| `--muted` / `--muted-foreground` | `#fff1e6` / `#6b625a` | Quiet fills / secondary text |
| `--accent` | `#fff3dc` | Warm highlight fill |
| `--border` | `#eedfd3` | Warm ring borders & dividers |

**Two rules:** _Amber is money_ (reserve `--points` for Paw Points). _Warm lines only_ (borders are
sand, never cool grey; nothing colder than the cream).

### Contrast notes (WCAG)
- **Ink on cream / card** (`#1f1b16` on `#fff8f1`/`#fff`): ~15:1 — AAA. Use for all body text.
- **Dark amber on amber** (`#3a2a05` on `#f5a623`): ~8:1 — AAA. The points pill is safe.
- **White on teal** (`#fff` on `#0e7c7b`): ~4.7:1 — AA for normal text.
- **White on coral** (`#fff` on `#ff6b4a`): ~2.8:1 — **below AA for small text.** Only use white on
  coral for **large, bold** button/CTA labels (the established primary button), never for small or
  long-form text.
- **Coral text on cream** (`#ff6b4a` on `#fff8f1`): ~2.9:1 — use only for large/bold emphasis. When a
  coral link or label must meet AA at body size, use the **deeper coral `#e4532f`** (~4.3:1), as the
  email templates already do (`BRAND.coralDark`).
- Always keep a visible focus ring (`--ring`, coral) for keyboard users.
- Dark theme mirrors every token; verify the same pairings there.

## 7. Typography

- **Display / headings:** **Nunito** (600–900). Rounded, friendly, confident. All `h1`–`h4`,
  extra-bold, tracked tight (-0.02em).
- **Body / UI:** **Inter** (400–600). Neutral, legible, with `cv11`+`ss01` features on.
- **Label:** Inter 600, 0.75rem, letter-spacing 0.08em, uppercase — for small category labels/meta.

**Scale:** Display 2.5–3.75rem · Headline 1.5–1.875rem · Title 1.125–1.25rem · Body 0.9375–1rem
(line-height 1.6) · Label 0.75rem. Keep reading measure to ~65–75ch.

**The Rounded-Heading Rule:** headings are always Nunito; body is always Inter. Never cross them.

## 8. Iconography

- **Library:** [Lucide](https://lucide.dev) (`lucide-react`), single consistent stroke (~2,
  2.4–2.75 for emphasis). Never mix icon families or substitute emoji for icons.
- **Sizing:** 16–24px inline; icons in tiles sit in a rounded 12–16px chip tinted coral-soft /
  teal-soft / accent.
- **Pet-domain glyphs:** the inline `PawIcon` (paw) and `<Mascot>` (Pip) are Pawtella's own marks —
  use them for brand/points/empty moments, Lucide for everything functional.

## 9. Motion

Pawtella is Operate-mode: motion serves **feedback, state and continuity**, never decoration. One
authored moment per surface at most; routine transitions stay fast.

- **Durations:** 100–150ms immediate feedback · 150–300ms routine state · 300–500ms overlays/page
  transitions · 500–800ms a deliberate focal entrance. Exits faster than entrances.
- **Easing:** natural deceleration `cubic-bezier(0.16, 1, 0.3, 1)` for arrivals; `pop`
  `cubic-bezier(0.2, 0.9, 0.3, 1.2)` for count/badge emphasis. No bounce/elastic by reflex.
- **Material:** transform + opacity only (no animating width/height/top/left). Keep content visible
  by default so a failed script never hides the page.
- **The authored moment:** Paw Points — the balance counts up and the glyph pops when points land.
- **Signature touches:** page-enter (`animate-page-in`), scroll-in list/grid entrance (`Reveal`),
  cart-badge pop on add-to-cart, Pip's idle blink and ear twitch.
- **Reduced motion:** every animation has a `prefers-reduced-motion: reduce` path that removes
  movement while preserving the final, legible state. This is a hard requirement.

## 10. UI components

- **Buttons:** full pills. Primary = coral + white + Lift shadow (presses 1px on active). `points` =
  amber. `soft` = coral-soft. Secondary = teal. Always a visible focus ring.
- **Cards:** 24px radius, white on cream, 1px warm ring; add Soft shadow only when raised/hovered.
- **Inputs:** pill or 16px radius, card bg, 1px sand ring, 48px tall; focus shifts the ring to coral.
- **Chips:** pills; selected = coral fill, unselected = card + sand ring.
- **Navigation:** desktop left sidebar (pill items, active coral-soft); mobile blurred top bar + 5-slot
  bottom tab bar with a raised coral create FAB.
- **Depth:** _Ring-first_ — separate with a warm ring; reach for shadow only to signal elevation or
  primacy.

## 11. Photography & illustration

- **Photography:** real pets, real owners, warm natural light; candid over studio. Avoid cold,
  clinical or stock-looking imagery. Let user pet photos be the hero — the UI stays out of their way.
- **Illustration:** flat, rounded, two-to-three warm tones from the palette, a thick round-capped
  teal outline and no gradients-as-texture — the same language as Pip. New illustrations should look like they belong in
  Pip's world.
- **Backgrounds:** soft blurred colour blooms (coral-soft, teal-soft, accent) on cream, as on the
  welcome screen. Keep them low-contrast so content stays readable.

## 12. Examples in product

- **Welcome / auth:** Pip waves; warm colour blooms; coral CTA.
- **Onboarding success:** Pip celebrates with confetti; "You've got 30 Paw Points."
- **Paw Points screen:** amber hero, Pip waving in the corner, balance counts up.
- **Empty / error / 404:** Pip (happy / sad / sad) carries the moment with honest, warm copy.
- **AI Studio generating:** Pip thinks and floats while the video renders; celebrates on success,
  commiserates (and refunds points) on failure.
- **Email:** Pip's head mark in the header; coral CTA on cream.

---

_Keep this guide and `DESIGN.md` in sync. When you add a surface, reach for the existing tokens,
components and Pip poses before inventing anything new._
