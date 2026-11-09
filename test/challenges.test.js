import '../scripts/load-env.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { one, many, closePool } from '../lib/db.js';
import { RULES } from '../lib/points-rules.js';
import { createPost } from '../lib/posts.js';
import { closeChallenge, closeEndedChallenges, activateDueChallenges, listChallenges, getChallenge, leaderboard } from '../lib/challenges.js';

const suffix = () => Math.random().toString(36).slice(2, 9);

async function makeUser() {
  const s = suffix();
  return one(`INSERT INTO users (email, handle, display_name) VALUES ($1, $2, 'Ch Test') RETURNING *`, [`ch-${s}@example.com`, `ch_${s}`]);
}

async function like(postId, userId) {
  await one(`INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [postId, userId]);
  await one(`UPDATE posts SET like_count = like_count + 1 WHERE id = $1`, [postId]);
}

after(() => closePool());

test('close picks winner (ties → earliest), two runner-ups, awards points, notifies', async () => {
  const s = suffix();
  // Active challenge whose window just ended.
  const ch = await one(
    `INSERT INTO challenges (slug, title, preset_id, starts_at, ends_at, status)
     VALUES ($1, 'Zoomies', 'astronaut', now() - interval '8 day', now() - interval '1 minute', 'active') RETURNING *`,
    [`zoomies-${s}`],
  );
  // Keep the challenge "active" for entry: createPost checks status first.
  const [a, b, c, d, l1, l2] = await Promise.all([makeUser(), makeUser(), makeUser(), makeUser(), makeUser(), makeUser()]);
  const pa = await createPost(a.id, { mediaUrl: 'https://x/a.jpg', mediaType: 'image', challengeId: ch.id });
  const pb = await createPost(b.id, { mediaUrl: 'https://x/b.jpg', mediaType: 'image', challengeId: ch.id });
  const pc = await createPost(c.id, { mediaUrl: 'https://x/c.jpg', mediaType: 'image', challengeId: ch.id });
  const pd = await createPost(d.id, { mediaUrl: 'https://x/d.jpg', mediaType: 'image', challengeId: ch.id });
  // a and b tie with 2 likes; a is earlier → a wins. c has 1 like, d has 0.
  await like(pa.id, l1.id); await like(pa.id, l2.id);
  await like(pb.id, l1.id); await like(pb.id, l2.id);
  await like(pc.id, l1.id);

  const before = Object.fromEntries((await many(`SELECT id, paw_points FROM users WHERE id = ANY($1)`, [[a.id, b.id, c.id, d.id]])).map((r) => [r.id, r.paw_points]));

  const lb = await leaderboard(ch.id, { limit: 20 });
  assert.deepEqual(lb.map((e) => e.id), [pa.id, pb.id, pc.id, pd.id]);
  assert.deepEqual(lb.map((e) => e.rank), [1, 2, 3, 4]);

  const results = await closeEndedChallenges();
  const res = results.find((r) => r.challengeId === ch.id);
  assert.ok(res, 'our challenge was closed by the sweep');
  assert.equal(res.winnerPostId, pa.id);
  assert.deepEqual(res.awards.map((x) => [x.userId, x.place, x.points]), [
    [a.id, 1, RULES.challengeWin],
    [b.id, 2, RULES.challengeRunnerUp],
    [c.id, 3, RULES.challengeRunnerUp],
  ]);

  const after_ = Object.fromEntries((await many(`SELECT id, paw_points FROM users WHERE id = ANY($1)`, [[a.id, b.id, c.id, d.id]])).map((r) => [r.id, r.paw_points]));
  assert.equal(after_[a.id] - before[a.id], RULES.challengeWin);
  assert.equal(after_[b.id] - before[b.id], RULES.challengeRunnerUp);
  assert.equal(after_[c.id] - before[c.id], RULES.challengeRunnerUp);
  assert.equal(after_[d.id] - before[d.id], 0);

  const row = await one(`SELECT status, winner_post_id FROM challenges WHERE id = $1`, [ch.id]);
  assert.equal(row.status, 'closed');
  assert.equal(row.winner_post_id, pa.id);

  const won = await many(`SELECT user_id, props FROM events WHERE name = 'challenge_won' AND (props->>'challengeId')::int = $1 ORDER BY (props->>'place')::int`, [ch.id]);
  assert.deepEqual(won.map((e) => e.user_id), [a.id, b.id, c.id]);
  const tx = await many(`SELECT user_id, amount FROM point_transactions WHERE ref_type = 'challenge' AND ref_id = $1 ORDER BY amount DESC`, [String(ch.id)]);
  assert.equal(tx.length, 3);
  const notifs = await many(`SELECT user_id, journey FROM notifications WHERE dedupe_key LIKE $1 ORDER BY user_id`, [`challenge_result:${ch.id}:%`]);
  assert.equal(notifs.length, 3);
  assert.equal(notifs.find((n) => n.user_id === a.id).journey, 'challenge_won');

  // Closing again is a no-op (idempotent).
  assert.equal(await closeChallenge(ch.id), null);
  const after2 = await one(`SELECT paw_points FROM users WHERE id = $1`, [a.id]);
  assert.equal(after2.paw_points, after_[a.id]);

  // It shows up under "recent" with top entries, and the detail has the leaderboard.
  const list = await listChallenges();
  const recent = list.recent.find((x) => x.id === ch.id);
  assert.ok(recent);
  assert.equal(recent.entryCount, 4);
  assert.equal(recent.topEntries.length, 3);
  assert.equal(recent.winnerPostId, pa.id);
  const detail = await getChallenge(ch.id);
  assert.equal(detail.status, 'closed');
});

test('close with no entries leaves winner null; activation flips scheduled challenges', async () => {
  const s = suffix();
  const empty = await one(
    `INSERT INTO challenges (slug, title, starts_at, ends_at, status) VALUES ($1, 'Empty', now() - interval '8 day', now() - interval '1 day', 'active') RETURNING id`,
    [`empty-${s}`],
  );
  const res = await closeChallenge(empty.id);
  assert.equal(res.winnerPostId, null);
  assert.deepEqual(res.awards, []);

  const sched = await one(
    `INSERT INTO challenges (slug, title, starts_at, ends_at, status) VALUES ($1, 'Soon', now() - interval '1 hour', now() + interval '6 day', 'scheduled') RETURNING id`,
    [`soon-${s}`],
  );
  const future = await one(
    `INSERT INTO challenges (slug, title, starts_at, ends_at, status) VALUES ($1, 'Later', now() + interval '1 day', now() + interval '8 day', 'scheduled') RETURNING id`,
    [`later-${s}`],
  );
  const activated = await activateDueChallenges();
  assert.ok(activated.includes(sched.id));
  assert.ok(!activated.includes(future.id));
  assert.equal((await one(`SELECT status FROM challenges WHERE id = $1`, [sched.id])).status, 'active');
  assert.equal((await one(`SELECT status FROM challenges WHERE id = $1`, [future.id])).status, 'scheduled');
});
