// DB mirror for subscriptions: read/write subscription_contracts, subscription_lines,
// subscription_billing_attempts and selling_plan_groups. Shopify stays the system of record; these
// rows are a queryable projection kept in sync by webhooks. snake_case in, camelCase out via camelize.
import { query, one, many, withTransaction } from '../db.js';
import { camelize } from '../serialize.js';
import { contractMonthlyCents } from './tiers.js';

// ---- Selling plans ----------------------------------------------------------------------------

export async function saveSellingPlanGroup(group) {
  for (const plan of group.plans) {
    if (plan.weeks == null) continue;
    await query(
      `INSERT INTO selling_plan_groups (shopify_group_id, merchant_code, shopify_plan_id, interval_weeks, base_percent)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (shopify_plan_id) DO UPDATE SET
         shopify_group_id = EXCLUDED.shopify_group_id,
         merchant_code = EXCLUDED.merchant_code,
         interval_weeks = EXCLUDED.interval_weeks,
         base_percent = EXCLUDED.base_percent`,
      [group.groupId, group.merchantCode, plan.planId, plan.weeks, group.basePercent ?? 5],
    );
  }
}

export async function listSellingPlans() {
  return camelize(await many('SELECT * FROM selling_plan_groups ORDER BY interval_weeks'));
}

// ---- Contract reads ---------------------------------------------------------------------------

async function attachLines(rows) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const lines = await many('SELECT * FROM subscription_lines WHERE contract_id = ANY($1) ORDER BY id', [ids]);
  const byContract = new Map(rows.map((r) => [r.id, []]));
  for (const l of lines) byContract.get(l.contract_id)?.push(l);
  return rows.map((r) => ({ ...r, lines: byContract.get(r.id) || [] }));
}

export async function getByShopifyContractId(shopifyContractId) {
  const row = await one('SELECT * FROM subscription_contracts WHERE shopify_contract_id = $1', [shopifyContractId]);
  if (!row) return null;
  return (await attachLines([row]))[0];
}

export async function getByIdForUser(id, userId) {
  const row = await one('SELECT * FROM subscription_contracts WHERE id = $1 AND user_id = $2', [id, userId]);
  if (!row) return null;
  return (await attachLines([row]))[0];
}

export async function listByUser(userId) {
  const rows = await many(
    `SELECT * FROM subscription_contracts WHERE user_id = $1 ORDER BY
       CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, created_at DESC`,
    [userId],
  );
  return attachLines(rows);
}

/** Active contracts (with lines) for a customer, used by the tier engine. */
export async function activeContractsForCustomer({ userId, shopifyCustomerId }) {
  const rows = await many(
    `SELECT * FROM subscription_contracts
      WHERE status = 'active' AND (
        ($1::int IS NOT NULL AND user_id = $1) OR
        ($2::text IS NOT NULL AND shopify_customer_id = $2)
      )`,
    [userId ?? null, shopifyCustomerId ?? null],
  );
  return attachLines(rows);
}

// ---- Contract writes --------------------------------------------------------------------------

/** Resolve a Pawtella user id from a Shopify customer id. */
async function resolveUserId(tx, shopifyCustomerId) {
  if (!shopifyCustomerId) return null;
  const u = await tx.one('SELECT id FROM users WHERE shopify_customer_id = $1', [String(shopifyCustomerId)]);
  return u?.id ?? null;
}

/**
 * Insert or update a contract + its lines from a normalized Shopify contract. Preserves the locally
 * tracked tier_percent/billing_failures (those are driven by our own engine, not the sync).
 */
