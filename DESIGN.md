---
name: Pawtella
description: Warm, rounded companion app for cat and dog owners — coral, cream and a cat-dog mascot.
colors:
  primary: "#ff6b4a"
  primary-foreground: "#ffffff"
  secondary: "#0e7c7b"
  points: "#f5a623"
  points-foreground: "#3a2a05"
  success: "#2bb673"
  destructive: "#e5484d"
  background: "#fff8f1"
  foreground: "#1f1b16"
  card: "#ffffff"
  muted: "#fff1e6"
  muted-foreground: "#6b625a"
  accent: "#fff3dc"
  border: "#eedfd3"
  coral-soft: "#ffe6df"
  teal-soft: "#dff3f2"
typography:
  display:
    fontFamily: "Nunito, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3.75rem"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Nunito, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Nunito, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.08em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  card: "24px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "9999px"
    padding: "0 16px"
    height: "40px"
  button-points:
    backgroundColor: "{colors.points}"
    textColor: "{colors.points-foreground}"
    rounded: "9999px"
    height: "40px"
  button-soft:
    backgroundColor: "{colors.coral-soft}"
    textColor: "{colors.primary}"
    rounded: "9999px"
    height: "40px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.card}"
    padding: "24px"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "9999px"
    height: "48px"
  chip-selected:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "9999px"
    height: "36px"
---

# Design System: Pawtella

## Overview

**Creative North Star: "The warm Toronto pet shop, as an app."**

Pawtella feels like the neighbourhood pet store run by someone who clearly adores animals: cream walls, a coral awning, a friendly face at the counter, and a jar of treats by the register. Everything is soft-cornered, generously spaced and quietly cheerful. The system earns retention through warmth and reliability rather than novelty — it is an Operate-mode product (feed, shop, advice, rewards) wearing a Persuade-mode smile at its edges (welcome, onboarding, success moments).

The palette is sun-warmed, never corporate: a coral primary on a cream ground, a grounding teal, and an amber reserved almost entirely for the Paw Points economy so money and rewards read instantly. Type is the rounded Nunito for headings and the neutral Inter for reading, giving headlines a soft, approachable confidence without tipping into childish. Depth is gentle and coral-tinted, as if lit by warm afternoon light.

The anti-reference is the clinical SaaS dashboard: hard greys, thin hairlines, dense tables, cold blue accents. Pawtella rejects all of it. Where a competitor would show a chart, Pawtella shows a pet, a point total, or Pip.

**Key Characteristics:**
- Coral-on-cream warmth; amber means Paw Points and nothing else.
- Big soft corners (16–24px) and ring borders instead of hard lines.
- Rounded display type (Nunito) over neutral body (Inter).
- A cat-dog mascot, Pip, carries personality at empty, loading, error and success moments.
- Motion is feedback, not decoration; everything honours `prefers-reduced-motion`.

## Colors

A warm, food-adjacent palette: coral and cream do the everyday work, teal grounds it, and amber is rationed for rewards.

