// Auth route family: /api/auth/{register,login,apple,google,me,forgot,reset,account}
import crypto from 'node:crypto';
import { route, segments, body, requireFields, badRequest, unauthorized, forbidden, notFound, conflict } from '../lib/http.js';
import { withTransaction, query, one, many } from '../lib/db.js';
import { env } from '../lib/env.js';
import {
  requireAuth,
  signToken,
  hashPassword,
  verifyPassword,
  validatePassword,
  verifyAppleIdentityToken,
  verifyGoogleIdToken,
} from '../lib/auth.js';
import {
  getUserById,
  getUserByEmail,
  getUserByAppleId,
  getUserByGoogleId,
  ensureHandle,
  isValidHandle,
  toPrivateUser,
  touchLastSeen,
  awardBonusOnce,
} from '../lib/users.js';
import { RULES } from '../lib/points-rules.js';
import { getOrCreateReferralCode, attributeSignup } from '../lib/referrals.js';
import { track, EVENT } from '../lib/events.js';
import { sendEmail } from '../lib/email.js';
import { camelize } from '../lib/serialize.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_TTL_MS = 60 * 60 * 1000;

function normalizeEmail(email) {
  if (typeof email !== 'string') throw badRequest('Invalid email');
  const e = email.trim().toLowerCase();
  if (!EMAIL_RE.test(e) || e.length > 254) throw badRequest('Invalid email');
  return e;
}

function cleanName(name) {
  if (name === undefined || name === null) return null;
  const s = String(name).trim().replace(/\s+/g, ' ').slice(0, 60);
  return s || null;
}

function isUniqueViolation(err) {
  return err?.code === '23505';
}

async function listPets(userId) {
  const rows = await many('SELECT * FROM pets WHERE user_id = $1 ORDER BY is_primary DESC, created_at ASC', [userId]);
  return camelize(rows).map((p) => ({ ...p, weightKg: p.weightKg === null ? null : Number(p.weightKg) }));
}

/** Private user payload + referral code. */
async function userPayload(row) {
  const referralCode = await getOrCreateReferralCode(row.id);
  return { ...toPrivateUser(row), referralCode };
}

function assertActive(user) {
  if (!user || user.status === 'deleted') throw unauthorized('Invalid credentials');
  if (user.status === 'suspended') throw forbidden('This account is suspended');
}

/**
 * Insert a new user and run every signup side effect in one transaction: handle, welcome
 * bonus, referral code, referral/partner attribution, signup event.
 */
