// Subscription orchestration: ties the DB mirror, the Shopify adapter and the pure tier/dunning logic
// together. This is what the API, the webhook and the billing cron call.
import { flags } from '../env.js';
import { withTransaction } from '../db.js';
import { track } from '../events.js';
import { notify } from '../notifications.js';
import * as shopify from './shopify.js';
import * as catalog from '../shopify.js';
import { isProductAvailable } from '../catalog.js';
import * as store from './store.js';
import { customerMonthlyCents, tierForMonthlyCents, discountedPriceCents } from './tiers.js';
import { nextDunningStep, advanceBillingDate } from './dunning.js';
import { SUB_RULES } from './rules.js';

export const isEnabled = () => flags.subscriptionsEnabled;

/** Pull a contract from Shopify, refresh the mirror, then recompute the customer's tier. */
export async function syncContractFromShopify(shopifyContractId) {
  const normalized = await shopify.getContract(shopifyContractId);
  if (!normalized) return null;
  const contract = await store.upsertContractFromShopify(normalized);
  await recomputeAndApplyTier({ userId: contract.user_id, shopifyCustomerId: contract.shopify_customer_id });
  return store.getByShopifyContractId(shopifyContractId);
}

/**
 * Recompute the customer's tier from their active contracts and push the resulting unit prices to any
 * contract whose tier changed. Returns { tier, changed: [shopifyContractId...] }.
 */
export async function recomputeAndApplyTier({ userId, shopifyCustomerId }) {
  const contracts = await store.activeContractsForCustomer({ userId, shopifyCustomerId });
  if (!contracts.length) return { tier: SUB_RULES.baseDiscountPercent, changed: [] };

  const monthly = customerMonthlyCents(
    contracts.map((c) => ({
      status: c.status,
      intervalWeeks: c.interval_weeks,
      lines: c.lines,
    })),
  );
  const tier = tierForMonthlyCents(monthly);
  const changed = [];

  for (const c of contracts) {
    if (Number(c.tier_percent) === tier) continue;
    const lineUpdates = c.lines.map((l) => ({
      lineId: l.shopify_line_id,
      priceCents: discountedPriceCents(l.base_price_cents, tier),
    }));
    await shopify.updateLinePrices(c.shopify_contract_id, lineUpdates);
    await store.applyTierToContract(c.id, tier, lineUpdates);
    changed.push(c.shopify_contract_id);
    await track('subscription_tier_changed', {
      userId: c.user_id,
      props: { contractId: c.id, from: Number(c.tier_percent), to: tier, monthlyCents: Math.round(monthly) },
    });
  }
  return { tier, changed };
}

// ---- Billing ----------------------------------------------------------------------------------

/**
 * Does this contract have at least one in-stock line? Shopify is the source of truth. Lines whose
 * product we can't resolve are treated as available so we never block billing on uncertainty; a
 * contract is "out of stock" only when every resolvable line is out of stock. Used to skip an OOS
 * delivery cycle gracefully instead of charging for something we cannot fulfill.
 */
async function contractHasStock(contract) {
  const lines = contract?.lines || [];
  if (!lines.length) return true;
  let resolved = 0;
  let available = 0;
  for (const line of lines) {
    const handle = line.product_handle;
    if (!handle) continue;
    let product;
    try {
      product = await catalog.getProduct(handle);
    } catch (err) {
      console.warn('[subscriptions] stock lookup failed; treating line as available', { handle, error: err?.message });
      continue;
    }
    if (!product) continue;
    resolved += 1;
    if (isProductAvailable(product)) available += 1;
  }
  if (resolved === 0) return true;
  return available > 0;
}

/** Deterministic key so a re-run of the cron never double-charges the same cycle+attempt. */
function idempotencyKey(contract, attemptNumber) {
  const cycle = contract.next_billing_at ? new Date(contract.next_billing_at).toISOString().slice(0, 10) : 'now';
  return `sub-bill:${contract.shopify_contract_id}:${cycle}:${attemptNumber}`;
}

