// Paw Points ledger. Balance lives on users.paw_points; every movement is a point_transactions
// row with balance_after. Every read-modify-write locks the user row (SELECT ... FOR UPDATE)
// inside a transaction, including the one-time flag check in awardOnce (the closet's race).
// Owner: Backend B. Contract in docs/CONVENTIONS.md.
import crypto from 'node:crypto';
import { query, one, many, withTransaction } from './db.js';
import { ApiError, badRequest, notFound } from './http.js';
import { camelize } from './serialize.js';
import { track, EVENT } from './events.js';
import * as shopify from './shopify.js';
import { RULES, pointsToCents, validateRedeem, orderEarnPoints } from './points-rules.js';

const CREDIT_TYPES = new Set(['earn', 'bonus', 'purchase', 'refund', 'admin', 'release']);
const LIFETIME_TYPES = new Set(['earn', 'bonus', 'purchase']);
const DEBIT_TYPES = new Set(['spend', 'hold', 'expire', 'admin']);
const FLAG_COLUMNS = new Set([
  'bonus_welcome',
  'bonus_profile_pet',
  'bonus_first_post',
  'bonus_first_order',
  'bonus_first_creation',
]);

/** Run `fn(tx)` inside the caller's transaction when given, else in a new one. */
function inTx(tx, fn) {
  return tx ? fn(tx) : withTransaction(fn);
}

function assertPositiveInt(amount, what = 'Amount') {
  if (!Number.isInteger(amount) || amount <= 0) throw badRequest(`${what} must be a positive integer`);
}

async function insertTx(tx, { userId, amount, type, source, refType, refId, balanceAfter, description, metadata }) {
  const row = await tx.one(
    `INSERT INTO point_transactions (user_id, amount, type, source, ref_type, ref_id, balance_after, description, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     RETURNING *`,
    [
      userId,
      amount,
      type,
      source || 'unknown',
      refType ?? null,
      refId === undefined || refId === null ? null : String(refId),
      balanceAfter,
      description ?? null,
      JSON.stringify(metadata ?? {}),
    ],
  );
  return row;
}

