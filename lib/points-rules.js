// Paw Points rules: every tunable constant of the points economy lives here.
// Pure module: no DB, no HTTP. Owner: Backend B. Contract in docs/CONVENTIONS.md.
//
// 1 PP = $0.05 everywhere (AI prices and store discounts).

export const RULES = Object.freeze({
  valueCents: 5, // 1 Paw Point = $0.05

  // Sign-up and one-time bonuses
  welcomeBonus: 30,
  referredSignupBonus: 10, // extra for a user who signs up through a referral/share link
  referralConversionBonus: 20, // to the referrer on the friend's first creation or order
  referralMonthlyCap: 200, // max referral + share points a referrer can earn per calendar month
  shareConversionBonus: 10, // a share link that converts to a signup
  profilePetBonus: 3, // profile completed + first pet
  firstPostBonus: 5,
  firstOrderBonus: 10,
  reviewBonus: 5, // photo review of a purchased product
  petBirthdayBonus: 5, // per pet per year
  challengeWin: 50,
  challengeRunnerUp: 15,
  partnerReferredBonus: 10, // customer attributed to a partner
  winbackBonus: 15, // winback_30d journey offer

  // Earning on store spend: 1 PP per $1 of cash subtotal (after discounts, before tax/shipping)
  earnPerDollarCents: 100, // cents of subtotal per point
  orderPointsPerDollar: 1, // same rule, expressed per dollar (used by lib/orders.js)

  // Spending in store
  minRedeem: 20, // minimum points per hold
  maxRedeemPercent: 50, // max share of the cart subtotal payable in points
  holdHours: 24,

  // Expiry
  expiryEnabled: true,
  expiryMonths: 12,

  // AI generation
  dailyGenerationCap: 20,
  prices: Object.freeze({
    image: 2,
    video: Object.freeze({ 6: 8, 10: 12, 15: 16 }), // seconds → points (lite model, 720p)
    hdMultiplier: 2, // "HD" = video-1.5 model at 1080p (images: 2k resolution)
  }),

  // Paw Point packs sold as Shopify digital products tagged `paw-points:<n>`
  packs: Object.freeze([
    Object.freeze({ sku: 'PP-100', points: 100, priceCents: 499, handle: 'paw-points-100' }),
    Object.freeze({ sku: 'PP-300', points: 300, priceCents: 1299, handle: 'paw-points-300' }),
    Object.freeze({ sku: 'PP-1000', points: 1000, priceCents: 3499, handle: 'paw-points-1000' }),
  ]),
});

/** Allowed video durations in seconds, ascending. */
export const allowedDurations = Object.freeze(
  Object.keys(RULES.prices.video)
    .map(Number)
    .sort((a, b) => a - b),
);

/** Points → cents (integer). */
export function pointsToCents(points) {
  return Math.max(0, Math.trunc(Number(points) || 0)) * RULES.valueCents;
}

/** Cents → points, rounding down. */
export function centsToPoints(cents) {
  return Math.floor(Math.max(0, Number(cents) || 0) / RULES.valueCents);
}

/** Snap a requested duration to the nearest allowed one (ties go to the longer clip). */
export function nearestDuration(duration) {
  const d = Number(duration);
  if (!Number.isFinite(d)) return allowedDurations[1] ?? allowedDurations[0];
  let best = allowedDurations[0];
  for (const a of allowedDurations) {
    if (Math.abs(a - d) < Math.abs(best - d) || (Math.abs(a - d) === Math.abs(best - d) && a > best)) best = a;
  }
  return best;
}

/**
 * Cost in Paw Points of a generation.
 *   image → 2 (×2 when hd)
 *   video → price of the nearest allowed duration (×2 when hd)
 */
export function generationCost({ kind, duration, hd = false } = {}) {
  let base;
  if (kind === 'image') base = RULES.prices.image;
  else if (kind === 'video') base = RULES.prices.video[nearestDuration(duration)];
  else throw new Error(`Unknown generation kind: ${kind}`);
  return hd ? base * RULES.prices.hdMultiplier : base;
}

/** Points a user may put toward a cart: min(50% of subtotal in points, balance), never negative. */
export function maxRedeemablePoints(subtotalCents, balance) {
  const byCart = Math.floor(((Number(subtotalCents) || 0) * RULES.maxRedeemPercent) / 100 / RULES.valueCents);
  return Math.max(0, Math.min(byCart, Math.max(0, Math.trunc(Number(balance) || 0))));
}

/** Points earned on a paid order's cash subtotal: 1 PP per full dollar. */
export function orderEarnPoints(subtotalCents) {
  return Math.floor(Math.max(0, Number(subtotalCents) || 0) / RULES.earnPerDollarCents);
}

/** Validate a hold request against the rules. Returns { ok, error?, max }. */
export function validateRedeem({ points, subtotalCents, balance }) {
  const max = maxRedeemablePoints(subtotalCents, balance);
  if (!Number.isInteger(points) || points <= 0) return { ok: false, error: 'Points must be a positive integer', max };
  if (points < RULES.minRedeem) return { ok: false, error: `Minimum ${RULES.minRedeem} Paw Points per redemption`, max };
  if (points > balance) return { ok: false, error: 'Not enough Paw Points', max };
  if (points > max) return { ok: false, error: `Maximum ${max} Paw Points (${RULES.maxRedeemPercent}% of subtotal) on this cart`, max };
  return { ok: true, max };
}

/** Find a pack by SKU, handle or points. */
export function findPack({ sku, handle, points } = {}) {
  return RULES.packs.find((p) => (sku && p.sku === sku) || (handle && p.handle === handle) || (points && p.points === Number(points))) || null;
}

/**
 * "Ways to earn" checklist for the Points screen. `user` is a users row (snake_case) or
 * undefined for the generic list; `done` reflects the one-time flags.
 */
export function describeWays(user = {}) {
  const u = user || {};
  return [
    { id: 'welcome', title: 'Join Pawtella', points: RULES.welcomeBonus, done: !!u.bonus_welcome },
    { id: 'profile_pet', title: 'Complete your profile and add your first pet', points: RULES.profilePetBonus, done: !!u.bonus_profile_pet },
    { id: 'first_post', title: 'Share your first post', points: RULES.firstPostBonus, done: !!u.bonus_first_post },
    { id: 'first_order', title: 'Place your first order', points: RULES.firstOrderBonus, done: !!u.bonus_first_order },
    { id: 'order', title: 'Earn 1 Paw Point per $1 spent in the shop', points: 1, done: false, repeatable: true },
    { id: 'review', title: 'Leave a photo review of a product you bought', points: RULES.reviewBonus, done: false, repeatable: true },
    { id: 'referral', title: 'Invite a friend (paid when they make their first creation or order)', points: RULES.referralConversionBonus, done: false, repeatable: true },
    { id: 'share', title: 'Share a creation that brings a friend to Pawtella', points: RULES.shareConversionBonus, done: false, repeatable: true },
    { id: 'challenge', title: 'Win a weekly challenge', points: RULES.challengeWin, done: false, repeatable: true },
    { id: 'birthday', title: "Celebrate your pet's birthday", points: RULES.petBirthdayBonus, done: false, repeatable: true },
    { id: 'buy', title: 'Buy a Paw Points pack', points: RULES.packs[0].points, done: false, repeatable: true },
  ];
}

export default RULES;
