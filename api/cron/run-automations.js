// Every 15 min (vercel.json): evaluate lifecycle journeys and deliver queued notifications.
// GET /api/cron/run-automations  (Authorization: Bearer CRON_SECRET in production)
import { route, requireCron } from '../../lib/http.js';
import { env } from '../../lib/env.js';
import { runAutomations } from '../../lib/automation.js';

async function handler(req) {
  requireCron(req, env.cronSecret);
  const summary = await runAutomations(new Date());
  return { ok: true, ...summary };
}

export default route({ GET: handler, POST: handler });
