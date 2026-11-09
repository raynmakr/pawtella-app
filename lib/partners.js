// Partner program: local pet-service providers who send us customers. Directory, attribution,
// commission ledger, tiers, dashboard, redemption and payouts. Rules live in partner-rules.js.
// Owner: Backend F.
import { query, one, many, withTransaction } from './db.js';
import { env } from './env.js';
import { ApiError, badRequest, notFound, conflict } from './http.js';
import { camelize, omit } from './serialize.js';
import { PARTNER_RULES, tierFor, nextTier, tierById, commissionFor, pointsForRedeem } from './partner-rules.js';
import { awardPoints } from './points.js';
import * as shopify from './shopify.js';
import { notify, enqueueAdmin } from './notifications.js';
import { track, EVENT } from './events.js';

const ADMIN_FIELDS = ['notes_admin'];
const PRIVATE_FIELDS = ['shopify_customer_id', 'shopify_discount_id', 'email', 'owner_user_id', ...ADMIN_FIELDS];

/** Helpers that work with or without a transaction. */
const q = (tx) => (tx ? tx.query : query);
const first = (tx) => (tx ? tx.one : one);
const inTx = (tx, fn) => (tx ? fn(tx) : withTransaction(fn));

// ---------------------------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------------------------

export async function findPartnerByCode(code, tx) {
  if (!code || typeof code !== 'string') return null;
  return first(tx)('SELECT * FROM partners WHERE upper(code) = upper($1)', [code.trim()]);
}

export async function getPartnerById(id, tx) {
  return first(tx)('SELECT * FROM partners WHERE id = $1', [id]);
}

export async function getPartnerByOwner(userId, tx) {
  return first(tx)('SELECT * FROM partners WHERE owner_user_id = $1', [userId]);
}

/** The user's attribution if it has not expired yet. */
export async function getActiveAttribution(userId, tx) {
  return first(tx)('SELECT * FROM partner_attributions WHERE user_id = $1 AND expires_at > now()', [userId]);
}

// ---------------------------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------------------------

/**
 * Attribute a user to a partner. One attribution per user: an active one is a no-op (returned
 * as-is), an expired one is replaced. Awards the referred-customer bonus once per user.
 */
export async function attributeUser(userId, partnerId, source = 'link', tx) {
  if (!['signup', 'qr_scan', 'link', 'manual'].includes(source)) throw badRequest('Invalid attribution source');
  return inTx(tx, async (t) => {
    const partner = await t.one('SELECT id, status, code FROM partners WHERE id = $1 FOR UPDATE', [partnerId]);
    if (!partner) throw notFound('Partner not found');
    if (partner.status !== 'approved') throw badRequest('Partner is not active');

    const existing = await t.one('SELECT * FROM partner_attributions WHERE user_id = $1 FOR UPDATE', [userId]);
    if (existing && new Date(existing.expires_at) > new Date()) return existing;

    const months = PARTNER_RULES.attributionMonths;
    let attribution;
    if (existing) {
      attribution = await t.one(
        `UPDATE partner_attributions
            SET partner_id = $2, source = $3, attributed_at = now(), expires_at = now() + ($4 || ' months')::interval
          WHERE id = $1 RETURNING *`,
        [existing.id, partnerId, source, String(months)],
      );
    } else {
      attribution = await t.one(
        `INSERT INTO partner_attributions (user_id, partner_id, source, expires_at)
         VALUES ($1, $2, $3, now() + ($4 || ' months')::interval) RETURNING *`,
        [userId, partnerId, source, String(months)],
      );
    }

    if (!attribution.bonus_awarded) {
      await awardPoints(
        userId,
        PARTNER_RULES.referredCustomerBonus,
        {
          type: 'bonus',
          source: 'partner_attribution',
          refType: 'partner_attribution',
          refId: `partner_attribution:${attribution.id}`,
          description: 'Welcome bonus from your Pawtella partner',
          metadata: { partnerId, source },
        },
        t,
      );
      attribution = await t.one('UPDATE partner_attributions SET bonus_awarded = true WHERE id = $1 RETURNING *', [attribution.id]);
    }

    if (source === 'signup') {
      await t.query(`UPDATE users SET signup_source = 'partner' WHERE id = $1 AND (signup_source IS NULL OR signup_source = 'organic')`, [userId]);
    }
    await t.query('UPDATE partners SET total_referred = total_referred + 1 WHERE id = $1', [partnerId]);
    await track(EVENT.partner_attributed, { userId, props: { partnerId, source, attributionId: attribution.id } }, t);
    console.log('[partners] attributed', { userId, partnerId, source });
    return attribution;
  });
}

