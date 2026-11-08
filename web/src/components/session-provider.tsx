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

/** Server components render this with the session they already read, so the UI never flashes. */
export function SessionHydrator({ initial }: { initial: SessionPayload }) {
  const done = useRef(false);
  if (!done.current) {
    // Safe: zustand setState outside React's render of subscribed components has not happened yet
    // on the first client render (no subscribers mounted above us have read the store).
    done.current = true;
    useSessionStore.getState().hydrate(initial);
  }
  useEffect(() => {
    useSessionStore.getState().hydrate(initial);
  }, [initial]);
  return null;
}
