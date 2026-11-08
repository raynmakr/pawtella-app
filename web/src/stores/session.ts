"use client";

import { create } from "zustand";
import type { SessionPayload } from "@/types/auth";
import type { PrivateUser } from "@/types/user";
import type { Pet } from "@/types/pet";
import { authService } from "@/services/auth";

export type SessionStatus = "loading" | "authenticated" | "anonymous";

interface SessionState {
  status: SessionStatus;
  user: PrivateUser | null;
  pets: Pet[];
  /** Replace the snapshot (used after auth mutations and by the server hydrator). */
  hydrate: (payload: SessionPayload) => void;
  /** Re-fetch GET /api/session. */
  refresh: () => Promise<SessionPayload>;
  setUser: (user: PrivateUser | null) => void;
  setPets: (pets: Pet[]) => void;
  /** Optimistic local balance update; the next refresh re-syncs with the API. */
  adjustPoints: (delta: number) => void;
  clear: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  status: "loading",
  user: null,
  pets: [],
  hydrate: ({ user, pets }) =>
    set({ user: user ?? null, pets: pets ?? [], status: user ? "authenticated" : "anonymous" }),
  refresh: async () => {
    try {
      const payload = await authService.session();
      get().hydrate(payload);
      return payload;
    } catch {
      const payload: SessionPayload = { user: null, pets: [] };
      get().hydrate(payload);
      return payload;
    }
  },
  setUser: (user) => set((s) => ({ user, status: user ? "authenticated" : s.status })),
  setPets: (pets) => set({ pets }),
  adjustPoints: (delta) =>
    set((s) => (s.user ? { user: { ...s.user, pawPoints: Math.max(0, s.user.pawPoints + delta) } } : {})),
  clear: () => set({ user: null, pets: [], status: "anonymous" }),
}));

/** Convenience hook: `const { user, pets, status, isAuthenticated, refresh } = useSession()`. */
export function useSession() {
  const status = useSessionStore((s) => s.status);
  const user = useSessionStore((s) => s.user);
  const pets = useSessionStore((s) => s.pets);
  const refresh = useSessionStore((s) => s.refresh);
  const hydrate = useSessionStore((s) => s.hydrate);
  const clear = useSessionStore((s) => s.clear);
  return {
    status,
    user,
    pets,
    isLoading: status === "loading",
    isAuthenticated: status === "authenticated",
    primaryPet: pets.find((p) => p.isPrimary) ?? pets[0] ?? null,
    refresh,
    hydrate,
    clear,
  };
}
