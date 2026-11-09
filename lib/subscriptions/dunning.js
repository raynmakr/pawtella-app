// Billing scheduling + dunning (pure): when is a contract due, and what to do after an attempt.
import { SUB_RULES } from './rules.js';

/** Is this contract due to be billed at `now`? Active + next_billing_at in the past. */
export function isDueForBilling(contract, now = new Date()) {
  if (!contract || contract.status !== 'active') return false;
  const next = contract.nextBillingAt ?? contract.next_billing_at;
  if (!next) return false;
  const t = next instanceof Date ? next.getTime() : new Date(next).getTime();
  return Number.isFinite(t) && t <= now.getTime();
}

/** The next billing date after a successful charge: now + cadence. */
export function advanceBillingDate(weeks, from = new Date()) {
  const base = from instanceof Date ? from.getTime() : new Date(from).getTime();
  return new Date(base + Number(weeks) * 7 * 24 * 60 * 60 * 1000);
}

/**
 * Decide the next step after a billing attempt.
 *   succeeded              → { action: 'success', failures: 0 }
 *   failed, retries left   → { action: 'retry', attemptNumber, retryInDays, failures }
 *   failed, retries used   → { action: 'pause', failures }
 * `failures` is the count of failures BEFORE this attempt.
 */
export function nextDunningStep({ succeeded, failures = 0 } = {}) {
  if (succeeded) return { action: 'success', failures: 0 };
  const newFailures = Number(failures) + 1;
  if (newFailures > SUB_RULES.maxBillingRetries) {
    return { action: 'pause', failures: newFailures };
  }
  const idx = Math.min(newFailures - 1, SUB_RULES.retryIntervalDays.length - 1);
  return {
    action: 'retry',
    attemptNumber: newFailures + 1,
    retryInDays: SUB_RULES.retryIntervalDays[idx],
    failures: newFailures,
  };
}