/** Lock the user row and return it (throws 404 when missing). */
async function lockUser(tx, userId) {
  const user = await tx.one('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId]);
  if (!user) throw notFound('User not found');
  return user;
}

/** Credit `amount` points (positive). Internal: handles every credit type including 'release'. */
async function credit(tx, userId, amount, { type = 'earn', source, refType, refId, description, metadata } = {}) {
  assertPositiveInt(amount);
  if (!CREDIT_TYPES.has(type)) throw badRequest(`Invalid credit type: ${type}`);
  const user = await lockUser(tx, userId);
  const balanceAfter = user.paw_points + amount;
  const lifetime = LIFETIME_TYPES.has(type) ? amount : 0;
  await tx.query(
    `UPDATE users
        SET paw_points = $2,
            points_lifetime_earned = points_lifetime_earned + $3,
            points_last_activity_at = now()
      WHERE id = $1`,
    [userId, balanceAfter, lifetime],
  );
  const row = await insertTx(tx, { userId, amount, type, source, refType, refId, balanceAfter, description, metadata });
  return { balanceAfter, transactionId: row.id };
}

/** Debit `amount` points (positive number, stored negative). Throws 402 when short. */
async function debit(tx, userId, amount, { type = 'spend', source, refType, refId, description, metadata } = {}) {
  assertPositiveInt(amount);
  if (!DEBIT_TYPES.has(type)) throw badRequest(`Invalid debit type: ${type}`);
  const user = await lockUser(tx, userId);
  if (user.paw_points < amount) {
    throw new ApiError(402, 'Not enough Paw Points', { needed: amount, balance: user.paw_points });
  }
  const balanceAfter = user.paw_points - amount;
  await tx.query('UPDATE users SET paw_points = $2, points_last_activity_at = now() WHERE id = $1', [userId, balanceAfter]);
  const row = await insertTx(tx, { userId, amount: -amount, type, source, refType, refId, balanceAfter, description, metadata });
  return { balanceAfter, transactionId: row.id };
}

// ------------------------------------------------------------------------------------------------
// Public API
// ------------------------------------------------------------------------------------------------

/** Balance summary. `held` is the sum of points in active holds. */
export async function getBalance(userId, tx) {
  const run = tx ? tx.one : one;
  const row = await run(
    `SELECT u.paw_points, u.points_lifetime_earned,
            COALESCE((SELECT SUM(points) FROM point_holds h WHERE h.user_id = u.id AND h.status = 'held'), 0)::int AS held
       FROM users u WHERE u.id = $1`,
    [userId],
  );
  if (!row) throw notFound('User not found');
  return { pawPoints: row.paw_points, lifetimeEarned: row.points_lifetime_earned, held: row.held };
}

/**
 * Award points. type ∈ earn|bonus|purchase|refund|admin. Positive earn/bonus/purchase also
 * increase points_lifetime_earned.
 */
export async function awardPoints(userId, amount, opts = {}, tx) {
  const type = opts.type || 'earn';
  if (type === 'release') throw badRequest('Use releaseHold for releases');
  return inTx(tx, async (t) => {
    const result = await credit(t, userId, amount, { ...opts, type });
    await track(EVENT.points_awarded, { userId, props: { amount, type, source: opts.source, refType: opts.refType, refId: opts.refId } }, t);
    return result;
  });
}

/**
 * Award once per user, keyed on a boolean flag column of `users`. The flag check and the award
 * run in one transaction with the user row locked, so concurrent calls can't double-award.
 */
export async function awardOnce(userId, flagColumn, amount, opts = {}, tx) {
  if (!FLAG_COLUMNS.has(flagColumn)) throw new Error(`awardOnce: unknown flag column ${flagColumn}`);
  assertPositiveInt(amount);
  return inTx(tx, async (t) => {
    const user = await lockUser(t, userId);
    if (user[flagColumn]) return { awarded: false, balanceAfter: user.paw_points };
    await t.query(`UPDATE users SET ${flagColumn} = true WHERE id = $1`, [userId]);
    const result = await credit(t, userId, amount, { type: 'bonus', ...opts });
    await track(EVENT.points_awarded, { userId, props: { amount, type: 'bonus', source: opts.source, flag: flagColumn } }, t);
    return { awarded: true, ...result };
  });
}

/** Spend points (AI generations etc.). Throws ApiError(402, 'Not enough Paw Points', { needed, balance }). */
export async function spendPoints(userId, amount, opts = {}, tx) {
  return inTx(tx, async (t) => {
    const result = await debit(t, userId, amount, { ...opts, type: 'spend' });
    await track(EVENT.points_spent, { userId, props: { amount, source: opts.source, refType: opts.refType, refId: opts.refId } }, t);
    return result;
  });
}

// ------------------------------------------------------------------------------------------------
// Store holds (points → single-use Shopify discount code)
// ------------------------------------------------------------------------------------------------

function mintCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  let s = '';
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return `PAW-${s}`;
}

/** Fallback cart when lib/shopify.js (Backend C) doesn't expose cart functions yet. */
async function loadCart(cartId) {
  if (typeof shopify.cartGet === 'function') {
    const cart = await shopify.cartGet(cartId);
    if (!cart) throw notFound('Cart not found');
    return cart;
  }
  console.warn('[points] shopify.cartGet missing (stub); using placeholder cart');
  return { id: cartId, checkoutUrl: null, lines: [], subtotalCents: 0, totalCents: 0, discountCodes: [], currency: 'CAD' };
}

async function applyCodeToCart(cartId, code) {
  if (typeof shopify.cartDiscountCodesUpdate === 'function') return shopify.cartDiscountCodesUpdate(cartId, [code]);
  console.warn('[points] shopify.cartDiscountCodesUpdate missing (stub); skipping');
  return null;
}

/**
 * Reserve `points` against a cart: validates the rules, mints a single-use fixed-amount discount
 * code (points × $0.05) and debits the balance (type 'hold'). Returns the hold row (snake_case)
 * with an extra `cart` property (updated cart from Shopify, or null).
 */
