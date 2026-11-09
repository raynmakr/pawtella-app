// Daily 08:00 Toronto (13:00 UTC in vercel.json): email the admin digest to ADMIN_EMAIL and drain
// enqueueAdmin() rows into it. `?dry=1` builds without sending.
import { route, requireCron } from '../../lib/http.js';
import { env } from '../../lib/env.js';
import { buildDigest, sendDigest } from '../../lib/digest.js';

async function handler(req) {
  requireCron(req, env.cronSecret);
  if (req.query?.dry) {
    const digest = await buildDigest();
    return { ok: true, sent: false, dry: true, digest };
  }
  const result = await sendDigest();
  return {
    ok: true,
    sent: result.sent,
    mock: result.mock ?? null,
    to: result.to ?? null,
    drained: result.drained ?? 0,
    reason: result.reason,
    counts: result.digest.counts,
    topPosts: result.digest.topPosts.length,
    pendingPayouts: result.digest.pendingPayouts.length,
  };
}

export default route({ GET: handler, POST: handler });
