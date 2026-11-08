"use client";

import { useInfiniteQuery, useQueries, useQuery } from "@tanstack/react-query";
import { shopService, type ProductsQuery } from "@/services/shop";
import { reviewsService } from "@/services/reviews";
import { queryKeys } from "@/lib/query-keys";

export function useCollections() {
  return useQuery({ queryKey: queryKeys.shop.collections, queryFn: () => shopService.collections(), staleTime: 5 * 60_000 });
}

export function useFulfillment() {
  return useQuery({ queryKey: queryKeys.shop.fulfillment, queryFn: () => shopService.fulfillment(), staleTime: 30 * 60_000 });
}

/** Paged product grid: GET /api/shop/products?collection&q&cursor */
export function useProducts(params: Omit<ProductsQuery, "cursor">, enabled = true) {
  return useInfiniteQuery({
    queryKey: queryKeys.shop.products({ collection: params.collection || undefined, q: params.q || undefined }),
    queryFn: ({ pageParam }) => shopService.products({ ...params, cursor: pageParam || undefined }),
    initialPageParam: "" as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });
}

export function useProduct(handle: string) {
  return useQuery({ queryKey: queryKeys.shop.product(handle), queryFn: () => shopService.product(handle), enabled: !!handle });
}

/** Several products by handle (order line item thumbnails). Failures are ignored per item. */
export function useProductsByHandle(handles: string[]) {
  return useQueries({
    queries: handles.map((h) => ({
      queryKey: queryKeys.shop.product(h),
      queryFn: () => shopService.product(h),
      staleTime: 10 * 60_000,
      retry: false,
    })),
  });
}

export function useReviews(handle: string) {
  return useQuery({ queryKey: [...queryKeys.shop.product(handle), "reviews"] as const, queryFn: () => reviewsService.list(handle), enabled: !!handle });
}