export async function createHold(userId, { cartId, points, subtotalCents, currency, customerId } = {}) {
  if (!cartId) throw badRequest('cartId is required');
  if (!Number.isInteger(points) || points <= 0) throw badRequest('points must be a positive integer');

  let cart = null;
  if (subtotalCents === undefined || subtotalCents === null) {
    cart = await loadCart(cartId);
    subtotalCents = cart.subtotalCents ?? 0;
    currency = currency || cart.currency;
  }
  currency = currency || 'CAD';

  const amountCents = pointsToCents(points);
  const code = mintCode();
  const expiresAt = new Date(Date.now() + RULES.holdHours * 3600 * 1000);
  let discount = null;

  try {
    const hold = await withTransaction(async (tx) => {
      const user = await lockUser(tx, userId);
      const check = validateRedeem({ points, subtotalCents, balance: user.paw_points });
      if (!check.ok) {
        if (check.error === 'Not enough Paw Points') throw new ApiError(402, check.error, { needed: points, balance: user.paw_points });
        throw badRequest(check.error, { max: check.max });
      }
      discount = await shopify.createDiscountCode({
        code,
        amountCents,
        customerId: customerId || user.shopify_customer_id || undefined,
        usageLimit: 1,
        endsAt: expiresAt.toISOString(),
        title: `Paw Points: ${points} PP ($${(amountCents / 100).toFixed(2)}) for user ${userId}`,
      });
      const row = await tx.one(
        `INSERT INTO point_holds (user_id, cart_id, points, discount_cents, currency, discount_code, shopify_discount_id, status, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'held', $8) RETURNING *`,
        [userId, cartId, points, amountCents, currency, code, discount?.id ?? null, expiresAt],
      );
      await debit(tx, userId, points, {
        type: 'hold',
        source: 'store_discount',
        refType: 'hold',
        refId: row.id,
        description: `Reserved ${points} Paw Points for a $${(amountCents / 100).toFixed(2)} store discount`,
        metadata: { code, cartId },
      });
      await track(EVENT.hold_created, { userId, props: { holdId: row.id, points, amountCents, cartId } }, tx);
      return row;
    });
    const updatedCart = await applyCodeToCart(cartId, code);
    console.log('[points] hold created', { holdId: hold.id, userId, points });
    return { ...hold, cart: updatedCart || cart };
  } catch (err) {
    // The DB rolled back; make sure a minted code can't be used.
    if (discount?.id && typeof shopify.deactivateDiscountCode === 'function') {
      try {
        await shopify.deactivateDiscountCode(discount.id);
      } catch (e) {
        console.error('[points] failed to deactivate orphan discount code', { code, error: e.message });
      }
    }
    throw err;
  }
}

/**
 * The order with `discountCode` was paid: mark the hold captured, write a 'spend' ledger row
 * (amount 0: the hold already debited) and link the order. Returns the hold or null.
 */
export async function captureHold(discountCode, { orderId } = {}, tx) {
  if (!discountCode) return null;
  return inTx(tx, async (t) => {
    const hold = await t.one(`SELECT * FROM point_holds WHERE upper(discount_code) = upper($1) FOR UPDATE`, [discountCode]);
    if (!hold || hold.status !== 'held') return hold?.status === 'captured' ? hold : null;
    const updated = await t.one(
      `UPDATE point_holds SET status = 'captured', order_id = COALESCE($2, order_id) WHERE id = $1 RETURNING *`,
      [hold.id, orderId ?? null],
    );
    const user = await lockUser(t, hold.user_id);
    await t.query('UPDATE users SET points_last_activity_at = now() WHERE id = $1', [hold.user_id]);
    await insertTx(t, {
      userId: hold.user_id,
      amount: 0,
      type: 'spend',
      source: 'store_discount',
      refType: 'order',
      refId: orderId ?? hold.id,
      balanceAfter: user.paw_points,
      description: `Redeemed ${hold.points} Paw Points ($${(hold.discount_cents / 100).toFixed(2)}) on an order`,
      metadata: { holdId: hold.id, points: hold.points, code: hold.discount_code },
    });
    if (orderId) {
      await t.query('UPDATE shop_orders SET points_redeemed = points_redeemed + $2 WHERE id = $1', [orderId, hold.points]);
    }
    await track(EVENT.points_spent, { userId: hold.user_id, props: { amount: hold.points, source: 'store_discount', holdId: hold.id, orderId } }, t);
    return updated;
  });
}

