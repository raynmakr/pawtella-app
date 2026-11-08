import '../scripts/load-env.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { one, closePool } from '../lib/db.js';
import { env } from '../lib/env.js';
import { createPost } from '../lib/posts.js';
import { getOrCreateReferralCode } from '../lib/referrals.js';
import { cleanRef, REF_COOKIE } from '../lib/landing.js';
import postPage from '../api/p/[id].js';
import invitePage from '../api/r/[code].js';

const suffix = () => Math.random().toString(36).slice(2, 9);

async function call(handler, url, params = {}) {
  const u = new URL(url, 'http://test.local');
  const req = { method: 'GET', url: u.pathname + u.search, headers: {}, query: { ...Object.fromEntries(u.searchParams.entries()), ...params }, cookies: {}, socket: {} };
  const res = {
    statusCode: 200, headers: {}, body: '', headersSent: false, writableEnded: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = JSON.stringify(o); this.headersSent = true; this.writableEnded = true; return this; },
    end(d) { if (d !== undefined) this.body = String(d); this.headersSent = true; this.writableEnded = true; return this; },
  };
  await handler(req, res);
  return res;
}

const meta = (html, key) => {
  const m = html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`));
  return m ? m[1] : null;
};

after(() => closePool());

test('cleanRef sanitises (pure)', () => {
  assert.equal(cleanRef('ABC123'), 'ABC123');
  assert.equal(cleanRef(' ab-c_1 <script>'), 'ab-c_1script');
  assert.equal(cleanRef(''), null);
  assert.equal(cleanRef(undefined), null);
});

test('/p/:id renders OG tags, escapes content, sets the ref cookie and tracks the view', async () => {
  const s = suffix();
  const user = await one(`INSERT INTO users (email, handle, display_name) VALUES ($1, $2, 'Land Test') RETURNING *`, [`land-${s}@example.com`, `land_${s}`]);
  const pet = await one(`INSERT INTO pets (user_id, name, species) VALUES ($1, 'Mochi', 'cat') RETURNING id`, [user.id]);
  const post = await createPost(user.id, {
    mediaUrl: 'https://cdn.example/mochi.mp4',
    mediaType: 'video',
    thumbnailUrl: 'https://cdn.example/mochi.jpg',
    petId: pet.id,
    caption: 'Mochi says "hi" <3 & more',
    width: 720,
    height: 1280,
  });

  const res = await call(postPage, `/p/${post.id}?ref=REF${s}`, { id: String(post.id) });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /text\/html/);
  const html = res.body;
  assert.equal(meta(html, 'og:title'), 'Mochi on Pawtella');
  assert.equal(meta(html, 'og:description'), 'Mochi says &quot;hi&quot; &lt;3 &amp; more');
  assert.equal(meta(html, 'og:image'), 'https://cdn.example/mochi.jpg');
  assert.equal(meta(html, 'og:video'), 'https://cdn.example/mochi.mp4');
  assert.equal(meta(html, 'og:video:type'), 'video/mp4');
  assert.equal(meta(html, 'og:url'), `${env.appUrl}/p/${post.id}`);
  assert.equal(meta(html, 'twitter:card'), 'player');
  assert.ok(html.includes('<video autoplay muted loop playsinline'), 'autoplaying muted looping video');
  assert.ok(html.includes(`@${user.handle}`), 'author handle');
  assert.ok(html.includes(`href="${env.appScheme}://post/${post.id}`), 'deep link');
  assert.ok(html.includes('30 Paw Points'), 'CTA copy');
  assert.ok(html.includes('App Store') && html.includes('Google Play'), 'store badges');
  assert.ok(html.includes('apple-itunes-app'), 'smart banner placeholder');
  assert.ok(html.includes('prefers-color-scheme:dark'), 'dark mode');
  assert.ok(!html.includes('<3 & more'), 'caption is escaped');
  assert.match(res.headers['set-cookie'], new RegExp(`^${REF_COOKIE}=REF${s}; Max-Age=2592000; Path=/; SameSite=Lax`));

  const ev = await one(`SELECT props FROM events WHERE name = 'share_landing_view' AND (props->>'postId')::int = $1 ORDER BY id DESC LIMIT 1`, [post.id]);
  assert.ok(ev);
  assert.equal(ev.props.ref, `REF${s}`);
  assert.equal(ev.props.found, true);

  // image post → summary_large_image, no og:video, no cookie without ref
  const img = await createPost(user.id, { mediaUrl: 'https://cdn.example/pic.jpg', mediaType: 'image' });
  const res2 = await call(postPage, `/p/${img.id}`, { id: String(img.id) });
  assert.equal(res2.statusCode, 200);
  assert.equal(meta(res2.body, 'twitter:card'), 'summary_large_image');
  assert.equal(meta(res2.body, 'og:image'), 'https://cdn.example/pic.jpg');
  assert.equal(meta(res2.body, 'og:video'), null);
  assert.ok(res2.body.includes('<img src="https://cdn.example/pic.jpg"'));
  assert.equal(res2.headers['set-cookie'], undefined);
});

test('/p/:id is 404 for missing, hidden and private posts', async () => {
  const s = suffix();
  const user = await one(`INSERT INTO users (email, handle) VALUES ($1, $2) RETURNING *`, [`land2-${s}@example.com`, `land2_${s}`]);
  const res = await call(postPage, '/p/999999999', { id: '999999999' });
  assert.equal(res.statusCode, 404);
  assert.ok(res.body.includes('This post is unavailable'));
  assert.ok(res.body.includes('name="robots" content="noindex"'));

  const bad = await call(postPage, '/p/not-a-number', { id: 'not-a-number' });
  assert.equal(bad.statusCode, 404);

  const hidden = await createPost(user.id, { mediaUrl: 'https://cdn.example/h.jpg', mediaType: 'image' });
  await one(`UPDATE posts SET is_hidden = true WHERE id = $1`, [hidden.id]);
  assert.equal((await call(postPage, `/p/${hidden.id}`, { id: String(hidden.id) })).statusCode, 404);

  const priv = await createPost(user.id, { mediaUrl: 'https://cdn.example/p.jpg', mediaType: 'image' });
  await one(`UPDATE posts SET visibility = 'private' WHERE id = $1`, [priv.id]);
  assert.equal((await call(postPage, `/p/${priv.id}`, { id: String(priv.id) })).statusCode, 404);
});

test('/r/:code resolves a user invite and sets the cookie; unknown code is 404', async () => {
  const s = suffix();
  const user = await one(`INSERT INTO users (email, handle, display_name) VALUES ($1, $2, 'Inviter') RETURNING *`, [`inv-${s}@example.com`, `inv_${s}`]);
  const code = await getOrCreateReferralCode(user.id);
  const res = await call(invitePage, `/r/${code}`, { code });
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.includes(`You&#39;ve been invited by @${user.handle}`) || res.body.includes(`You've been invited by @${user.handle}`));
  assert.equal(meta(res.body, 'og:title'), `@${user.handle} invited you to Pawtella`);
  assert.match(res.headers['set-cookie'], new RegExp(`^${REF_COOKIE}=${code};`));
  assert.ok(res.body.includes(`${env.appScheme}://invite/${code}`));

  const missing = await call(invitePage, `/r/NOPE${s}`, { code: `NOPE${s}` });
  assert.equal(missing.statusCode, 404);
  assert.ok(missing.body.includes('Invite link not found'));
  assert.equal(missing.headers['set-cookie'], undefined);
});
