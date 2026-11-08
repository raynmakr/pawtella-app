import "server-only";
import { cookies } from "next/headers";
import { ApiError, buildQuery, parseApiResponse, type ApiInit } from "./api";

export const API_URL = (process.env.API_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const TOKEN_COOKIE = "pawtella_token";
export const ONBOARDED_COOKIE = "pawtella_onboarded";

/**
 * Server-component fetch helper: calls the API host directly with the Bearer token read from
 * the httpOnly cookie. Never cached.
 *
 *   const { user, pets } = await serverApi<SessionPayload>("/api/auth/me");
 */
export async function serverApi<T = unknown>(path: string, init: ApiInit = {}): Promise<T> {
  const { json, query, headers, body, ...rest } = init;
  const store = await cookies();
  const token = store.get(TOKEN_COOKIE)?.value;
  const h = new Headers(headers);
  h.set("Accept", "application/json");
  if (token && !h.has("Authorization")) h.set("Authorization", `Bearer ${token}`);
  let finalBody: BodyInit | null | undefined = body;
  if (json !== undefined) {
    h.set("Content-Type", "application/json");
    finalBody = JSON.stringify(json);
  }
  const url = `${API_URL}${path.startsWith("/") ? path : `/${path}`}${buildQuery(query)}`;
  let res: Response;
  try {
    res = await fetch(url, { ...rest, headers: h, body: finalBody, cache: "no-store" });
  } catch (err) {
    throw new ApiError(502, "The Pawtella API is unreachable", err);
  }
  return parseApiResponse<T>(res);
}
