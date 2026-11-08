// Auth: lib/auth.js + lib/users.js + lib/referrals.js + api/auth.js against the local Postgres.
import '../scripts/load-env.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { closePool, one, query } from '../lib/db.js';
import { env } from '../lib/env.js';
import { signToken, verifyToken, requireAuth, optionalAuth, requireAdmin, hashPassword, verifyPassword } from '../lib/auth.js';
import { slugifyHandle, ensureHandle, isValidHandle, toPrivateUser } from '../lib/users.js';
import { getOrCreateReferralCode, resolveCode, onReferredConversion, normalizeCode } from '../lib/referrals.js';
import { RULES } from '../lib/points-rules.js';
import authHandler from '../api/auth.js';
import usersHandler from '../api/users.js';

const suffix = () => crypto.randomBytes(5).toString('hex');

/** Invoke a Vercel-style handler with a fake req/res; resolves { status, body }. */
export function call(handler, method, url, { body, token, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url, 'http://localhost');
    const req = {
      method,
      url: u.pathname + u.search,
      headers: { 'content-type': 'application/json', ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) },
      query: Object.fromEntries(u.searchParams.entries()),
      body,
      socket: { remoteAddress: '127.0.0.1' },
    };
    const res = {
      statusCode: 200,
      headersSent: false,
      writableEnded: false,
      _headers: {},
      setHeader(k, v) {
        this._headers[k.toLowerCase()] = v;
      },
      getHeader(k) {
        return this._headers[k.toLowerCase()];
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(obj) {
        this.end(JSON.stringify(obj));
        return this;
      },
      end(data) {
        this.headersSent = true;
        this.writableEnded = true;
        let parsed = null;
        if (data) {
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
        }
        resolve({ status: this.statusCode, body: parsed });
      },
    };
    handler(req, res).catch(reject);
  });
}

after(() => closePool());

// ---------------------------------------------------------------------------------------------
// Pure logic
// ---------------------------------------------------------------------------------------------

test('signToken / verifyToken round-trip with {sub, role} payload, 30d expiry', () => {
  const token = signToken({ id: 42, role: 'admin' });
  const decoded = jwt.decode(token);
  assert.equal(decoded.sub, '42');
  assert.equal(decoded.role, 'admin');
  const days = (decoded.exp - decoded.iat) / 86400;
  assert.ok(days > 29.9 && days < 30.1, `expiry should be 30 days, got ${days}`);
  assert.deepEqual(verifyToken(token), { userId: 42, role: 'admin' });
});

test('requireAuth rejects missing, malformed and tampered tokens with 401', async () => {
  await assert.rejects(requireAuth({ headers: {} }), (e) => e.status === 401);
  await assert.rejects(requireAuth({ headers: { authorization: 'Basic abc' } }), (e) => e.status === 401);
  await assert.rejects(requireAuth({ headers: { authorization: 'Bearer not.a.jwt' } }), (e) => e.status === 401);
  const other = jwt.sign({ role: 'admin' }, 'wrong-secret', { subject: '1' });
  await assert.rejects(requireAuth({ headers: { authorization: `Bearer ${other}` } }), (e) => e.status === 401);
  const none = jwt.sign({ role: 'admin', sub: '1' }, '', { algorithm: 'none' });
  await assert.rejects(requireAuth({ headers: { authorization: `Bearer ${none}` } }), (e) => e.status === 401);
  assert.equal(await optionalAuth({ headers: {} }), null);
  assert.equal(await optionalAuth({ headers: { authorization: 'Bearer junk' } }), null);
});

test('requireAdmin: 403 for users, ok for admins', async () => {
  const userTok = signToken({ id: 7, role: 'user' });
  await assert.rejects(requireAdmin({ headers: { authorization: `Bearer ${userTok}` } }), (e) => e.status === 403);
  const adminTok = signToken({ id: 8, role: 'admin' });
  assert.deepEqual(await requireAdmin({ headers: { authorization: `Bearer ${adminTok}` } }), { userId: 8, role: 'admin' });
});

test('hashPassword/verifyPassword: bcrypt, min 8 chars', async () => {
  await assert.rejects(hashPassword('short'), (e) => e.status === 400);
  const hash = await hashPassword('correct horse');
  assert.ok(hash.startsWith('$2'));
  assert.equal(await verifyPassword('correct horse', hash), true);
  assert.equal(await verifyPassword('wrong', hash), false);
  assert.equal(await verifyPassword('x', null), false);
});

