// Cart ids are Shopify GIDs — `gid://shopify/Cart/<token>?key=<key>` — full of reserved URL
// characters ('/', ':', '?', '='). Putting one in a URL path segment (even percent-encoded) is
// unsafe: Vercel/Next answers a 308 that normalizes `%2F` back to `/` and collapses `//`, so the
// id arrives split and with a slash dropped (`gid:/shopify/...`) and the API self-heals it away.
// The fix is to carry the id as an opaque base64url token with no reserved characters, so the
// segment survives path normalization untouched. These tests pin that codec.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeCartToken, decodeCartToken, isCartId } from '../lib/shopify-client.js';

const IDS = [
  'gid://shopify/Cart/c1-36e8477271a658e2ec3ebd1bf2506686?key=ba72b8f664bfb53a09522a0e789123de',
  'gid://shopify/Cart/123456789',
  'gid://shopify/Cart/missing',
  // Pathological but legal: slashes, a question mark, and multiple '=' in the id.
  'gid://shopify/Cart/c1-abc?key=def=ghi/extra',
];

test('encodeCartToken emits a URL-safe token (only [A-Za-z0-9_-], no reserved chars)', () => {
  for (const id of IDS) {
    const token = encodeCartToken(id);
    assert.match(token, /^[A-Za-z0-9_-]+$/, `token for ${id} must be URL-path-safe`);
    // The characters that trigger 308 normalization must be absent from the token.
    assert.ok(!/[/:?=%]/.test(token), 'token must not contain / : ? = or %');
  }
});

test('decodeCartToken round-trips ids containing / ? = through the token form', () => {
  for (const id of IDS) {
    assert.equal(decodeCartToken(encodeCartToken(id)), id);
  }
});

test('decodeCartToken matches the browser btoa-based encoder (same bytes)', () => {
  // The web client encodes with btoa(id) then +/= → -_ (and strips padding). Reproduce that here
  // to prove the server decodes exactly what the browser produces.
  const browserEncode = (id) =>
    Buffer.from(id, 'binary').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  for (const id of IDS) {
    assert.equal(decodeCartToken(browserEncode(id)), id);
  }
});

test('decodeCartToken still accepts a legacy percent-encoded gid (back-compat)', () => {
  const id = 'gid://shopify/Cart/c1-abc?key=def';
  assert.equal(decodeCartToken(encodeURIComponent(id)), id);
});

test('decodeCartToken still accepts a legacy raw gid segment (back-compat)', () => {
  const id = 'gid://shopify/Cart/c1-abc';
  assert.equal(decodeCartToken(id), id);
});

test('decodeCartToken leaves junk as a non-cart value so the API self-heals', () => {
  // The literal 'undefined' is valid base64url but does not decode to a gid → returned as-is.
  assert.equal(isCartId(decodeCartToken('undefined')), false);
  assert.equal(isCartId(decodeCartToken('')), false);
});
