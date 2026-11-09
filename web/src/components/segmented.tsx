"use client";

import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
}

interface SegmentedProps<T extends string | number> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  "aria-label": string;
  className?: string;
  size?: "sm" | "md";
}

/** Pill-style segmented control (radio group semantics). */
export function Segmented<T extends string | number>({ value, onChange, options, className, size = "md", ...rest }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={rest["aria-label"]} className={cn("inline-flex w-full rounded-full bg-muted p-1", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 rounded-full font-semibold transition disabled:opacity-40",
              size === "md" ? "h-9 px-3 text-sm" : "h-7 px-2.5 text-xs",
              active ? "bg-card text-foreground shadow-soft ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
