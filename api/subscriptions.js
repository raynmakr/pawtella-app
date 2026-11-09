// /api/subscriptions — the authenticated "My subscriptions" surface.
//   GET  /api/subscriptions            → { subscriptions, tierProgress }
//   GET  /api/subscriptions/:id         → { subscription }
//   POST /api/subscriptions/:id/pause | resume | cancel | skip
//   POST /api/subscriptions/:id/cadence { weeks }
// Everything 404s while SUBSCRIPTIONS_ENABLED is off, so the feature is invisible until activated.
import { route, segments, body, badRequest, notFound } from '../lib/http.js';
import { flags } from '../lib/env.js';
import { requireAuth } from '../lib/auth.js';
import { camelize } from '../lib/serialize.js';
import * as store from '../lib/subscriptions/store.js';
import * as service from '../lib/subscriptions/service.js';
import { normalizeCadence } from '../lib/subscriptions/cadence.js';
import { discountedPriceCents } from '../lib/subscriptions/tiers.js';

function ensureEnabled() {
  if (!flags.subscriptionsEnabled) throw notFound();
}

function toApi(row) {
  if (!row) return null;
  const { raw, ...rest } = row;
  return camelize(rest);
}

async function loadOwned(id, userId) {
  const contract = await store.getByIdForUser(id, userId);
  if (!contract) throw notFound('Subscription not found');
  return contract;
}

export default route({
  GET: async (req) => {
    ensureEnabled();
    const { userId } = await requireAuth(req);
    const seg = segments(req, '/api/subscriptions');
    if (seg.length === 0) {
      const [subscriptions, tierProgress] = await Promise.all([store.listByUser(userId), service.tierProgressForUser(userId)]);
      return { subscriptions: subscriptions.map(toApi), tierProgress };
    }
    const id = parseInt(seg[0], 10);
    if (!Number.isInteger(id)) throw badRequest('Invalid subscription id');
    return { subscription: toApi(await loadOwned(id, userId)) };
  },

  POST: async (req) => {
    ensureEnabled();
    const { userId } = await requireAuth(req);
    const seg = segments(req, '/api/subscriptions');
    const id = parseInt(seg[0], 10);
    const action = seg[1];
    if (!Number.isInteger(id) || !action) throw badRequest('Usage: POST /api/subscriptions/:id/:action');

    const contract = await loadOwned(id, userId);
    switch (action) {
      case 'pause':
        return { subscription: toApi(await service.pauseForUser(contract)) };
      case 'resume':
        return { subscription: toApi(await service.resumeForUser(contract)) };
      case 'cancel':
        return { subscription: toApi(await service.cancelForUser(contract)) };
      case 'skip':
        return { subscription: toApi(await service.skipNextForUser(contract)) };
      case 'cadence': {
        const weeks = normalizeCadence(body(req).weeks);
        if (!weeks) throw badRequest('weeks must be one of 2, 4, 6, 8');
        return { subscription: toApi(await service.changeCadenceForUser(contract, weeks)) };
      }
      default:
        throw badRequest(`Unknown action: ${action}`);
    }
  },
});

// Re-export for callers/tests that want the pricing helper alongside the route.
export { discountedPriceCents };
