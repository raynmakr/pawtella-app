// Daily cron: activate scheduled challenges whose window started, close ended ones and pay winners.
import { route, requireCron } from '../../lib/http.js';
import { env } from '../../lib/env.js';
import { activateDueChallenges, closeEndedChallenges } from '../../lib/challenges.js';

async function run(req) {
  requireCron(req, env.cronSecret);
  const activated = await activateDueChallenges();
  const closed = await closeEndedChallenges();
  const summary = {
    ok: true,
    activated: activated.length,
    closed: closed.length,
    awarded: closed.reduce((n, c) => n + c.awards.length, 0),
    results: closed,
  };
  console.log('[cron] close-challenges', { activated: summary.activated, closed: summary.closed, awarded: summary.awarded });
  return summary;
}

export default route({ GET: run, POST: run });