/** Charge every contract due at `asOf`. Recomputes tier before billing (per the spec). */
export async function processDueBilling({ asOf = new Date(), limit = 200 } = {}) {
  const due = (await store.listDueContracts(asOf)).slice(0, limit);
  const summary = { due: due.length, attempted: 0, succeeded: 0, failed: 0, paused: 0, skipped: 0 };

  for (const contract of due) {
    // Recompute the tier first so this cycle bills at the correct price.
    await recomputeAndApplyTier({ userId: contract.user_id, shopifyCustomerId: contract.shopify_customer_id });

    // Skip an out-of-stock delivery gracefully: don't charge for what we can't fulfill. Advance to
    // the next cycle and tell the customer. (Whole feature is already gated by subscriptionsEnabled.)
    if (!(await contractHasStock(contract))) {
      if (contract.interval_weeks) {
        await store.setNextBilling(contract.id, advanceBillingDate(contract.interval_weeks, new Date(contract.next_billing_at || Date.now())));
      }
      if (contract.user_id) {
        await notify({
          userId: contract.user_id,
          journey: 'subscription_out_of_stock',
          channel: 'email',
          dedupeKey: `subscription_out_of_stock:${contract.id}:${new Date(contract.next_billing_at || Date.now()).toISOString().slice(0, 10)}`,
          title: 'We skipped your Pawtella delivery this time',
          body: 'An item in your subscription is temporarily out of stock, so we skipped this delivery and did not charge you. We will try again next cycle.',
          payload: { contractId: contract.id, reason: 'out_of_stock' },
        }).catch(() => {});
      }
      await track('subscription_skipped', { userId: contract.user_id, props: { contractId: contract.id, reason: 'out_of_stock' } }).catch(() => {});
      summary.skipped += 1;
      continue;
    }

    const attemptNumber = (contract.billing_failures || 0) + 1;
    const key = idempotencyKey(contract, attemptNumber);
    const recorded = await store.recordAttempt({
      contractId: contract.id,
      shopifyContractId: contract.shopify_contract_id,
      idempotencyKey: key,
      attemptNumber,
    });
    if (!recorded) {
      summary.skipped += 1; // already attempted this cycle/attempt
      continue;
    }

    summary.attempted += 1;
    let result;
    try {
      result = await shopify.createBillingAttempt({ contractId: contract.shopify_contract_id, idempotencyKey: key });
    } catch (err) {
      console.error('[subscriptions] billing attempt failed to start', { contractId: contract.id, error: err?.message });
      await store.markAttempt(key, { status: 'failure', errorCode: 'ATTEMPT_START_ERROR' });
      await applyDunning(contract, { succeeded: false, errorCode: 'ATTEMPT_START_ERROR' }, summary);
      continue;
    }
    await track('subscription_billing_attempted', { userId: contract.user_id, props: { contractId: contract.id, attemptNumber } });

    // Real mode: the result arrives later via subscription_billing_attempts/*. Mock mode resolves now.
    if (result?.mockResult) {
      await store.markAttempt(key, {
        shopifyAttemptId: result.attemptId,
        status: result.mockResult.status,
        errorCode: result.mockResult.errorCode,
        shopifyOrderId: result.mockResult.orderId,
      });
      await applyDunning(contract, { succeeded: result.mockResult.status === 'success', errorCode: result.mockResult.errorCode }, summary);
    }
  }
  return summary;
}

/** Apply the dunning state machine after an attempt completes. Shared by cron (mock) and webhook. */
async function applyDunning(contract, { succeeded, errorCode }, summary = {}) {
  const step = nextDunningStep({ succeeded, failures: contract.billing_failures || 0 });
  if (step.action === 'success') {
    await store.setBillingFailures(contract.id, 0, null);
    // Advance to the next cycle. Shopify sets the authoritative date; we project it so the cron
    // won't re-select the contract before the next webhook sync arrives.
    if (contract.interval_weeks) {
      await store.setNextBilling(contract.id, advanceBillingDate(contract.interval_weeks, new Date(contract.next_billing_at || Date.now())));
    }
    await track('subscription_renewed', { userId: contract.user_id, props: { contractId: contract.id } });
    summary.succeeded = (summary.succeeded || 0) + 1;
    return step;
  }
  if (step.action === 'retry') {
    await store.setBillingFailures(contract.id, step.failures, errorCode || null);
    await store.setNextBilling(contract.id, advanceBillingDate(step.retryInDays / 7, new Date()));
    summary.failed = (summary.failed || 0) + 1;
    return step;
  }
  // pause
  await store.setBillingFailures(contract.id, step.failures, errorCode || null);
  await store.setStatus(contract.shopify_contract_id, 'paused');
  try {
    await shopify.pauseContract(contract.shopify_contract_id);
  } catch (err) {
    console.error('[subscriptions] pause after dunning failed', { contractId: contract.id, error: err?.message });
  }
  if (contract.user_id) {
    await notify({
      userId: contract.user_id,
      journey: 'subscription_payment_failed',
      channel: 'email',
      dedupeKey: `subscription_payment_failed:${contract.id}:${new Date().toISOString().slice(0, 10)}`,
      title: 'Your Pawtella subscription is paused',
      body: 'We could not process your subscription payment after several tries, so we paused it. Update your payment method to resume.',
      payload: { contractId: contract.id, errorCode: errorCode || null },
    });
  }
  await track('subscription_paused', { userId: contract.user_id, props: { contractId: contract.id, reason: 'billing_failed', errorCode } });
  summary.paused = (summary.paused || 0) + 1;
  return step;
}

