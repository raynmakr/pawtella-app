import { PawIcon } from "@/components/logo";
import { cn } from "@/lib/utils";
import { formatPoints } from "@/lib/format";

/** Amber "+N Paw Points" pill for pack products. */
export function PawPackBadge({ points, className, size = "sm" }: { points: number; className?: string; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-points font-heading font-extrabold text-points-foreground",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        className,
      )}
    >
      <PawIcon className={size === "sm" ? "size-3" : "size-3.5"} />+{formatPoints(points)} PP
    </span>
  );
}