test('slugifyHandle normalises names and emails', () => {
  assert.equal(slugifyHandle('Zoë Müller-Smith'), 'zoe_muller_smith');
  assert.equal(slugifyHandle('Ann.Lee+tag@example.com'), 'ann_lee_tag');
  assert.equal(slugifyHandle('a_very_long_display_name_for_someone'), 'a_very_long_display');
  assert.equal(slugifyHandle('admin'), 'admin_');
  assert.ok(isValidHandle(slugifyHandle('!!')), 'garbage input still yields a valid handle');
  assert.ok(isValidHandle(slugifyHandle('x')), 'short input is padded to 3 chars');
  assert.equal(isValidHandle('Bad Handle'), false);
  assert.equal(isValidHandle('ok_handle9'), true);
});

test('normalizeCode accepts loose input and rejects junk', () => {
  assert.equal(normalizeCode(' ab-cd 23 '), 'ABCD23');
  assert.equal(normalizeCode('x'), null);
  assert.equal(normalizeCode(123), null);
});

test('toPrivateUser never leaks password_hash', () => {
  const u = toPrivateUser({ id: 1, handle: 'h', password_hash: 'secret', role: 'user', status: 'active', paw_points: 3 });
  assert.equal(JSON.stringify(u).includes('secret'), false);
  assert.equal(u.pawPoints, 3);
  assert.equal(u.hasPassword, true);
});

// ---------------------------------------------------------------------------------------------
// Provider tokens (no real network needed: garbage never verifies)
// ---------------------------------------------------------------------------------------------

test('POST /api/auth/apple with bogus identity tokens → 401', async () => {
  const r1 = await call(authHandler, 'POST', '/api/auth/apple', { body: { identityToken: 'garbage' } });
  assert.equal(r1.status, 401);
  // Well-formed but self-signed JWT claiming to be from Apple: must fail signature verification.
  const fake = jwt.sign({ iss: 'https://appleid.apple.com', sub: 'abc', email: 'a@b.co' }, 'nope', { audience: env.apple.bundleId || 'x' });
  const r2 = await call(authHandler, 'POST', '/api/auth/apple', { body: { identityToken: fake } });
  assert.equal(r2.status, 401);
  const r3 = await call(authHandler, 'POST', '/api/auth/apple', { body: {} });
  assert.equal(r3.status, 400);
});

test('POST /api/auth/google with a bogus id token → 401', async () => {
  const r = await call(authHandler, 'POST', '/api/auth/google', { body: { idToken: 'garbage-token' } });
  assert.equal(r.status, 401);
});

// ---------------------------------------------------------------------------------------------
// Register → login → me, handles, duplicates
// ---------------------------------------------------------------------------------------------

test('register → login → me; welcome bonus, referral code, handle generation', async () => {
  const s = suffix();
  const email = `Test.User+${s}@Example.com`;
  const reg = await call(authHandler, 'POST', '/api/auth/register', {
    body: { email, password: 'password123', displayName: 'Test User' },
  });
  assert.equal(reg.status, 200, JSON.stringify(reg.body));
  assert.equal(reg.body.isNew, true);
  assert.ok(reg.body.token);
  assert.equal(reg.body.user.email, email.toLowerCase());
  assert.ok(reg.body.user.handle.startsWith('test_user'), reg.body.user.handle);
  assert.equal(reg.body.user.pawPoints, RULES.welcomeBonus);
  assert.equal(reg.body.user.bonuses.welcome, true);
  assert.match(reg.body.user.referralCode, /^[A-Z0-9]{6,8}$/);
  assert.equal('passwordHash' in reg.body.user, false);

  const ev = await one(`SELECT 1 FROM events WHERE user_id = $1 AND name = 'signup'`, [reg.body.user.id]);
  assert.ok(ev, 'signup event tracked');

  const bad = await call(authHandler, 'POST', '/api/auth/login', { body: { email, password: 'wrong-password' } });
  assert.equal(bad.status, 401);

  const login = await call(authHandler, 'POST', '/api/auth/login', { body: { email: email.toUpperCase(), password: 'password123' } });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  assert.equal(login.body.user.id, reg.body.user.id);
  assert.equal(login.body.user.referralCode, reg.body.user.referralCode);

  const me = await call(authHandler, 'GET', '/api/auth/me', { token: login.body.token });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.id, reg.body.user.id);
  assert.deepEqual(me.body.pets, []);
  const seen = await one('SELECT last_seen_at FROM users WHERE id = $1', [reg.body.user.id]);
  assert.ok(seen.last_seen_at, 'login touches last_seen_at');

  const noTok = await call(authHandler, 'GET', '/api/auth/me');
  assert.equal(noTok.status, 401);
});