/**
 * Attribute by code from the app (QR scan / code entry). Rejects a second partner for a user
 * who already has an active attribution.
 */
export async function attributeByCode(userId, code, source = 'qr_scan') {
  const partner = await findPartnerByCode(code);
  if (!partner || partner.status !== 'approved') throw notFound('Unknown partner code');
  if (partner.owner_user_id === userId) throw badRequest('You cannot be attributed to your own business');
  const active = await getActiveAttribution(userId);
  if (active) {
    if (active.partner_id === partner.id) return { attribution: active, partner, alreadyAttributed: true };
    throw conflict('You are already linked to another partner');
  }
  const user = await one('SELECT id, created_at FROM users WHERE id = $1', [userId]);
  if (!user) throw notFound('User not found');
  const ageDays = (Date.now() - new Date(user.created_at).getTime()) / 86_400_000;
  // A user with no attribution at all may always link; the signup window applies once they have
  // had one (an expired attribution cannot be transferred to a new partner after the window).
  const hadAttribution = await one('SELECT id FROM partner_attributions WHERE user_id = $1', [userId]);
  if (hadAttribution && ageDays > PARTNER_RULES.attributionWindowDaysAfterSignup) {
    throw badRequest(`Partner codes can only be entered within ${PARTNER_RULES.attributionWindowDaysAfterSignup} days of signing up`);
  }
  const attribution = await attributeUser(userId, partner.id, source);
  return { attribution, partner, alreadyAttributed: false };
}

// ---------------------------------------------------------------------------------------------
// Commission ledger
// ---------------------------------------------------------------------------------------------

/**
 * Accrue a pending commission for a paid order whose buyer has an active attribution.
 * `order` is a shop_orders row (needs user_id, subtotal_cents, placed_at; id/currency optional).
 */
export async function accrueCommission(order, tx) {
  if (!order?.user_id) return null;
  return inTx(tx, async (t) => {
    const placedAt = order.placed_at ? new Date(order.placed_at) : new Date();
    const attribution = await t.one(
      `SELECT * FROM partner_attributions WHERE user_id = $1 AND attributed_at <= $2 AND expires_at > $2`,
      [order.user_id, placedAt],
    );
    if (!attribution) return null;
    const partner = await t.one('SELECT id, status FROM partners WHERE id = $1', [attribution.partner_id]);
    if (!partner || partner.status !== 'approved') return null;

    if (order.id) {
      const dup = await t.one(`SELECT * FROM partner_earnings WHERE order_id = $1 AND type = 'commission'`, [order.id]);
      if (dup) return dup;
    }
    const amount = commissionFor(order.subtotal_cents);
    if (amount <= 0) return null;

    const earning = await t.one(
      `INSERT INTO partner_earnings (partner_id, order_id, user_id, type, amount_cents, currency, status, available_at, metadata)
       VALUES ($1, $2, $3, 'commission', $4, $5, 'pending', $6::timestamptz + ($7 || ' days')::interval, $8)
       RETURNING *`,
      [
        partner.id,
        order.id ?? null,
        order.user_id,
        amount,
        order.currency || 'CAD',
        placedAt,
        String(PARTNER_RULES.commissionMaturityDays),
        JSON.stringify({ subtotalCents: order.subtotal_cents, commissionPercent: PARTNER_RULES.commissionPercent, orderNumber: order.order_number ?? null }),
      ],
    );
    if (order.id) await t.query('UPDATE shop_orders SET partner_id = $2 WHERE id = $1', [order.id, partner.id]);
    console.log('[partners] commission accrued', { partnerId: partner.id, orderId: order.id, amount });
    return earning;
  });
}

