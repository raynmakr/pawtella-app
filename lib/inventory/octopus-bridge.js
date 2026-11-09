// Octopus Bridge (24Seven Commerce) adapter (stub).
// If the owner licenses Octopus Bridge, the middleware syncs Franpos → Shopify (products, prices,
// depot quantities) on its own. We then do NOT push anything to Shopify; we only mirror what is
// already there so getStockState()/reservations/digests keep working. listItems() reads Shopify
// Admin products tagged `franpos` via lib/shopify.js when it exposes a product listing; otherwise it
// returns [] and warns. pushOnly=false + readOnlyShopify=true tells sync.js to skip Shopify writes.
export function createOctopusBridgeSource() {
  return {
    name: 'octopus-bridge',
    readOnlyShopify: true,
    async listItems() {
      let shopify;
      try {
        shopify = await import('../shopify.js');
      } catch {
        console.warn('[inventory] octopus-bridge: lib/shopify.js not available, returning []');
        return [];
      }
      const list = shopify.listAdminProducts || shopify.getProducts;
      if (typeof list !== 'function') {
        console.warn('[inventory] octopus-bridge: no product listing function in lib/shopify.js, returning []');
        return [];
      }
      const items = [];
      let cursor;
      for (let page = 0; page < 50; page++) {
        const res = await list({ query: 'tag:franpos', cursor, first: 250 });
        const products = res?.products ?? res ?? [];
        for (const p of products) {
          if (!(p.tags || []).includes('franpos')) continue;
          for (const v of p.variants || []) {
            if (!v.sku) continue;
            items.push({
              sku: v.sku,
              barcode: v.barcode,
              name: p.variants.length > 1 ? `${p.title} - ${v.title}` : p.title,
              category: (p.tags || []).find((t) => t.startsWith('category:'))?.slice(9),
              brand: p.vendor,
              priceCents: v.priceCents ?? p.priceCents ?? 0,
              qtyOnHand: v.quantityAvailable ?? 0,
              shopify: { productId: p.id, variantId: v.id, handle: p.handle, inventoryItemId: v.inventoryItemId },
            });
          }
        }
        cursor = res?.nextCursor;
        if (!cursor) break;
      }
      if (!items.length) console.warn('[inventory] octopus-bridge: no franpos-tagged products found on Shopify');
      return items;
    },
  };
}
