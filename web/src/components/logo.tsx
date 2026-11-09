import { cn } from "@/lib/utils";

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
  /** Hide the wordmark and show only the paw. */
  markOnly?: boolean;
}

const sizes = {
  sm: { mark: "size-7 rounded-lg", icon: "size-4", text: "text-lg" },
  md: { mark: "size-9 rounded-xl", icon: "size-5", text: "text-2xl" },
  lg: { mark: "size-12 rounded-2xl", icon: "size-7", text: "text-3xl" },
  xl: { mark: "size-16 rounded-3xl", icon: "size-9", text: "text-5xl" },
};

/** Pawtella wordmark: coral rounded tile with a paw + "Pawtella" in the display face. */
export function Logo({ size = "md", markOnly = false, className, ...props }: LogoProps) {
  const s = sizes[size];
  return (
    <span className={cn("inline-flex items-center gap-2.5 select-none", className)} {...props}>
      <span
        className={cn(
          "inline-flex items-center justify-center bg-primary text-primary-foreground shadow-[0_6px_16px_-6px_var(--primary)]",
          s.mark,
        )}
      >
        <PawIcon className={s.icon} />
      </span>
      {!markOnly && (
        <span className={cn("font-heading font-extrabold tracking-tight text-foreground", s.text)}>
          Paw<span className="text-primary">tella</span>
        </span>
      )}
    </span>
  );
}