### Primary
- **Pawtella Coral** (#ff6b4a): The brand. Primary buttons, active nav, links, focus rings, Pip's coral dot, and the one accent a screen is allowed to lean on. Softens to **#ff7a5c** in dark mode.
- **Coral Soft** (#ffe6df): The tint behind coral icons, selected chips' cousins, and quiet coral surfaces (icon tiles, highlight cards).

### Secondary
- **Depot Teal** (#0e7c7b): The grounding accent — secondary buttons, "Ask"/advice surfaces, informational chips, Pip's outline and ears, and the lowercase `pawtella` wordmark. Teal Soft (#dff3f2) is its tint.

### Tertiary
- **Paw Points Amber** (#f5a623): Reserved for the Paw Points economy — the points pill, the rewards hero, point packs, "+PP" badges. Amber appearing anywhere else dilutes the signal.
- **Success Green** (#2bb673): Completed, in-stock, delivered, and confirmed states only.

### Neutral
- **Ink** (#1f1b16): Primary text, warm near-black (not pure black).
- **Cream** (#fff8f1): The app background — the warm ground everything sits on.
- **Card White** (#ffffff): Raised surfaces and cards.
- **Muted Cream** (#fff1e6) / **Muted Ink** (#6b625a): Quiet fills and secondary text.
- **Border Sand** (#eedfd3): Ring borders and dividers — a warm line, never cool grey.

### Named Rules
**The Amber-Is-Money Rule.** Amber (#f5a623) is reserved for Paw Points. If a surface isn't about earning, spending or showing points, it does not use amber.

**The Warm-Line Rule.** Borders and dividers are warm sand (#eedfd3), never a cool neutral grey. Depth is coral-tinted. Nothing on the surface is colder than the cream it sits on.

## Typography

**Display Font:** Nunito (with system-ui, sans-serif fallback)
**Body Font:** Inter (with system-ui, sans-serif fallback)

**Character:** Nunito's rounded terminals give headings a soft, friendly confidence; Inter keeps body copy crisp and highly legible. The pairing reads as "warm but trustworthy" — a shop you'd let mind your dog.

### Hierarchy
- **Display** (Nunito 800, 2.5–3.75rem, line-height 1.05, tracking -0.02em): Welcome and success hero lines only.
- **Headline** (Nunito 800, 1.5–1.875rem, tracking -0.02em): Page titles (`h1` via PageHeader).
- **Title** (Nunito 700, 1.125–1.25rem): Section headings and card titles.
- **Body** (Inter 400, 0.9375–1rem, line-height 1.6): Reading text; `cv11` + `ss01` features on.
- **Label** (Inter 600, 0.75rem, tracking 0.08em, uppercase): Category labels, meta, chip text.

### Named Rules
**The Rounded-Heading Rule.** Every `h1`–`h4` is Nunito, extra-bold, tracked tight (-0.02em). Body never borrows the display face, and the display face never sets long-form copy.

## Layout

Single warm column on mobile, a fixed 256px left sidebar at ≥768px with a bottom tab bar + top bar below it. Content is capped at a comfortable `max-w-[1100px]` and padded 16–24px. The spacing rhythm is an 8px scale; related items sit tight (8–12px), distinct groups breathe (24–40px), and headings always carry more space above than below. Product and feed content lays out on a 2→3→4 column responsive grid. Safe-area insets are respected for the bottom tab bar (`pb-safe`).

## Elevation & Depth

Hybrid, leaning soft. Surfaces are mostly flat with a 1px warm ring (`ring-1 ring-border`); elevation is a gentle, coral-tinted shadow used sparingly on genuinely raised or primary elements (the create FAB, primary buttons, the points hero, hovered cards).

### Shadow Vocabulary
- **Soft** (`box-shadow: 0 1px 2px rgb(31 27 22 / 0.04), 0 8px 24px -12px rgb(31 27 22 / 0.12)`): Resting cards and popovers.
- **Lift** (`box-shadow: 0 2px 4px rgb(31 27 22 / 0.06), 0 16px 40px -16px rgb(255 107 74 / 0.35)`): Primary actions and hero moments — note the coral tint in the ambient layer.

### Named Rules
**The Ring-First Rule.** Separation comes from a warm 1px ring by default; shadow is added only to signal elevation or primacy, never as default card decoration.

## Shapes

Big, friendly radii define the brand silhouette: cards and sheets at 24px (`--radius-card`), inputs and buttons fully rounded (pills), icon tiles and chips at 12–16px. Nothing is sharp-cornered. Borders are hairline warm rings; hard offset shadows and square corners are off-brand. The recurring silhouette is the rounded pill (buttons, chips, points, badges) against the rounded-rectangle card.

## Components

### Buttons
- **Shape:** Full pill (`rounded-full`), height 40px default (28/48/56px for sm/lg/xl).
- **Primary:** Coral fill, white text, Lift shadow; presses down 1px on `:active`.
- **Points:** Amber fill, dark amber text — the "spend/earn" button.
- **Soft:** Coral-soft fill, coral text — low-emphasis coral action.
- **Secondary / Outline / Ghost:** Teal fill / warm ring / transparent-to-muted, respectively.
- **Hover / Focus:** Subtle background shift; 3px `ring-ring/50` focus ring, always visible for keyboard.

### Chips
- **Style:** Pills with a warm ring; selected = coral fill + white text, unselected = card + sand ring.
- **State:** Used as collection filters (shop) and radio-style selectors (species picker).

### Cards / Containers
- **Corner Style:** 24px (`rounded-card`).
- **Background:** Card white on cream; tinted variants use coral-soft / teal-soft / accent.
- **Shadow Strategy:** Ring-first (see Elevation); Soft shadow on hover or when raised.
- **Internal Padding:** 16–32px (`p-4` to `p-8`).

### Inputs / Fields
- **Style:** Pill (search) or 16px radius, card background, 1px sand ring, 48px tall.
- **Focus:** Ring shifts to 2px `ring-ring`; coral when in an AI/assistant context.

### Navigation
- **Desktop:** Fixed left sidebar — Logo lockup, pill nav items (active = coral-soft + coral), a create button with a coral circle, Paw Points row, user menu.
- **Mobile:** Translucent blurred top bar (Logo + points + inbox) and a 5-slot bottom tab bar with a raised coral create FAB. Active items turn coral.

### Pip, the mascot (signature)
A hand-authored vector cat-dog face, faithful to the reference mark (`web/public/brand/pawtella-mascot-original.png`) and recoloured to the palette: a thick, round-capped Depot-Teal outline, a warm cream face, one pointy cat ear (left) and one folded dog ear (right), simple oval eyes, a cat "‿‿" smile, whiskers, freckles and a small coral dot. Ships as `<Mascot>` with poses (`happy`, `wave`, `thinking`, `sleeping`, `celebrating`, `sad`) expressed through the eyes, mouth, ear tilt and a small prop, a `full` framing with room for props and a `mark` head-only lockup, plus idle life (blink, ear twitch) that is fully disabled under reduced motion. See docs/BRAND_GUIDE.md for usage.

### Paw Points pill (signature)
Amber pill with the paw glyph and the balance in tabular Nunito; the number counts up and the glyph pops when points are earned.

## Do's and Don'ts

### Do:
- **Do** keep coral as the single leaned-on accent per screen; let the cream ground breathe.
- **Do** reserve amber for Paw Points, success green for confirmed states.
- **Do** use Pip at empty, loading, error and success moments — one pose, matched to the emotion.
- **Do** separate with warm 1px rings; add shadow only for elevation or primacy.
- **Do** set every heading in Nunito extra-bold, tracked tight; body in Inter.
- **Do** gate every animation behind `prefers-reduced-motion` and keep motion to transform/opacity.

### Don't:
- **Don't** introduce cool greys or cold blues; nothing colder than the cream.
- **Don't** spend amber on non-points UI, or coral on more than its one accent role per screen.
- **Don't** use hard offset shadows, square corners, or hairline grey borders.
- **Don't** set body copy in Nunito or headings in Inter.
- **Don't** over-deploy Pip — personality at meaningful moments, not on every card.
- **Don't** animate layout-driving properties (width/height/top/left) or run motion that ignores reduced-motion.
