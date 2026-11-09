// Build the Subscribe & Save offer shown on a product detail page, or null when the product is not
// eligible or the feature is off. Keeps the storefront a thin consumer: it just renders what it gets.
import { flags } from '../env.js';
import { eligibleCategory } from './eligibility.js';
import { cadenceLabel } from './cadence.js';
import { discountedPriceCents } from './tiers.js';
import { listSellingPlans } from './store.js';
import { SUB_RULES } from './rules.js';

export async function subscriptionOfferForProduct(product) {
  if (!flags.subscriptionsEnabled || !product) return null;
  const category = eligibleCategory({
    collections: product.collectionHandles || [],
    title: product.title,
    productType: product.productType,
    tags: product.tags,
  });
  if (!category) return null;

  const plans = await listSellingPlans();
  if (!plans.length) return null;

  const priceCents = product.priceCents || product.variants?.[0]?.priceCents || 0;
  return {
    eligible: true,
    category, // 'dry' | 'wet' | 'litter'
    basePercent: SUB_RULES.baseDiscountPercent,
    maxPercent: SUB_RULES.tierDiscountPercent,
    thresholdCents: SUB_RULES.tierThresholdCents,
    plans: plans
      .filter((p) => p.intervalWeeks)
      .map((p) => ({
        sellingPlanId: p.shopifyPlanId,
        weeks: p.intervalWeeks,
        label: cadenceLabel(p.intervalWeeks),
        percent: Number(p.basePercent),
        priceCents: discountedPriceCents(priceCents, Number(p.basePercent)),
      })),
  };
}
