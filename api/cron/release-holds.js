// Hourly: release Paw Point holds older than 24 h (credit back, deactivate the discount code).
import { route, requireCron } from '../../lib/http.js';
import { env } from '../../lib/env.js';
import { releaseExpiredHolds } from '../../lib/points.js';

async function run(req) {
  requireCron(req, env.cronSecret);
  const released = await releaseExpiredHolds();
  console.log('[cron] release-holds', { released });
  return { ok: true, released };
}

export default route({ GET: run, POST: run });
