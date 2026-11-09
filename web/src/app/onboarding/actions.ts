"use server";

import { cookies } from "next/headers";
import { ONBOARDED_COOKIE } from "@/lib/server-api";

/** Remember that this browser has seen onboarding, so the (app) gate stops redirecting to it. */
export async function markOnboarded() {
  const store = await cookies();
  store.set(ONBOARDED_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
