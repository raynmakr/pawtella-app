// Every 5 min: finish video jobs the client stopped polling (older than 1 min); fail + refund anything
// still running after 30 min.
import { route, requireCron } from '../../lib/http.js';
import { env } from '../../lib/env.js';
import { finalizeStale } from '../../lib/generations.js';

async function run(req) {
  requireCron(req, env.cronSecret);
  const summary = await finalizeStale({ minAgeMs: 60_000, timeoutMs: 30 * 60_000 });
  console.log('[cron] finalize-generations', summary);
  return { ok: true, ...summary };
}

export default route({ GET: run, POST: run });
