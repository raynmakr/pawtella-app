// User lookups, handle generation and API mappers. HTTP handlers live in api/users.js.
import { query, one, withTransaction } from './db.js';
import * as points from './points.js';
import { RULES } from './points-rules.js';
import { track, EVENT } from './events.js';
import { hasAcceptedCurrent } from './legal.js';

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;
export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;
const RESERVED = new Set([
  'admin', 'pawtella', 'support', 'help', 'api', 'me', 'root', 'system', 'null', 'undefined',
  'deleted', 'moderator', 'staff', 'official',
]);

function runner(tx) {
  return tx ? tx : { query, one };
}

export async function getUserById(id, tx) {
  const n = parseInt(id, 10);
  if (!Number.isInteger(n)) return null;
  return runner(tx).one('SELECT * FROM users WHERE id = $1', [n]);
}

export async function getUserByEmail(email, tx) {
  if (typeof email !== 'string' || !email) return null;
  return runner(tx).one('SELECT * FROM users WHERE email = $1', [email.trim()]);
}

export async function getUserByHandle(handle, tx) {
  if (typeof handle !== 'string' || !handle) return null;
  return runner(tx).one('SELECT * FROM users WHERE handle = $1', [handle.trim()]);
}

export async function getUserByAppleId(appleId, tx) {
  if (!appleId) return null;
  return runner(tx).one('SELECT * FROM users WHERE apple_id = $1', [String(appleId)]);
}

export async function getUserByGoogleId(googleId, tx) {
  if (!googleId) return null;
  return runner(tx).one('SELECT * FROM users WHERE google_id = $1', [String(googleId)]);
}

/** True when `handle` is syntactically valid (lowercase [a-z0-9_], 3–20 chars, not reserved). */
export function isValidHandle(handle) {
  return typeof handle === 'string' && HANDLE_RE.test(handle) && !RESERVED.has(handle);
}

