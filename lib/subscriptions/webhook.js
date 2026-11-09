// Maps Shopify subscription webhook topics onto the service. Subscription webhooks are intentionally
// thin (often just an id), so for contract changes we re-read the full contract from the Admin API.
import { gid } from '../shopify-client.js';
import { syncContractFromShopify, handleBillingResult } from './service.js';

export const SUBSCRIPTION_TOPICS = new Set([
  'subscription_contracts/create',
  'subscription_contracts/update',
  'subscription_billing_attempts/success',
  'subscription_billing_attempts/failure',
  'subscription_billing_attempts/challenged',
]);

function contractGid(payload) {
  return payload.admin_graphql_api_id || (payload.id != null ? gid('SubscriptionContract', payload.id) : null);
}

function billingContractGid(payload) {
  const raw = payload.subscription_contract_id ?? payload.subscriptionContractId;
  return raw != null ? gid('SubscriptionContract', raw) : null;
}

export async function dispatchSubscriptionWebhook(topic, payload, _meta = {}) {
  switch (topic) {
    case 'subscription_contracts/create':
    case 'subscription_contracts/update': {
      const id = contractGid(payload);
      if (!id) return { subscriptions: 'no contract id' };
      const contract = await syncContractFromShopify(id);
      return { subscriptions: topic, contractId: contract?.id ?? null };
    }
    case 'subscription_billing_attempts/success':
    case 'subscription_billing_attempts/failure': {
      const succeeded = topic.endsWith('/success');
      const result = await handleBillingResult({
        shopifyContractId: billingContractGid(payload),
        idempotencyKey: payload.idempotency_key || payload.idempotencyKey || null,
        shopifyAttemptId: payload.admin_graphql_api_id || null,
        succeeded,
        errorCode: payload.error_code || payload.errorCode || null,
        shopifyOrderId: payload.order_id != null ? gid('Order', payload.order_id) : null,
      });
      return { subscriptions: topic, ...result };
    }
    case 'subscription_billing_attempts/challenged':
      // Buyer action required (3DS etc.); nothing to do until it resolves to success/failure.
      console.log('[subscriptions] billing attempt challenged', { contractId: billingContractGid(payload) });
      return { subscriptions: topic, pending: true };
    default:
      return { subscriptions: 'unhandled', topic };
  }
}
