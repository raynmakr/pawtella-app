// Partner program rules. All tunables live here; lib/partners.js and the landing page read them.

export const PARTNER_RULES = {
  commissionPercent: 10, // of the referred customer's cash subtotal (after discounts, before tax/shipping)
  commissionMaturityDays: 14, // pending → available (returns window)
  attributionMonths: 12, // how long a referred customer earns commission for the partner
  attributionWindowDaysAfterSignup: 30, // in-app code entry / QR scan allowed this long after signup
  referredCustomerBonus: 10, // Paw Points to the customer when attributed
  tiers: [
    { id: 'bronze', minActive: 0, discountPercent: 10, featured: false, perks: ['10% off supplies', 'Directory listing', 'QR poster kit'] },
    { id: 'silver', minActive: 10, discountPercent: 15, featured: true, perks: ['15% off supplies', 'Featured badge', 'Directory boost'] },
    { id: 'gold', minActive: 50, discountPercent: 20, featured: true, perks: ['20% off supplies', 'Featured badge', 'Co-marketing with Pawtella'] },
  ],
  activeWindowDays: 90, // a referred customer is "active" if they have an event in this window
  redeemPointsCentsPerPoint: 4, // earnings → Paw Points at $0.04/PP (PP is worth $0.05: a 25% boost)
  minPayoutCents: 2500,
  payoutMethods: ['etransfer', 'gift_card'],
  partnerTypes: ['vet', 'groomer', 'walker', 'trainer', 'sitter', 'boarding', 'rescue', 'boutique', 'other'],
};

/** Tier for a count of active referred customers (highest tier whose minActive ≤ count). */
export function tierFor(activeCount) {
  const n = Math.max(0, Number(activeCount) || 0);
  let current = PARTNER_RULES.tiers[0];
  for (const t of PARTNER_RULES.tiers) if (n >= t.minActive) current = t;
  return current;
}

/** The tier after `tier` (id or tier object), or null at the top. */
export function nextTier(tier) {
  const id = typeof tier === 'string' ? tier : tier?.id;
  const idx = PARTNER_RULES.tiers.findIndex((t) => t.id === id);
  if (idx === -1) return PARTNER_RULES.tiers[1] ?? null;
  return PARTNER_RULES.tiers[idx + 1] ?? null;
}

/** Tier object by id (defaults to bronze). */
export function tierById(id) {
  return PARTNER_RULES.tiers.find((t) => t.id === id) ?? PARTNER_RULES.tiers[0];
}

/** Commission in cents for a cash subtotal in cents (floor, never negative). */
export function commissionFor(subtotalCents) {
  const c = Math.max(0, Math.floor(Number(subtotalCents) || 0));
  return Math.floor((c * PARTNER_RULES.commissionPercent) / 100);
}

/** Paw Points a partner gets for redeeming `amountCents` of earnings. */
export function pointsForRedeem(amountCents) {
  return Math.floor(Math.max(0, Number(amountCents) || 0) / PARTNER_RULES.redeemPointsCentsPerPoint);
}

export default PARTNER_RULES;
