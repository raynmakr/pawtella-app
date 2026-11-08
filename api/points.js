// Paw Points: GET /api/points, GET /api/points/transactions, POST /api/points/hold,
// DELETE /api/points/hold/:id, GET /api/points/packs
import { route, segments, body, badRequest, notFound, forbidden, pagination, ApiError } from '../lib/http.js';
import * as shopify from '../lib/shopify.js';
import { one } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';
import { camelize } from '../lib/serialize.js';
import { RULES, describeWays, maxRedeemablePoints, validateRedeem } from '../lib/points-rules.js';
import { getBalance, listTransactions, createHold, releaseHold } from '../lib/points.js';

function rulesSummary() {
  return {
    valueCents: RULES.valueCents,
    minRedeem: RULES.minRedeem,
    maxRedeemPercent: RULES.maxRedeemPercent,
    holdHours: RULES.holdHours,
    expiryMonths: RULES.expiryEnabled ? RULES.expiryMonths : null,
    dailyGenerationCap: RULES.dailyGenerationCap,
    earnPerDollarCents: RULES.earnPerDollarCents,
    prices: RULES.prices,
  };
}

function toApiHold(row) {
  if (!row) return null;
  const { cart, ...rest } = row;
  const h = camelize(rest);
  return { ...h, cart: cart || undefined };
}

export default route({
  GET: async (req) => {
    const { userId } = await requireAuth(req);
    const [first] = segments(req, '/api/points');

    if (!first) {
      const user = await one('SELECT * FROM users WHERE id = $1', [userId]);
      if (!user) throw notFound('User not found');
      const balance = await getBalance(userId);
      return {
        balance: balance.pawPoints,
        lifetimeEarned: balance.lifetimeEarned,
        held: balance.held,
        valueCents: RULES.valueCents,
        balanceCents: balance.pawPoints * RULES.valueCents,
        rules: rulesSummary(),
        ways: describeWays(user),
        packs: RULES.packs,
        lastActivityAt: user.points_last_activity_at,
      };
    }
    if (first === 'transactions') {
      const { page, limit } = pagination(req);
      return listTransactions(userId, { page, limit });
    }
    if (first === 'packs') {
      return { packs: RULES.packs, valueCents: RULES.valueCents };
    }
    if (first === 'hold') {
      const rows = await one(
        `SELECT COALESCE(json_agg(h ORDER BY h.created_at DESC), '[]'::json) AS holds FROM point_holds h WHERE h.user_id = $1 AND h.status = 'held'`,
        [userId],
      );
      return { holds: camelize(rows?.holds ?? []) };
    }
    throw notFound();
  },

  POST: async (req) => {
    const { userId } = await requireAuth(req);
    const [first] = segments(req, '/api/points');
    if (first !== 'hold') throw notFound();
    const b = body(req);
    if (!b.cartId || typeof b.cartId !== 'string') throw badRequest('cartId is required');
    const points = Number(b.points);
    if (!Number.isInteger(points) || points <= 0) throw badRequest('points must be a positive integer');

    // One active hold per cart: a new amount replaces the previous hold. Validate against the cart
    // first (counting the points the old hold would give back) so a rejected change keeps the old hold.
    const existing = await one(`SELECT id, points FROM point_holds WHERE user_id = $1 AND cart_id = $2 AND status = 'held'`, [userId, b.cartId]);
    if (typeof shopify.cartGet === 'function') {
      const cart = await shopify.cartGet(b.cartId);
      if (!cart) throw notFound('Cart not found');
      const current = await getBalance(userId);
      const check = validateRedeem({ points, subtotalCents: cart.subtotalCents ?? 0, balance: current.pawPoints + (existing?.points ?? 0) });
      if (!check.ok) {
        if (check.error === 'Not enough Paw Points') throw new ApiError(402, check.error, { needed: points, balance: current.pawPoints + (existing?.points ?? 0) });
        throw badRequest(check.error, { max: check.max });
      }
    }
    if (existing) await releaseHold(existing.id);

    const hold = await createHold(userId, { cartId: b.cartId, points });
    const balance = await getBalance(userId);
    const api = toApiHold(hold);
    return {
      hold: { ...api, cart: undefined },
      cart: api.cart ?? null,
      balance: balance.pawPoints,
      maxRedeemable: maxRedeemablePoints(api.cart?.subtotalCents ?? 0, balance.pawPoints + points),
    };
  },

  DELETE: async (req) => {
    const { userId } = await requireAuth(req);
    const [first, id] = segments(req, '/api/points');
    if (first !== 'hold' || !id) throw notFound();
    const hold = await one('SELECT * FROM point_holds WHERE id = $1', [parseInt(id, 10) || 0]);
    if (!hold) throw notFound('Hold not found');
    if (hold.user_id !== userId) throw forbidden();
    if (hold.status !== 'held') throw badRequest(`Hold already ${hold.status}`);
    const released = await releaseHold(hold.id);
    const balance = await getBalance(userId);
    return { hold: camelize(released), balance: balance.pawPoints };
  },
});
