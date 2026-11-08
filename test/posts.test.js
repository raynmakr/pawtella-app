import '../scripts/load-env.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { one, many, closePool } from '../lib/db.js';
import { signToken } from '../lib/auth.js';
import { RULES } from '../lib/points-rules.js';
import { createPost, listFeed, decodeCursor, encodeCursor } from '../lib/posts.js';
import postsHandler from '../api/posts.js';
import followsHandler from '../api/follows.js';
import blocksHandler from '../api/blocks.js';
import reportsHandler from '../api/reports.js';

const suffix = () => Math.random().toString(36).slice(2, 9);

async function makeUser(role = 'user') {
  const s = suffix();
  const row = await one(
    `INSERT INTO users (email, handle, display_name, role) VALUES ($1, $2, $3, $4) RETURNING *`,
    [`posts-${s}@example.com`, `posts_${s}`, 'Posts Test', role],
  );
  return { ...row, token: signToken({ id: row.id, role }) };
}

/** Invoke a Vercel-style handler with a fake req/res. */
async function call(handler, method, url, { token, body } = {}) {
  const u = new URL(url, 'http://test.local');
  const req = {
    method,
    url: u.pathname + u.search,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
    query: Object.fromEntries(u.searchParams.entries()),
    body,
    cookies: {},
    socket: {},
  };
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    headersSent: false,
    writableEnded: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; this.headersSent = true; this.writableEnded = true; return this; },
    end(d) { if (d !== undefined) this.body = d; this.headersSent = true; this.writableEnded = true; return this; },
  };
  await handler(req, res);
  return { status: res.statusCode, body: res.body, headers: res.headers };
}

after(() => closePool());

test('cursor helpers round-trip (pure)', () => {
  assert.deepEqual(decodeCursor(null), null);
  assert.deepEqual(decodeCursor('42'), { id: 42 });
  const c = encodeCursor({ t: 'x', s: 0.5, id: 7 });
  assert.deepEqual(decodeCursor(c), { t: 'x', s: 0.5, id: 7 });
  assert.throws(() => decodeCursor('!!!not-base64-json'), /Invalid cursor/);
});

