// Lifecycle automation: code-defined journeys evaluated against `events` + state tables.
// Each journey selects candidate rows, builds a notification, and notify() dedupes it, so
// runAutomations() is idempotent: re-running it never creates a second row for the same key.
//
//   import { runAutomations, JOURNEYS } from '../lib/automation.js';
//   const summary = await runAutomations();  // { journeys: { welcome_d0: 3, ... }, delivered }
//
// Time-based journeys live here. Event-driven ones (generation_ready, back_in_stock,
// challenge_won, partner_applied/approved/tier_up, password_reset) are sent by their owners via
// notify() with the matching template name; see lib/email-templates.js.
import { many, one, query } from './db.js';
import { env, flags } from './env.js';
import { notify, deliverQueued } from './notifications.js';
import { awardPoints } from './points.js';
import { RULES } from './points-rules.js';
import * as claude from './claude.js';

const tz = () => env.timezone || 'America/Toronto';
const app = (path = '') => `${env.appUrl}${path}`;

/** "YYYY-MM-DD" and { year, month, day } of `date` in the app timezone. */
export function localDate(date = new Date(), timeZone = tz()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (t) => Number(parts.find((p) => p.type === t)?.value);
  const year = get('year');
  const month = get('month');
  const day = get('day');
  return { iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, year, month, day };
}

const firstName = (row) => (row.display_name || row.handle || 'there').split(' ')[0];
const dayDiff = (later, earlier) => Math.max(0, Math.ceil((new Date(later) - new Date(earlier)) / 86_400_000));

/** Users who signed up within [from, to) hours ago, with their event time. */
function signupWindow(fromHours, toHours) {
  return (now) =>
    many(
      `SELECT DISTINCT ON (u.id) u.id AS user_id, u.display_name, u.handle, u.paw_points, e.created_at AS signed_up_at,
              (SELECT name FROM pets p WHERE p.user_id = u.id ORDER BY is_primary DESC, id ASC LIMIT 1) AS pet_name
       FROM events e
       JOIN users u ON u.id = e.user_id
       WHERE e.name = 'signup' AND u.status = 'active'
         AND e.created_at <= $1::timestamptz - make_interval(hours => $2)
         AND e.created_at >  $1::timestamptz - make_interval(hours => $3)
       ORDER BY u.id, e.created_at DESC`,
      [now, fromHours, toHours],
    );
}

/**
 * Journey rule shape:
 *   id          journey name (also the email template name)
 *   channels    ['email', 'inapp'] etc.
 *   select(now) → rows with at least user_id (+ vars)
 *   dedupeKey(row, now) → base key; the channel is appended
 *   build(row, now) → { title, body, payload } (may be async)
 *   onCreated?(row, now) → side effects once per row (points awards), guarded by its own dedupe
 *   when?(now) → boolean gate (e.g. only on the 1st of the month)
 */
