// Scheduled: trigger billing for subscription contracts due today. Our app owns the contracts, so
// Shopify will not bill them for us — we create a subscriptionBillingAttempt per due contract with a
// deterministic idempotency key. Recomputes each customer's tier before charging. Dunning (retry →
// pause) is applied as attempts resolve (synchronously in mock mode; via webhook in real mode).
import { route, requireCron } from '../../lib/http.js';
import { env, flags } from '../../lib/env.js';
import { processDueBilling } from '../../lib/subscriptions/service.js';

async function run(req) {
  requireCron(req, env.cronSecret);
  if (!flags.subscriptionsEnabled) {
    return { ok: true, skipped: 'subscriptions disabled' };
  }
  const summary = await processDueBilling({ asOf: new Date() });
  console.log('[cron] subscriptions-billing', summary);
  return { ok: true, ...summary };
}

export default route({ GET: run, POST: run });
