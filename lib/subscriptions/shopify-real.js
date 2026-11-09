// Shopify Admin adapter for app-managed subscriptions (API version env.shopify.apiVersion, 2026-10).
//
// Our app owns these contracts, so we both create the selling plans and trigger billing ourselves.
// Tier pricing is applied with the SubscriptionDraft flow:
//   subscriptionContractUpdate(contractId) -> { draft }
//   subscriptionDraftLineUpdate(draftId, lineId, { currentPrice }) per line
//   subscriptionDraftCommit(draftId)
// NOTE: in 2026-10 the SubscriptionDraft mutations are marked deprecated in favour of the newer
// SubscriptionContractCalculation API (subscriptionContractUpdateCalculate ->
// subscriptionContractCalculationCommit). The draft flow still works; updateLinePrices() is the single
// place to swap implementations if/when we migrate. See docs/SUBSCRIPTIONS.md.
import { admin, gid, gidNumber, moneyToCents, centsToMoney } from '../shopify-client.js';
import { SUB_RULES } from './rules.js';
import { planNameForWeeks } from './cadence.js';

export const isMock = false;

const MONEY = '{ amount currencyCode }';

// ---- Selling plan group (setup) --------------------------------------------------------------

function sellingPlanInput(weeks, basePercent) {
  return {
    name: planNameForWeeks(weeks),
    options: `${weeks} weeks`,
    category: 'SUBSCRIPTION',
    billingPolicy: { recurring: { interval: 'WEEK', intervalCount: weeks } },
    deliveryPolicy: { recurring: { interval: 'WEEK', intervalCount: weeks, preAnchorBehavior: 'ASAP' } },
    pricingPolicies: [{ fixed: { adjustmentType: 'PERCENTAGE', adjustmentValue: { percentage: basePercent } } }],
  };
}

/** Find an existing group by merchant code, or null. Keeps the setup script idempotent. */
export async function findGroupByMerchantCode(merchantCode = SUB_RULES.merchantCode) {
  const data = await admin(
    /* GraphQL */ `
      query Groups($q: String!) {
        sellingPlanGroups(first: 20, query: $q) {
          nodes {
            id
            merchantCode
            sellingPlans(first: 20) {
              nodes {
                id
                billingPolicy { ... on SellingPlanRecurringBillingPolicy { interval intervalCount } }
              }
            }
          }
        }
      }
    `,
    { q: `merchant_code:${merchantCode}` },
  );
  const node = (data.sellingPlanGroups?.nodes || []).find((g) => g.merchantCode === merchantCode);
  return node ? normalizeGroup(node) : null;
}

function normalizeGroup(node) {
  return {
    groupId: node.id,
    merchantCode: node.merchantCode,
    plans: (node.sellingPlans?.nodes || []).map((p) => ({
      planId: p.id,
      weeks: p.billingPolicy?.intervalCount ?? null,
    })),
  };
}

/** Create the Subscribe & Save group with one plan per cadence. */
export async function createSellingPlanGroup({
  cadences = SUB_RULES.cadenceWeeks,
  basePercent = SUB_RULES.baseDiscountPercent,
  merchantCode = SUB_RULES.merchantCode,
  groupName = SUB_RULES.groupName,
} = {}) {
  const data = await admin(
    /* GraphQL */ `
      mutation CreateGroup($input: SellingPlanGroupInput!) {
        sellingPlanGroupCreate(input: $input) {
          sellingPlanGroup {
            id
            merchantCode
            sellingPlans(first: 20) {
              nodes { id billingPolicy { ... on SellingPlanRecurringBillingPolicy { interval intervalCount } } }
            }
          }
          userErrors { field message }
        }
      }
    `,
    {
      input: {
        name: groupName,
        merchantCode,
        options: [SUB_RULES.groupOptionLabel],
        sellingPlansToCreate: cadences.map((w) => sellingPlanInput(w, basePercent)),
      },
    },
  );
  return normalizeGroup(data.sellingPlanGroupCreate.sellingPlanGroup);
}