export const JOURNEYS = [
  {
    id: 'welcome_d0',
    channels: ['email', 'inapp'],
    select: signupWindow(0, 24),
    dedupeKey: (r) => `welcome_d0:user:${r.user_id}`,
    build: (r) => ({
      title: `Welcome, ${firstName(r)}`,
      body: `You have ${r.paw_points} Paw Points. Make your first creation in the studio.`,
      payload: { name: r.display_name, pawPoints: r.paw_points, url: app('/studio') },
    }),
  },
  {
    id: 'welcome_d1',
    channels: ['email', 'inapp'],
    select: signupWindow(24, 48),
    dedupeKey: (r) => `welcome_d1:user:${r.user_id}`,
    build: (r) => ({
      title: 'Two quick tips',
      body: 'Add your pet so the studio and assistant know them, then ask the assistant anything.',
      payload: { name: r.display_name, url: app('/pets/new') },
    }),
  },
  {
    id: 'welcome_d3',
    channels: ['email', 'inapp'],
    select: async (now) => {
      const rows = await signupWindow(72, 96)(now);
      if (!rows.length) return rows;
      const challenge = await one(
        `SELECT id, title, description, reward_points, runner_up_points, ends_at FROM challenges
         WHERE status = 'active' AND starts_at <= $1 AND ends_at > $1 ORDER BY ends_at ASC LIMIT 1`,
        [now],
      );
      return rows.map((r) => ({ ...r, challenge }));
    },
    dedupeKey: (r) => `welcome_d3:user:${r.user_id}`,
    build: (r) => {
      const c = r.challenge;
      return {
        title: c ? `Challenge of the week: ${c.title}` : 'Challenge of the week',
        body: c ? `Enter with one creation. Winner takes ${c.reward_points} Paw Points.` : 'A new theme every week, with Paw Points for the most-liked entry.',
        payload: {
          name: r.display_name,
          challenge: c
            ? { id: c.id, title: c.title, description: c.description, rewardPoints: c.reward_points, runnerUpPoints: c.runner_up_points, endsAt: c.ends_at }
            : null,
          url: c ? app(`/challenges/${c.id}`) : app('/challenges'),
        },
      };
    },
  },
  {
    id: 'first_creation_nudge',
    channels: ['email', 'inapp'],
    // Signed up 48h–14d ago and never started a generation. The upper bound keeps the scan small;
    // the dedupe key makes it once per user anyway.
    select: (now) =>
      many(
        `SELECT DISTINCT ON (u.id) u.id AS user_id, u.display_name, u.handle, u.paw_points,
                (SELECT name FROM pets p WHERE p.user_id = u.id ORDER BY is_primary DESC, id ASC LIMIT 1) AS pet_name
         FROM events e JOIN users u ON u.id = e.user_id
         WHERE e.name = 'signup' AND u.status = 'active'
           AND e.created_at <= $1::timestamptz - interval '48 hours'
           AND e.created_at >  $1::timestamptz - interval '14 days'
           AND NOT EXISTS (SELECT 1 FROM ai_generations g WHERE g.user_id = u.id)
         ORDER BY u.id, e.created_at DESC`,
        [now],
      ),
    dedupeKey: (r) => `first_creation_nudge:user:${r.user_id}`,
    build: (r) => ({
      title: 'Your first creation is on us',
      body: `${r.paw_points} Paw Points are waiting. Pick a photo and a style.`,
      payload: { name: r.display_name, petName: r.pet_name, pawPoints: r.paw_points, url: app('/studio') },
    }),
  },
  {
    id: 'pet_birthday',
    channels: ['email', 'inapp'],
    select: (now) => {
      const { month, day, year } = localDate(now);
      return many(
        `SELECT p.id AS pet_id, p.name AS pet_name, p.species, p.birthday, u.id AS user_id, u.display_name, u.handle,
                $3::int - EXTRACT(YEAR FROM p.birthday)::int AS age
         FROM pets p JOIN users u ON u.id = p.user_id
         WHERE u.status = 'active' AND p.birthday IS NOT NULL
           AND EXTRACT(MONTH FROM p.birthday) = $1 AND EXTRACT(DAY FROM p.birthday) = $2`,
        [month, day, year],
      ).then((rows) => rows.map((r) => ({ ...r, year })));
    },
    dedupeKey: (r) => `pet_birthday:pet:${r.pet_id}:${r.year}`,
    build: (r) => ({
      title: `Happy birthday, ${r.pet_name}`,
      body: `We added ${RULES.petBirthdayBonus} Paw Points to celebrate.`,
      payload: {
        petId: r.pet_id,
        petName: r.pet_name,
        species: r.species,
        age: r.age > 0 ? r.age : null,
        bonusPoints: RULES.petBirthdayBonus,
        url: app('/studio?preset=birthday'),
      },
    }),
    onCreated: async (r) => {
      const refId = `birthday:${r.pet_id}:${r.year}`;
      const dup = await one(`SELECT 1 FROM point_transactions WHERE ref_type = 'pet_birthday' AND ref_id = $1 LIMIT 1`, [refId]);
      if (dup) return;
      await awardPoints(r.user_id, RULES.petBirthdayBonus, {
        type: 'bonus',
        source: 'birthday',
        refType: 'pet_birthday',
        refId,
        description: `${r.pet_name}'s birthday`,
        metadata: { petId: r.pet_id, year: r.year },
      });
    },
  },
  {
    id: 'replenishment',
    channels: ['email', 'inapp'],
    // ≥2 orders containing the same SKU → average interval → due date − 5 days.
    select: (now) =>
      many(
        `WITH lines AS (
           SELECT o.user_id, o.id AS order_id, o.placed_at, li->>'sku' AS sku, li->>'title' AS title, li->>'handle' AS handle
           FROM shop_orders o, jsonb_array_elements(o.line_items) li
           WHERE o.user_id IS NOT NULL AND o.status NOT IN ('cancelled', 'refunded')
             AND COALESCE(li->>'sku', '') <> ''
         ), agg AS (
           SELECT user_id, sku, count(DISTINCT order_id)::int AS orders, min(placed_at) AS first_at, max(placed_at) AS last_at,
                  (array_agg(title ORDER BY placed_at DESC))[1] AS title,
                  (array_agg(handle ORDER BY placed_at DESC))[1] AS handle,
                  (array_agg(order_id ORDER BY placed_at DESC))[1] AS last_order_id
           FROM lines GROUP BY user_id, sku
           HAVING count(DISTINCT order_id) >= 2 AND max(placed_at) > min(placed_at)
         ), est AS (
           SELECT *, (last_at - first_at) / (orders - 1) AS cycle FROM agg
         )
         SELECT e.user_id, e.sku, e.orders, e.title, e.handle, e.last_order_id, e.last_at,
                EXTRACT(EPOCH FROM e.cycle) / 86400 AS interval_days,
                e.last_at + e.cycle AS runs_out_at,
                u.display_name, u.handle AS user_handle,
                (SELECT name FROM pets p WHERE p.user_id = u.id ORDER BY is_primary DESC, id ASC LIMIT 1) AS pet_name,
                (SELECT weight_kg FROM pets p WHERE p.user_id = u.id ORDER BY is_primary DESC, id ASC LIMIT 1) AS pet_weight_kg
         FROM est e JOIN users u ON u.id = e.user_id
         WHERE u.status = 'active'
           AND e.last_at + e.cycle - interval '5 days' <= $1::timestamptz
           AND e.last_at + e.cycle > $1::timestamptz - interval '7 days'`,
        [now],
      ),
    dedupeKey: (r) => `replenishment:user:${r.user_id}:sku:${r.sku}:order:${r.last_order_id}`,
    build: async (r, now) => {
      let daysLeft = dayDiff(r.runs_out_at, now);
      if (flags.hasClaude && !claude.isMock) {
        try {
          const est = await claude.json({
            system: 'You estimate pet supply consumption. Answer with JSON only.',
            prompt: `A customer reorders SKU "${r.sku}" (${r.title || 'pet supply'}) every ${Number(r.interval_days).toFixed(1)} days on average (${r.orders} orders). Their pet weighs ${r.pet_weight_kg ?? 'unknown'} kg. The last order was ${dayDiff(now, r.last_at)} days ago. Estimate how many days of supply remain.`,
            schema: { type: 'object', properties: { daysLeft: { type: 'integer' } }, required: ['daysLeft'] },
          });
          if (Number.isInteger(est?.daysLeft) && est.daysLeft >= 0 && est.daysLeft <= 60) daysLeft = est.daysLeft;
        } catch (err) {
          console.warn('[automation] claude estimate failed, using interval math', { error: err?.message });
        }
      }
      const url = r.handle ? app(`/shop/product/${r.handle}`) : app('/shop');
      return {
        title: `Running low on ${r.title || r.sku}?`,
        body: `About ${daysLeft} day${daysLeft === 1 ? '' : 's'} left, going by your past orders.`,
        payload: { sku: r.sku, title: r.title, handle: r.handle, petName: r.pet_name, daysLeft, intervalDays: Math.round(Number(r.interval_days)), reorderUrl: url, url },
      };
    },
  },
  {
    id: 'winback_30d',
    channels: ['email', 'inapp'],
    select: (now) =>
      many(
        `WITH activity AS (
           SELECT u.id AS user_id, u.display_name, u.handle, u.paw_points,
                  GREATEST(COALESCE(u.last_seen_at, u.created_at),
                           COALESCE((SELECT max(created_at) FROM events e WHERE e.user_id = u.id), u.created_at)) AS last_active_at,
                  (SELECT name FROM pets p WHERE p.user_id = u.id ORDER BY is_primary DESC, id ASC LIMIT 1) AS pet_name
           FROM users u WHERE u.status = 'active'
         )
         SELECT * FROM activity a
         WHERE a.last_active_at <= $1::timestamptz - interval '30 days'
           AND a.last_active_at >  $1::timestamptz - interval '45 days'
           AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id = a.user_id AND n.journey = 'winback_30d'
                             AND n.created_at > $1::timestamptz - interval '60 days')`,
        [now],
      ),
    dedupeKey: (r) => `winback_30d:user:${r.user_id}:${new Date(r.last_active_at).toISOString().slice(0, 10)}`,
    build: (r) => ({
      title: `We added ${RULES.winbackBonus ?? 15} Paw Points for you`,
      body: 'It has been a while. New styles and a weekly challenge are waiting.',
      payload: { name: r.display_name, petName: r.pet_name, offerPoints: RULES.winbackBonus ?? 15, pawPoints: r.paw_points + (RULES.winbackBonus ?? 15), url: app('/') },
    }),
    onCreated: async (r) => {
      const refId = `winback:${r.user_id}:${new Date(r.last_active_at).toISOString().slice(0, 10)}`;
      const dup = await one(`SELECT 1 FROM point_transactions WHERE ref_type = 'winback' AND ref_id = $1 LIMIT 1`, [refId]);
      if (dup) return;
      await awardPoints(r.user_id, RULES.winbackBonus ?? 15, { type: 'bonus', source: 'winback', refType: 'winback', refId, description: 'Welcome back bonus' });
      // awardPoints bumps points_last_activity_at; the win-back itself must not count as activity
      // for the inactivity clock, so we restore the previous value.
      await query(`UPDATE users SET points_last_activity_at = LEAST(points_last_activity_at, $2) WHERE id = $1`, [r.user_id, r.last_active_at]);
    },
  },
  {
    id: 'points_expiring_30d',
    channels: ['email', 'inapp'],
    when: () => RULES.expiryEnabled !== false,
    select: (now) =>
      many(
        `SELECT u.id AS user_id, u.display_name, u.handle, u.paw_points, u.points_last_activity_at,
                u.points_last_activity_at + make_interval(months => $2) AS expires_at
         FROM users u
         WHERE u.status = 'active' AND u.paw_points > 0
           AND u.points_last_activity_at <= $1::timestamptz - make_interval(months => $2) + interval '30 days'
           AND u.points_last_activity_at >  $1::timestamptz - make_interval(months => $2) + interval '15 days'`,
        [now, RULES.expiryMonths ?? 12],
      ),
    dedupeKey: (r) => `points_expiring_30d:user:${r.user_id}:${new Date(r.points_last_activity_at).toISOString().slice(0, 10)}`,
    build: (r) => ({
      title: `${r.paw_points} Paw Points expire in 30 days`,
      body: 'Any activity keeps them: make a creation or use a few on supplies.',
      payload: {
        pawPoints: r.paw_points,
        expiresOn: new Date(r.expires_at).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', timeZone: tz() }),
        url: app('/points'),
      },
    }),
  },
  {
    id: 'post_purchase_review_request',
    channels: ['email', 'inapp'],
    select: (now) =>
      many(
        `SELECT o.id AS order_id, o.order_number, o.user_id, o.line_items, u.display_name, u.handle,
                (SELECT name FROM pets p WHERE p.user_id = u.id ORDER BY is_primary DESC, id ASC LIMIT 1) AS pet_name
         FROM shop_orders o JOIN users u ON u.id = o.user_id
         WHERE u.status = 'active' AND o.status IN ('delivered', 'picked_up')
           AND o.updated_at <= $1::timestamptz - interval '3 days'
           AND o.updated_at >  $1::timestamptz - interval '5 days'
           AND NOT EXISTS (SELECT 1 FROM product_reviews r WHERE r.order_id = o.id)`,
        [now],
      ),
    dedupeKey: (r) => `post_purchase_review_request:order:${r.order_id}`,
    build: (r) => {
      const first = Array.isArray(r.line_items) ? r.line_items[0] : null;
      return {
        title: 'How did it go?',
        body: `Leave a photo review of your order and earn ${RULES.reviewBonus} Paw Points.`,
        payload: { orderId: r.order_id, orderNumber: r.order_number, title: first?.title, handle: first?.handle, petName: r.pet_name, bonusPoints: RULES.reviewBonus, url: app(`/shop/order/${r.order_id}`) },
      };
    },
  },
  {
    id: 'abandoned_hold',
    channels: ['email', 'inapp'],
    select: (now) =>
      many(
        `SELECT h.id AS hold_id, h.user_id, h.points, h.discount_cents, h.currency, h.expires_at, h.cart_id, u.display_name, u.handle
         FROM point_holds h JOIN users u ON u.id = h.user_id
         WHERE h.status = 'held' AND u.status = 'active'
           AND h.created_at <= $1::timestamptz - interval '2 hours'
           AND h.created_at >  $1::timestamptz - interval '24 hours'`,
        [now],
      ),
    dedupeKey: (r) => `abandoned_hold:hold:${r.hold_id}`,
    build: (r) => ({
      title: 'Your cart is waiting',
      body: `${r.points} Paw Points are still holding your discount. Finish checkout when you are ready.`,
      payload: { holdId: r.hold_id, points: r.points, discountCents: r.discount_cents, currency: r.currency, expiresAt: r.expires_at, cartId: r.cart_id, url: app('/shop/cart') },
    }),
  },
  {
    id: 'partner_inactive_60d',
    channels: ['email', 'inapp'],
    select: (now) =>
      many(
        `SELECT p.id AS partner_id, p.business_name, p.owner_user_id AS user_id, u.display_name, u.handle
         FROM partners p JOIN users u ON u.id = p.owner_user_id
         WHERE p.status = 'approved' AND u.status = 'active'
           AND COALESCE(p.approved_at, p.created_at) <= $1::timestamptz - interval '60 days'
           AND NOT EXISTS (SELECT 1 FROM partner_attributions a WHERE a.partner_id = p.id AND a.attributed_at > $1::timestamptz - interval '60 days')
           AND NOT EXISTS (SELECT 1 FROM partner_earnings e WHERE e.partner_id = p.id AND e.type = 'commission' AND e.created_at > $1::timestamptz - interval '60 days')
           AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.journey = 'partner_inactive_60d' AND n.user_id = p.owner_user_id
                             AND n.created_at > $1::timestamptz - interval '60 days')`,
        [now],
      ),
    dedupeKey: (r, now) => `partner_inactive_60d:partner:${r.partner_id}:${localDate(now).iso.slice(0, 7)}`,
    build: (r) => ({
      title: 'No new clients in 60 days',
      body: 'A few easy ways to get your Pawtella code in front of clients again.',
      payload: { partnerId: r.partner_id, businessName: r.business_name, url: app('/partner/dashboard') },
    }),
  },
  {
    id: 'partner_monthly_statement',
    channels: ['email', 'inapp'],
    when: (now) => localDate(now).day === 1,
    select: (now) =>
      many(
        `WITH bounds AS (
           SELECT (date_trunc('month', ($1::timestamptz AT TIME ZONE $2)) - interval '1 month') AT TIME ZONE $2 AS start_at,
                  date_trunc('month', ($1::timestamptz AT TIME ZONE $2)) AT TIME ZONE $2 AS end_at
         )
         SELECT p.id AS partner_id, p.business_name, p.tier, p.total_referred, p.owner_user_id AS user_id, u.display_name, u.handle,
                b.start_at, b.end_at,
                (SELECT count(*)::int FROM partner_attributions a WHERE a.partner_id = p.id AND a.attributed_at >= b.start_at AND a.attributed_at < b.end_at) AS new_referred,
                (SELECT count(DISTINCT e.order_id)::int FROM partner_earnings e WHERE e.partner_id = p.id AND e.type = 'commission' AND e.created_at >= b.start_at AND e.created_at < b.end_at) AS order_count,
                (SELECT COALESCE(sum(e.amount_cents), 0)::int FROM partner_earnings e WHERE e.partner_id = p.id AND e.type = 'commission' AND e.status <> 'cancelled' AND e.created_at >= b.start_at AND e.created_at < b.end_at) AS commission_cents,
                (SELECT COALESCE(sum(e.amount_cents), 0)::int FROM partner_earnings e WHERE e.partner_id = p.id AND e.status = 'available') AS available_cents,
                (SELECT COALESCE(sum(e.amount_cents), 0)::int FROM partner_earnings e WHERE e.partner_id = p.id AND e.status = 'pending' AND e.amount_cents > 0) AS pending_cents
         FROM partners p JOIN users u ON u.id = p.owner_user_id, bounds b
         WHERE p.status = 'approved' AND u.status = 'active' AND COALESCE(p.approved_at, p.created_at) < b.end_at`,
        [now, tz()],
      ),
    dedupeKey: (r) => `partner_monthly_statement:partner:${r.partner_id}:${new Date(r.start_at).toISOString().slice(0, 7)}`,
    build: (r) => {
      const periodLabel = new Date(r.start_at).toLocaleDateString('en-CA', { month: 'long', year: 'numeric', timeZone: tz() });
      return {
        title: `Your statement for ${periodLabel}`,
        body: `Commission earned $${(r.commission_cents / 100).toFixed(2)} · available $${(r.available_cents / 100).toFixed(2)}.`,
        payload: {
          partnerId: r.partner_id,
          businessName: r.business_name,
          periodLabel,
          tier: r.tier,
          totalReferred: r.total_referred,
          newReferred: r.new_referred,
          orderCount: r.order_count,
          commissionCents: r.commission_cents,
          availableCents: r.available_cents,
          pendingCents: r.pending_cents,
          currency: 'CAD',
          url: app('/partner/dashboard'),
        },
      };
    },
  },
];

