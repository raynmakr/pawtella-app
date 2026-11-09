// Challenges: GET /api/challenges (active + upcoming + recent), GET /api/challenges/:id (leaderboard).
import { route, segments, notFound, intParam } from '../lib/http.js';
import { optionalAuth } from '../lib/auth.js';
import { listChallenges, getChallenge, leaderboard } from '../lib/challenges.js';

const BASE = '/api/challenges';

async function GET(req) {
  const seg = segments(req, BASE);
  const viewer = await optionalAuth(req);
  const viewerId = viewer?.userId ?? null;

  if (seg.length === 0) return listChallenges({ viewerId });

  const id = Number(seg[0]);
  if (!Number.isInteger(id) || id <= 0) throw notFound('Challenge not found');

  if (seg.length === 1) {
    const challenge = await getChallenge(id);
    if (!challenge) throw notFound('Challenge not found');
    const entries = await leaderboard(id, { limit: intParam(req.query.limit, 20, { min: 1, max: 50 }), viewerId });
    return { challenge, leaderboard: entries };
  }

  throw notFound();
}

export default route({ GET });
