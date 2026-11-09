"use client";

import { useSession } from "@/stores/session";

/** The signed-in user (or null) plus their pets, straight from the session store. */
export function useMe() {
  const { user, pets, status, isLoading, isAuthenticated, primaryPet, refresh } = useSession();
  return { me: user, pets, primaryPet, status, isLoading, isAuthenticated, refresh };
}
