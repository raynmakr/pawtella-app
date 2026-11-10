// Shared, pure helpers that decide whether a mapped Storefront product (or variant) should be shown
// to customers. Out-of-stock items are hidden everywhere customers browse (shop, collections,
// search, AI suggestions, pet picks); they reappear automatically when Shopify reports stock again.
//
// Shopify is the source of truth. A variant's `availableForSale` is TRUE when it has sellable units
// OR the merchant set it to keep selling when out of stock (inventory policy CONTINUE / "special
// order") OR Shopify is not tracking its inventory. So `availableForSale` already encodes the
// "unless set to continue selling when out of stock" exception; we fall back to `quantityAvailable`
// only to stay safe if the flag is ever stale.

/** A single variant is purchasable if Shopify will sell it (units left, continue-selling, or untracked). */
export function isVariantAvailable(variant) {
  if (!variant) return false;
  if (variant.availableForSale) return true;
  return typeof variant.quantityAvailable === 'number' && variant.quantityAvailable > 0;
}

/**
 * A product is shown when at least one variant is purchasable. When a product carries no variant
 * detail (some list endpoints), fall back to the product-level `availableForSale` flag, which
 * Shopify sets true when any variant can be sold.
 */
export function isProductAvailable(product) {
  if (!product) return false;
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (variants.length) return variants.some(isVariantAvailable);
  return !!product.availableForSale;
}

/** Drop out-of-stock products from a list of mapped products. */
export function filterAvailableProducts(products = []) {
  return (products || []).filter(isProductAvailable);
}

/** Keep only the purchasable variants of a product (for variant pickers). */
export function availableVariants(product) {
  if (!product || !Array.isArray(product.variants)) return [];
  return product.variants.filter(isVariantAvailable);
}

export default { isVariantAvailable, isProductAvailable, filterAvailableProducts, availableVariants };
