// Referral codes, signup attribution and referrer conversion bonuses.
// Partner codes (lib/partners.js) are valid wherever a referral code is accepted.
import crypto from 'node:crypto';
import { query, one, withTransaction } from './db.js';
import { RULES } from './points-rules.js';
import { awardPoints } from './points.js';
import { findPartnerByCode, attributeUser } from './partners.js';
import { track, EVENT } from './events.js';

// Base32-ish alphabet without easily confused characters (0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_RE = /^[A-Z0-9]{4,12}$/;

export function generateCode(length = 6) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function normalizeCode(code) {
  if (typeof code !== 'string') return null;
  const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return CODE_RE.test(c) ? c : null;
}

function runner(tx) {
  return tx ? tx : { query, one };
}

/** Return the user's referral code, creating one (unique, 6–8 chars) when missing. */
export async function getOrCreateReferralCode(userId, tx) {
  const r = runner(tx);
  const existing = await r.one('SELECT code FROM referral_codes WHERE user_id = $1', [userId]);
  if (existing) return existing.code;
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = generateCode(attempt < 10 ? 6 : attempt < 15 ? 7 : 8);
    const clash = await r.one('SELECT 1 FROM referral_codes WHERE code = $1 UNION ALL SELECT 1 FROM partners WHERE upper(code) = $1', [code]);
    if (clash) continue;
    const row = await r.one(
      `INSERT INTO referral_codes (code, user_id) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET code = referral_codes.code RETURNING code`,
      [code, userId],
    );
    if (row) return row.code;
  }
  throw new Error('Could not allocate a referral code');
}

/** Resolve a code to its owner: a user, a partner, or null. */
export async function resolveCode(code, tx) {
  const c = normalizeCode(code);
  if (!c) return null;
  const r = runner(tx);
  const user = await r.one(
    `SELECT rc.user_id FROM referral_codes rc JOIN users u ON u.id = rc.user_id
     WHERE rc.code = $1 AND u.status = 'active'`,
    [c],
  );
  if (user) return { kind: 'user', userId: user.user_id };
  try {
    const partner = await findPartnerByCode(c, tx);
    if (partner && partner.status === 'approved') return { kind: 'partner', partnerId: partner.id };
  } catch (err) {
    console.error('[referrals] partner lookup failed', { code: c, error: err?.message });
  }
  return null;
}

/**
 * Attribute a brand-new user to whoever owns `code`. User code → `referrals` row (+ signup bonus
 * to the new user); partner code → partner attribution. Silently ignores unknown codes and
 * self-referrals. Runs inside `tx` (required: callers compose it with the user insert).
 */
export async function attributeSignup(newUserId, { code, source, sharedPostId } = {}, tx) {
  const resolved = await resolveCode(code, tx);
  if (!resolved) return;
  const work = async (t) => {
    if (resolved.kind === 'user') {
      if (resolved.userId === newUserId) return;
      const already = await t.one('SELECT 1 FROM referrals WHERE referred_id = $1', [newUserId]);
      if (already) return;
      const src = source === 'share' ? 'share' : 'invite';
      await t.query(
        `INSERT INTO referrals (referrer_id, referred_id, source, shared_post_id, signup_bonus_awarded)
         VALUES ($1, $2, $3, $4, true)`,
        [resolved.userId, newUserId, src, sharedPostId ?? null],
      );
      await t.query(`UPDATE users SET referred_by_user_id = $2, signup_source = $3 WHERE id = $1`, [
        newUserId,
        resolved.userId,
        src,
      ]);
      await awardPoints(
        newUserId,
        RULES.referredSignupBonus,
        {
          type: 'bonus',
          source: 'referral',
          refType: 'referral',
          refId: resolved.userId,
          description: 'Bonus for joining through a friend',
        },
        t,
      );
      await track(EVENT.referral_signup, { userId: resolved.userId, props: { referredId: newUserId, source: src } }, t);
      console.log('[referrals] signup attributed', { referrerId: resolved.userId, referredId: newUserId, source: src });
      return;
    }
    if (resolved.kind === 'partner') {
      // A partner problem must never block the signup: isolate it with a savepoint.
      await t.query('SAVEPOINT partner_attribution');
      try {
        await attributeUser(newUserId, resolved.partnerId, 'signup', t);
        await t.query(`UPDATE users SET signup_source = 'partner' WHERE id = $1`, [newUserId]);
        await track(EVENT.partner_attributed, { userId: newUserId, props: { partnerId: resolved.partnerId, source: 'signup' } }, t);
        await t.query('RELEASE SAVEPOINT partner_attribution');
        console.log('[referrals] partner attributed', { partnerId: resolved.partnerId, userId: newUserId });
      } catch (err) {
        await t.query('ROLLBACK TO SAVEPOINT partner_attribution');
        console.error('[referrals] partner attribution failed', { partnerId: resolved.partnerId, userId: newUserId, error: err?.message });
      }
    }
  };
  return tx ? work(tx) : withTransaction(work);
}

