// In-memory mock of the subscription Admin adapter. Same interface as shopify-real.js so the service,
// cron and webhook paths run locally and in tests without a Shopify store. State is per process.
import { SUB_RULES } from './rules.js';

export const isMock = true;

let groups = new Map(); // merchantCode -> { groupId, merchantCode, plans }
let contracts = new Map(); // contractId -> normalized contract
let seq = 1;
export const _calls = []; // recorded mutations, for test assertions

function nextId(type) {
  return `gid://shopify/${type}/mock-${seq++}`;
}

export function __reset() {
  groups = new Map();
  contracts = new Map();
  seq = 1;
  _calls.length = 0;
}

/** Seed a contract (tests). Accepts a normalized contract; fills ids/defaults. */
export function __seedContract(c) {
  const contractId = c.contractId || nextId('SubscriptionContract');
  const normalized = {
    contractId,
    status: c.status || 'active',
    currency: c.currency || 'CAD',
    customerId: c.customerId ?? null,
    intervalWeeks: c.intervalWeeks ?? 4,
    nextBillingAt: c.nextBillingAt ?? null,
    lines: (c.lines || []).map((l, i) => ({
      lineId: l.lineId || `gid://shopify/SubscriptionLine/mock-${contractId}-${i}`,
      title: l.title || 'Mock product',
      quantity: l.quantity ?? 1,
      sku: l.sku ?? null,
      variantId: l.variantId ?? null,
      productId: l.productId ?? null,
      currentPriceCents: l.currentPriceCents ?? l.basePriceCents ?? 0,
      basePriceCents: l.basePriceCents ?? l.currentPriceCents ?? 0,
    })),
  };
  contracts.set(contractId, normalized);
  return normalized;
}

export async function findGroupByMerchantCode(merchantCode = SUB_RULES.merchantCode) {
  return groups.get(merchantCode) || null;
}

export async function createSellingPlanGroup({
  cadences = SUB_RULES.cadenceWeeks,
  merchantCode = SUB_RULES.merchantCode,
} = {}) {
  const group = {
    groupId: nextId('SellingPlanGroup'),
    merchantCode,
    plans: cadences.map((w) => ({ planId: nextId('SellingPlan'), weeks: w })),
  };
  groups.set(merchantCode, group);
  return group;
}

export async function attachProducts(groupId, productIds = []) {
  _calls.push({ op: 'attachProducts', groupId, productIds });
  return { count: productIds.length };
}

export async function getContract(contractId) {
  return contracts.get(contractId) || null;
}

export async function updateLinePrices(contractId, updates = []) {
  _calls.push({ op: 'updateLinePrices', contractId, updates });
  const c = contracts.get(contractId);
  if (c) {
    for (const u of updates) {
      const line = c.lines.find((l) => l.lineId === u.lineId);
      if (line) line.currentPriceCents = u.priceCents;
    }
  }
  return { contractId };
}

export async function createBillingAttempt({ contractId, idempotencyKey }) {
  _calls.push({ op: 'createBillingAttempt', contractId, idempotencyKey });
  const c = contracts.get(contractId);
  // Mock resolves synchronously (no webhook round-trip): success unless a test forced a failure.
  const mockResult = c?._forceFailure
    ? { status: 'failure', errorCode: c._forceFailure, orderId: null }
    : { status: 'success', errorCode: null, orderId: `gid://shopify/Order/mock-${seq++}` };
  return { attemptId: nextId('SubscriptionBillingAttempt'), mockResult };
}

export function __forceFailure(contractId, errorCode = 'PAYMENT_METHOD_DECLINED') {
  const c = contracts.get(contractId);
  if (c) c._forceFailure = errorCode;
}

async function setStatus(contractId, status) {
  _calls.push({ op: status, contractId });
  const c = contracts.get(contractId);
  if (c) c.status = status;
  return { contractId, status };
}

export const pauseContract = (id) => setStatus(id, 'paused');
export const activateContract = (id) => setStatus(id, 'active');
export const cancelContract = (id) => setStatus(id, 'cancelled');

export async function skipNextCycle(contractId) {
  _calls.push({ op: 'skipNextCycle', contractId });
  return { skipped: true };
}

export async function setCadence(contractId, weeks) {
  _calls.push({ op: 'setCadence', contractId, weeks });
  const c = contracts.get(contractId);
  if (c) c.intervalWeeks = weeks;
  return { contractId, intervalWeeks: weeks };
}
