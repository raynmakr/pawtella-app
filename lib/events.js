// Event tracking: every key action emits one row in `events`. Backbone for automation,
// attribution and metrics. `track()` never throws; failures are logged.
import { query } from './db.js';

const NAMES = [
  'signup',
  'login',
  'app_open',
  'pet_added',
  'profile_completed',
  'generation_started',
  'generation_done',
  'generation_failed',
  'post_created',
  'post_liked',
  'comment_created',
  'share_clicked',
  'share_landing_view',
  'referral_signup',
  'checkout_started',
  'hold_created',
  'order_paid',
  'order_fulfilled',
  'review_created',
  'points_awarded',
  'points_spent',
  'pack_purchased',
  'partner_applied',
  'partner_approved',
  'partner_attributed',
  'challenge_entered',
  'challenge_won',
  'notification_sent',
  'inventory_synced',
  'inventory_shopify_sync',
  'back_in_stock',
];

/** EVENT.signup === 'signup', etc. Frozen so typos surface as `undefined`. */
export const EVENT = Object.freeze(Object.fromEntries(NAMES.map((n) => [n, n])));

export function isKnownEvent(name) {
  return Object.prototype.hasOwnProperty.call(EVENT, name);
}

/**
 * Record an event. Pass `tx` to write inside a caller's transaction.
 * Never throws: an unknown name or a DB error is logged and swallowed.
 */
export async function track(name, { userId = null, props = {} } = {}, tx) {
  try {
    if (!isKnownEvent(name)) {
      console.warn('[events] unknown event name, recording anyway', { name });
    }
    const run = tx ? tx.query : query;
    await run('INSERT INTO events (user_id, name, props) VALUES ($1, $2, $3::jsonb)', [
      userId ?? null,
      String(name),
      JSON.stringify(props ?? {}),
    ]);
  } catch (err) {
    console.error('[events] track failed', { name, userId, error: err?.message });
  }
}

export default { EVENT, track };
