"use client";

import { StarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Stars({ value, size = "sm", className }: { value: number; size?: "sm" | "md" | "lg"; className?: string }) {
  const px = size === "lg" ? "size-6" : size === "md" ? "size-4.5" : "size-3.5";
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon key={n} className={cn(px, n <= Math.round(value) ? "fill-points text-points" : "fill-muted text-border")} />
      ))}
    </span>
  );
}

/** Interactive 1–5 rating. */
export function StarPicker({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          disabled={disabled}
          onClick={() => onChange(n)}
          className="rounded-full p-0.5 transition hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
        >
          <StarIcon className={cn("size-8", n <= value ? "fill-points text-points" : "fill-transparent text-border")} />
        </button>
      ))}
    </div>
  );
}