test('create → feed → like idempotent → comment counts → blocks hide → delete', async () => {
  const alice = await makeUser();
  const bob = await makeUser();
  const carol = await makeUser();
  const admin = await makeUser('admin');
  const pet = await one(`INSERT INTO pets (user_id, name, species) VALUES ($1, 'Biscuit', 'dog') RETURNING id`, [alice.id]);

  // --- create (HTTP) -------------------------------------------------------------------------
  let r = await call(postsHandler, 'POST', '/api/posts', { body: { mediaUrl: 'https://x/y.jpg', mediaType: 'image' } });
  assert.equal(r.status, 401);
  r = await call(postsHandler, 'POST', '/api/posts', { token: bob.token, body: { mediaUrl: 'https://x/y.jpg', mediaType: 'image', petId: pet.id } });
  assert.equal(r.status, 400, 'pet must belong to the poster');
  r = await call(postsHandler, 'POST', '/api/posts', { token: alice.token, body: { mediaUrl: 'https://x/y.jpg', mediaType: 'gif' } });
  assert.equal(r.status, 400);
  r = await call(postsHandler, 'POST', '/api/posts', { token: alice.token, body: { mediaUrl: 'https://x/y.jpg', mediaType: 'image', caption: 'a'.repeat(2201) } });
  assert.equal(r.status, 400);

  r = await call(postsHandler, 'POST', '/api/posts', {
    token: alice.token,
    body: { mediaUrl: 'https://x/a.mp4', mediaType: 'video', thumbnailUrl: 'https://x/a.jpg', petId: pet.id, caption: 'Hello <world>', featureConsent: true },
  });
  assert.equal(r.status, 201);
  const post = r.body.post;
  assert.equal(post.author.handle, alice.handle);
  assert.deepEqual(post.pet, { id: pet.id, name: 'Biscuit', species: 'dog' });
  assert.equal(post.featureConsent, true);
  assert.equal(post.likedByViewer, false);

  // first-post bonus awarded exactly once
  const u1 = await one(`SELECT paw_points, bonus_first_post FROM users WHERE id = $1`, [alice.id]);
  assert.equal(u1.bonus_first_post, true);
  assert.equal(u1.paw_points, RULES.firstPostBonus);
  const second = await createPost(alice.id, { mediaUrl: 'https://x/b.jpg', mediaType: 'image' });
  const u2 = await one(`SELECT paw_points FROM users WHERE id = $1`, [alice.id]);
  assert.equal(u2.paw_points, RULES.firstPostBonus, 'second post does not award again');
  const ev = await many(`SELECT name FROM events WHERE user_id = $1 AND name = 'post_created'`, [alice.id]);
  assert.equal(ev.length, 2);

  // --- feed ----------------------------------------------------------------------------------
  const discover = await listFeed({ viewerId: bob.id, mode: 'discover', limit: 50 });
  assert.ok(discover.posts.some((p) => p.id === post.id), 'discover shows the post');

  let following = await listFeed({ viewerId: bob.id, mode: 'following' });
  assert.ok(!following.posts.some((p) => p.id === post.id), 'not following yet');
  r = await call(followsHandler, 'POST', '/api/follows', { token: bob.token, body: { handle: alice.handle } });
  assert.equal(r.status, 200);
  assert.equal(r.body.counts.followers, 1);
  assert.equal(r.body.counts.isFollowing, true);
  r = await call(followsHandler, 'POST', '/api/follows', { token: bob.token, body: { handle: bob.handle } });
  assert.equal(r.status, 400, 'cannot follow self');
  following = await listFeed({ viewerId: bob.id, mode: 'following' });
  assert.ok(following.posts.some((p) => p.id === post.id), 'following feed shows followee posts');

  // discover pagination by stable cursor: no duplicates across pages
  const page1 = await listFeed({ viewerId: null, mode: 'discover', limit: 1 });
  assert.equal(page1.posts.length, 1);
  assert.ok(page1.nextCursor);
  const page2 = await listFeed({ viewerId: null, mode: 'discover', limit: 1, cursor: page1.nextCursor });
  assert.notEqual(page2.posts[0]?.id, page1.posts[0].id);

  // --- like idempotent -----------------------------------------------------------------------
  r = await call(postsHandler, 'POST', `/api/posts/${post.id}/like`, { token: bob.token });
  assert.deepEqual(r.body, { liked: true, likeCount: 1 });
  r = await call(postsHandler, 'POST', `/api/posts/${post.id}/like`, { token: bob.token });
  assert.deepEqual(r.body, { liked: true, likeCount: 1 }, 'second like is a no-op');
  r = await call(postsHandler, 'POST', `/api/posts/${post.id}/like`, { token: carol.token });
  assert.equal(r.body.likeCount, 2);
  r = await call(postsHandler, 'GET', `/api/posts/${post.id}`, { token: bob.token });
  assert.equal(r.body.post.likedByViewer, true);
  r = await call(postsHandler, 'DELETE', `/api/posts/${post.id}/like`, { token: carol.token });
  assert.deepEqual(r.body, { liked: false, likeCount: 1 });
  r = await call(postsHandler, 'DELETE', `/api/posts/${post.id}/like`, { token: carol.token });
  assert.deepEqual(r.body, { liked: false, likeCount: 1 }, 'second unlike is a no-op');
  const likes = await one(`SELECT count(*)::int AS n FROM post_likes WHERE post_id = $1`, [post.id]);
  assert.equal(likes.n, 1);

  // liked post ranks above a newer unliked post in discover
  const ranked = await listFeed({ viewerId: null, mode: 'discover', limit: 50 });
  const iLiked = ranked.posts.findIndex((p) => p.id === post.id);
  const iSecond = ranked.posts.findIndex((p) => p.id === second.id);
  assert.ok(iLiked >= 0 && iSecond >= 0 && iLiked < iSecond, 'like boost ranks liked post first');

  // --- comments ------------------------------------------------------------------------------
  r = await call(postsHandler, 'POST', `/api/posts/${post.id}/comments`, { token: bob.token, body: { body: '  ' } });
  assert.equal(r.status, 400);
  r = await call(postsHandler, 'POST', `/api/posts/${post.id}/comments`, { token: bob.token, body: { body: 'so cute' } });
  assert.equal(r.status, 201);
  assert.equal(r.body.commentCount, 1);
  const c1 = r.body.comment;
  assert.equal(c1.author.handle, bob.handle);
  r = await call(postsHandler, 'POST', `/api/posts/${post.id}/comments`, { token: carol.token, body: { body: 'agreed' } });
  assert.equal(r.body.commentCount, 2);
  r = await call(postsHandler, 'GET', `/api/posts/${post.id}`, {});
  assert.equal(r.body.post.commentCount, 2);
  assert.equal(r.body.comments.length, 2);
  r = await call(postsHandler, 'GET', `/api/posts/${post.id}/comments?limit=1`, {});
  assert.equal(r.body.comments.length, 1);
  assert.ok(r.body.nextCursor);
  r = await call(postsHandler, 'DELETE', `/api/posts/${post.id}/comments/${c1.id}`, { token: carol.token });
  assert.equal(r.status, 403, 'only author, post owner or admin may delete');
  r = await call(postsHandler, 'DELETE', `/api/posts/${post.id}/comments/${c1.id}`, { token: alice.token });
  assert.equal(r.status, 200);
  assert.equal(r.body.commentCount, 1);

  // --- share ---------------------------------------------------------------------------------
  r = await call(postsHandler, 'POST', `/api/posts/${post.id}/share`, { token: bob.token, body: {} });
  assert.equal(r.status, 200);
  assert.match(r.body.shareUrl, new RegExp(`/p/${post.id}\\?ref=[A-Za-z0-9]+$`));
  assert.match(r.body.watermarkedUrl, /^https?:\/\//);
  assert.equal(r.body.shareCount, 1);

  // --- blocks hide both ways -----------------------------------------------------------------
  r = await call(blocksHandler, 'POST', '/api/blocks', { token: bob.token, body: { handle: alice.handle } });
  assert.equal(r.status, 200);
  assert.equal((await one(`SELECT count(*)::int AS n FROM follows WHERE follower_id = $1 AND followee_id = $2`, [bob.id, alice.id])).n, 0, 'block removes follows');
  let feedBob = await listFeed({ viewerId: bob.id, mode: 'discover', limit: 50 });
  assert.ok(!feedBob.posts.some((p) => p.userId === alice.id), 'blocker does not see blocked user');
  const feedAlice = await listFeed({ viewerId: alice.id, mode: 'discover', limit: 50 });
  const bobPost = await createPost(bob.id, { mediaUrl: 'https://x/c.jpg', mediaType: 'image' });
  const feedAlice2 = await listFeed({ viewerId: alice.id, mode: 'discover', limit: 50 });
  assert.ok(!feedAlice2.posts.some((p) => p.id === bobPost.id), 'blocked user does not see blocker');
  assert.ok(feedAlice.posts.length <= feedAlice2.posts.length + 1);
  r = await call(postsHandler, 'GET', `/api/posts/${post.id}`, { token: bob.token });
  assert.equal(r.status, 404, 'blocked post detail is 404');
  r = await call(blocksHandler, 'GET', '/api/blocks', { token: bob.token });
  assert.equal(r.body.blocks.length, 1);
  r = await call(blocksHandler, 'DELETE', `/api/blocks/${alice.handle}`, { token: bob.token });
  assert.equal(r.body.blocked, false);
  feedBob = await listFeed({ viewerId: bob.id, mode: 'discover', limit: 50 });
  assert.ok(feedBob.posts.some((p) => p.id === post.id), 'visible again after unblock');

  // --- reports: dedupe + auto-hide at 3 ------------------------------------------------------
  r = await call(reportsHandler, 'POST', '/api/reports', { token: alice.token, body: { targetType: 'post', targetId: post.id, reason: 'spam' } });
  assert.equal(r.status, 400, 'cannot report own content');
  r = await call(reportsHandler, 'POST', '/api/reports', { token: bob.token, body: { targetType: 'post', targetId: post.id, reason: 'nope' } });
  assert.equal(r.status, 400);
  r = await call(reportsHandler, 'POST', '/api/reports', { token: bob.token, body: { targetType: 'post', targetId: post.id, reason: 'spam' } });
  assert.equal(r.status, 201);
  r = await call(reportsHandler, 'POST', '/api/reports', { token: bob.token, body: { targetType: 'post', targetId: post.id, reason: 'spam' } });
  assert.equal(r.body.duplicate, true);
  r = await call(reportsHandler, 'POST', '/api/reports', { token: carol.token, body: { targetType: 'post', targetId: post.id, reason: 'abuse' } });
  assert.equal(r.body.autoHidden, false);
  r = await call(reportsHandler, 'POST', '/api/reports', { token: admin.token, body: { targetType: 'post', targetId: post.id, reason: 'other', details: 'x' } });
  assert.equal(r.body.autoHidden, true);
  assert.equal((await one(`SELECT is_hidden FROM posts WHERE id = $1`, [post.id])).is_hidden, true);
  const hidden = await listFeed({ viewerId: null, mode: 'discover', limit: 50 });
  assert.ok(!hidden.posts.some((p) => p.id === post.id), 'hidden post leaves the feed');
  r = await call(postsHandler, 'GET', `/api/posts/${post.id}`, { token: carol.token });
  assert.equal(r.status, 404);
  r = await call(postsHandler, 'GET', `/api/posts/${post.id}`, { token: alice.token });
  assert.equal(r.status, 200, 'owner still sees their hidden post');

  // --- delete --------------------------------------------------------------------------------
  r = await call(postsHandler, 'DELETE', `/api/posts/${second.id}`, { token: bob.token });
  assert.equal(r.status, 403);
  r = await call(postsHandler, 'DELETE', `/api/posts/${second.id}`, { token: alice.token });
  assert.equal(r.status, 200);
  r = await call(postsHandler, 'DELETE', `/api/posts/${post.id}`, { token: admin.token });
  assert.equal(r.status, 200, 'admin can delete');
  assert.equal(await one(`SELECT id FROM posts WHERE id = $1`, [post.id]), null);
  assert.equal((await one(`SELECT count(*)::int AS n FROM post_comments WHERE post_id = $1`, [post.id])).n, 0, 'comments cascade');
  r = await call(postsHandler, 'DELETE', `/api/posts/${post.id}`, { token: admin.token });
  assert.equal(r.status, 404);
});

test('createPost validates challenge window', async () => {
  const u = await makeUser();
  const s = suffix();
  const closed = await one(
    `INSERT INTO challenges (slug, title, starts_at, ends_at, status) VALUES ($1, 'Old', now() - interval '10 day', now() - interval '3 day', 'closed') RETURNING id`,
    [`old-${s}`],
  );
  await assert.rejects(createPost(u.id, { mediaUrl: 'https://x/z.jpg', mediaType: 'image', challengeId: closed.id }), /not active/);
  await assert.rejects(createPost(u.id, { mediaUrl: 'https://x/z.jpg', mediaType: 'image', challengeId: 999999999 }), /not found/);
  const active = await one(
    `INSERT INTO challenges (slug, title, starts_at, ends_at, status) VALUES ($1, 'Now', now() - interval '1 day', now() + interval '1 day', 'active') RETURNING id`,
    [`now-${s}`],
  );
  const p = await createPost(u.id, { mediaUrl: 'https://x/z.jpg', mediaType: 'image', challengeId: active.id });
  assert.equal(p.challengeId, active.id);
  const entered = await one(`SELECT 1 FROM events WHERE user_id = $1 AND name = 'challenge_entered'`, [u.id]);
  assert.ok(entered);
  const feed = await listFeed({ mode: 'challenge', challengeId: active.id });
  assert.deepEqual(feed.posts.map((x) => x.id), [p.id]);
});
