"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { storeReferralCode } from "@/lib/referral";

/** Stores `?ref=CODE` from the URL so /register can send it as referralCode. Renders nothing. */
export function ReferralCapture() {
  const params = useSearchParams();
  const ref = params.get("ref");
  useEffect(() => {
    storeReferralCode(ref);
  }, [ref]);
  return null;
}
