# AI in Pawtella

Two providers, one rule: **every AI call runs server-side** (`lib/claude.js`, `lib/xai.js`). Keys never ship in the app.

## Claude (text, vision, structured output)

| Use | Endpoint | Model (env) | Notes |
|---|---|---|---|
| Pet advice assistant | `POST /api/ai/chat` | `CLAUDE_MODEL_CHAT` (default `claude-sonnet-5-5`) | Pet profile injected into the system prompt; photo attachments via vision; triage rules produce a `vetAlert` card for red-flag symptoms; never diagnoses or doses |
| Caption ideas | `POST /api/ai/caption` | `CLAUDE_MODEL_FAST` (`claude-haiku-5-5`) | 3 options from an image + pet name |
| Shop assist | `POST /api/ai/shop-assist` | fast | Natural language → `{ intent, query, productHandles }` against the catalog |
| Replenishment estimate | automation `replenishment` | fast | Days-of-supply from order history + pet weight; pure interval math when no key |
| Digest captions | cron `admin-digest` | fast | Suggested social captions for feature-consented posts |

Prompts and triage rules live in `lib/ai-assistant.js`. Conversations persist in `ai_conversations` / `ai_messages`.

## xAI Grok Imagine (images and videos)

| Kind | API | Model (env) | Cost (provider) |
|---|---|---|---|
| Image | `POST /v1/images/generations` | `XAI_IMAGE_MODEL` = `grok-imagine-image-2.0` | ≈ $0.04 / image |
| Video (standard) | `POST /v1/videos/generations` → poll `GET /v1/videos/{id}` | `XAI_VIDEO_MODEL` = `grok-imagine-video-1.5-lite` | ≈ $0.02 / second (720p) |
| Video (HD) | same | `XAI_VIDEO_MODEL_HD` = `grok-imagine-video-1.5` | ≈ $0.08 / second (1080p) |

Video is asynchronous: `POST /api/ai/generate` charges points and starts the job; the app polls `GET /api/ai/generate/:id`; `api/cron/finalize-generations.js` finishes jobs the client stopped polling and refunds failures. Provider URLs are temporary, so finished media is copied to Cloudinary, which also produces the watermarked share version and thumbnails.

## Paw Points math (`lib/points-rules.js`)

- 1 PP = **$0.05** of value, everywhere.
- **Prices:** image 2 PP ($0.10 vs ≈$0.04 cost) · video 6 s 8 PP ($0.40 vs $0.12) · 10 s 12 PP · 15 s 16 PP · HD ×2 (15 s HD = 32 PP = $1.60 vs $1.20 cost). Margins stay positive at every tier; tune in one file.
- **Free budget:** 30 PP on signup (+10 if referred, +10 if attributed to a partner).
- **Earning:** 1 PP per $1 of cash subtotal in the store (a 5% reward), plus one-time bonuses (first pet 3, first post 5, first order 10, photo review 5, pet birthday 5/yr, challenge win 50 / runner-up 15, share→signup 10, referral conversion 20, monthly caps on referral earnings).
- **Store redemption:** min 20 PP, max 50% of the subtotal; implemented as a single-use Shopify discount code with a 24 h hold.
- **Packs** (Shopify products tagged `paw-points:<n>`): 100 PP $4.99 · 300 PP $12.99 · 1000 PP $34.99.
- **Expiry:** 12 months without activity (toggle `expiryEnabled`), with a 30-day warning email.
- **Abuse limits:** `dailyGenerationCap` per user; referral/share bonuses capped per month.

## Mock mode

With `ANTHROPIC_API_KEY` / `XAI_API_KEY` missing, `lib/claude.js` returns deterministic helpful text and `lib/xai.js` returns placeholder images and a sample MP4 after a short delay, so the whole Studio → poll → post → share loop works locally.
