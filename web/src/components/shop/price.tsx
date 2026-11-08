import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Price({
  cents,
  compareAtCents,
  currency = "CAD",
  className,
  size = "sm",
}: {
  cents: number;
  compareAtCents?: number | null;
  currency?: string;
  className?: string;
  size?: "sm" | "lg";
}) {
  const onSale = !!compareAtCents && compareAtCents > cents;
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-1.5", className)}>
      <span className={cn("font-heading font-extrabold tabular-nums", size === "lg" ? "text-2xl" : "text-[15px]", onSale && "text-primary")}>
        {formatCents(cents, currency)}
      </span>
      {onSale && (
        <span className={cn("text-muted-foreground line-through tabular-nums", size === "lg" ? "text-base" : "text-xs")}>
          {formatCents(compareAtCents as number, currency)}
        </span>
      )}
    </span>
  );
}