export async function upsertContractFromShopify(normalized, { tx } = {}) {
  const run = async (t) => {
    const existing = await t.one('SELECT * FROM subscription_contracts WHERE shopify_contract_id = $1 FOR UPDATE', [
      normalized.contractId,
    ]);
    const userId = existing?.user_id ?? (await resolveUserId(t, normalized.customerId));
    const monthlyCents = Math.round(
      contractMonthlyCents({ intervalWeeks: normalized.intervalWeeks, lines: normalized.lines }),
    );
    let contract;
    if (!existing) {
      contract = await t.one(
        `INSERT INTO subscription_contracts
           (user_id, shopify_contract_id, shopify_customer_id, status, interval_weeks,
            monthly_value_cents, currency, next_billing_at, raw)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING *`,
        [
          userId,
          normalized.contractId,
          normalized.customerId,
          normalized.status || 'active',
          normalized.intervalWeeks,
          monthlyCents,
          normalized.currency || 'CAD',
          normalized.nextBillingAt,
          JSON.stringify(normalized.raw ?? normalized),
        ],
      );
    } else {
      contract = await t.one(
        `UPDATE subscription_contracts SET
           user_id = COALESCE(user_id, $2),
           shopify_customer_id = COALESCE($3, shopify_customer_id),
           status = $4, interval_weeks = $5, monthly_value_cents = $6,
           currency = $7, next_billing_at = $8, raw = $9::jsonb
         WHERE id = $1 RETURNING *`,
        [
          existing.id,
          userId,
          normalized.customerId,
          normalized.status || existing.status,
          normalized.intervalWeeks,
          monthlyCents,
          normalized.currency || existing.currency,
          normalized.nextBillingAt,
          JSON.stringify(normalized.raw ?? normalized),
        ],
      );
    }
    // Replace lines (idempotent on shopify_line_id).
    for (const l of normalized.lines) {
      await t.query(
        `INSERT INTO subscription_lines
           (contract_id, shopify_line_id, variant_id, product_id, product_handle, title, sku,
            quantity, base_price_cents, current_price_cents)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (contract_id, shopify_line_id) DO UPDATE SET
           variant_id = EXCLUDED.variant_id, product_id = EXCLUDED.product_id,
           product_handle = EXCLUDED.product_handle, title = EXCLUDED.title, sku = EXCLUDED.sku,
           quantity = EXCLUDED.quantity, base_price_cents = EXCLUDED.base_price_cents,
           current_price_cents = EXCLUDED.current_price_cents`,
        [
          contract.id,
          l.lineId,
          l.variantId,
          l.productId,
          l.productHandle ?? l.handle ?? null,
          l.title,
          l.sku,
          l.quantity ?? 1,
          l.basePriceCents ?? 0,
          l.currentPriceCents ?? 0,
        ],
      );
    }
    return (await attachLinesTx(t, [contract]))[0];
  };
  return tx ? run(tx) : withTransaction(run);
}

async function attachLinesTx(t, rows) {
  const ids = rows.map((r) => r.id);
  const lines = await t.many('SELECT * FROM subscription_lines WHERE contract_id = ANY($1) ORDER BY id', [ids]);
  const byContract = new Map(rows.map((r) => [r.id, []]));
  for (const l of lines) byContract.get(l.contract_id)?.push(l);
  return rows.map((r) => ({ ...r, lines: byContract.get(r.id) || [] }));
}

/** Persist a tier change: update tier_percent and each line's current_price_cents. */
export async function applyTierToContract(contractId, tierPercent, lineUpdates = [], { tx } = {}) {
  const run = async (t) => {
    await t.query('UPDATE subscription_contracts SET tier_percent = $2 WHERE id = $1', [contractId, tierPercent]);
    for (const u of lineUpdates) {
      await t.query('UPDATE subscription_lines SET current_price_cents = $3 WHERE contract_id = $1 AND shopify_line_id = $2', [
        contractId,
        u.lineId,
        u.priceCents,
      ]);
    }
  };
  return tx ? run(tx) : withTransaction(run);
}

export async function setStatus(shopifyContractId, status) {
  return one('UPDATE subscription_contracts SET status = $2 WHERE shopify_contract_id = $1 RETURNING *', [
    shopifyContractId,
    status,
  ]);
}

export async function setNextBilling(contractId, nextBillingAt) {
  return query('UPDATE subscription_contracts SET next_billing_at = $2 WHERE id = $1', [contractId, nextBillingAt]);
}

export async function setBillingFailures(contractId, failures, lastError = null) {
  return query('UPDATE subscription_contracts SET billing_failures = $2, last_billing_error = $3 WHERE id = $1', [
    contractId,
    failures,
    lastError,
  ]);
}

/** Contracts due for billing at `asOf` (active + next_billing_at in the past). */
export async function listDueContracts(asOf = new Date()) {
  const rows = await many(
    `SELECT * FROM subscription_contracts WHERE status = 'active' AND next_billing_at IS NOT NULL AND next_billing_at <= $1
      ORDER BY next_billing_at`,
    [asOf],
  );
  return attachLines(rows);
}

// ---- Billing attempts -------------------------------------------------------------------------

/** Record a pending attempt. Returns null if the idempotency key already exists (already attempted). */
export async function recordAttempt({ contractId, shopifyContractId, idempotencyKey, attemptNumber = 1 }) {
  const row = await one(
    `INSERT INTO subscription_billing_attempts (contract_id, shopify_contract_id, idempotency_key, attempt_number)
     VALUES ($1,$2,$3,$4) ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`,
    [contractId, shopifyContractId, idempotencyKey, attemptNumber],
  );
  return row;
}

export async function markAttempt(idempotencyKey, { shopifyAttemptId, status, errorCode = null, shopifyOrderId = null }) {
  return one(
    `UPDATE subscription_billing_attempts
       SET status = $2, shopify_attempt_id = COALESCE($3, shopify_attempt_id),
           error_code = $4, shopify_order_id = $5, completed_at = now()
     WHERE idempotency_key = $1 RETURNING *`,
    [idempotencyKey, status, shopifyAttemptId, errorCode, shopifyOrderId],
  );
}

export { camelize };
