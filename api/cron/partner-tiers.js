// Daily: mature pending commissions and recompute partner tiers (re-minting discount codes).
import { route, requireCron } from '../../lib/http.js';
import { env } from '../../lib/env.js';
import { matureEarnings, recomputeTiers } from '../../lib/partners.js';

async function run(req) {
  requireCron(req, env.cronSecret);
  const matured = await matureEarnings();
  const tiersChanged = await recomputeTiers();
  console.log('[cron:partner-tiers] done', { matured, tiersChanged });
  return { ok: true, matured, tiersChanged };
}

export default route({ GET: run, POST: run });
