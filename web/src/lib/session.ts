import "server-only";
import { cookies } from "next/headers";
import type { SessionPayload } from "@/types/auth";
import { ONBOARDED_COOKIE, TOKEN_COOKIE, serverApi } from "./server-api";

/**
 * Read the current session on the server. Returns `{ user: null, pets: [] }` when there is no
 * cookie, the token is invalid, or the API is down (so pages degrade to the signed-out state).
 */
export async function getServerSession(): Promise<SessionPayload> {
  const store = await cookies();
  if (!store.get(TOKEN_COOKIE)?.value) return { user: null, pets: [] };
  try {
    const data = await serverApi<SessionPayload>("/api/auth/me");
    return { user: data.user ?? null, pets: Array.isArray(data.pets) ? data.pets : [] };
  } catch {
    return { user: null, pets: [] };
  }
}

export async function hasOnboardedCookie(): Promise<boolean> {
  const store = await cookies();
  return store.get(ONBOARDED_COOKIE)?.value === "1";
}
