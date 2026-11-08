import { api } from "@/lib/api";
import type { Collection, FulfillmentInfo, ProductDetail, ProductsPage, ShopAssistResponse } from "@/types/shop";

export interface ProductsQuery {
  collection?: string;
  q?: string;
  cursor?: string;
  first?: number;
}

export const shopService = {
  collections: () => api<{ collections: Collection[]; isMock?: boolean }>("/api/shop/collections"),
  products: (params: ProductsQuery = {}) =>
    api<ProductsPage>("/api/shop/products", { query: { collection: params.collection, q: params.q, cursor: params.cursor, first: params.first } }),
  product: (handle: string) => api<{ product: ProductDetail }>(`/api/shop/products/${encodeURIComponent(handle)}`),
  fulfillment: () => api<{ fulfillment: FulfillmentInfo }>("/api/shop/fulfillment"),
  /** Natural-language search grounded in the catalog. */
  assist: (message: string, petId?: number) => api<ShopAssistResponse>("/api/ai/shop-assist", { method: "POST", json: { message, petId } }),
};
