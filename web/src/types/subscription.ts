/** Mirrors the API shape from api/subscriptions.js (camelCase of the subscription_* tables). */

export type SubscriptionStatus = "active" | "paused" | "cancelled" | "expired" | "failed";

export interface SubscriptionLine {
  id: number;
  shopifyLineId: string;
  productHandle?: string | null;
  title?: string | null;
  sku?: string | null;
  quantity: number;
  basePriceCents: number;
  currentPriceCents: number;
}

export interface Subscription {
  id: number;
  shopifyContractId: string;
  status: SubscriptionStatus;
  intervalWeeks: number | null;
  tierPercent: number;
  monthlyValueCents: number;
  currency: string;
  nextBillingAt: string | null;
  billingFailures: number;
  lastBillingError?: string | null;
  lines: SubscriptionLine[];
}

/** Progress toward the next discount tier. */
export interface TierProgress {
  tier: number;
  monthlyCents: number;
  thresholdCents: number;
  nextTierPercent: number | null;
  toNextTierCents: number;
}

export interface SubscriptionsResponse {
  subscriptions: Subscription[];
  tierProgress: TierProgress;
}