/** pending → available once the returns window has passed. Returns the count matured. */
export async function matureEarnings() {
  const { rowCount } = await query(
    `UPDATE partner_earnings SET status = 'available'
      WHERE status = 'pending' AND amount_cents > 0 AND available_at IS NOT NULL AND available_at <= now()`,
  );
  if (rowCount) console.log('[partners] matured earnings', { count: rowCount });
  return rowCount;
}

/**
 * Balance available to redeem/pay out: everything except cancelled rows and not-yet-matured
 * positive earnings. Pending payout requests (negative) already count against it.
 */
export async function getAvailableBalance(partnerId, tx) {
  const row = await first(tx)(
    `SELECT COALESCE(SUM(amount_cents), 0)::int AS cents FROM partner_earnings
      WHERE partner_id = $1 AND status <> 'cancelled' AND NOT (status = 'pending' AND amount_cents > 0)`,
    [partnerId],
  );
  return row.cents;
}

async function earningTotals(partnerId) {
  const row = await one(
    `SELECT
       COALESCE(SUM(amount_cents) FILTER (WHERE status = 'pending' AND amount_cents > 0), 0)::int AS pending,
       COALESCE(SUM(amount_cents) FILTER (WHERE status <> 'cancelled' AND NOT (status = 'pending' AND amount_cents > 0)), 0)::int AS available,
       COALESCE(SUM(-amount_cents) FILTER (WHERE status = 'paid' AND amount_cents < 0), 0)::int AS paid,
       COALESCE(SUM(amount_cents) FILTER (WHERE amount_cents > 0 AND status <> 'cancelled'), 0)::int AS lifetime
     FROM partner_earnings WHERE partner_id = $1`,
    [partnerId],
  );
  return { pendingCents: row.pending, availableCents: row.available, paidCents: row.paid, lifetimeCents: row.lifetime };
}

// ---------------------------------------------------------------------------------------------
// Discount codes & tiers
// ---------------------------------------------------------------------------------------------

/** Mint a customer-locked, no-expiry percentage code for the partner and replace the old one. */
async function mintDiscountCode(partner, tier) {
  const code = `PARTNER-${partner.code}`;
  const created = await shopify.createDiscountCode({
    code,
    percent: tier.discountPercent,
    customerId: partner.shopify_customer_id || null,
    usageLimit: null, // reusable for the partner's own supplies orders
    title: `Pawtella partner ${tier.id} – ${partner.business_name}`,
  });
  if (partner.shopify_discount_id && partner.shopify_discount_id !== created.id) {
    try {
      await shopify.deactivateDiscountCode(partner.shopify_discount_id);
    } catch (err) {
      console.error('[partners] deactivate old discount failed', { partnerId: partner.id, error: err?.message });
    }
  }
  await query(
    `UPDATE partners SET discount_code = $2, shopify_discount_id = $3, discount_percent = $4, tier = $5, is_featured = $6 WHERE id = $1`,
    [partner.id, created.code, created.id, tier.discountPercent, tier.id, tier.featured],
  );
  return created;
}

/**
 * Count active referred customers per approved partner (events in the trailing window), set
 * tier/featured/discount, and re-mint the discount code when the tier changes.
 * Returns the number of partners whose tier changed.
 */