export const journeyById = (id) => JOURNEYS.find((j) => j.id === id);

/**
 * Evaluate one journey. Returns the number of candidate rows for which at least one
 * notification row was newly created.
 */
export async function runJourney(journey, now = new Date()) {
  if (journey.when && !journey.when(now)) return { created: 0, candidates: 0, skipped: true };
  const rows = await journey.select(now);
  let created = 0;
  for (const row of rows) {
    const base = journey.dedupeKey(row, now);
    let built = null;
    let anyCreated = false;
    for (const channel of journey.channels) {
      const dedupeKey = `${base}:${channel}`;
      // Cheap pre-check so build() (which may call Claude) only runs for new rows.
      const exists = await one(`SELECT 1 FROM notifications WHERE dedupe_key = $1`, [dedupeKey]);
      if (exists) continue;
      built = built || (await journey.build(row, now));
      const res = await notify({ userId: row.user_id, journey: journey.id, channel, dedupeKey, title: built.title, body: built.body, payload: built.payload });
      if (res.created) anyCreated = true;
    }
    if (anyCreated) {
      created++;
      if (journey.onCreated) {
        try {
          await journey.onCreated(row, now);
        } catch (err) {
          console.error('[automation] onCreated failed', { journey: journey.id, userId: row.user_id, error: err?.message });
        }
      }
    }
  }
  return { created, candidates: rows.length };
}

/**
 * Evaluate every journey, then deliver queued email/push rows.
 * Idempotent: a second run with the same state creates nothing new.
 */
export async function runAutomations(now = new Date(), { deliver = true, only } = {}) {
  const started = Date.now();
  const journeys = {};
  const errors = {};
  for (const journey of JOURNEYS) {
    if (only && !only.includes(journey.id)) continue;
    try {
      const r = await runJourney(journey, now);
      journeys[journey.id] = r.created;
    } catch (err) {
      console.error('[automation] journey failed', { journey: journey.id, error: err?.message });
      journeys[journey.id] = 0;
      errors[journey.id] = err?.message || String(err);
    }
  }
  const delivered = deliver ? await deliverQueued({ limit: 200 }) : null;
  await query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ('automation.last_run', $1::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify({ at: now.toISOString(), journeys, delivered, ms: Date.now() - started })],
  );
  console.log('[automation] run complete', { journeys, delivered, ms: Date.now() - started });
  return { journeys, delivered, ...(Object.keys(errors).length ? { errors } : {}) };
}

export default { JOURNEYS, runAutomations, runJourney };
