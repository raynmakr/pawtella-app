// Subscribe & Save rules: every tunable constant of the subscription economy lives here.
// Pure module: no DB, no HTTP. Mirrors the shape of lib/points-rules.js.

export const SUB_RULES = Object.freeze({
  // Tiered discount. Base applies to every subscription; the higher tier unlocks once a customer's
  // normalized monthly base spend (see lib/subscriptions/tiers.js) strictly exceeds the threshold.
  baseDiscountPercent: 5,
  tierDiscountPercent: 10,
  tierThresholdCents: 10000, // $100.00 CAD / month; "$100 or below" stays at the base tier.

  // 52.14 weeks / 12 months. Used to normalize any cadence to a per-month figure.
  weeksPerMonth: 4.345,

  // Delivery/billing cadences offered, in weeks.
  cadenceWeeks: Object.freeze([2, 4, 6, 8]),

  // Shopify collections that make a product subscribable. Dry vs wet is a sub-classification of the
  // two food collections (see eligibility.js); litter-hygiene is eligible as a whole.
  eligibleCollections: Object.freeze(['dog-food', 'cat-food', 'litter-hygiene']),

  // Dunning: after the first failed billing attempt, retry this many times on this cadence (days),
  // then pause the contract and email the customer. 3 retries over ~7 days.
  maxBillingRetries: 3,
  retryIntervalDays: Object.freeze([2, 3, 2]),

  // Identity of the selling plan group our app creates.
  merchantCode: 'pawtella-subscribe-save',
  groupName: 'Subscribe & Save',
  groupOptionLabel: 'Delivery every',
});

export default SUB_RULES;
