"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { authService } from "@/services/auth";
import { useSession } from "@/stores/session";
import { errorMessage } from "@/lib/api";
import { clearReferralCode, readReferralCode } from "@/lib/referral";
import { Skeleton } from "@/components/ui/skeleton";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string; itp_support?: boolean }) => void;
          renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

/** Google Identity Services button. Renders a disabled hint when no client id is configured. */
export function GoogleButton({ onSuccess }: { onSuccess?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { hydrate, refresh } = useSession();
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!ready || !CLIENT_ID || !ref.current || !window.google) return;
    window.google.accounts.id.initialize({
      client_id: CLIENT_ID,
      itp_support: true,
      callback: async ({ credential }) => {
        setBusy(true);
        try {
          const referralCode = readReferralCode() || undefined;
          const res = await authService.google({ idToken: credential, referralCode });
          clearReferralCode();
          hydrate({ user: res.user, pets: [] });
          const session = await refresh();
          onSuccess?.();
          router.push(res.isNew || session.pets.length === 0 ? "/onboarding/add-pet" : "/home");
          router.refresh();
        } catch (err) {
          toast.error(errorMessage(err, "Google sign-in failed"));
        } finally {
          setBusy(false);
        }
      },
    });
    ref.current.innerHTML = "";
    window.google.accounts.id.renderButton(ref.current, {
      theme: resolvedTheme === "dark" ? "filled_black" : "outline",
      size: "large",
      shape: "pill",
      width: ref.current.clientWidth || 320,
      text: "continue_with",
      logo_alignment: "center",
    });
  }, [ready, resolvedTheme, router, hydrate, refresh, onSuccess]);

  if (!CLIENT_ID) {
    return (
      <div className="flex h-12 w-full cursor-not-allowed items-center justify-center rounded-full border border-dashed border-border bg-muted/60 px-4 text-sm text-muted-foreground" title="Set NEXT_PUBLIC_GOOGLE_CLIENT_ID to enable">
        Google sign-in is not configured yet
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={() => setReady(true)} />
      {!ready && <Skeleton className="h-12 w-full rounded-full" />}
      <div ref={ref} className={busy ? "pointer-events-none opacity-60" : undefined} />
    </div>
  );
}
