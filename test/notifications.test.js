// DB tests for lib/notifications.js: dedupe, inbox listing, markRead, delivery + opt-in rules.
import '../scripts/load-env.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { query, one, closePool } from '../lib/db.js';
import { notify, enqueueAdmin, markRead, listInapp, unreadCount, deliverQueued, isMarketingJourney } from '../lib/notifications.js';

const suffix = Math.random().toString(36).slice(2, 10);

async function makeUser(extra = {}) {
  const row = await one(
    `INSERT INTO users (email, handle, display_name, marketing_opt_in) VALUES ($1, $2, $3, $4) RETURNING id`,
    [`notif-${suffix}-${Math.random().toString(36).slice(2, 6)}@test.local`, `notif_${suffix}_${Math.random().toString(36).slice(2, 6)}`, 'Notif Tester', extra.marketingOptIn ?? true],
  );
  return row.id;
}

after(async () => {
  await query(`DELETE FROM users WHERE email LIKE $1`, [`notif-${suffix}-%`]);
  await query(`DELETE FROM notifications WHERE dedupe_key LIKE $1`, [`%:${suffix}%`]);
  await closePool();
});

test('notify dedupes on dedupe_key', async () => {
  const userId = await makeUser();
  const key = `test_journey:user:${userId}:${suffix}`;
  const a = await notify({ userId, journey: 'test_journey', channel: 'inapp', dedupeKey: key, title: 'A', body: 'b' });
  const b = await notify({ userId, journey: 'test_journey', channel: 'inapp', dedupeKey: key, title: 'A again', body: 'b' });
  assert.equal(a.created, true);
  assert.ok(a.id > 0);
  assert.equal(b.created, false);
  assert.equal(b.id, null);
  const n = await one(`SELECT count(*)::int AS c FROM notifications WHERE dedupe_key = $1`, [key]);
  assert.equal(n.c, 1);
});

test('notify rejects unknown channel', async () => {
  const userId = await makeUser();
  await assert.rejects(() => notify({ userId, journey: 'x', channel: 'fax', dedupeKey: `fax:${suffix}` }));
});

test('listInapp + unreadCount + markRead(ids) + markRead(all)', async () => {
  const userId = await makeUser();
  for (let i = 0; i < 3; i++) {
    await notify({ userId, journey: 'welcome_d0', channel: 'inapp', dedupeKey: `inbox:${userId}:${i}:${suffix}`, title: `T${i}`, body: 'b', payload: { url: '/x' } });
  }
  // an email row must not appear in the inbox
  await notify({ userId, journey: 'welcome_d0', channel: 'email', dedupeKey: `inbox-email:${userId}:${suffix}`, title: 'E', body: 'b' });

  const list = await listInapp(userId, { page: 1, limit: 10 });
  assert.equal(list.notifications.length, 3);
  assert.equal(list.unreadCount, 3);
  assert.equal(list.total, 3);
  assert.equal(list.hasMore, false);
  assert.equal(list.notifications[0].read, false);
  assert.equal(list.notifications[0].payload.url, '/x');
  assert.equal(typeof list.notifications[0].id, 'number');

  const first = list.notifications[0].id;
  const r1 = await markRead(userId, [first]);
  assert.equal(r1.updated, 1);
  assert.equal(await unreadCount(userId), 2);

  // ids of another user are ignored
  const other = await makeUser();
  const r0 = await markRead(other, [list.notifications[1].id]);
  assert.equal(r0.updated, 0);
  assert.equal(await unreadCount(userId), 2);

  const rAll = await markRead(userId);
  assert.equal(rAll.updated, 2);
  assert.equal(await unreadCount(userId), 0);
  const again = await markRead(userId);
  assert.equal(again.updated, 0);
});

test('listInapp paginates', async () => {
  const userId = await makeUser();
  for (let i = 0; i < 5; i++) await notify({ userId, journey: 'j', channel: 'inapp', dedupeKey: `page:${userId}:${i}:${suffix}`, title: `T${i}` });
  const p1 = await listInapp(userId, { page: 1, limit: 2 });
  const p3 = await listInapp(userId, { page: 3, limit: 2 });
  assert.equal(p1.notifications.length, 2);
  assert.equal(p1.hasMore, true);
  assert.equal(p3.notifications.length, 1);
  assert.equal(p3.hasMore, false);
});

test('enqueueAdmin creates a user_id NULL email row that deliverQueued leaves alone', async () => {
  const r = await enqueueAdmin({ journey: 'partner_applied', title: 'New partner', body: 'x', dedupeKey: `admin:${suffix}` });
  assert.equal(r.created, true);
  await deliverQueued({ limit: 500 });
  const row = await one(`SELECT user_id, status FROM notifications WHERE dedupe_key = $1`, [`admin:${suffix}`]);
  assert.equal(row.user_id, null);
  assert.equal(row.status, 'queued');
});

test('deliverQueued: marketing respects opt-out, transactional always sends, push is skipped', async () => {
  const optedOut = await makeUser({ marketingOptIn: false });
  const optedIn = await makeUser({ marketingOptIn: true });
  assert.equal(isMarketingJourney('welcome_d1'), true);
  assert.equal(isMarketingJourney('generation_ready'), false);

  await notify({ userId: optedOut, journey: 'welcome_d1', channel: 'email', dedupeKey: `d:mk:${optedOut}:${suffix}`, title: 't' });
  await notify({ userId: optedOut, journey: 'generation_ready', channel: 'email', dedupeKey: `d:tx:${optedOut}:${suffix}`, title: 't', payload: { petName: 'Milo', kind: 'image', generationId: 1 } });
  await notify({ userId: optedIn, journey: 'welcome_d1', channel: 'email', dedupeKey: `d:mk:${optedIn}:${suffix}`, title: 't' });
  await notify({ userId: optedIn, journey: 'welcome_d1', channel: 'push', dedupeKey: `d:push:${optedIn}:${suffix}`, title: 't' });
  await notify({ userId: optedIn, journey: 'custom_note', channel: 'email', dedupeKey: `d:generic:${optedIn}:${suffix}`, title: 'Custom', body: 'Hello body' });

  const res = await deliverQueued({ limit: 500 });
  assert.ok(res.total >= 5);

  const get = (k) => one(`SELECT status, error FROM notifications WHERE dedupe_key = $1`, [k]);
  assert.deepEqual(await get(`d:mk:${optedOut}:${suffix}`), { status: 'skipped', error: 'marketing opt-out' });
  assert.equal((await get(`d:tx:${optedOut}:${suffix}`)).status, 'sent');
  assert.equal((await get(`d:mk:${optedIn}:${suffix}`)).status, 'sent');
  assert.deepEqual(await get(`d:push:${optedIn}:${suffix}`), { status: 'skipped', error: 'push not configured' });
  assert.equal((await get(`d:generic:${optedIn}:${suffix}`)).status, 'sent');

  const ev = await one(`SELECT count(*)::int AS c FROM events WHERE name = 'notification_sent' AND user_id = $1`, [optedIn]);
  assert.equal(ev.c, 2);

  // second pass finds nothing for these rows
  const again = await one(`SELECT count(*)::int AS c FROM notifications WHERE status = 'queued' AND dedupe_key LIKE $1`, [`d:%:${suffix}`]);
  assert.equal(again.c, 0);
});
