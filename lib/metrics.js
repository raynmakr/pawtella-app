// Growth metrics computed from `events` and state tables. Powers GET /api/admin/metrics and the
// daily digest. Pure reads; cheap enough to run on request for Phase 1 volumes.
import { many, one } from './db.js';
import { RULES, pointsToCents } from './points-rules.js';

const FUNNEL = ['signup', 'pet_added', 'generation_done', 'share_clicked', 'order_paid'];

/** Distinct users per funnel event in the last `days` days, plus step-to-step conversion. */
export async function funnel(days, now = new Date()) {
  const rows = await many(
    `SELECT name, count(DISTINCT user_id)::int AS users
     FROM events WHERE name = ANY($1::text[]) AND created_at > $2::timestamptz - make_interval(days => $3)
     GROUP BY name`,
    [FUNNEL, now, days],
  );
  const byName = Object.fromEntries(rows.map((r) => [r.name, r.users]));
  const steps = FUNNEL.map((name, i) => {
    const users = byName[name] ?? 0;
    const prev = i === 0 ? null : byName[FUNNEL[i - 1]] ?? 0;
    return { step: name, users, conversionFromPrevious: prev ? Math.round((users / prev) * 1000) / 1000 : null };
  });
  return { days, steps };
}

/**
 * K-factor ≈ signups attributed to a share/referral/partner in the period ÷ distinct sharers in
 * the period. >1 means each sharer brings more than one new user.
 */
export async function kFactor(days, now = new Date()) {
  const row = await one(
    `SELECT
       (SELECT count(*)::int FROM users u
         WHERE u.created_at > $1::timestamptz - make_interval(days => $2)
           AND (u.referred_by_user_id IS NOT NULL
                OR EXISTS (SELECT 1 FROM partner_attributions a WHERE a.user_id = u.id AND a.source = 'signup'))) AS attributed_signups,
       (SELECT count(DISTINCT user_id)::int FROM events
         WHERE name = 'share_clicked' AND created_at > $1::timestamptz - make_interval(days => $2)) AS sharers,
       (SELECT count(*)::int FROM users WHERE created_at > $1::timestamptz - make_interval(days => $2)) AS signups`,
    [now, days],
  );
  const k = row.sharers ? Math.round((row.attributed_signups / row.sharers) * 100) / 100 : null;
  return { days, signups: row.signups, attributedSignups: row.attributed_signups, sharers: row.sharers, kFactor: k };
}

/** Points issued / redeemed in the period and total outstanding liability. */
export async function pointsSummary(days, now = new Date()) {
  const row = await one(
    `SELECT
       COALESCE((SELECT sum(amount) FROM point_transactions
          WHERE amount > 0 AND type IN ('earn', 'bonus', 'purchase', 'refund', 'admin')
            AND created_at > $1::timestamptz - make_interval(days => $2)), 0)::int AS issued,
       COALESCE((SELECT -sum(amount) FROM point_transactions
          WHERE amount < 0 AND type IN ('spend', 'hold', 'admin')
            AND created_at > $1::timestamptz - make_interval(days => $2)), 0)::int AS redeemed,
       COALESCE((SELECT sum(amount) FROM point_transactions
          WHERE type = 'expire' AND created_at > $1::timestamptz - make_interval(days => $2)), 0)::int AS expired,
       COALESCE((SELECT sum(paw_points) FROM users WHERE status <> 'deleted'), 0)::bigint AS balance_liability,
       COALESCE((SELECT sum(points) FROM point_holds WHERE status = 'held'), 0)::bigint AS held`,
    [now, days],
  );
  const liability = Number(row.balance_liability) + Number(row.held);
  return {
    days,
    issued: row.issued,
    redeemed: row.redeemed,
    expired: Math.abs(row.expired),
    liability,
    liabilityCents: pointsToCents(liability),
    held: Number(row.held),
    valueCents: RULES.valueCents,
  };
}

