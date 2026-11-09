// Daily: expire the balances of users with no points activity for RULES.expiryMonths.
import { route, requireCron } from '../../lib/http.js';
import { env } from '../../lib/env.js';
import { RULES } from '../../lib/points-rules.js';
import { expireInactivePoints } from '../../lib/points.js';

async function run(req) {
  requireCron(req, env.cronSecret);
  const expired = await expireInactivePoints();
  console.log('[cron] expire-points', { expired, enabled: RULES.expiryEnabled });
  return { ok: true, expired, enabled: RULES.expiryEnabled, expiryMonths: RULES.expiryMonths };
}

export default route({ GET: run, POST: run });
