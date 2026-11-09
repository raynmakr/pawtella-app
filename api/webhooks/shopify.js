// POST /api/webhooks/shopify — Shopify webhook receiver.
// Raw body (bodyParser off) → HMAC verify → idempotency via processed_webhooks (X-Shopify-Webhook-Id)
// → dispatch by X-Shopify-Topic. Always answers 200 once the webhook is recorded, so Shopify does not
// retry or drop the subscription; failures are logged. 401 only for a bad signature.
import { route, rawBody, unauthorized } from '../../lib/http.js';
import { env } from '../../lib/env.js';
import { query, withTransaction } from '../../lib/db.js';
import { verifyWebhookHmac } from '../../lib/shopify.js';
import { upsertOrderFromWebhook } from '../../lib/orders.js';
import { applyShopifyInventoryLevel } from '../../lib/inventory/sync.js';
import { enqueueAdmin } from '../../lib/notifications.js';
import { flags } from '../../lib/env.js';
import { dispatchSubscriptionWebhook, SUBSCRIPTION_TOPICS } from '../../lib/subscriptions/webhook.js';

export const config = { api: { bodyParser: false } };

const ORDER_TOPICS = new Set(['orders/paid', 'orders/create', 'orders/updated', 'orders/fulfilled', 'orders/cancelled', 'orders/partially_fulfilled']);

const header = (req, name) => {
  const v = req.headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
};

async function handle(req) {
  const raw = await rawBody(req);
  const hmac = header(req, 'X-Shopify-Hmac-Sha256');
  const topic = String(header(req, 'X-Shopify-Topic') || '').toLowerCase();
  const webhookId = header(req, 'X-Shopify-Webhook-Id') || `nohdr:${topic}:${Date.now()}`;
  const shopDomain = header(req, 'X-Shopify-Shop-Domain') || null;

  if (env.shopify.webhookSecret) {
    if (!verifyWebhookHmac(raw, hmac)) {
      console.warn('[webhooks/shopify] HMAC mismatch', { topic, webhookId, shopDomain });
      throw unauthorized('Invalid webhook signature');
    }
  } else if (env.isProd) {
    console.error('[webhooks/shopify] SHOPIFY_WEBHOOK_SECRET missing in production; rejecting');
    throw unauthorized('Webhook secret not configured');
  } else {
    console.warn('[webhooks/shopify] SHOPIFY_WEBHOOK_SECRET not set; skipping HMAC verification (dev only)');
  }

  let payload;
  try {
    payload = raw.length ? JSON.parse(raw.toString('utf8')) : {};
  } catch {
    console.warn('[webhooks/shopify] invalid JSON body', { topic, webhookId });
    return { ok: false, error: 'invalid json' };
  }

  // Idempotency: claim the id first; a replay is acknowledged without side effects.
  const id = `shopify:${webhookId}`;
  const { rowCount } = await query('INSERT INTO processed_webhooks (id, topic) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [id, topic || 'unknown']);
  if (rowCount === 0) {
    console.log('[webhooks/shopify] duplicate ignored', { topic, webhookId });
    return { ok: true, duplicate: true };
  }

  try {
    const result = await dispatch(topic, payload, { webhookId, shopDomain });
    return { ok: true, topic, ...(result || {}) };
  } catch (err) {
    // Release the idempotency claim so Shopify's retry can re-run the handler.
    await query('DELETE FROM processed_webhooks WHERE id = $1', [id]).catch(() => {});
    console.error('[webhooks/shopify] handler failed', { topic, webhookId, error: err?.message });
    return { ok: false, topic, error: 'handler failed' };
  }
}

export async function dispatch(topic, payload, meta = {}) {
  if (ORDER_TOPICS.has(topic)) {
    const { order, isNew } = await upsertOrderFromWebhook(payload, { topic });
    return { orderId: order.id, isNew, status: order.status };
  }
  if (SUBSCRIPTION_TOPICS.has(topic)) {
    // Inert until the feature is on, even if Shopify is already sending these.
    if (!flags.subscriptionsEnabled) return { subscriptions: 'disabled' };
    return dispatchSubscriptionWebhook(topic, payload, meta);
  }
  switch (topic) {
    case 'fulfillments/create':
    case 'fulfillments/update': {
      // Fulfillment payloads carry order_id + status/shipment_status; fold into the order row.
      const orderPayload = {
        id: payload.order_id,
        financial_status: undefined,
        fulfillment_status: payload.status === 'success' ? 'fulfilled' : undefined,
        fulfillments: [{ status: payload.status, shipment_status: payload.shipment_status, tracking_url: payload.tracking_url || payload.tracking_urls?.[0] }],
        line_items: payload.line_items || [],
      };
      const { order } = await upsertOrderFromWebhook(stripUndefined(orderPayload), { topic });
      return { orderId: order.id, status: order.status };
    }
    case 'inventory_levels/update': {
      const r = await applyShopifyInventoryLevel(payload);
      return { inventory: r ?? true };
    }
    case 'customers/data_request': {
      console.log('[webhooks/shopify] GDPR data_request', { customerId: payload.customer?.id, ordersRequested: payload.orders_requested?.length });
      await enqueueAdmin({
        journey: 'gdpr_data_request',
        title: 'Shopify customer data request',
        body: `Customer ${payload.customer?.email || payload.customer?.id} requested their data. Orders: ${(payload.orders_requested || []).join(', ') || 'none'}. Export within 30 days.`,
        payload: { customerId: payload.customer?.id, email: payload.customer?.email, orders: payload.orders_requested || [], shop: meta.shopDomain },
      });
      return { gdpr: 'queued' };
    }
    case 'customers/redact': {
      const email = payload.customer?.email || null;
      const customerId = payload.customer?.id != null ? String(payload.customer.id) : null;
      const anonymized = await anonymizeUser({ email, customerId });
      return { gdpr: 'redacted', anonymized };
    }
    case 'shop/redact':
      console.log('[webhooks/shopify] shop/redact acknowledged', { shop: payload.shop_domain });
      return { gdpr: 'ack' };
    default:
      console.log('[webhooks/shopify] unhandled topic', { topic });
      return { unhandled: true };
  }
}

function stripUndefined(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

/** Same effect as DELETE /api/auth/account: scrub PII, keep the row for ledger integrity. */
export async function anonymizeUser({ email, customerId }) {
  return withTransaction(async (tx) => {
    const user = await tx.one(
      `SELECT id FROM users WHERE ($1::text IS NOT NULL AND shopify_customer_id = $1) OR ($2::citext IS NOT NULL AND email = $2) LIMIT 1`,
      [customerId, email],
    );
    if (!user) {
      await tx.query(`UPDATE shop_orders SET email = NULL WHERE email = $1`, [email]);
      return 0;
    }
    const tag = `deleted-${user.id}`;
    await tx.query(
      `UPDATE users SET email = NULL, password_hash = NULL, apple_id = NULL, google_id = NULL, handle = $2, display_name = 'Deleted user',
         avatar_url = NULL, bio = NULL, status = 'deleted', push_token = NULL, shopify_customer_id = NULL, postal_code = NULL,
         lat = NULL, lng = NULL, marketing_opt_in = false WHERE id = $1`,
      [user.id, tag],
    );
    await tx.query(`UPDATE shop_orders SET email = NULL WHERE user_id = $1`, [user.id]);
    await tx.query(`DELETE FROM saved_addresses WHERE user_id = $1`, [user.id]);
    console.log('[webhooks/shopify] customers/redact anonymized user', { userId: user.id });
    return 1;
  });
}

export default route({ POST: handle }, { cors: false });
