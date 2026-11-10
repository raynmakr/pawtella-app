// Pets + users: api/pets.js, api/users.js, api/upload.js against the local Postgres.
import '../scripts/load-env.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { closePool, one, query } from '../lib/db.js';
import { RULES } from '../lib/points-rules.js';
import * as media from '../lib/media.js';
import authHandler from '../api/auth.js';
import petsHandler from '../api/pets.js';
import usersHandler from '../api/users.js';
import uploadHandler from '../api/upload.js';

const suffix = () => crypto.randomBytes(5).toString('hex');

function call(handler, method, url, { body, token, headers = {} } = {}) {
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

async function registerUser(extra = {}) {
  const s = suffix();
  const r = await call(authHandler, 'POST', '/api/auth/register', {
    body: { email: `pets${s}@example.com`, password: 'password123', ...extra },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { token: r.body.token, user: r.body.user };
}

after(() => closePool());

test('pets CRUD with primary-pet logic', async () => {
  const { token, user } = await registerUser();

  const empty = await call(petsHandler, 'GET', '/api/pets', { token });
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.pets, []);

  const bad = await call(petsHandler, 'POST', '/api/pets', { token, body: { name: 'Rex', species: 'hamster' } });
  assert.equal(bad.status, 400);
  const missing = await call(petsHandler, 'POST', '/api/pets', { token, body: { species: 'dog' } });
  assert.equal(missing.status, 400);
  const noAuth = await call(petsHandler, 'POST', '/api/pets', { body: { name: 'Rex', species: 'dog' } });
  assert.equal(noAuth.status, 401);

  const first = await call(petsHandler, 'POST', '/api/pets', {
    token,
    body: { name: 'Rex', species: 'Dog', breed: 'Lab', sex: 'male', birthday: '2020-05-01', weightKg: '31.5', notes: 'loves snow' },
  });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.isFirst, true);
  assert.equal(first.body.pet.isPrimary, true, 'first pet is primary');
  assert.equal(first.body.pet.species, 'dog');
  assert.equal(first.body.pet.weightKg, 31.5);
  assert.equal(first.body.pet.birthday, '2020-05-01');
  const ev = await one(`SELECT props FROM events WHERE user_id = $1 AND name = 'pet_added'`, [user.id]);
  assert.ok(ev, 'pet_added tracked');
  assert.equal(ev.props.isFirst, true);

  const second = await call(petsHandler, 'POST', '/api/pets', { token, body: { name: 'Mittens', species: 'cat' } });
  assert.equal(second.status, 200);
  assert.equal(second.body.isFirst, false);
  assert.equal(second.body.pet.isPrimary, false, 'later pets are not primary by default');

  const list = await call(petsHandler, 'GET', '/api/pets', { token });
  assert.equal(list.body.pets.length, 2);
  assert.equal(list.body.pets[0].id, first.body.pet.id, 'primary first');

  // Make the cat primary: the dog loses the flag.
  const promote = await call(petsHandler, 'PATCH', `/api/pets/${second.body.pet.id}`, { token, body: { isPrimary: true, weightKg: 4.2 } });
  assert.equal(promote.status, 200, JSON.stringify(promote.body));
  assert.equal(promote.body.pet.isPrimary, true);
  assert.equal(promote.body.pet.weightKg, 4.2);
  const dog = await call(petsHandler, 'GET', `/api/pets/${first.body.pet.id}`, { token });
  assert.equal(dog.body.pet.isPrimary, false);
  const primaries = await one('SELECT count(*)::int AS n FROM pets WHERE user_id = $1 AND is_primary', [user.id]);
  assert.equal(primaries.n, 1);

  // Third pet created with isPrimary: true also takes over.
  const third = await call(petsHandler, 'POST', '/api/pets', { token, body: { name: 'Bolt', species: 'dog', isPrimary: true } });
  assert.equal(third.body.pet.isPrimary, true);
  assert.equal((await one('SELECT count(*)::int AS n FROM pets WHERE user_id = $1 AND is_primary', [user.id])).n, 1);

  // Deleting the primary promotes the oldest remaining pet.
  const del = await call(petsHandler, 'DELETE', `/api/pets/${third.body.pet.id}`, { token });
  assert.equal(del.status, 200);
  const afterDel = await call(petsHandler, 'GET', '/api/pets', { token });
  assert.equal(afterDel.body.pets.length, 2);
  assert.equal(afterDel.body.pets.find((p) => p.isPrimary).id, first.body.pet.id);

  const gone = await call(petsHandler, 'GET', `/api/pets/${third.body.pet.id}`, { token });
  assert.equal(gone.status, 404);

  // Another user cannot see or edit these pets.
  const other = await registerUser();
  const peek = await call(petsHandler, 'GET', `/api/pets/${first.body.pet.id}`, { token: other.token });
  assert.equal(peek.status, 404);
  const edit = await call(petsHandler, 'PATCH', `/api/pets/${first.body.pet.id}`, { token: other.token, body: { name: 'Hijack' } });
  assert.equal(edit.status, 404);
  const nothing = await call(petsHandler, 'PATCH', `/api/pets/${first.body.pet.id}`, { token, body: {} });
  assert.equal(nothing.status, 400);
});

test('mock-mode data-URL photos persist end to end (pets.photoUrl + users.avatarUrl)', async () => {
  // The mock uploader echoes a data URL far longer than the old 2048 cap; the save must still work.
  const { token } = await registerUser();
  const dataUrl = 'data:image/jpeg;base64,' + '/9j/4AAQSkZJRg'.repeat(1000); // ~14k chars
  assert.ok(dataUrl.length > 2048 && dataUrl.length <= media.MOCK_UPLOAD_MAX_BYTES);

  const created = await call(petsHandler, 'POST', '/api/pets', { token, body: { name: 'Pixel', species: 'cat', photoUrl: dataUrl } });
  assert.equal(created.status, 200, JSON.stringify(created.body).slice(0, 160));
  assert.equal(created.body.pet.photoUrl, dataUrl, 'data URL stored and returned for display');

  const avatar = await call(usersHandler, 'PATCH', '/api/users/me', { token, body: { avatarUrl: dataUrl } });
  assert.equal(avatar.status, 200, JSON.stringify(avatar.body).slice(0, 160));
  assert.equal(avatar.body.user.avatarUrl, dataUrl, 'data URL avatar stored and returned');
});

test('profile + first pet bonus is awarded once, whichever comes last', async () => {
  const { token, user } = await registerUser({ displayName: 'Bonus Hunter' });
  const start = user.pawPoints;

  const pet = await call(petsHandler, 'POST', '/api/pets', { token, body: { name: 'Luna', species: 'cat' } });
  assert.equal(pet.body.bonusAwarded, false, 'no avatar yet');

  const bad = await call(usersHandler, 'PATCH', '/api/users/me', { token, body: { avatarUrl: 'javascript:alert(1)' } });
  assert.equal(bad.status, 400);

  const patched = await call(usersHandler, 'PATCH', '/api/users/me', {
    token,
    body: { avatarUrl: 'https://example.com/a.png', bio: 'Cat person', country: 'ca', postalCode: 'm5v 1a1', marketingOptIn: false, featureConsentDefault: true },
  });
  assert.equal(patched.status, 200, JSON.stringify(patched.body));
  assert.equal(patched.body.bonusAwarded, true);
  assert.equal(patched.body.user.pawPoints, start + RULES.profilePetBonus);
  assert.equal(patched.body.user.bonuses.profilePet, true);
  assert.equal(patched.body.user.country, 'CA');
  assert.equal(patched.body.user.postalCode, 'M5V 1A1');
  assert.equal(patched.body.user.marketingOptIn, false);
  assert.equal(patched.body.user.featureConsentDefault, true);
  assert.equal(patched.body.user.bio, 'Cat person');
  const ev = await one(`SELECT 1 FROM events WHERE user_id = $1 AND name = 'profile_completed'`, [user.id]);
  assert.ok(ev);

  const again = await call(usersHandler, 'PATCH', '/api/users/me', { token, body: { bio: 'Still a cat person' } });
  assert.equal(again.body.bonusAwarded, false);
  assert.equal(again.body.user.pawPoints, start + RULES.profilePetBonus, 'not awarded twice');

  const me = await call(usersHandler, 'GET', '/api/users/me', { token });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.id, user.id);
  assert.ok(me.body.user.referralCode);

  const push = await call(usersHandler, 'POST', '/api/users/me/push-token', { token, body: { token: 'ExponentPushToken[abc]' } });
  assert.equal(push.status, 200);
  assert.equal((await one('SELECT push_token FROM users WHERE id = $1', [user.id])).push_token, 'ExponentPushToken[abc]');
});