test('duplicate email → 409; duplicate handle → 409; invalid inputs → 400', async () => {
  const s = suffix();
  const email = `dup${s}@example.com`;
  const first = await call(authHandler, 'POST', '/api/auth/register', { body: { email, password: 'password123', handle: `dup_${s}` } });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.user.handle, `dup_${s}`);
  const again = await call(authHandler, 'POST', '/api/auth/register', { body: { email: email.toUpperCase(), password: 'password123' } });
  assert.equal(again.status, 409);
  const sameHandle = await call(authHandler, 'POST', '/api/auth/register', { body: { email: `other${s}@example.com`, password: 'password123', handle: `DUP_${s}` } });
  assert.equal(sameHandle.status, 409);
  const badHandle = await call(authHandler, 'POST', '/api/auth/register', { body: { email: `x${s}@example.com`, password: 'password123', handle: 'no spaces!' } });
  assert.equal(badHandle.status, 400);
  const shortPw = await call(authHandler, 'POST', '/api/auth/register', { body: { email: `y${s}@example.com`, password: 'short' } });
  assert.equal(shortPw.status, 400);
  const badEmail = await call(authHandler, 'POST', '/api/auth/register', { body: { email: 'nope', password: 'password123' } });
  assert.equal(badEmail.status, 400);
  const unknown = await call(authHandler, 'POST', '/api/auth/whatever', { body: {} });
  assert.equal(unknown.status, 404);
});

test('ensureHandle appends numeric suffixes when the base is taken', async () => {
  const base = `collide_${suffix()}`;
  const h1 = await ensureHandle(base);
  assert.equal(h1, base);
  await query(`INSERT INTO users (handle) VALUES ($1)`, [h1]);
  const h2 = await ensureHandle(base);
  assert.equal(h2, `${base}1`);
  await query(`INSERT INTO users (handle) VALUES ($1)`, [h2]);
  const h3 = await ensureHandle(base);
  assert.equal(h3, `${base}2`);
  assert.ok(isValidHandle(h3));
  // Long base: suffix must still fit in 20 chars.
  const long = await ensureHandle('abcdefghijklmnopqrstuvwxyz');
  assert.ok(long.length <= 20 && isValidHandle(long));
});

// ---------------------------------------------------------------------------------------------
// Referrals
// ---------------------------------------------------------------------------------------------

test('referral attribution: signup bonus to the friend, conversion bonus to the referrer once', async () => {
  const s = suffix();
  const referrer = await call(authHandler, 'POST', '/api/auth/register', { body: { email: `ref${s}@example.com`, password: 'password123', displayName: 'Ref Errer' } });
  assert.equal(referrer.status, 200);
  const code = referrer.body.user.referralCode;
  assert.equal(await getOrCreateReferralCode(referrer.body.user.id), code, 'code is stable');
  assert.deepEqual(await resolveCode(code.toLowerCase()), { kind: 'user', userId: referrer.body.user.id });
  assert.equal(await resolveCode('ZZZZZZ99'), null);

  const friend = await call(authHandler, 'POST', '/api/auth/register', {
    body: { email: `friend${s}@example.com`, password: 'password123', referralCode: code },
  });
  assert.equal(friend.status, 200, JSON.stringify(friend.body));
  assert.equal(friend.body.user.pawPoints, RULES.welcomeBonus + RULES.referredSignupBonus);

  const ref = await one('SELECT * FROM referrals WHERE referred_id = $1', [friend.body.user.id]);
  assert.ok(ref);
  assert.equal(ref.referrer_id, referrer.body.user.id);
  assert.equal(ref.source, 'invite');
  assert.equal(ref.signup_bonus_awarded, true);
  assert.equal(ref.conversion_bonus_awarded, false);
  const u = await one('SELECT referred_by_user_id, signup_source FROM users WHERE id = $1', [friend.body.user.id]);
  assert.equal(u.referred_by_user_id, referrer.body.user.id);
  assert.equal(u.signup_source, 'invite');
  const ev = await one(`SELECT 1 FROM events WHERE user_id = $1 AND name = 'referral_signup'`, [referrer.body.user.id]);
  assert.ok(ev, 'referral_signup event tracked for the referrer');

  const before = (await one('SELECT paw_points FROM users WHERE id = $1', [referrer.body.user.id])).paw_points;
  const r1 = await onReferredConversion(friend.body.user.id, 'creation');
  assert.equal(r1.awarded, true);
  const r2 = await onReferredConversion(friend.body.user.id, 'order');
  assert.equal(r2.awarded, false, 'conversion bonus is paid only once');
  const after = (await one('SELECT paw_points FROM users WHERE id = $1', [referrer.body.user.id])).paw_points;
  assert.equal(after - before, RULES.referralConversionBonus);
  assert.equal((await onReferredConversion(999999999, 'order')).awarded, false, 'unknown user is a no-op');

  // Self-referral and unknown codes are ignored without failing the signup.
  const selfish = await call(authHandler, 'POST', '/api/auth/register', {
    body: { email: `self${s}@example.com`, password: 'password123', referralCode: 'NOPE99' },
  });
  assert.equal(selfish.status, 200);
  assert.equal(selfish.body.user.pawPoints, RULES.welcomeBonus);
});