/** Normalise free text (display name, email local part) into a handle candidate. */
export function slugifyHandle(base) {
  let s = String(base ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase();
  if (s.includes('@')) s = s.split('@')[0];
  s = s.replace(/[^a-z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  if (s.length > HANDLE_MAX) s = s.slice(0, HANDLE_MAX).replace(/_+$/g, '');
  if (!s || RESERVED.has(s)) s = s ? `${s}_` : 'pawfriend';
  while (s.length < HANDLE_MIN) s += Math.floor(Math.random() * 10);
  return s;
}

/**
 * Turn `base` (display name, email or requested handle) into a unique handle. Appends a numeric
 * suffix when taken. Pass `tx` to check uniqueness inside the caller's transaction.
 */
export async function ensureHandle(base, tx) {
  const r = runner(tx);
  const root = slugifyHandle(base);
  const taken = async (h) => !!(await r.one('SELECT 1 FROM users WHERE handle = $1', [h]));
  if (!(await taken(root))) return root;
  for (let i = 0; i < 50; i++) {
    const suffix = i < 10 ? String(i + 1) : String(Math.floor(Math.random() * 100000));
    const trimmed = root.slice(0, HANDLE_MAX - suffix.length).replace(/_+$/g, '') || 'paw';
    const candidate = `${trimmed}${suffix}`;
    if (!(await taken(candidate))) return candidate;
  }
  return `paw${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.slice(0, HANDLE_MAX);
}

export async function touchLastSeen(userId) {
  try {
    await query('UPDATE users SET last_seen_at = now() WHERE id = $1', [userId]);
  } catch (err) {
    console.error('[users] touchLastSeen failed', { userId, error: err?.message });
  }
}

/** Fields safe to show to anyone. */
export function toPublicUser(row) {
  if (!row) return null;
  const deleted = row.status === 'deleted';
  return {
    id: row.id,
    handle: row.handle,
    displayName: deleted ? 'Deleted user' : row.display_name ?? null,
    avatarUrl: deleted ? null : row.avatar_url ?? null,
    bio: deleted ? null : row.bio ?? null,
    createdAt: row.created_at,
  };
}

/** Public fields plus what the owner may see about themselves. Never leaks password_hash. */
export function toPrivateUser(row) {
  if (!row) return null;
  const out = {
    ...toPublicUser(row),
    email: row.email ?? null,
    role: row.role,
    status: row.status,
    pawPoints: row.paw_points ?? 0,
    pointsLifetimeEarned: row.points_lifetime_earned ?? 0,
    country: row.country ?? null,
    postalCode: row.postal_code ?? null,
    marketingOptIn: !!row.marketing_opt_in,
    featureConsentDefault: !!row.feature_consent_default,
    termsVersion: row.terms_version ?? null,
    termsAcceptedAt: row.terms_accepted_at ?? null,
    privacyVersion: row.privacy_version ?? null,
    needsTermsAcceptance: !hasAcceptedCurrent(row),
    hasPassword: !!row.password_hash,
    hasApple: !!row.apple_id,
    hasGoogle: !!row.google_id,
    bonuses: {
      welcome: !!row.bonus_welcome,
      profilePet: !!row.bonus_profile_pet,
      firstPost: !!row.bonus_first_post,
      firstOrder: !!row.bonus_first_order,
      firstCreation: !!row.bonus_first_creation,
    },
    lastSeenAt: row.last_seen_at ?? null,
  };
  if (row.shopify_customer_id) out.shopifyCustomerId = row.shopify_customer_id;
  return out;
}

export default {
  getUserById,
  getUserByEmail,
  getUserByHandle,
  toPublicUser,
  toPrivateUser,
  ensureHandle,
  touchLastSeen,
};

// ---------------------------------------------------------------------------------------------
// One-time bonus helper. Delegates to lib/points.js `awardOnce` when the module exports it
// (Backend B) and otherwise performs the same atomic flag-flip + award itself, so the signup
// flow keeps working while that module is still a stub.
// ---------------------------------------------------------------------------------------------

const BONUS_FLAGS = new Set([
  'bonus_welcome',
  'bonus_profile_pet',
  'bonus_first_post',
  'bonus_first_order',
  'bonus_first_creation',
]);

export async function awardBonusOnce(userId, flagColumn, amount, opts = {}, tx) {
  if (typeof points.awardOnce === 'function') return points.awardOnce(userId, flagColumn, amount, opts, tx);
  if (!BONUS_FLAGS.has(flagColumn)) throw new Error(`Unknown bonus flag ${flagColumn}`);
  const work = async (t) => {
    const row = await t.one(`SELECT id, ${flagColumn} AS flag FROM users WHERE id = $1 FOR UPDATE`, [userId]);
    if (!row || row.flag) return { awarded: false };
    await t.query(`UPDATE users SET ${flagColumn} = true WHERE id = $1`, [userId]);
    await points.awardPoints(userId, amount, { type: 'bonus', ...opts }, t);
    return { awarded: true };
  };
  return tx ? work(tx) : withTransaction(work);
}

/**
 * "Profile + first pet" bonus: awarded once when the user has a display name, an avatar and at
 * least one pet. Safe to call after any profile or pet change. Returns { awarded }.
 */
export async function maybeAwardProfilePetBonus(userId) {
  try {
    const row = await one(
      `SELECT u.display_name, u.avatar_url, u.bonus_profile_pet,
              (SELECT count(*) FROM pets p WHERE p.user_id = u.id)::int AS pet_count
       FROM users u WHERE u.id = $1`,
      [userId],
    );
    if (!row || row.bonus_profile_pet) return { awarded: false };
    if (!row.display_name || !row.avatar_url || row.pet_count < 1) return { awarded: false };
    const amount = RULES.profilePetBonus ?? RULES.profileAndPetBonus ?? 3;
    const result = await awardBonusOnce(userId, 'bonus_profile_pet', amount, {
      source: 'profile',
      description: 'Profile and first pet completed',
    });
    if (result.awarded) await track(EVENT.profile_completed, { userId, props: { bonus: amount } });
    return result;
  } catch (err) {
    console.error('[users] maybeAwardProfilePetBonus failed', { userId, error: err?.message });
    return { awarded: false };
  }
}
