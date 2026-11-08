// Authentication helpers: JWT sessions, password hashing, Apple / Google identity token
// verification. HTTP handlers live in api/auth.js.
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from './env.js';
import { unauthorized, forbidden, badRequest } from './http.js';

const JWT_EXPIRY = '30d';
const BCRYPT_COST = 10;
export const MIN_PASSWORD_LENGTH = 8;

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo?id_token=';

// ---------------------------------------------------------------------------------------------
// JWT
// ---------------------------------------------------------------------------------------------

/** Sign a 30-day session token. Payload: { sub: userId, role }. */
export function signToken({ id, role = 'user' }) {
  if (id === undefined || id === null) throw new Error('signToken requires an id');
  return jwt.sign({ role }, env.jwtSecret, {
    subject: String(id),
    expiresIn: JWT_EXPIRY,
    algorithm: 'HS256',
  });
}

/** Verify a session token. Returns { userId, role } or throws 401. */
export function verifyToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw unauthorized('Invalid or expired token');
  }
  const userId = parseInt(payload.sub, 10);
  if (!Number.isInteger(userId)) throw unauthorized('Invalid token subject');
  const role = payload.role === 'admin' ? 'admin' : 'user';
  return { userId, role };
}

function bearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  if (typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

/** Require a valid Bearer token. Returns { userId, role }; throws 401 otherwise. */
export async function requireAuth(req) {
  const token = bearerToken(req);
  if (!token) throw unauthorized('Missing bearer token');
  return verifyToken(token);
}

/** Like requireAuth but returns null when no (or an invalid) token is present. */
export async function optionalAuth(req) {
  const token = bearerToken(req);
  if (!token) return null;
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}

/** Require an admin. Throws 401 when unauthenticated, 403 when not admin. */
export async function requireAdmin(req) {
  const auth = await requireAuth(req);
  if (auth.role !== 'admin') throw forbidden('Admin only');
  return auth;
}

// ---------------------------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------------------------

export function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD_LENGTH) {
    throw badRequest(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (pw.length > 200) throw badRequest('Password is too long');
}

export async function hashPassword(pw) {
  validatePassword(pw);
  return bcrypt.hash(pw, BCRYPT_COST);
}

export async function verifyPassword(pw, hash) {
  if (typeof pw !== 'string' || typeof hash !== 'string' || !hash) return false;
  try {
    return await bcrypt.compare(pw, hash);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Apple Sign In
// ---------------------------------------------------------------------------------------------

let appleJwks;
function getAppleJwks() {
  if (!appleJwks) appleJwks = createRemoteJWKSet(new URL(APPLE_JWKS_URL));
  return appleJwks;
}

/**
 * Verify an Apple identity token (signature against Apple's JWKS, issuer, expiry, audience).
 * Returns { providerId, email, emailVerified }. Throws 401 on any failure.
 * The audience check is skipped only when APPLE_BUNDLE_ID is unset AND not in production.
 */
export async function verifyAppleIdentityToken(identityToken) {
  if (typeof identityToken !== 'string' || identityToken.split('.').length !== 3) {
    throw unauthorized('Invalid Apple identity token');
  }
  const options = { issuer: APPLE_ISSUER, algorithms: ['RS256'] };
  if (env.apple.bundleId) {
    options.audience = env.apple.bundleId;
  } else if (env.isProd) {
    console.error('[auth] APPLE_BUNDLE_ID is not set in production; refusing Apple sign-in');
    throw unauthorized('Apple sign-in is not configured');
  } else {
    console.warn('[auth] APPLE_BUNDLE_ID unset: skipping Apple audience check (dev only)');
  }
  let payload;
  try {
    ({ payload } = await jwtVerify(identityToken, getAppleJwks(), options));
  } catch (err) {
    console.warn('[auth] Apple token verification failed', { error: err?.code || err?.message });
    throw unauthorized('Invalid Apple identity token');
  }
  if (!payload.sub) throw unauthorized('Invalid Apple identity token');
  const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
  return {
    providerId: String(payload.sub),
    email: typeof payload.email === 'string' ? payload.email.toLowerCase() : null,
    emailVerified,
    isPrivateEmail: payload.is_private_email === true || payload.is_private_email === 'true',
  };
}

// ---------------------------------------------------------------------------------------------
// Google Sign In
// ---------------------------------------------------------------------------------------------

/**
 * Verify a Google ID token via the tokeninfo endpoint and check the audience against
 * GOOGLE_CLIENT_IDS. Returns { providerId, email, emailVerified, name, picture }. Throws 401.
 */
export async function verifyGoogleIdToken(idToken) {
  if (typeof idToken !== 'string' || !idToken || idToken.length > 4096) {
    throw unauthorized('Invalid Google ID token');
  }
  let data;
  try {
    const resp = await fetch(GOOGLE_TOKENINFO_URL + encodeURIComponent(idToken));
    if (!resp.ok) throw new Error(`tokeninfo ${resp.status}`);
    data = await resp.json();
  } catch (err) {
    console.warn('[auth] Google token verification failed', { error: err?.message });
    throw unauthorized('Invalid Google ID token');
  }
  if (!data?.sub) throw unauthorized('Invalid Google ID token');
  const okIssuer = data.iss === 'accounts.google.com' || data.iss === 'https://accounts.google.com';
  if (!okIssuer) throw unauthorized('Invalid Google ID token issuer');
  if (data.exp && Number(data.exp) * 1000 < Date.now()) throw unauthorized('Google ID token expired');

  const allowed = env.google.clientIds;
  if (allowed.length) {
    if (!allowed.includes(data.aud)) throw unauthorized('Google ID token audience mismatch');
  } else if (env.isProd) {
    console.error('[auth] GOOGLE_CLIENT_IDS is not set in production; refusing Google sign-in');
    throw unauthorized('Google sign-in is not configured');
  } else {
    console.warn('[auth] GOOGLE_CLIENT_IDS unset: skipping Google audience check (dev only)');
  }
  return {
    providerId: String(data.sub),
    email: typeof data.email === 'string' ? data.email.toLowerCase() : null,
    emailVerified: data.email_verified === true || data.email_verified === 'true',
    name: data.name || null,
    picture: data.picture || null,
  };
}

export default {
  requireAuth,
  optionalAuth,
  requireAdmin,
  signToken,
  verifyToken,
  hashPassword,
  verifyPassword,
  verifyAppleIdentityToken,
  verifyGoogleIdToken,
};