/** Called by the webhook when a billing attempt resolves (real mode). */
export async function handleBillingResult({ shopifyContractId, idempotencyKey, shopifyAttemptId, succeeded, errorCode, shopifyOrderId }) {
  const contract = await store.getByShopifyContractId(shopifyContractId);
  if (!contract) {
    console.warn('[subscriptions] billing result for unknown contract', { shopifyContractId });
    return { ok: false };
  }
  if (idempotencyKey) {
    await store.markAttempt(idempotencyKey, {
      shopifyAttemptId,
      status: succeeded ? 'success' : 'failure',
      errorCode: errorCode || null,
      shopifyOrderId: shopifyOrderId || null,
    });
  }
  await applyDunning(contract, { succeeded, errorCode }, {});
  // Resync so our next_billing_at matches Shopify's authoritative schedule.
  await syncContractFromShopify(shopifyContractId).catch(() => {});
  return { ok: true };
}

// ---- Account actions (authorized by caller via store.getByIdForUser) --------------------------

export async function pauseForUser(contract) {
  await shopify.pauseContract(contract.shopify_contract_id);
  await store.setStatus(contract.shopify_contract_id, 'paused');
  await track('subscription_paused', { userId: contract.user_id, props: { contractId: contract.id, reason: 'user' } });
  return syncContractFromShopify(contract.shopify_contract_id);
}

export async function resumeForUser(contract) {
  await shopify.activateContract(contract.shopify_contract_id);
  await store.setStatus(contract.shopify_contract_id, 'active');
  return syncContractFromShopify(contract.shopify_contract_id);
}

export async function cancelForUser(contract) {
  await shopify.cancelContract(contract.shopify_contract_id);
  await store.setStatus(contract.shopify_contract_id, 'cancelled');
  await track('subscription_cancelled', { userId: contract.user_id, props: { contractId: contract.id } });
  // Cancelling frees up spend → the customer's remaining contracts may drop a tier.
  await recomputeAndApplyTier({ userId: contract.user_id, shopifyCustomerId: contract.shopify_customer_id });
  return syncContractFromShopify(contract.shopify_contract_id);
}

export async function skipNextForUser(contract) {
  await shopify.skipNextCycle(contract.shopify_contract_id, contract.next_billing_at);
  return syncContractFromShopify(contract.shopify_contract_id);
}

export async function changeCadenceForUser(contract, weeks) {
  await shopify.setCadence(contract.shopify_contract_id, weeks);
  await store.setStatus(contract.shopify_contract_id, contract.status); // no-op touch; keep row fresh
  const synced = await syncContractFromShopify(contract.shopify_contract_id);
  // Cadence drives normalized spend → tier may move.
  await recomputeAndApplyTier({ userId: contract.user_id, shopifyCustomerId: contract.shopify_customer_id });
  return synced;
}

/** Shape a contract row (with lines) + the customer's tier progress for the account UI. */
export async function tierProgressForUser(userId) {
  const contracts = await store.activeContractsForCustomer({ userId });
  const monthly = customerMonthlyCents(contracts.map((c) => ({ status: c.status, intervalWeeks: c.interval_weeks, lines: c.lines })));
  const tier = tierForMonthlyCents(monthly);
  return {
    tier,
    monthlyCents: Math.round(monthly),
    thresholdCents: SUB_RULES.tierThresholdCents,
    nextTierPercent: tier < SUB_RULES.tierDiscountPercent ? SUB_RULES.tierDiscountPercent : null,
    toNextTierCents: tier < SUB_RULES.tierDiscountPercent ? Math.max(0, SUB_RULES.tierThresholdCents - Math.round(monthly) + 1) : 0,
  };
}
