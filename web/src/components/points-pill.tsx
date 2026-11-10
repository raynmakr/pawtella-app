"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePointsBalance } from "@/hooks/use-points";
import { useCountUp } from "@/hooks/use-count-up";
import { formatPoints } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PawIcon } from "./logo";
import { Skeleton } from "@/components/ui/skeleton";

interface PointsPillProps {
  className?: string;
  size?: "sm" | "md";
}

/** Amber pill with the Paw Points balance; counts up and pops when points are earned. */
export function PointsPill({ className, size = "md" }: PointsPillProps) {
  const { balance, isLoading } = usePointsBalance();
  const display = useCountUp(balance);
  const prev = useRef(balance);
  const [bump, setBump] = useState(0);

  useEffect(() => {
    if (balance > prev.current) setBump((b) => b + 1);
    prev.current = balance;
  }, [balance]);

  return (
    <Link
      href="/points"
      aria-label={`${formatPoints(balance)} Paw Points`}
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-full bg-points font-heading font-extrabold text-points-foreground shadow-[0_4px_12px_-4px_var(--points)] transition-transform hover:scale-[1.03] active:scale-95",
        size === "md" ? "h-9 px-3.5 text-sm" : "h-7 px-2.5 text-xs",
        className,
      )}
    >
      <span key={bump} className={cn("inline-flex", bump > 0 && "animate-pop")}>
        <PawIcon className={size === "md" ? "size-4" : "size-3.5"} />
      </span>
      {isLoading ? (
        <Skeleton className="h-3 w-6 bg-points-foreground/20" />
      ) : (
        <span className="tabular-nums">{formatPoints(display)}</span>
      )}
    </Link>
  );
}
