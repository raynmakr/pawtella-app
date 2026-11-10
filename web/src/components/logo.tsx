import { cn } from "@/lib/utils";
import { Mascot } from "./mascot";

/** Paw-print mark drawn inline. Inherits `currentColor` unless `className` sets a text color. */
export function PawIcon({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 64 64" fill="currentColor" aria-hidden="true" className={cn("size-6", className)} {...props}>
      <ellipse cx="20" cy="20" rx="7.5" ry="9.5" transform="rotate(-18 20 20)" />
      <ellipse cx="44" cy="20" rx="7.5" ry="9.5" transform="rotate(18 44 20)" />
      <ellipse cx="8.5" cy="36" rx="6" ry="7.5" transform="rotate(-32 8.5 36)" />
      <ellipse cx="55.5" cy="36" rx="6" ry="7.5" transform="rotate(32 55.5 36)" />
      <path d="M32 30c-8 0-12.5 6.5-16 12.5C12.5 48.5 15.5 56 23 56c3.7 0 6-1.5 9-1.5s5.3 1.5 9 1.5c7.5 0 10.5-7.5 7-13.5C44.5 36.5 40 30 32 30z" />
    </svg>
  );
}

interface LogoProps extends React.ComponentProps<"span"> {
  /** Height of the mark; the wordmark scales with it. */
  size?: "sm" | "md" | "lg" | "xl";
  /** Hide the wordmark and show only Pip's head mark. */
  markOnly?: boolean;
  /** Idle blink / ear twitch on the mark. Default true; always honours reduced motion. */
  animate?: boolean;
}

const sizes = {
  sm: { mark: "w-8", text: "text-lg", gap: "gap-2" },
  md: { mark: "w-10", text: "text-2xl", gap: "gap-2.5" },
  lg: { mark: "w-14", text: "text-3xl", gap: "gap-3" },
  xl: { mark: "w-20", text: "text-5xl", gap: "gap-3.5" },
};

/** Pawtella lockup: Pip's head mark + "Pawtella" in the display face. */
export function Logo({ size = "md", markOnly = false, animate = true, className, ...props }: LogoProps) {
  const s = sizes[size];
  return (
    <span className={cn("inline-flex items-center select-none", s.gap, className)} {...props}>
      <Mascot
        variant="mark"
        animate={animate}
        className={cn("shrink-0 drop-shadow-[0_4px_10px_rgba(255,107,74,0.30)]", s.mark)}
      />
      {!markOnly && (
        <span className={cn("font-heading font-extrabold tracking-tight text-foreground", s.text)}>
          Paw<span className="text-primary">tella</span>
        </span>
      )}
    </span>
  );
}
