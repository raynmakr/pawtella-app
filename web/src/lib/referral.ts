"use client";

const KEY = "pawtella_ref";

/** Referral / partner code captured from `?ref=` on /welcome, kept for the register call. */
export function storeReferralCode(code: string | null | undefined) {
  if (!code) return;
  try {
    sessionStorage.setItem(KEY, code.trim().toUpperCase().slice(0, 32));
  } catch {
    /* private mode */
  }
}

export function readReferralCode(): string {
  try {
    return sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function clearReferralCode() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