async function createUser({ email, passwordHash, appleId, googleId, displayName, avatarUrl, requestedHandle, referralCode, partnerCode, provider }) {
  return withTransaction(async (tx) => {
    let handle;
    if (requestedHandle !== undefined && requestedHandle !== null && requestedHandle !== '') {
      const h = String(requestedHandle).trim().toLowerCase();
      if (!isValidHandle(h)) throw badRequest('Handle must be 3-20 characters: lowercase letters, numbers, underscores');
      if (await tx.one('SELECT 1 FROM users WHERE handle = $1', [h])) throw conflict('That handle is taken');
      handle = h;
    } else {
      handle = await ensureHandle(displayName || email || 'pawfriend', tx);
    }
    const source = partnerCode ? 'partner' : referralCode ? 'invite' : 'organic';
    const user = await tx.one(
      `INSERT INTO users (email, password_hash, apple_id, google_id, handle, display_name, avatar_url, signup_source, email_verified_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [email ?? null, passwordHash ?? null, appleId ?? null, googleId ?? null, handle, displayName ?? null, avatarUrl ?? null, source, provider && provider !== 'email' && email ? new Date() : null],
    );
    await awardBonusOnce(user.id, 'bonus_welcome', RULES.welcomeBonus, {
      source: 'welcome',
      description: 'Welcome to Pawtella',
    }, tx);
    await getOrCreateReferralCode(user.id, tx);
    const code = referralCode || partnerCode;
    if (code) await attributeSignup(user.id, { code, source: 'invite' }, tx);
    await track(EVENT.signup, { userId: user.id, props: { provider: provider || 'email', source, hasReferral: !!code } }, tx);
    return (await getUserById(user.id, tx)) ?? user;
  });
}

async function respondSession(user, isNew) {
  const token = signToken({ id: user.id, role: user.role });
  const payload = { token, user: await userPayload(user) };
  if (isNew !== undefined) payload.isNew = isNew;
  return payload;
}

// ---------------------------------------------------------------------------------------------

async function register(req) {
  const b = requireFields(body(req), ['email', 'password']);
  const email = normalizeEmail(b.email);
  validatePassword(b.password);
  if (await getUserByEmail(email)) throw conflict('An account with that email already exists');
  const passwordHash = await hashPassword(b.password);
  let user;
  try {
    user = await createUser({
      email,
      passwordHash,
      displayName: cleanName(b.displayName),
      requestedHandle: b.handle,
      referralCode: b.referralCode,
      partnerCode: b.partnerCode,
      provider: 'email',
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict('An account with that email or handle already exists');
    throw err;
  }
  console.log('[auth] registered', { userId: user.id });
  return respondSession(user, true);
}

async function login(req) {
  const b = requireFields(body(req), ['email', 'password']);
  const email = normalizeEmail(b.email);
  const user = await getUserByEmail(email);
  if (!user || !user.password_hash) throw unauthorized('Invalid credentials');
  if (!(await verifyPassword(b.password, user.password_hash))) throw unauthorized('Invalid credentials');
  assertActive(user);
  await track(EVENT.login, { userId: user.id, props: { provider: 'email' } });
  await touchLastSeen(user.id);
  return respondSession(user);
}

/** Shared find-or-create for social providers. */
async function socialSignIn({ provider, providerId, email, displayName, avatarUrl, referralCode, partnerCode }) {
  const column = provider === 'apple' ? 'apple_id' : 'google_id';
  let user = provider === 'apple' ? await getUserByAppleId(providerId) : await getUserByGoogleId(providerId);
  let isNew = false;
  if (!user && email) {
    // Link to an existing email account (provider verified the email).
    const existing = await getUserByEmail(email);
    if (existing && existing.status !== 'deleted') {
      user = await one(`UPDATE users SET ${column} = $2, email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1 RETURNING *`, [existing.id, providerId]);
    }
  }
  if (!user) {
    try {
      user = await createUser({
        email,
        appleId: provider === 'apple' ? providerId : null,
        googleId: provider === 'google' ? providerId : null,
        displayName,
        avatarUrl,
        referralCode,
        partnerCode,
        provider,
      });
      isNew = true;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Lost a race with a concurrent sign-in for the same identity: load it.
      user = provider === 'apple' ? await getUserByAppleId(providerId) : await getUserByGoogleId(providerId);
      if (!user) throw conflict('An account with that email already exists');
    }
  }
  assertActive(user);
  if (!isNew) {
    await track(EVENT.login, { userId: user.id, props: { provider } });
    await touchLastSeen(user.id);
  }
  return respondSession(user, isNew);
}

async function apple(req) {
  const b = requireFields(body(req), ['identityToken']);
  const claims = await verifyAppleIdentityToken(b.identityToken);
  const fn = b.fullName && typeof b.fullName === 'object' ? b.fullName : {};
  const displayName = cleanName([fn.givenName, fn.familyName].filter(Boolean).join(' ')) || cleanName(b.displayName);
  return socialSignIn({
    provider: 'apple',
    providerId: claims.providerId,
    email: claims.email,
    displayName,
    avatarUrl: null,
    referralCode: b.referralCode,
    partnerCode: b.partnerCode,
  });
}

async function google(req) {
  const b = requireFields(body(req), ['idToken']);
  const claims = await verifyGoogleIdToken(b.idToken);
  return socialSignIn({
    provider: 'google',
    providerId: claims.providerId,
    email: claims.emailVerified ? claims.email : null,
    displayName: cleanName(claims.name),
    avatarUrl: claims.picture,
    referralCode: b.referralCode,
    partnerCode: b.partnerCode,
  });
}

async function me(req) {
  const { userId } = await requireAuth(req);
  const user = await getUserById(userId);
  if (!user || user.status === 'deleted') throw unauthorized('Account not found');
  const [payload, pets] = await Promise.all([userPayload(user), listPets(userId)]);
  return { user: payload, pets };
}

async function forgot(req) {
  const b = requireFields(body(req), ['email']);
  let email;
  try {
    email = normalizeEmail(b.email);
  } catch {
    return { ok: true }; // never reveal whether an email exists
  }
  const user = await getUserByEmail(email);
  if (user && user.status === 'active') {
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await query('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [
      user.id,
      tokenHash,
      new Date(Date.now() + RESET_TTL_MS),
    ]);
    const webLink = `${env.appUrl}/reset?token=${token}`;
    const appLink = `${env.appScheme}://reset-password?token=${token}`;
    try {
      const result = await sendEmail({
        to: user.email,
        subject: 'Reset your Pawtella password',
        text: `Tap to reset your password (valid for 1 hour): ${webLink}\n\nOpen in the app: ${appLink}\n\nIf you did not ask for this, ignore this email.`,
        html: `<p>Tap to reset your password (valid for 1 hour):</p><p><a href="${webLink}">${webLink}</a></p><p>Open in the app: <a href="${appLink}">${appLink}</a></p><p>If you did not ask for this, ignore this email.</p>`,
      });
      if (result?.mock) console.log('[auth] password reset link (mock email)', { userId: user.id, webLink });
      else console.log('[auth] password reset email sent', { userId: user.id });
    } catch (err) {
      console.error('[auth] password reset email failed', { userId: user.id, error: err?.message });
    }
  }
  return { ok: true };
}

async function reset(req) {
  const b = requireFields(body(req), ['token', 'password']);
  validatePassword(b.password);
  const tokenHash = crypto.createHash('sha256').update(String(b.token)).digest('hex');
  const passwordHash = await hashPassword(b.password);
  const user = await withTransaction(async (tx) => {
    const row = await tx.one(
      `SELECT * FROM password_resets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE`,
      [tokenHash],
    );
    if (!row) throw badRequest('This reset link is invalid or has expired');
    await tx.query('UPDATE password_resets SET used_at = now() WHERE id = $1', [row.id]);
    await tx.query('UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [row.user_id]);
    const u = await tx.one(`UPDATE users SET password_hash = $2 WHERE id = $1 AND status <> 'deleted' RETURNING *`, [row.user_id, passwordHash]);
    if (!u) throw badRequest('This reset link is invalid or has expired');
    return u;
  });
  assertActive(user);
  console.log('[auth] password reset', { userId: user.id });
  return respondSession(user);
}

/** App Store requirement: delete the account. We anonymize the row so ledgers stay consistent. */
async function deleteAccount(req) {
  const { userId } = await requireAuth(req);
  await withTransaction(async (tx) => {
    const user = await tx.one('SELECT id, status FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (!user) throw notFound('Account not found');
    await tx.query(
      `UPDATE users SET email = NULL, password_hash = NULL, apple_id = NULL, google_id = NULL,
         handle = $2, display_name = NULL, avatar_url = NULL, bio = NULL, push_token = NULL,
         postal_code = NULL, lat = NULL, lng = NULL, shopify_customer_id = NULL,
         marketing_opt_in = false, status = 'deleted'
       WHERE id = $1`,
      [userId, `deleted_${userId}`],
    );
    await tx.query('DELETE FROM password_resets WHERE user_id = $1', [userId]);
    // AI context memory + chat history: the user row is anonymized (not deleted) so FK cascade
    // won't fire — remove it explicitly. Deleting conversations cascades their messages. The memory
    // tables (migration 013) are removed only if present, so deletion stays safe on an environment
    // where that migration has not been applied yet.
    for (const table of ['ai_user_facts', 'ai_user_memory']) {
      const { rows } = await tx.query('SELECT to_regclass($1) AS reg', [`public.${table}`]);
      if (rows[0]?.reg) await tx.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
    }
    await tx.query('DELETE FROM ai_conversations WHERE user_id = $1', [userId]);
    await tx.query('DELETE FROM pets WHERE user_id = $1', [userId]);
    await tx.query('DELETE FROM referral_codes WHERE user_id = $1', [userId]);
    await tx.query('DELETE FROM follows WHERE follower_id = $1 OR followee_id = $1', [userId]);
    await tx.query(`UPDATE posts SET is_hidden = true, visibility = 'private' WHERE user_id = $1`, [userId]);
  });
  console.log('[auth] account deleted', { userId });
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------

const POST_ROUTES = { register, login, apple, google, forgot, reset };

export default route({
  POST: async (req) => {
    const [action, ...rest] = segments(req, '/api/auth');
    const fn = POST_ROUTES[action];
    if (!fn || rest.length) throw notFound();
    return fn(req);
  },
  GET: async (req) => {
    const [action, ...rest] = segments(req, '/api/auth');
    if (action === 'me' && !rest.length) return me(req);
    throw notFound();
  },
  DELETE: async (req) => {
    const [action, ...rest] = segments(req, '/api/auth');
    if (action === 'account' && !rest.length) return deleteAccount(req);
    throw notFound();
  },
});