/** Give the points back (type 'release') and deactivate the Shopify code. Returns the hold or null. */
export async function releaseHold(holdId, tx) {
  const released = await inTx(tx, async (t) => {
    const hold = await t.one('SELECT * FROM point_holds WHERE id = $1 FOR UPDATE', [holdId]);
    if (!hold || hold.status !== 'held') return null;
    const updated = await t.one(`UPDATE point_holds SET status = 'released' WHERE id = $1 RETURNING *`, [holdId]);
    await credit(t, hold.user_id, hold.points, {
      type: 'release',
      source: 'store_discount',
      refType: 'hold',
      refId: hold.id,
      description: `Released ${hold.points} Paw Points from an unused store discount`,
      metadata: { code: hold.discount_code },
    });
    return updated;
  });
  if (released?.shopify_discount_id && typeof shopify.deactivateDiscountCode === 'function') {
    try {
      await shopify.deactivateDiscountCode(released.shopify_discount_id);
    } catch (err) {
      console.error('[points] deactivateDiscountCode failed', { holdId, error: err.message });
    }
  }
  return released;
}

/** Release every hold past its expiry. Returns the count. */
export async function releaseExpiredHolds() {
  const rows = await many(`SELECT id FROM point_holds WHERE status = 'held' AND expires_at < now() ORDER BY id`);
  let count = 0;
  for (const { id } of rows) {
    try {
      if (await releaseHold(id)) count++;
    } catch (err) {
      console.error('[points] releaseExpiredHolds failed for hold', { id, error: err.message });
    }
  }
  return count;
}

// ------------------------------------------------------------------------------------------------
// Orders, packs, generations, expiry
// ------------------------------------------------------------------------------------------------

/**
 * Award 1 PP per $1 of the order's cash subtotal (floor(subtotal_cents / 100)) plus the first-order
 * bonus. Idempotent per order. `order` is a shop_orders row. Returns the points earned.
 */
export async function awardOrderPoints(order, tx) {
  if (!order?.user_id) return 0;
  return inTx(tx, async (t) => {
    const existing = await t.one(
      `SELECT id FROM point_transactions WHERE type = 'earn' AND source = 'order' AND ref_type = 'order' AND ref_id = $1 LIMIT 1`,
      [String(order.id)],
    );
    if (existing) return order.points_earned ?? 0;
    const points = orderEarnPoints(order.subtotal_cents);
    if (points > 0) {
      await credit(t, order.user_id, points, {
        type: 'earn',
        source: 'order',
        refType: 'order',
        refId: order.id,
        description: `Earned ${points} Paw Points on order ${order.order_number ? '#' + order.order_number : ''}`.trim(),
        metadata: { subtotalCents: order.subtotal_cents, shopifyOrderId: order.shopify_order_id },
      });
      await track(EVENT.points_awarded, { userId: order.user_id, props: { amount: points, type: 'earn', source: 'order', orderId: order.id } }, t);
      await t.query('UPDATE shop_orders SET points_earned = $2 WHERE id = $1', [order.id, points]);
    }
    await awardOnce(
      order.user_id,
      'bonus_first_order',
      RULES.firstOrderBonus,
      { source: 'first_order', refType: 'order', refId: order.id, description: 'First order bonus' },
      t,
    );
    return points;
  });
}

/** A Paw Points pack was bought in `orderId`: credit the points (type 'purchase'). */
export async function grantPackPoints(userId, points, { orderId } = {}, tx) {
  return inTx(tx, async (t) => {
    const result = await credit(t, userId, points, {
      type: 'purchase',
      source: 'pack',
      refType: 'order',
      refId: orderId,
      description: `Bought a ${points} Paw Points pack`,
    });
    if (orderId) {
      await t.query('UPDATE shop_orders SET pack_points_granted = pack_points_granted + $2 WHERE id = $1', [orderId, points]);
    }
    await track(EVENT.pack_purchased, { userId, props: { points, orderId } }, t);
    return result;
  });
}

/** Refund whatever a generation charged and hasn't refunded yet (type 'refund'). Returns the refunded amount. */
export async function refundGeneration(generationId, tx) {
  return inTx(tx, async (t) => {
    const gen = await t.one('SELECT * FROM ai_generations WHERE id = $1 FOR UPDATE', [generationId]);
    if (!gen) return 0;
    const amount = gen.points_charged - gen.points_refunded;
    if (amount <= 0) return 0;
    await credit(t, gen.user_id, amount, {
      type: 'refund',
      source: gen.kind === 'video' ? 'ai_video' : 'ai_image',
      refType: 'generation',
      refId: gen.id,
      description: `Refund for a failed ${gen.kind} creation`,
    });
    await t.query('UPDATE ai_generations SET points_refunded = points_refunded + $2 WHERE id = $1', [gen.id, amount]);
    return amount;
  });
}

