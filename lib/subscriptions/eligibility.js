// Eligibility (pure): which products can be subscribed to, and the dry/wet/litter sub-category.
//
// Eligibility is driven by Shopify collection membership (dog-food, cat-food, litter-hygiene). For
// the two food collections we additionally classify dry vs wet from product type / tags / title "as
// best available" — this is metadata for the UI and reporting; both dry and wet food are eligible.
import { SUB_RULES } from './rules.js';

const WET_RE = /\b(wet|canned|cans?|pouch(es)?|pat[eé]|p[aâ]t[eé]|gravy|broth|stew|morsels|chunks|loaf)\b/i;
const DRY_RE = /\b(dry|kibble|crunchy|biscuits?|baked)\b/i;

/** 'dry' | 'wet' for a food product, best-effort from title/type/tags; defaults to 'dry'. */
export function classifyFood({ title = '', productType = '', tags = [] } = {}) {
  const hay = [title, productType, ...(tags || [])].join(' ').toLowerCase();
  if (WET_RE.test(hay)) return 'wet';
  if (DRY_RE.test(hay)) return 'dry';
  return 'dry'; // dry food is the default auto-ship staple when unmarked
}

/**
 * Category for a product, or null when it is not subscribable.
 * Returns 'dry' | 'wet' | 'litter'.
 */
export function eligibleCategory({ collections = [], title = '', productType = '', tags = [] } = {}) {
  const handles = (collections || []).map((c) => String(c?.handle ?? c).toLowerCase());
  if (handles.includes('litter-hygiene')) return 'litter';
  if (handles.includes('dog-food') || handles.includes('cat-food')) {
    return classifyFood({ title, productType, tags });
  }
  return null;
}

export function isEligible(product) {
  return eligibleCategory(product) !== null;
}

export { SUB_RULES };
