"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/stores/session";
import { authService } from "@/services/auth";
import { errorMessage } from "@/lib/api";

/**
 * Non-blocking, persistent banner shown to existing users who haven't accepted the current Terms +
 * Privacy versions. It stays until they accept (it doesn't gate the app), satisfying the
 * re-acceptance requirement while keeping the UX soft.
 */
export function TermsAcceptanceBanner() {
  const user = useSessionStore((s) => s.user);
  const setUser = useSessionStore((s) => s.setUser);
  const [submitting, setSubmitting] = useState(false);

  if (!user || !user.needsTermsAcceptance) return null;

  const accept = async () => {
    setSubmitting(true);
    try {
      const res = await authService.acceptTerms();
      setUser(res.user);
      toast.success("Thanks — you're all set.");
    } catch (err) {
      toast.error(errorMessage(err, "Could not record your acceptance"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div role="region" aria-label="Updated terms" className="border-b border-border bg-primary/10 px-4 py-3">
      <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-relaxed text-foreground/90">
          We&apos;ve updated our{" "}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-2">
            Terms of Use
          </a>{" "}
          and{" "}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-2">
            Privacy Policy
          </a>
          . Please review and accept to continue.
        </p>
        <Button size="sm" className="shrink-0 self-start sm:self-auto" disabled={submitting} onClick={accept}>
          {submitting && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
          I agree
        </Button>
      </div>
    </div>
  );
}
