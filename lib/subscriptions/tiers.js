// Tier engine (pure): normalize subscription spend to a per-month figure and decide the discount tier.
//
// A customer's tier is driven by the sum, across their ACTIVE contracts, of each line's BASE
// (pre-discount) price * quantity, normalized to a month by the line's cadence. Using the base price
// — not the already-discounted price — keeps the tier stable: applying the 10% tier can never pull a
// customer back below the threshold and oscillate them to 5% and back.
import { SUB_RULES } from './rules.js';

/** Normalize one recurring line's cost to cents-per-month. 0 for an invalid cadence. */
export function lineMonthlyCents({ priceCents, quantity = 1, weeks }) {
  const w = Number(weeks);
  if (!Number.isFinite(w) || w <= 0) return 0;
  const n = (Number(priceCents) || 0) * (Number(quantity) || 0) * (SUB_RULES.weeksPerMonth / w);
  return Number.isFinite(n) ? n : 0;
}

/** Normalized monthly base spend for a single contract: sum of its lines. */
export function contractMonthlyCents(contract = {}) {
  const weeks = contract.intervalWeeks ?? contract.interval_weeks;
  const lines = contract.lines || [];
  let sum = 0;
  for (const l of lines) {
    const priceCents = l.basePriceCents ?? l.base_price_cents ?? 0;
    const quantity = l.quantity ?? 1;
    sum += lineMonthlyCents({ priceCents, quantity, weeks });
  }
  return sum;
}

/** Normalized monthly base spend across a customer's active contracts. */
export function customerMonthlyCents(contracts = []) {
  return contracts
    .filter((c) => (c.status ?? 'active') === 'active')
    .reduce((acc, c) => acc + contractMonthlyCents(c), 0);
}

/** Discount tier (percent) for a normalized monthly spend. Strictly above the threshold → high tier. */
export function tierForMonthlyCents(monthlyCents) {
  return Number(monthlyCents) > SUB_RULES.tierThresholdCents
    ? SUB_RULES.tierDiscountPercent
    : SUB_RULES.baseDiscountPercent;
}

/** The discount tier a customer qualifies for, given all of their contracts. */
export function tierForCustomer(contracts = []) {
  return tierForMonthlyCents(customerMonthlyCents(contracts));
}

/** Unit price (integer cents) for a base price at a given discount percent. */
export function discountedPriceCents(basePriceCents, tierPercent) {
  const base = Number(basePriceCents) || 0;
  const pct = Number(tierPercent) || 0;
  return Math.round((base * (100 - pct)) / 100);
}