export async function recomputeTiers() {
  const partners = await many(`SELECT * FROM partners WHERE status = 'approved'`);
  const counts = await many(
    `SELECT pa.partner_id, COUNT(DISTINCT pa.user_id)::int AS active
       FROM partner_attributions pa
       JOIN events e ON e.user_id = pa.user_id AND e.created_at > now() - ($1 || ' days')::interval
      WHERE pa.expires_at > now()
      GROUP BY pa.partner_id`,
    [String(PARTNER_RULES.activeWindowDays)],
  );
  const byPartner = new Map(counts.map((c) => [c.partner_id, c.active]));
  let changed = 0;
  for (const p of partners) {
    const active = byPartner.get(p.id) ?? 0;
    const tier = tierFor(active);
    const tierChanged = tier.id !== p.tier;
    await query('UPDATE partners SET active_referred_90d = $2 WHERE id = $1', [p.id, active]);
    if (!tierChanged && p.discount_code) {
      if (p.discount_percent !== tier.discountPercent || p.is_featured !== tier.featured) {
        await query('UPDATE partners SET discount_percent = $2, is_featured = $3 WHERE id = $1', [p.id, tier.discountPercent, tier.featured]);
      }
      continue;
    }
    try {
      await mintDiscountCode(p, tier);
    } catch (err) {
      console.error('[partners] mint discount failed', { partnerId: p.id, error: err?.message });
      await query('UPDATE partners SET tier = $2, is_featured = $3, discount_percent = $4 WHERE id = $1', [p.id, tier.id, tier.featured, tier.discountPercent]);
    }
    if (tierChanged) {
      changed++;
      const up = PARTNER_RULES.tiers.findIndex((t) => t.id === tier.id) > PARTNER_RULES.tiers.findIndex((t) => t.id === p.tier);
      console.log('[partners] tier changed', { partnerId: p.id, from: p.tier, to: tier.id, active });
      if (up && p.owner_user_id) {
        await notify({
          userId: p.owner_user_id,
          journey: 'partner_tier_up',
          channel: 'inapp',
          dedupeKey: `partner_tier_up:partner:${p.id}:${tier.id}`,
          title: `You reached ${tier.id[0].toUpperCase()}${tier.id.slice(1)} tier`,
          body: `${active} active referred customers. Your supplies discount is now ${tier.discountPercent}%.`,
          payload: { partnerId: p.id, tier: tier.id, discountPercent: tier.discountPercent, deepLink: `${env.appScheme}://partner/dashboard` },
        }).catch((err) => console.error('[partners] tier notify failed', { partnerId: p.id, error: err?.message }));
      }
    }
  }
  return changed;
}

// ---------------------------------------------------------------------------------------------
// Application & approval
// ---------------------------------------------------------------------------------------------

function cleanStr(v, max = 500) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

function cleanUrl(v) {
  const s = cleanStr(v, 500);
  if (!s) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error();
    return u.toString();
  } catch {
    throw badRequest('Invalid URL');
  }
}

function cleanNumber(v, { min, max, name }) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw badRequest(`Invalid ${name}`);
  return n;
}

/** HAPPYPAWS + 2 digits, unique across partner codes and user referral codes. */
export async function generatePartnerCode(businessName, tx) {
  let base = String(businessName || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10);
  if (base.length < 3) base = `PAW${base}`;
  for (let attempt = 0; attempt < 50; attempt++) {
    const digits = String(Math.floor(Math.random() * 100)).padStart(2, '0');
    const code = attempt < 20 ? `${base}${digits}` : `${base}${digits}${Math.floor(Math.random() * 10)}`;
    const taken = await first(tx)(
      `SELECT 1 FROM partners WHERE upper(code) = $1
       UNION ALL SELECT 1 FROM referral_codes WHERE upper(code) = $1 LIMIT 1`,
      [code],
    );
    if (!taken) return code;
  }
  throw new ApiError(500, 'Could not allocate a partner code');
}