/** Attach the group to products (idempotent on Shopify's side). */
export async function attachProducts(groupId, productIds = []) {
  if (!productIds.length) return { count: 0 };
  const data = await admin(
    /* GraphQL */ `
      mutation AddProducts($id: ID!, $productIds: [ID!]!) {
        sellingPlanGroupAddProducts(id: $id, productIds: $productIds) {
          sellingPlanGroup { id productCount }
          userErrors { field message }
        }
      }
    `,
    { id: gid('SellingPlanGroup', groupId), productIds: productIds.map((p) => gid('Product', p)) },
  );
  return { count: data.sellingPlanGroupAddProducts.sellingPlanGroup?.productCount ?? productIds.length };
}

// ---- Contract read -----------------------------------------------------------------------------

/** Fetch and normalize a contract. Subscription webhooks are thin, so we always re-read from Admin. */
export async function getContract(contractId) {
  const data = await admin(
    /* GraphQL */ `
      query Contract($id: ID!) {
        subscriptionContract(id: $id) {
          id
          status
          currencyCode
          nextBillingDate
          customer { id }
          billingPolicy { interval intervalCount }
          lines(first: 50) {
            nodes {
              id
              title
              quantity
              sku
              variantId
              productId
              currentPrice ${MONEY}
              pricingPolicy { basePrice ${MONEY} }
            }
          }
        }
      }
    `,
    { id: gid('SubscriptionContract', contractId) },
  );
  return normalizeContract(data.subscriptionContract);
}

export function normalizeContract(c) {
  if (!c) return null;
  return {
    contractId: c.id,
    status: String(c.status || '').toLowerCase(), // ACTIVE/PAUSED/CANCELLED/EXPIRED/FAILED
    currency: c.currencyCode || 'CAD',
    customerId: c.customer?.id ? gidNumber(c.customer.id) : null,
    intervalWeeks: c.billingPolicy?.interval === 'WEEK' ? c.billingPolicy.intervalCount : null,
    nextBillingAt: c.nextBillingDate || null,
    lines: (c.lines?.nodes || []).map((l) => ({
      lineId: l.id,
      title: l.title || '',
      quantity: l.quantity ?? 1,
      sku: l.sku || null,
      variantId: l.variantId ? gidNumber(l.variantId) : null,
      productId: l.productId ? gidNumber(l.productId) : null,
      currentPriceCents: moneyToCents(l.currentPrice?.amount),
      basePriceCents: moneyToCents(l.pricingPolicy?.basePrice?.amount ?? l.currentPrice?.amount),
    })),
  };
}

// ---- Tier pricing (draft flow) ----------------------------------------------------------------

/** Set per-line unit prices via the draft flow. `updates`: [{ lineId, priceCents }]. */
export async function updateLinePrices(contractId, updates = []) {
  if (!updates.length) return { contractId };
  const begin = await admin(
    /* GraphQL */ `
      mutation Begin($contractId: ID!) {
        subscriptionContractUpdate(contractId: $contractId) {
          draft { id }
          userErrors { field message }
        }
      }
    `,
    { contractId: gid('SubscriptionContract', contractId) },
  );
  const draftId = begin.subscriptionContractUpdate.draft?.id;
  if (!draftId) throw new Error('subscriptionContractUpdate returned no draft');

  for (const u of updates) {
    await admin(
      /* GraphQL */ `
        mutation LineUpdate($draftId: ID!, $lineId: ID!, $input: SubscriptionLineUpdateInput!) {
          subscriptionDraftLineUpdate(draftId: $draftId, lineId: $lineId, input: $input) {
            lineUpdated { id }
            userErrors { field message }
          }
        }
      `,
      { draftId, lineId: u.lineId, input: { currentPrice: centsToMoney(u.priceCents) } },
    );
  }

  const commit = await admin(
    /* GraphQL */ `
      mutation Commit($draftId: ID!) {
        subscriptionDraftCommit(draftId: $draftId) {
          contract { id }
          userErrors { field message }
        }
      }
    `,
    { draftId },
  );
  return { contractId: commit.subscriptionDraftCommit.contract?.id || contractId };
}

