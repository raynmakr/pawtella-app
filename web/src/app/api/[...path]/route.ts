import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { API_URL, TOKEN_COOKIE } from "@/lib/server-api";

/**
 * BFF proxy: forwards /api/* to `${API_URL}/api/*`, injecting `Authorization: Bearer <token>` from
 * the httpOnly cookie. Auth responses set the cookie (and the token is stripped from the body);
 * logout and account deletion clear it. Everything else passes through untouched.
 */

const AUTH_SET_PATHS = new Set(["auth/login", "auth/register", "auth/apple", "auth/google", "auth/reset"]);
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, matches the JWT lifetime

type Ctx = { params: Promise<{ path: string[] }> };

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

async function setTokenCookie(token: string) {
  const store = await cookies();
  store.set(TOKEN_COOKIE, token, { ...cookieOptions(), maxAge: COOKIE_MAX_AGE });
}

async function clearTokenCookie() {
  const store = await cookies();
  store.set(TOKEN_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
}

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "content-length",
  "content-encoding",
  "host",
  "cookie",
  "set-cookie",
]);

async function proxy(req: NextRequest, ctx: Ctx): Promise<Response> {
  const { path } = await ctx.params;
  const joined = (path ?? []).join("/");
  const method = req.method.toUpperCase();

  // Local-only: there is no API logout; forgetting the cookie is the whole operation.
  if (joined === "auth/logout" && method === "POST") {
    await clearTokenCookie();
    return Response.json({ ok: true });
  }

  const store = await cookies();
  const token = store.get(TOKEN_COOKIE)?.value;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  });
  if (token && !headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);
  headers.set("x-forwarded-host", req.nextUrl.host);
  headers.set("x-forwarded-proto", req.nextUrl.protocol.replace(":", ""));

  const upstreamUrl = `${API_URL}/api/${joined}${req.nextUrl.search}`;
  const init: RequestInit = { method, headers, redirect: "manual" };
  if (method !== "GET" && method !== "HEAD") {
    // Buffer the body: supports JSON and multipart alike without needing `duplex`.
    init.body = await req.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, init);
  } catch (err) {
    console.error("[bff] upstream unreachable", { path: joined, err: (err as Error).message });
    return Response.json({ error: "The Pawtella API is unreachable. Try again in a moment." }, { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  // Auth responses: move the token into the cookie.
  if (isJson && method === "POST" && AUTH_SET_PATHS.has(joined)) {
    const data = (await upstream.json().catch(() => null)) as Record<string, unknown> | null;
    if (upstream.ok && data && typeof data.token === "string") {
      await setTokenCookie(data.token);
      const { token: _omit, ...rest } = data;
      void _omit;
      return Response.json(rest, { status: upstream.status });
    }
    return Response.json(data ?? { error: "Unexpected response" }, { status: upstream.status });
  }

  if (joined === "auth/account" && method === "DELETE" && upstream.ok) await clearTokenCookie();
  if (joined === "auth/me" && upstream.status === 401 && token) await clearTokenCookie();

  const outHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) outHeaders.set(key, value);
  });
  outHeaders.set("cache-control", "no-store");
  return new Response(upstream.body, { status: upstream.status, headers: outHeaders });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