export async function applyPartner(userId, body = {}) {
  const businessName = cleanStr(body.businessName, 80);
  if (!businessName || businessName.length < 2) throw badRequest('businessName is required (2–80 characters)');
  const type = cleanStr(body.type, 20);
  if (!PARTNER_RULES.partnerTypes.includes(type)) throw badRequest(`type must be one of ${PARTNER_RULES.partnerTypes.join(', ')}`);
  const email = cleanStr(body.email, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('Invalid email');
  const services = Array.isArray(body.services) ? body.services.map((s) => cleanStr(s, 60)).filter(Boolean).slice(0, 20) : [];
  const lat = cleanNumber(body.lat, { min: -90, max: 90, name: 'lat' });
  const lng = cleanNumber(body.lng, { min: -180, max: 180, name: 'lng' });
  if ((lat === null) !== (lng === null)) throw badRequest('lat and lng must be given together');

  const existing = await getPartnerByOwner(userId);
  if (existing) throw conflict('You already have a partner application');

  const partner = await withTransaction(async (t) => {
    const code = await generatePartnerCode(businessName, t);
    return t.one(
      `INSERT INTO partners (owner_user_id, business_name, type, description, logo_url, cover_url, email, phone, website,
                             booking_url, instagram, street1, city, province, postal_code, country, lat, lng, services, code, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'pending') RETURNING *`,
      [
        userId,
        businessName,
        type,
        cleanStr(body.description, 2000),
        cleanUrl(body.logoUrl),
        cleanUrl(body.coverUrl),
        email,
        cleanStr(body.phone, 40),
        cleanUrl(body.website),
        cleanUrl(body.bookingUrl),
        cleanStr(body.instagram, 60)?.replace(/^@/, '') ?? null,
        cleanStr(body.street1, 200),
        cleanStr(body.city, 100),
        cleanStr(body.province, 100),
        cleanStr(body.postalCode, 20),
        cleanStr(body.country, 2)?.toUpperCase() ?? 'CA',
        lat,
        lng,
        services,
        code,
      ],
    );
  });

  await enqueueAdmin({
    journey: 'partner_applied',
    title: `Partner application: ${businessName}`,
    body: `${type} in ${partner.city || 'unknown city'} applied to the partner program (code ${partner.code}).`,
    payload: { partnerId: partner.id, userId, type, businessName },
  }).catch((err) => console.error('[partners] admin notify failed', { error: err?.message }));
  await track(EVENT.partner_applied, { userId, props: { partnerId: partner.id, type } });
  console.log('[partners] applied', { partnerId: partner.id, userId });
  return partner;
}

export async function approvePartner(id, adminId) {
  const partner = await getPartnerById(id);
  if (!partner) throw notFound('Partner not found');
  let shopifyCustomerId = partner.shopify_customer_id;
  if (!shopifyCustomerId && partner.email && typeof shopify.findCustomerByEmail === 'function') {
    try {
      shopifyCustomerId = (await shopify.findCustomerByEmail(partner.email))?.id ?? null;
    } catch (err) {
      console.error('[partners] findCustomerByEmail failed', { partnerId: id, error: err?.message });
    }
  }
  const updated = await one(
    `UPDATE partners SET status = 'approved', approved_at = COALESCE(approved_at, now()), shopify_customer_id = $2 WHERE id = $1 RETURNING *`,
    [id, shopifyCustomerId],
  );
  const tier = tierById(updated.tier);
  try {
    await mintDiscountCode(updated, tier);
  } catch (err) {
    console.error('[partners] initial discount mint failed', { partnerId: id, error: err?.message });
  }
  const links = partnerLinks(updated);
  if (updated.owner_user_id) {
    await notify({
      userId: updated.owner_user_id,
      journey: 'partner_approved',
      channel: 'email',
      dedupeKey: `partner_approved:partner:${id}`,
      title: `Welcome to the Pawtella partner program, ${updated.business_name}!`,
      body: `You're approved. Share your code ${updated.code} or print your poster to start earning ${PARTNER_RULES.commissionPercent}% on every order your clients place. Your supplies discount code is PARTNER-${updated.code}.`,
      payload: { partnerId: id, code: updated.code, posterUrl: `${env.appUrl}${links.poster}`, qrUrl: `${env.appUrl}${links.qr}`, referralUrl: links.referral, deepLink: `${env.appScheme}://partner/dashboard` },
    }).catch((err) => console.error('[partners] approve notify failed', { partnerId: id, error: err?.message }));
    await notify({
      userId: updated.owner_user_id,
      journey: 'partner_approved',
      channel: 'inapp',
      dedupeKey: `partner_approved:inapp:partner:${id}`,
      title: 'Your partner application was approved',
      body: 'Open your partner dashboard to grab your QR code and poster.',
      payload: { partnerId: id, deepLink: `${env.appScheme}://partner/dashboard` },
    }).catch(() => {});
  }
  await track(EVENT.partner_approved, { userId: updated.owner_user_id, props: { partnerId: id, adminId } });
  console.log('[partners] approved', { partnerId: id, adminId });
  return getPartnerById(id);
}

// ---------------------------------------------------------------------------------------------
// Redemption & payouts
// ---------------------------------------------------------------------------------------------

export async function redeemEarnings(partnerId, { type, amountCents } = {}) {
  if (!['points', 'gift_card'].includes(type)) throw badRequest("type must be 'points' or 'gift_card'");
  const amount = Number(amountCents);
  if (!Number.isInteger(amount) || amount <= 0) throw badRequest('amountCents must be a positive integer');
  return withTransaction(async (t) => {
    const partner = await t.one('SELECT * FROM partners WHERE id = $1 FOR UPDATE', [partnerId]);
    if (!partner) throw notFound('Partner not found');
    if (partner.status !== 'approved') throw badRequest('Partner is not active');
    const available = await getAvailableBalance(partnerId, t);
    if (amount > available) throw new ApiError(402, 'Not enough available earnings', { availableCents: available });

    if (type === 'points') {
      if (!partner.owner_user_id) throw badRequest('Partner has no owner account');
      const points = pointsForRedeem(amount);
      if (points <= 0) throw badRequest('Amount too small to convert to Paw Points');
      const earning = await t.one(
        `INSERT INTO partner_earnings (partner_id, user_id, type, amount_cents, status, metadata)
         VALUES ($1, $2, 'redeem_points', $3, 'paid', $4) RETURNING *`,
        [partnerId, partner.owner_user_id, -amount, JSON.stringify({ points, centsPerPoint: PARTNER_RULES.redeemPointsCentsPerPoint })],
      );
      const { balanceAfter } = await awardPoints(
        partner.owner_user_id,
        points,
        { type: 'earn', source: 'partner_redeem', refType: 'partner_earning', refId: String(earning.id), description: `Redeemed $${(amount / 100).toFixed(2)} of partner earnings` },
        t,
      );
      console.log('[partners] redeemed to points', { partnerId, amount, points });
      return { earning, points, balanceAfter, availableCents: available - amount };
    }

    const giftCard = await shopify.createGiftCard({
      amountCents: amount,
      note: `Pawtella partner earnings – ${partner.business_name} (#${partnerId})`,
      customerId: partner.shopify_customer_id || undefined,
    });
    const earning = await t.one(
      `INSERT INTO partner_earnings (partner_id, user_id, type, amount_cents, status, metadata)
       VALUES ($1, $2, 'redeem_gift_card', $3, 'paid', $4) RETURNING *`,
      [partnerId, partner.owner_user_id, -amount, JSON.stringify({ giftCardId: giftCard.id, lastCharacters: giftCard.lastCharacters })],
    );
    console.log('[partners] redeemed to gift card', { partnerId, amount, giftCardId: giftCard.id });
    return { earning, giftCard: { code: giftCard.code, lastCharacters: giftCard.lastCharacters, amountCents: amount }, availableCents: available - amount };
  });
}

export async function requestPayout(partnerId, { amountCents, method, details } = {}) {
  const amount = Number(amountCents);
  if (!Number.isInteger(amount) || amount <= 0) throw badRequest('amountCents must be a positive integer');
  if (amount < PARTNER_RULES.minPayoutCents) throw badRequest(`Minimum payout is $${(PARTNER_RULES.minPayoutCents / 100).toFixed(2)}`);
  if (!PARTNER_RULES.payoutMethods.includes(method)) throw badRequest(`method must be one of ${PARTNER_RULES.payoutMethods.join(', ')}`);
  const safeDetails = typeof details === 'string' ? details.slice(0, 500) : details && typeof details === 'object' ? details : {};
  const earning = await withTransaction(async (t) => {
    const partner = await t.one('SELECT * FROM partners WHERE id = $1 FOR UPDATE', [partnerId]);
    if (!partner) throw notFound('Partner not found');
    if (partner.status !== 'approved') throw badRequest('Partner is not active');
    const available = await getAvailableBalance(partnerId, t);
    if (amount > available) throw new ApiError(402, 'Not enough available earnings', { availableCents: available });
    const row = await t.one(
      `INSERT INTO partner_earnings (partner_id, user_id, type, amount_cents, status, metadata)
       VALUES ($1, $2, 'payout', $3, 'pending', $4) RETURNING *`,
      [partnerId, partner.owner_user_id, -amount, JSON.stringify({ method, details: safeDetails })],
    );
    row.business_name = partner.business_name;
    return row;
  });
  await enqueueAdmin({
    journey: 'partner_payout_requested',
    title: `Payout request: ${earning.business_name} – $${(amount / 100).toFixed(2)} via ${method}`,
    body: `Process the ${method} payout and mark it paid in the admin API (PATCH /api/admin/partners/payouts/${earning.id}).`,
    payload: { partnerId, earningId: earning.id, amountCents: amount, method },
  }).catch((err) => console.error('[partners] payout admin notify failed', { error: err?.message }));
  console.log('[partners] payout requested', { partnerId, amount, method });
  return earning;
}

// ---------------------------------------------------------------------------------------------
// Directory
// ---------------------------------------------------------------------------------------------

export async function searchPartners({ lat, lng, type, q: text, limit = 50 } = {}) {
  const params = [];
  const where = [`p.status = 'approved'`];
  const hasGeo = lat !== '' && lng !== '' && lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
  let distanceSql = 'NULL::double precision';
  if (hasGeo) {
    params.push(Number(lat), Number(lng));
    distanceSql = `CASE WHEN p.lat IS NULL OR p.lng IS NULL THEN NULL ELSE
      6371 * 2 * asin(sqrt(
        power(sin(radians(p.lat - $1) / 2), 2) +
        cos(radians($1)) * cos(radians(p.lat)) * power(sin(radians(p.lng - $2) / 2), 2)
      )) END`;
  }
  if (type && PARTNER_RULES.partnerTypes.includes(type)) {
    params.push(type);
    where.push(`p.type = $${params.length}`);
  }
  if (text && String(text).trim()) {
    params.push(`%${String(text).trim().slice(0, 80)}%`);
    where.push(`(p.business_name ILIKE $${params.length} OR p.city ILIKE $${params.length} OR p.description ILIKE $${params.length}
      OR EXISTS (SELECT 1 FROM unnest(p.services) s WHERE s ILIKE $${params.length}))`);
  }
  params.push(Math.min(100, Math.max(1, Number(limit) || 50)));
  const order = hasGeo
    ? `p.is_featured DESC, distance_km ASC NULLS LAST, p.rating_avg DESC NULLS LAST`
    : `p.is_featured DESC, p.rating_avg DESC NULLS LAST, p.rating_count DESC, p.business_name ASC`;
  const rows = await many(
    `SELECT * FROM (
       SELECT p.*, ${distanceSql} AS distance_km FROM partners p WHERE ${where.join(' AND ')}
     ) p ORDER BY ${order} LIMIT $${params.length}`,
    params,
  );
  return rows.map(toPublicPartner);
}

export function toPublicPartner(row) {
  if (!row) return null;
  const out = camelize(omit(row, PRIVATE_FIELDS));
  if (out.distanceKm !== undefined && out.distanceKm !== null) out.distanceKm = Math.round(out.distanceKm * 10) / 10;
  if (out.ratingAvg !== null && out.ratingAvg !== undefined) out.ratingAvg = Number(out.ratingAvg);
  return out;
}

export async function getPartnerPublic(id) {
  const row = await one(`SELECT * FROM partners WHERE id = $1 AND status = 'approved'`, [id]);
  if (!row) return null;
  const reviews = await many(
    `SELECT r.id, r.rating, r.body, r.created_at, u.handle, u.display_name, u.avatar_url
       FROM partner_reviews r JOIN users u ON u.id = r.user_id
      WHERE r.partner_id = $1 ORDER BY r.created_at DESC LIMIT 10`,
    [id],
  );
  const partner = toPublicPartner(row);
  partner.reviews = {
    average: row.rating_avg === null ? null : Number(row.rating_avg),
    count: row.rating_count,
    recent: camelize(reviews),
  };
  return partner;
}

export async function addReview(partnerId, userId, { rating, body } = {}) {
  const r = Number(rating);
  if (!Number.isInteger(r) || r < 1 || r > 5) throw badRequest('rating must be an integer from 1 to 5');
  const text = cleanStr(body, 2000);
  return withTransaction(async (t) => {
    const partner = await t.one(`SELECT id, owner_user_id, status FROM partners WHERE id = $1 FOR UPDATE`, [partnerId]);
    if (!partner || partner.status !== 'approved') throw notFound('Partner not found');
    if (partner.owner_user_id === userId) throw badRequest('You cannot review your own business');
    const review = await t.one(
      `INSERT INTO partner_reviews (partner_id, user_id, rating, body) VALUES ($1, $2, $3, $4)
       ON CONFLICT (partner_id, user_id) DO UPDATE SET rating = EXCLUDED.rating, body = EXCLUDED.body, created_at = now()
       RETURNING *`,
      [partnerId, userId, r, text],
    );
    const agg = await t.one(`SELECT AVG(rating)::numeric(3,2) AS avg, COUNT(*)::int AS count FROM partner_reviews WHERE partner_id = $1`, [partnerId]);
    await t.query('UPDATE partners SET rating_avg = $2, rating_count = $3 WHERE id = $1', [partnerId, agg.avg, agg.count]);
    await track(EVENT.review_created, { userId, props: { partnerId, rating: r, kind: 'partner' } }, t);
    return { review: camelize(review), ratingAvg: Number(agg.avg), ratingCount: agg.count };
  });
}

// ---------------------------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------------------------

export function partnerLinks(partner) {
  return {
    referral: `${env.appUrl}/r/${partner.code}`,
    qr: '/api/partners/me/qr',
    poster: '/api/partners/me/poster',
  };
}

/** The owner's view of their partner row (no admin notes). */
export function toOwnerPartner(row) {
  return camelize(omit(row, ADMIN_FIELDS));
}

export async function getDashboard(partnerId) {
  const partner = await getPartnerById(partnerId);
  if (!partner) throw notFound('Partner not found');
  const tier = tierById(partner.tier);
  const next = nextTier(tier);
  const active = partner.active_referred_90d;
  const [totals, earnings, referred, counts] = await Promise.all([
    earningTotals(partnerId),
    many(
      `SELECT e.id, e.type, e.amount_cents, e.currency, e.status, e.available_at, e.created_at, e.metadata, o.order_number
         FROM partner_earnings e LEFT JOIN shop_orders o ON o.id = e.order_id
        WHERE e.partner_id = $1 ORDER BY e.created_at DESC LIMIT 10`,
      [partnerId],
    ),
    many(
      `SELECT u.handle, u.avatar_url, pa.source, pa.attributed_at
         FROM partner_attributions pa JOIN users u ON u.id = pa.user_id
        WHERE pa.partner_id = $1 ORDER BY pa.attributed_at DESC LIMIT 10`,
      [partnerId],
    ),
    one(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE expires_at > now())::int AS current,
              (SELECT COUNT(*)::int FROM shop_orders WHERE partner_id = $1) AS orders
         FROM partner_attributions WHERE partner_id = $1`,
      [partnerId],
    ),
  ]);
  return {
    partner: toOwnerPartner(partner),
    tier: {
      id: tier.id,
      discountPercent: partner.discount_percent,
      featured: partner.is_featured,
      perks: tier.perks,
      activeReferred: active,
      next: next ? { id: next.id, minActive: next.minActive, remaining: Math.max(0, next.minActive - active), progress: Math.min(1, active / next.minActive) } : null,
    },
    earnings: { ...totals, recent: camelize(earnings) },
    referred: { total: counts.total, active, current: counts.current, orders: counts.orders, recent: camelize(referred) },
    code: partner.code,
    discountCode: partner.discount_code,
    links: partnerLinks(partner),
    rules: {
      commissionPercent: PARTNER_RULES.commissionPercent,
      commissionMaturityDays: PARTNER_RULES.commissionMaturityDays,
      redeemPointsCentsPerPoint: PARTNER_RULES.redeemPointsCentsPerPoint,
      minPayoutCents: PARTNER_RULES.minPayoutCents,
      payoutMethods: PARTNER_RULES.payoutMethods,
      tiers: PARTNER_RULES.tiers,
    },
  };
}

export { PARTNER_RULES, tierFor, nextTier, commissionFor };
