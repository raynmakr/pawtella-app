"use client";

import { useEffect, useRef } from "react";
import { useSessionStore } from "@/stores/session";
import type { SessionPayload } from "@/types/auth";

/**
 * Root-level: fetches GET /api/session once on mount unless a nested <SessionHydrator> already
 * filled the store from the server (its effect runs first because effects fire child-first).
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (useSessionStore.getState().status === "loading") void useSessionStore.getState().refresh();
  }, []);
  return <>{children}</>;
}

/**
 * Server components render this with the session they already read. Hydration happens in an
 * effect (never during render) so the module-level store is never touched during SSR.
 */
export function SessionHydrator({ initial }: { initial: SessionPayload }) {
  useEffect(() => {
    useSessionStore.getState().hydrate(initial);
  }, [initial]);
  return null;
}