// ---------------------------------------------------------------------------------------------
// Forgot / reset
// ---------------------------------------------------------------------------------------------

test('forgot/reset password flow (mock email)', async () => {
  const s = suffix();
  const email = `reset${s}@example.com`;
  const reg = await call(authHandler, 'POST', '/api/auth/register', { body: { email, password: 'password123' } });
  assert.equal(reg.status, 200);
  const forgot = await call(authHandler, 'POST', '/api/auth/forgot', { body: { email } });
  assert.equal(forgot.status, 200);
  assert.deepEqual(forgot.body, { ok: true });
  const unknown = await call(authHandler, 'POST', '/api/auth/forgot', { body: { email: `nobody${s}@example.com` } });
  assert.deepEqual(unknown.body, { ok: true }, 'does not reveal whether the email exists');

  const row = await one('SELECT token_hash FROM password_resets WHERE user_id = $1 ORDER BY id DESC LIMIT 1', [reg.body.user.id]);
  assert.ok(row);
  const badReset = await call(authHandler, 'POST', '/api/auth/reset', { body: { token: 'wrong', password: 'newpassword1' } });
  assert.equal(badReset.status, 400);

  // Simulate knowing the raw token by planting our own hash.
  const raw = crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  await query(`INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 hour')`, [reg.body.user.id, hash]);
  const reset = await call(authHandler, 'POST', '/api/auth/reset', { body: { token: raw, password: 'newpassword1' } });
  assert.equal(reset.status, 200, JSON.stringify(reset.body));
  assert.ok(reset.body.token);
  const reuse = await call(authHandler, 'POST', '/api/auth/reset', { body: { token: raw, password: 'newpassword2' } });
  assert.equal(reuse.status, 400, 'reset tokens are single-use');
  const oldLogin = await call(authHandler, 'POST', '/api/auth/login', { body: { email, password: 'password123' } });
  assert.equal(oldLogin.status, 401);
  const newLogin = await call(authHandler, 'POST', '/api/auth/login', { body: { email, password: 'newpassword1' } });
  assert.equal(newLogin.status, 200);
});

// ---------------------------------------------------------------------------------------------
// Account deletion
// ---------------------------------------------------------------------------------------------

test('DELETE /api/auth/account anonymizes the user and revokes access', async () => {
  const s = suffix();
  const email = `gone${s}@example.com`;
  const reg = await call(authHandler, 'POST', '/api/auth/register', { body: { email, password: 'password123', displayName: 'Gone Soon' } });
  assert.equal(reg.status, 200);
  const id = reg.body.user.id;
  const del = await call(authHandler, 'DELETE', '/api/auth/account', { token: reg.body.token });
  assert.equal(del.status, 200, JSON.stringify(del.body));
  const row = await one('SELECT * FROM users WHERE id = $1', [id]);
  assert.equal(row.email, null);
  assert.equal(row.password_hash, null);
  assert.equal(row.apple_id, null);
  assert.equal(row.google_id, null);
  assert.equal(row.display_name, null);
  assert.equal(row.status, 'deleted');
  assert.equal(row.handle, `deleted_${id}`);
  assert.equal(await one('SELECT 1 FROM referral_codes WHERE user_id = $1', [id]), null);

  const me = await call(authHandler, 'GET', '/api/auth/me', { token: reg.body.token });
  assert.equal(me.status, 401, 'old token no longer works');
  const login = await call(authHandler, 'POST', '/api/auth/login', { body: { email, password: 'password123' } });
  assert.equal(login.status, 401);
  const profile = await call(usersHandler, 'GET', `/api/users/deleted_${id}`);
  assert.equal(profile.status, 404, 'deleted profiles are not public');
  // The email can be used again for a fresh account.
  const again = await call(authHandler, 'POST', '/api/auth/register', { body: { email, password: 'password123' } });
  assert.equal(again.status, 200);
});