test('public profile: counts, isFollowing, pets, posts with cursor pagination', async () => {
  const owner = await registerUser({ displayName: 'Pet Owner', handle: `owner_${suffix()}` });
  const viewer = await registerUser();
  await call(petsHandler, 'POST', '/api/pets', { token: owner.token, body: { name: 'Rex', species: 'dog', notes: 'private notes' } });
  await query('INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2)', [viewer.user.id, owner.user.id]);
  const postIds = [];
  for (let i = 0; i < 3; i++) {
    const row = await one(
      `INSERT INTO posts (user_id, caption, media_url, media_type, visibility) VALUES ($1, $2, $3, 'image', 'public') RETURNING id`,
      [owner.user.id, `post ${i}`, `https://example.com/${i}.jpg`],
    );
    postIds.push(row.id);
  }
  await query(`INSERT INTO posts (user_id, caption, media_url, media_type, visibility) VALUES ($1, 'secret', 'https://example.com/p.jpg', 'image', 'private')`, [owner.user.id]);

  const anon = await call(usersHandler, 'GET', `/api/users/${owner.user.handle.toUpperCase()}`);
  assert.equal(anon.status, 200, JSON.stringify(anon.body));
  assert.equal(anon.body.user.handle, owner.user.handle);
  assert.equal(anon.body.user.followerCount, 1);
  assert.equal(anon.body.user.followingCount, 0);
  assert.equal(anon.body.user.postCount, 3, 'private posts are not counted');
  assert.equal(anon.body.user.isFollowing, false);
  assert.equal('email' in anon.body.user, false, 'public profile hides email');
  assert.equal('pawPoints' in anon.body.user, false);
  assert.equal(anon.body.pets.length, 1);
  assert.equal('notes' in anon.body.pets[0], false, 'pet notes are private');

  const asViewer = await call(usersHandler, 'GET', `/api/users/${owner.user.handle}`, { token: viewer.token });
  assert.equal(asViewer.body.user.isFollowing, true);
  const asSelf = await call(usersHandler, 'GET', `/api/users/${owner.user.handle}`, { token: owner.token });
  assert.equal(asSelf.body.user.isMe, true);

  const page1 = await call(usersHandler, 'GET', `/api/users/${owner.user.handle}/posts?limit=2`);
  assert.equal(page1.status, 200, JSON.stringify(page1.body));
  assert.equal(page1.body.posts.length, 2);
  assert.deepEqual(page1.body.posts.map((p) => p.id), [postIds[2], postIds[1]]);
  assert.equal(page1.body.nextCursor, postIds[1]);
  assert.equal(page1.body.posts[0].user.handle, owner.user.handle);
  const page2 = await call(usersHandler, 'GET', `/api/users/${owner.user.handle}/posts?limit=2&cursor=${page1.body.nextCursor}`);
  assert.deepEqual(page2.body.posts.map((p) => p.id), [postIds[0]]);
  assert.equal(page2.body.nextCursor, null);

  const missing = await call(usersHandler, 'GET', `/api/users/nobody_${suffix()}`);
  assert.equal(missing.status, 404);

  // Blocked viewers get a 404 instead of the profile.
  await query('INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)', [owner.user.id, viewer.user.id]);
  const blocked = await call(usersHandler, 'GET', `/api/users/${owner.user.handle}`, { token: viewer.token });
  assert.equal(blocked.status, 404);
});

