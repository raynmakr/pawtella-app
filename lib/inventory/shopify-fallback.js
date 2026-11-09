// In-memory Shopify Admin stand-in used by lib/inventory/sync.js when lib/shopify.js does not (yet)
// export the product/inventory functions, and by tests. Records every call in `calls`.
const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export function createRecordingShopify() {
  const calls = [];
  const products = new Map();
  const rec = (fn, args) => calls.push({ fn, args });
  const run = Math.random().toString(36).slice(2, 8); // unique per instance so ids never collide across runs
  return {
    isMock: true,
    calls,
    products,
    async createProduct({ title, sku, barcode, priceCents, vendor, tags = [], status = 'ACTIVE' }) {
      rec('createProduct', { title, sku, barcode, priceCents, vendor, tags, status });
      const n = `${run}-${products.size + 1}`;
      const p = {
        productId: `gid://shopify/Product/mock-${n}`,
        variantId: `gid://shopify/ProductVariant/mock-${n}`,
        inventoryItemId: `gid://shopify/InventoryItem/mock-${n}`,
        handle: `${slug(title)}-${slug(sku).slice(-8)}`,
      };
      products.set(p.productId, { ...p, title, sku, barcode, priceCents, vendor, tags, status, quantity: null });
      return p;
    },
    async updateProduct(productId, { status, tags, metafields } = {}) {
      rec('updateProduct', { productId, status, tags, metafields });
      const p = products.get(productId);
      if (p) Object.assign(p, status ? { status } : {}, tags ? { tags } : {}, metafields ? { metafields } : {});
      return { productId, handle: p?.handle };
    },
    async setInventoryQuantity(inventoryItemId, locationId, quantity) {
      rec('setInventoryQuantity', { inventoryItemId, locationId, quantity });
      for (const p of products.values()) if (p.inventoryItemId === inventoryItemId) p.quantity = quantity;
      return { inventoryItemId, locationId, quantity };
    },
    async setVariantInventoryPolicy(variantId, policy) {
      rec('setVariantInventoryPolicy', { variantId, policy });
      for (const p of products.values()) if (p.variantId === variantId) p.inventoryPolicy = policy;
      return { variantId, policy };
    },
  };
}
