"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, isApiError } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useCartStore } from "@/stores/cart";
import type { Cart, HoldResponse, PointsHold } from "@/types/shop";

/** Cart GIDs contain slashes; the API reads the id from the raw URL, so encode it as one segment. */
const cartPath = (id: string, suffix = "") => `/api/shop/cart/${encodeURIComponent(id)}${suffix}`;

export interface CartLineInput {
  variantId: string;
  quantity?: number;
}

const toLines = (lines: CartLineInput[]) => lines.map((l) => ({ merchandiseId: l.variantId, quantity: l.quantity ?? 1 }));

export const cartService = {
  get: (id: string) => api<{ cart: Cart }>(cartPath(id)),
  create: (lines: CartLineInput[]) => api<{ cart: Cart }>("/api/shop/cart", { method: "POST", json: { lines: toLines(lines) } }),
  addLines: (cartId: string, lines: CartLineInput[]) =>
    api<{ cart: Cart }>("/api/shop/cart", { method: "POST", json: { cartId, lines: toLines(lines) } }),
  updateLines: (cartId: string, lines: Array<{ id: string; quantity: number }>) =>
    api<{ cart: Cart }>(cartPath(cartId), { method: "PATCH", json: { lines } }),
  removeLines: (cartId: string, lineIds: string[]) =>
    api<{ cart: Cart }>(cartPath(cartId, "/lines"), { method: "DELETE", json: { lineIds } }),
  /** Paw Points at checkout: reserve `points` against this cart (mints a discount code). */
  createHold: (cartId: string, points: number) => api<HoldResponse>("/api/points/hold", { method: "POST", json: { cartId, points } }),
  releaseHold: (holdId: number) => api<{ hold: PointsHold; balance: number }>(`/api/points/hold/${holdId}`, { method: "DELETE" }),
  activeHolds: () => api<{ holds: PointsHold[] }>("/api/points/hold"),
};

const countOf = (cart: Cart) => cart.totalQuantity ?? cart.lines.reduce((s, l) => s + l.quantity, 0);

/** Remember the cart (id in localStorage, count for the badge). */
function remember(cart: Cart) {
  const store = useCartStore.getState();
  if (store.cartId !== cart.id) store.setCartId(cart.id);
  store.setCount(countOf(cart));
  const listeners = cartListeners;
  for (const fn of listeners) fn(cart);
}

const cartListeners = new Set<(cart: Cart) => void>();

/**
 * Add a variant to the cart (creating one when none exists or the saved one has expired).
 * Plain function so other areas (e.g. the Paw Points page quick-buy) can call it outside React Query.
 */
export async function addToCart({ variantId, quantity = 1 }: CartLineInput): Promise<Cart> {
  const store = useCartStore.getState();
  store.hydrate();
  const cartId = useCartStore.getState().cartId;
  let cart: Cart;
  if (cartId) {
    try {
      ({ cart } = await cartService.addLines(cartId, [{ variantId, quantity }]));
    } catch (err) {
      // The mock keeps carts in memory; a restarted API forgets them. Start a fresh cart.
      if (isApiError(err) && err.status === 404) ({ cart } = await cartService.create([{ variantId, quantity }]));
      else throw err;
    }
  } else {
    ({ cart } = await cartService.create([{ variantId, quantity }]));
  }
  remember(cart);
  return cart;
}

/** Normalize the checkout URL: the mock checkout lives on the API host but the Next rewrite proxies
 *  `/mock-checkout/*`, so keep it same-origin. Real Shopify URLs pass through untouched. */
export function checkoutHref(cart: Cart | null | undefined): string | null {
  if (!cart?.checkoutUrl) return null;
  try {
    const u = new URL(cart.checkoutUrl, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    if (u.pathname.startsWith("/mock-checkout/")) return `${u.pathname}${u.search}`;
    return cart.checkoutUrl;
  } catch {
    return cart.checkoutUrl;
  }
}

/**
 * The current cart as React Query state (key `queryKeys.shop.cart(id)`), plus line mutations.
 * Every mutation result is written straight into the cache and the badge store.
 */
export function useCart() {
  const qc = useQueryClient();
  const cartId = useCartStore((s) => s.cartId);
  const hydrated = useCartStore((s) => s.hydrated);
  const hydrate = useCartStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const fn = (cart: Cart) => qc.setQueryData(queryKeys.shop.cart(cart.id), cart);
    cartListeners.add(fn);
    return () => {
      cartListeners.delete(fn);
    };
  }, [qc]);

  const query = useQuery({
    queryKey: queryKeys.shop.cart(cartId ?? "none"),
    queryFn: async () => {
      try {
        const { cart } = await cartService.get(cartId as string);
        useCartStore.getState().setCount(countOf(cart));
        return cart;
      } catch (err) {
        if (isApiError(err) && err.status === 404) {
          useCartStore.getState().clear();
          return null;
        }
        throw err;
      }
    },
    enabled: hydrated && !!cartId,
    staleTime: 10_000,
  });

  const apply = (cart: Cart) => {
    remember(cart);
    return cart;
  };

  return {
    cartId,
    cart: query.data ?? null,
    isLoading: !hydrated || (!!cartId && query.isLoading),
    isEmpty: hydrated && (!cartId || (query.data !== undefined && (!query.data || query.data.lines.length === 0))),
    error: query.error,
    refetch: query.refetch,
    count: useCartStore((s) => s.count),
    add: addToCart,
    updateQuantity: async (lineId: string, quantity: number) => {
      if (!cartId) throw new Error("No cart");
      const { cart } = await cartService.updateLines(cartId, [{ id: lineId, quantity }]);
      return apply(cart);
    },
    removeLine: async (lineId: string) => {
      if (!cartId) throw new Error("No cart");
      const { cart } = await cartService.removeLines(cartId, [lineId]);
      return apply(cart);
    },
    /** After checkout completed (mock or real): forget the cart locally. */
    reset: () => {
      useCartStore.getState().clear();
      qc.removeQueries({ queryKey: ["shop", "cart"] });
    },
    applyCart: apply,
  };
}