test('upload: presign descriptor in mock mode and the dev mock uploader', async () => {
  const { token } = await registerUser();
  assert.equal(media.isMock, true, 'tests run without object-storage keys');
  const noAuth = await call(uploadHandler, 'POST', '/api/upload', { body: { kind: 'image', contentType: 'image/jpeg' } });
  assert.equal(noAuth.status, 401);
  const signed = await call(uploadHandler, 'POST', '/api/upload', { token, body: { kind: 'video', contentType: 'video/mp4' } });
  assert.equal(signed.status, 200, JSON.stringify(signed.body));
  assert.equal(signed.body.mock, true);
  assert.ok(signed.body.uploadUrl.endsWith('/api/upload/mock'));
  assert.equal(signed.body.kind, 'video');
  const badKind = await call(uploadHandler, 'POST', '/api/upload', { token, body: { kind: 'audio', contentType: 'audio/mp3' } });
  assert.equal(badKind.status, 400);
  // Unsupported content types are rejected at presign time.
  const badType = await call(uploadHandler, 'POST', '/api/upload', { token, body: { kind: 'image', contentType: 'application/pdf' } });
  assert.equal(badType.status, 400);
  // Oversized declared size is rejected with 413.
  const tooBigSign = await call(uploadHandler, 'POST', '/api/upload', { token, body: { kind: 'image', contentType: 'image/jpeg', size: media.IMAGE_MAX_BYTES + 1 } });
  assert.equal(tooBigSign.status, 413);

  const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const up = await call(uploadHandler, 'POST', '/api/upload/mock', { token, body: { dataUrl } });
  assert.equal(up.status, 200, JSON.stringify(up.body));
  assert.equal(up.body.url, dataUrl);
  assert.match(up.body.publicId, /^mock\/[0-9a-f]{16}$/);
  const notData = await call(uploadHandler, 'POST', '/api/upload/mock', { token, body: { dataUrl: 'https://example.com/x.png' } });
  assert.equal(notData.status, 400);
  // Oversized data URLs are rejected with 413, not silently stored.
  const huge = 'data:image/png;base64,' + 'A'.repeat(media.MOCK_UPLOAD_MAX_BYTES + 10);
  const tooBig = await call(uploadHandler, 'POST', '/api/upload/mock', { token, body: { dataUrl: huge } });
  assert.equal(tooBig.status, 413, JSON.stringify(tooBig.body).slice(0, 120));

  // completeImageUpload is a 404 in mock mode (storage-less); the data-URL path is used instead.
  const complete = await call(uploadHandler, 'POST', '/api/upload/complete', { token, body: { key: 'm/ab/whatever.jpg' } });
  assert.equal(complete.status, 404);

  // Mock media helpers pass the input through (no network/storage).
  const copied = await media.storeFromUrl('https://x/z.mp4', { kind: 'video' });
  assert.equal(copied.url, 'https://x/z.mp4');
  assert.equal(copied.thumbnailUrl, 'https://x/z.mp4');
  assert.equal((await media.deleteAsset('https://x/z.mp4')).ok, true);
});
