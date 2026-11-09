// Cadence helpers (pure): the delivery/billing frequencies we offer and how to parse/label them.
import { SUB_RULES } from './rules.js';

export function isValidCadence(weeks) {
  return SUB_RULES.cadenceWeeks.includes(Number(weeks));
}

/** Coerce loose input (2 | '2' | 'every 2 weeks' | {weeks:2}) to a supported cadence, else null. */
export function normalizeCadence(input) {
  if (input == null) return null;
  let value = input;
  if (typeof value === 'object') {
    value = value.weeks ?? value.intervalWeeks ?? value.interval_weeks ?? value.intervalCount;
  }
  const m = String(value).match(/\d+/);
  if (!m) return null;
  const weeks = parseInt(m[0], 10);
  return isValidCadence(weeks) ? weeks : null;
}

export function cadenceLabel(weeks) {
  return `Every ${weeks} weeks`;
}

/** Name shown for a selling plan at the given cadence. */
export function planNameForWeeks(weeks) {
  return `Deliver every ${weeks} weeks`;
}

/** Interpret a Shopify recurring billing/delivery policy into whole weeks. */
export function weeksFromBillingPolicy(policy) {
  if (!policy) return null;
  const count = Number(policy.intervalCount ?? policy.interval_count ?? 0);
  const unit = String(policy.interval || '').toUpperCase();
  if (!count) return null;
  if (unit === 'WEEK') return count;
  if (unit === 'DAY') return Math.round(count / 7) || null;
  if (unit === 'MONTH') return count * 4; // approximation; we only create WEEK plans ourselves
  if (unit === 'YEAR') return count * 52;
  return null;
}
