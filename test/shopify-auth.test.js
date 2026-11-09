// Client-credentials Admin token exchange (Dev Dashboard apps). No network: fetch is stubbed.
process.env.SHOPIFY_STORE_DOMAIN = 'pawtella-test.myshopify.com';
process.env.SHOPIFY_CLIENT_ID = 'cid_test';
process.env.SHOPIFY_CLIENT_SECRET = 'csecret_test';
delete process.env.SHOPIFY_ADMIN_TOKEN;
delete process.env.SHOPIFY_WEBHOOK_SECRET;

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { env, flags } = await import('../lib/env.js');
const client = await import('../lib/shopify-client.js');

function stubFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const r = responses.shift();
    return { ok: r.status === 200, status: r.status, json: async () => r.body };
  };
  fn.calls = calls;
  return fn;
}

test('admin is enabled by client credentials and webhook secret defaults to the client secret', () => {
  assert.equal(flags.hasShopifyAdmin, true);
  assert.equal(env.shopify.webhookSecret, 'csecret_test');
});

test('exchanges client credentials once and caches the token', async () => {
  client.__resetAdminToken();
  const fetchImpl = stubFetch([{ status: 200, body: { access_token: 'tok_1', scope: 'read_products', expires_in: 86399 } }]);
  const a = await client.getAdminToken({ fetchImpl });
  const b = await client.getAdminToken({ fetchImpl });
  assert.equal(a, 'tok_1');
  assert.equal(b, 'tok_1');
  assert.equal(fetchImpl.calls.length, 1);
  const { url, init } = fetchImpl.calls[0];
  assert.equal(url, 'https://pawtella-test.myshopify.com/admin/oauth/access_token');
  assert.equal(init.headers['Content-Type'], 'application/x-www-form-urlencoded');
  const body = new URLSearchParams(init.body);
  assert.equal(body.get('grant_type'), 'client_credentials');
  assert.equal(body.get('client_id'), 'cid_test');
  assert.equal(body.get('client_secret'), 'csecret_test');
  assert.equal(body.get('scope'), null);
});

test('concurrent callers share one in-flight request; force refreshes', async () => {
  client.__resetAdminToken();
  const fetchImpl = stubFetch([
    { status: 200, body: { access_token: 'tok_a', expires_in: 86399 } },
    { status: 200, body: { access_token: 'tok_b', expires_in: 86399 } },
  ]);
  const tokens = await Promise.all([1, 2, 3].map(() => client.getAdminToken({ fetchImpl })));
  assert.deepEqual(tokens, ['tok_a', 'tok_a', 'tok_a']);
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(await client.getAdminToken({ fetchImpl, force: true }), 'tok_b');
});

test('refreshes a token that is about to expire', async () => {
  client.__resetAdminToken();
  const fetchImpl = stubFetch([
    { status: 200, body: { access_token: 'short', expires_in: 60 } },
    { status: 200, body: { access_token: 'renewed', expires_in: 86399 } },
  ]);
  assert.equal(await client.getAdminToken({ fetchImpl }), 'short');
  assert.equal(await client.getAdminToken({ fetchImpl }), 'renewed');
});

test('surfaces Shopify auth errors as 502', async () => {
  client.__resetAdminToken();
  const fetchImpl = stubFetch([
    { status: 400, body: { error: 'shop_not_permitted', error_description: 'Client credentials cannot be performed on this shop.' } },
  ]);
  await assert.rejects(client.getAdminToken({ fetchImpl }), (err) => {
    assert.equal(err.status, 502);
    assert.match(err.message, /cannot be performed on this shop/);
    return true;
  });
});
