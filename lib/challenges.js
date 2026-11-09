// Challenges: listing, leaderboard and the close/activate lifecycle used by the cron.
// Owner: Backend D.
import { one, many, withTransaction } from './db.js';
import { track, EVENT } from './events.js';
import { awardPoints } from './points.js';
import { RULES } from './points-rules.js';
import { notify } from './notifications.js';
import { serializePost } from './posts.js';

export function serializeChallenge(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    presetId: row.preset_id,
    coverUrl: row.cover_url,
    rewardPoints: row.reward_points,
    runnerUpPoints: row.runner_up_points,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    winnerPostId: row.winner_post_id,
    entryCount: row.entry_count === undefined ? undefined : Number(row.entry_count),
    createdAt: row.created_at,
  };
}

const CHALLENGE_COLUMNS = `c.*, (SELECT count(*)::int FROM posts p WHERE p.challenge_id = c.id AND p.is_hidden = false) AS entry_count`;

/** Top entries of a challenge by like_count (ties → earliest), visible posts only. */
export async function leaderboard(challengeId, { limit = 20, viewerId = null } = {}) {
  const rows = await many(
    `SELECT p.id, p.user_id, p.pet_id, p.generation_id, p.challenge_id, p.caption, p.media_url, p.media_type,
            p.thumbnail_url, p.width, p.height, p.duration_seconds, p.visibility, p.feature_consent,
            p.like_count, p.comment_count, p.share_count, p.is_hidden, p.created_at, p.updated_at,
            u.handle AS author_handle, u.display_name AS author_display_name, u.avatar_url AS author_avatar_url,
            pe.name AS pet_name, pe.species AS pet_species, c.title AS challenge_title,
            EXISTS (SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = $3) AS liked_by_viewer
       FROM posts p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN pets pe ON pe.id = p.pet_id
       LEFT JOIN challenges c ON c.id = p.challenge_id
      WHERE p.challenge_id = $1 AND p.is_hidden = false AND p.visibility = 'public' AND u.status = 'active'
      ORDER BY p.like_count DESC, p.created_at ASC, p.id ASC
      LIMIT $2`,
    [challengeId, limit, viewerId],
  );
  return rows.map((r, i) => ({ rank: i + 1, ...serializePost(r) }));
}

export async function getChallenge(id) {
  const row = await one(`SELECT ${CHALLENGE_COLUMNS} FROM challenges c WHERE c.id = $1`, [id]);
  return serializeChallenge(row);
}

/** Active challenges, next `upcoming` scheduled ones and the last `recent` closed ones. */
export async function listChallenges({ upcoming = 2, recent = 3, topEntries = 3, viewerId = null } = {}) {
  const [active, next, closed] = await Promise.all([
    many(`SELECT ${CHALLENGE_COLUMNS} FROM challenges c WHERE c.status = 'active' ORDER BY c.ends_at ASC`),
    many(`SELECT ${CHALLENGE_COLUMNS} FROM challenges c WHERE c.status = 'scheduled' ORDER BY c.starts_at ASC LIMIT $1`, [upcoming]),
    many(`SELECT ${CHALLENGE_COLUMNS} FROM challenges c WHERE c.status = 'closed' ORDER BY c.ends_at DESC LIMIT $1`, [recent]),
  ]);
  const withTop = async (rows) =>
    Promise.all(
      rows.map(async (r) => ({
        ...serializeChallenge(r),
        topEntries: await leaderboard(r.id, { limit: topEntries, viewerId }),
      })),
    );
  return {
    active: await withTop(active),
    upcoming: next.map((r) => ({ ...serializeChallenge(r), topEntries: [] })),
    recent: await withTop(closed),
  };
}

/** Flip scheduled challenges whose window has started to active. Returns ids. */
export async function activateDueChallenges() {
  const rows = await many(
    `UPDATE challenges SET status = 'active'
      WHERE status = 'scheduled' AND starts_at <= now() AND ends_at > now()
      RETURNING id, title`,
  );
  for (const r of rows) console.log('[challenges] activated', { id: r.id, title: r.title });
  return rows.map((r) => r.id);
}

/**
 * Close one challenge: winner = most likes (ties → earliest), two runner-ups; awards points,
 * records the winner post, tracks challenge_won and notifies the winners.
 */
export async function closeChallenge(challengeId) {
  return withTransaction(async (tx) => {
    const ch = await tx.one(`SELECT * FROM challenges WHERE id = $1 FOR UPDATE`, [challengeId]);
    if (!ch || ch.status === 'closed') return null;

    const entries = await tx.many(
      `SELECT p.id, p.user_id, p.like_count, u.handle
         FROM posts p JOIN users u ON u.id = p.user_id
        WHERE p.challenge_id = $1 AND p.is_hidden = false AND p.visibility = 'public' AND u.status = 'active'
        ORDER BY p.like_count DESC, p.created_at ASC, p.id ASC
        LIMIT 3`,
      [challengeId],
    );
    const [winner, ...runnerUps] = entries;

    await tx.query(`UPDATE challenges SET status = 'closed', winner_post_id = $2 WHERE id = $1`, [
      challengeId,
      winner ? winner.id : null,
    ]);

    const winPoints = RULES?.challengeWin ?? ch.reward_points ?? 50;
    const runnerUpPoints = RULES?.challengeRunnerUp ?? ch.runner_up_points ?? 15;
    const awards = [];

    const award = async (entry, points, place) => {
      if (!entry || points <= 0) return;
      await awardPoints(
        entry.user_id,
        points,
        {
          type: 'earn',
          source: 'challenge',
          refType: 'challenge',
          refId: String(challengeId),
          description: place === 1 ? `Won "${ch.title}"` : `Runner-up in "${ch.title}"`,
          metadata: { postId: entry.id, place },
        },
        tx,
      );
      await track(EVENT.challenge_won, { userId: entry.user_id, props: { challengeId, postId: entry.id, place, points } }, tx);
      try {
        await notify({
          userId: entry.user_id,
          journey: place === 1 ? 'challenge_won' : 'challenge_runner_up',
          channel: 'inapp',
          dedupeKey: `challenge_result:${challengeId}:user:${entry.user_id}`,
          title: place === 1 ? `You won ${ch.title}!` : `Runner-up in ${ch.title}`,
          body: `+${points} Paw Points added to your balance.`,
          payload: { challengeId, postId: entry.id, place, points, deepLink: `challenge/${challengeId}` },
        }, tx);
      } catch (err) {
        console.error('[challenges] notify failed', { challengeId, userId: entry.user_id, err: err.message });
      }
      awards.push({ userId: entry.user_id, postId: entry.id, place, points });
    };

    await award(winner, winPoints, 1);
    for (let i = 0; i < runnerUps.length; i++) await award(runnerUps[i], runnerUpPoints, i + 2);

    console.log('[challenges] closed', { challengeId, winnerPostId: winner?.id ?? null, awards: awards.length });
    return { challengeId, winnerPostId: winner?.id ?? null, awards };
  });
}

/** Close every active (or scheduled-but-expired) challenge whose window has ended. */
export async function closeEndedChallenges() {
  const rows = await many(`SELECT id FROM challenges WHERE status <> 'closed' AND ends_at <= now() ORDER BY ends_at ASC`);
  const results = [];
  for (const r of rows) {
    const res = await closeChallenge(r.id);
    if (res) results.push(res);
  }
  return results;
}