/** Share of buyers with 2+ paid orders (all time), plus the same for buyers active in the period. */
export async function repeatPurchase(days, now = new Date()) {
  const row = await one(
    `WITH per_user AS (
       SELECT user_id, count(*)::int AS orders, max(placed_at) AS last_at
       FROM shop_orders WHERE user_id IS NOT NULL AND status NOT IN ('cancelled', 'refunded')
       GROUP BY user_id
     )
     SELECT count(*)::int AS buyers,
            count(*) FILTER (WHERE orders >= 2)::int AS repeat_buyers,
            count(*) FILTER (WHERE last_at > $1::timestamptz - make_interval(days => $2))::int AS buyers_in_period,
            count(*) FILTER (WHERE orders >= 2 AND last_at > $1::timestamptz - make_interval(days => $2))::int AS repeat_in_period
     FROM per_user`,
    [now, days],
  );
  const rate = (a, b) => (b ? Math.round((a / b) * 1000) / 1000 : null);
  return {
    days,
    buyers: row.buyers,
    repeatBuyers: row.repeat_buyers,
    repeatRate: rate(row.repeat_buyers, row.buyers),
    buyersInPeriod: row.buyers_in_period,
    repeatRateInPeriod: rate(row.repeat_in_period, row.buyers_in_period),
  };
}

/** DAU / WAU / MAU from app_open (falls back to any event when app_open is not tracked yet). */
export async function activeUsers(now = new Date()) {
  const row = await one(
    `WITH src AS (
       SELECT user_id, created_at FROM events WHERE user_id IS NOT NULL
         AND name = CASE WHEN EXISTS (SELECT 1 FROM events WHERE name = 'app_open' LIMIT 1) THEN 'app_open' ELSE name END
         AND created_at > $1::timestamptz - interval '30 days'
     )
     SELECT count(DISTINCT user_id) FILTER (WHERE created_at > $1::timestamptz - interval '1 day')::int AS dau,
            count(DISTINCT user_id) FILTER (WHERE created_at > $1::timestamptz - interval '7 days')::int AS wau,
            count(DISTINCT user_id)::int AS mau
     FROM src`,
    [now],
  );
  return { dau: row.dau, wau: row.wau, mau: row.mau, stickiness: row.wau ? Math.round((row.dau / row.wau) * 1000) / 1000 : null };
}

/** Everything GET /api/admin/metrics returns. */
export async function getMetrics({ now = new Date() } = {}) {
  const [f7, f30, k7, k30, p7, p30, r30, active, totals] = await Promise.all([
    funnel(7, now),
    funnel(30, now),
    kFactor(7, now),
    kFactor(30, now),
    pointsSummary(7, now),
    pointsSummary(30, now),
    repeatPurchase(30, now),
    activeUsers(now),
    one(
      `SELECT (SELECT count(*)::int FROM users WHERE status <> 'deleted') AS users,
              (SELECT count(*)::int FROM pets) AS pets,
              (SELECT count(*)::int FROM posts WHERE is_hidden = false) AS posts,
              (SELECT count(*)::int FROM ai_generations WHERE status = 'done') AS generations,
              (SELECT count(*)::int FROM shop_orders WHERE status NOT IN ('cancelled', 'refunded')) AS orders,
              (SELECT COALESCE(sum(subtotal_cents), 0)::bigint FROM shop_orders WHERE status NOT IN ('cancelled', 'refunded')) AS revenue_cents,
              (SELECT count(*)::int FROM partners WHERE status = 'approved') AS partners`,
    ),
  ]);
  return {
    generatedAt: now.toISOString(),
    totals: {
      users: totals.users,
      pets: totals.pets,
      posts: totals.posts,
      generations: totals.generations,
      orders: totals.orders,
      revenueCents: Number(totals.revenue_cents),
      partners: totals.partners,
    },
    funnel: { d7: f7, d30: f30 },
    kFactor: { d7: k7, d30: k30 },
    points: { d7: p7, d30: p30 },
    repeatPurchase: r30,
    active,
  };
}

export default { getMetrics, funnel, kFactor, pointsSummary, repeatPurchase, activeUsers };
