import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ListSkeletonProps extends React.ComponentProps<"div"> {
  rows?: number;
  /** `row`: avatar + two lines; `card`: media card; `tile`: square grid tile. */
  variant?: "row" | "card" | "tile";
}

export function ListSkeleton({ rows = 4, variant = "row", className, ...props }: ListSkeletonProps) {
  if (variant === "tile") {
    return (
      <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3", className)} {...props}>
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-2xl" />
        ))}
      </div>
    );
  }
  if (variant === "card") {
    return (
      <div className={cn("flex flex-col gap-4", className)} {...props}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-card bg-card ring-1 ring-border">
            <Skeleton className="aspect-[4/3] w-full rounded-none" />
            <div className="space-y-2 p-4">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className={cn("flex flex-col gap-3", className)} {...props}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl bg-card p-4 ring-1 ring-border">
          <Skeleton className="size-11 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