// ---- Billing -----------------------------------------------------------------------------------

/** Trigger a billing attempt. The outcome arrives asynchronously via subscription_billing_attempts/*. */
export async function createBillingAttempt({ contractId, idempotencyKey, originTime }) {
  const data = await admin(
    /* GraphQL */ `
      mutation Bill($contractId: ID!, $input: SubscriptionBillingAttemptInput!) {
        subscriptionBillingAttemptCreate(subscriptionContractId: $contractId, subscriptionBillingAttemptInput: $input) {
          subscriptionBillingAttempt { id }
          userErrors { field message code }
        }
      }
    `,
    {
      contractId: gid('SubscriptionContract', contractId),
      input: { idempotencyKey, ...(originTime ? { originTime } : {}) },
    },
  );
  return { attemptId: data.subscriptionBillingAttemptCreate.subscriptionBillingAttempt?.id || null };
}

// ---- Account actions ---------------------------------------------------------------------------
// Isolated wrappers; verify against the live store during activation (see docs/SUBSCRIPTIONS.md).

async function simpleContractMutation(field, contractId) {
  const data = await admin(
    /* GraphQL */ `
      mutation ${field}($id: ID!) {
        ${field}(subscriptionContractId: $id) {
          contract { id status }
          userErrors { field message }
        }
      }
    `,
    { id: gid('SubscriptionContract', contractId) },
  );
  return normalizeStatus(data[field]?.contract);
}

function normalizeStatus(contract) {
  return { contractId: contract?.id || null, status: String(contract?.status || '').toLowerCase() };
}

export const pauseContract = (id) => simpleContractMutation('subscriptionContractPause', id);
export const activateContract = (id) => simpleContractMutation('subscriptionContractActivate', id);
export const cancelContract = (id) => simpleContractMutation('subscriptionContractCancel', id);

/** Skip the next billing cycle (dated by the contract's next billing date). */
export async function skipNextCycle(contractId, nextBillingAt) {
  const data = await admin(
    /* GraphQL */ `
      mutation Skip($contractId: ID!, $date: DateTime!) {
        subscriptionBillingCycleSkip(billingCycleInput: { contractId: $contractId, selector: { date: $date } }) {
          billingCycle { skipped }
          userErrors { field message }
        }
      }
    `,
    { contractId: gid('SubscriptionContract', contractId), date: nextBillingAt },
  );
  return { skipped: !!data.subscriptionBillingCycleSkip.billingCycle?.skipped };
}

/** Change the delivery/billing cadence via the draft flow. */
export async function setCadence(contractId, weeks) {
  const begin = await admin(
    /* GraphQL */ `
      mutation Begin($contractId: ID!) {
        subscriptionContractUpdate(contractId: $contractId) { draft { id } userErrors { field message } }
      }
    `,
    { contractId: gid('SubscriptionContract', contractId) },
  );
  const draftId = begin.subscriptionContractUpdate.draft?.id;
  if (!draftId) throw new Error('subscriptionContractUpdate returned no draft');
  await admin(
    /* GraphQL */ `
      mutation DraftUpdate($draftId: ID!, $input: SubscriptionDraftInput!) {
        subscriptionDraftUpdate(draftId: $draftId, input: $input) {
          draft { id }
          userErrors { field message }
        }
      }
    `,
    {
      draftId,
      input: {
        billingPolicy: { interval: 'WEEK', intervalCount: weeks },
        deliveryPolicy: { interval: 'WEEK', intervalCount: weeks },
      },
    },
  );
  const commit = await admin(
    /* GraphQL */ `
      mutation Commit($draftId: ID!) {
        subscriptionDraftCommit(draftId: $draftId) { contract { id } userErrors { field message } }
      }
    `,
    { draftId },
  );
  return { contractId: commit.subscriptionDraftCommit.contract?.id || contractId, intervalWeeks: weeks };
}
