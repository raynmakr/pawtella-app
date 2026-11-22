"use client";

import { PawPrintIcon } from "lucide-react";
import { Mascot } from "@/components/mascot";
import { cn } from "@/lib/utils";

/**
 * Brand "searching" cue for the shop search box: three coral paw prints walk across in turn,
 * like Pip sniffing out a trail. Sits where the search icon normally is.
 */
export function PawTrail({ className }: { className?: string }) {
  return (
    <span className={cn("paw-trail inline-flex items-center gap-[1px] text-primary", className)} aria-hidden>
      <PawPrintIcon className="size-3" />
      <PawPrintIcon className="size-3" />
      <PawPrintIcon className="size-3" />
    </span>
  );
}

/** Thin coral sweep along the bottom edge of the search field while results load. */
export function SearchSweep({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-5 bottom-0 h-[2px] overflow-hidden rounded-full transition-opacity duration-200",
        active ? "opacity-100" : "opacity-0",
      )}
    >
      <span className="search-sweep block h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent" />
    </span>
  );
}

/** First search with nothing on screen yet: Pip sniffs around above the placeholder tiles. */
export function SniffingOut({ query }: { query: string }) {
  return (
    <div className="mb-4 flex items-center gap-3 rounded-card bg-coral-soft/70 px-4 py-3" role="status" aria-live="polite">
      <Mascot pose="thinking" float className="size-10 shrink-0" />
      <p className="min-w-0 text-sm font-semibold text-foreground">
        Sniffing out <span className="text-primary">“{query}”</span>
        <span className="pip-dots ml-0.5 inline-flex gap-[2px] align-middle" aria-hidden>
          <span className="size-1 rounded-full bg-primary" />
          <span className="size-1 rounded-full bg-primary" />
          <span className="size-1 rounded-full bg-primary" />
        </span>
      </p>
    </div>
  );
}