/** Expire all points of users inactive for RULES.expiryMonths. Returns the number of users expired. */
export async function expireInactivePoints() {
  if (!RULES.expiryEnabled) return 0;
  const rows = await many(
    `SELECT id FROM users WHERE paw_points > 0 AND points_last_activity_at < now() - ($1 || ' months')::interval ORDER BY id`,
    [String(RULES.expiryMonths)],
  );
  let count = 0;
  for (const { id } of rows) {
    try {
      await withTransaction(async (tx) => {
        const user = await lockUser(tx, id);
        // Re-check under lock: an award since the SELECT resets the clock.
        const stale = await tx.one(
          `SELECT 1 FROM users WHERE id = $1 AND paw_points > 0 AND points_last_activity_at < now() - ($2 || ' months')::interval`,
          [id, String(RULES.expiryMonths)],
        );
        if (!stale) return;
        await debit(tx, id, user.paw_points, {
          type: 'expire',
          source: 'inactivity',
          description: `${user.paw_points} Paw Points expired after ${RULES.expiryMonths} months of inactivity`,
        });
        count++;
      });
    } catch (err) {
      console.error('[points] expire failed', { userId: id, error: err.message });
    }
  }
  return count;
}

// ------------------------------------------------------------------------------------------------
// History
// ------------------------------------------------------------------------------------------------

const SOURCE_LABELS = {
  welcome: 'Welcome bonus',
  referral: 'Referral reward',
  referral_signup: 'Joined with a friend’s link',
  share: 'Share reward',
  first_order: 'First order bonus',
  first_post: 'First post bonus',
  profile_pet: 'Profile and first pet bonus',
  order: 'Shop order',
  pack: 'Paw Points pack',
  ai_image: 'AI image',
  ai_video: 'AI video',
  store_discount: 'Store discount',
  challenge: 'Challenge',
  review: 'Product review',
  birthday: 'Pet birthday',
  partner_redeem: 'Partner earnings',
  partner: 'Partner welcome bonus',
  inactivity: 'Inactivity',
  admin: 'Adjustment',
};

export function describeTransaction(row) {
  if (row.description) return row.description;
  const label = SOURCE_LABELS[row.source] || row.source || 'Paw Points';
  const abs = Math.abs(row.amount);
  switch (row.type) {
    case 'earn':
      return `Earned ${abs} Paw Points · ${label}`;
    case 'bonus':
      return `${label}: +${abs} Paw Points`;
    case 'purchase':
      return `Bought ${abs} Paw Points`;
    case 'refund':
      return `Refund of ${abs} Paw Points · ${label}`;
    case 'spend':
      return abs ? `Spent ${abs} Paw Points · ${label}` : `Redeemed Paw Points · ${label}`;
    case 'hold':
      return `Reserved ${abs} Paw Points for a store discount`;
    case 'release':
      return `Released ${abs} Paw Points back to your balance`;
    case 'expire':
      return `${abs} Paw Points expired`;
    case 'admin':
      return `${row.amount >= 0 ? '+' : '-'}${abs} Paw Points · ${label}`;
    default:
      return label;
  }
}

/** Paginated ledger with human descriptions. */
export async function listTransactions(userId, { page = 1, limit = 20 } = {}) {
  const lim = Math.min(50, Math.max(1, limit | 0));
  const offset = (Math.max(1, page | 0) - 1) * lim;
  const rows = await many(
    `SELECT id, amount, type, source, ref_type, ref_id, balance_after, description, metadata, created_at
       FROM point_transactions WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`,
    [userId, lim + 1, offset],
  );
  const hasMore = rows.length > lim;
  const transactions = rows.slice(0, lim).map((r) => ({ ...camelize(r), description: describeTransaction(r) }));
  return { transactions, page: Math.max(1, page | 0), limit: lim, hasMore };
}

/** Admin: direct adjustment (positive or negative). */
export async function adminAdjust(userId, amount, { reason, adminId } = {}, tx) {
  if (!Number.isInteger(amount) || amount === 0) throw badRequest('amount must be a non-zero integer');
  const opts = { type: 'admin', source: 'admin', description: reason || 'Adjustment', metadata: { adminId } };
  return inTx(tx, (t) => (amount > 0 ? credit(t, userId, amount, opts) : debit(t, userId, -amount, opts)));
}

