"use client";

import { create } from "zustand";

export const CART_ID_KEY = "pawtella_cart_id";

function readCartId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CART_ID_KEY);
  } catch {
    return null;
  }
}

interface CartState {
  /** Shopify cart GID persisted in localStorage; null until the first add. */
  cartId: string | null;
  /** Item count shown on the Shop tab badge. */
  count: number;
  hydrated: boolean;
  hydrate: () => void;
  setCartId: (id: string | null) => void;
  setCount: (count: number) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>((set) => ({
  cartId: null,
  count: 0,
  hydrated: false,
  hydrate: () => set((s) => (s.hydrated ? {} : { cartId: readCartId(), hydrated: true })),
  setCartId: (id) => {
    try {
      if (id) window.localStorage.setItem(CART_ID_KEY, id);
      else window.localStorage.removeItem(CART_ID_KEY);
    } catch {
      // private mode; keep it in memory only
    }
    set({ cartId: id, hydrated: true, ...(id ? {} : { count: 0 }) });
  },
  setCount: (count) => set({ count: Math.max(0, count) }),
  clear: () => {
    try {
      window.localStorage.removeItem(CART_ID_KEY);
    } catch {
      // ignore
    }
    set({ cartId: null, count: 0, hydrated: true });
  },
}));

/** Badge count for the Shop nav item. */
export function useCartCount() {
  return useCartStore((s) => s.count);
}