/** Points the referrer earned from referral bonuses in the current calendar month. */
async function referrerPointsThisMonth(referrerId, t) {
  const row = await t.one(
    `SELECT COALESCE(SUM(amount), 0)::int AS total FROM point_transactions
     WHERE user_id = $1 AND source = 'referral' AND amount > 0
       AND created_at >= date_trunc('month', now())`,
    [referrerId],
  );
  return row?.total ?? 0;
}

/**
 * Called on a referred user's first creation or first paid order. Pays the referrer
 * RULES.referralConversionBonus exactly once (FOR UPDATE on the referrals row), subject to the
 * referrer's monthly cap. Never throws.
 */
export async function onReferredConversion(userId, kind, tx) {
  const work = async (t) => {
    const ref = await t.one('SELECT * FROM referrals WHERE referred_id = $1 FOR UPDATE', [userId]);
    if (!ref || ref.conversion_bonus_awarded) return { awarded: false };
    const earned = await referrerPointsThisMonth(ref.referrer_id, t);
    const bonus = ref.source === 'share' ? RULES.shareConversionBonus ?? RULES.referralConversionBonus : RULES.referralConversionBonus;
    const cap = RULES.referralMonthlyCap;
    if (cap && earned + bonus > cap) {
      console.log('[referrals] monthly cap reached, conversion bonus skipped', { referrerId: ref.referrer_id, earned, cap });
      return { awarded: false, capped: true };
    }
    await t.query('UPDATE referrals SET conversion_bonus_awarded = true WHERE id = $1', [ref.id]);
    await awardPoints(
      ref.referrer_id,
      bonus,
      {
        type: 'earn',
        source: 'referral',
        refType: 'referral',
        refId: ref.id,
        description: kind === 'order' ? 'A friend you invited placed their first order' : 'A friend you invited made their first creation',
        metadata: { referredId: userId, kind },
      },
      t,
    );
    console.log('[referrals] conversion bonus paid', { referrerId: ref.referrer_id, referredId: userId, kind, bonus });
    return { awarded: true, bonus };
  };
  if (!tx) {
    try {
      return await withTransaction(work);
    } catch (err) {
      console.error('[referrals] onReferredConversion failed', { userId, kind, error: err?.message });
      return { awarded: false, error: true };
    }
  }
  // Inside a caller's transaction: isolate our failure with a savepoint so the caller's work
  // (e.g. creating the post/order) still commits.
  await tx.query('SAVEPOINT referral_conversion');
  try {
    const result = await work(tx);
    await tx.query('RELEASE SAVEPOINT referral_conversion');
    return result;
  } catch (err) {
    await tx.query('ROLLBACK TO SAVEPOINT referral_conversion');
    console.error('[referrals] onReferredConversion failed', { userId, kind, error: err?.message });
    return { awarded: false, error: true };
  }
}

export default { getOrCreateReferralCode, resolveCode, attributeSignup, onReferredConversion };
