"use client";

import { useEffect, useRef } from "react";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LoadMoreProps {
  hasMore: boolean;
  loading: boolean;
  onLoad: () => void;
  /** What to show once everything is loaded. */
  endLabel?: React.ReactNode;
}

/** IntersectionObserver sentinel that loads the next page when scrolled into view. */
export function LoadMore({ hasMore, loading, onLoad, endLabel }: LoadMoreProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hasMore || loading) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoad();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, onLoad]);

  return (
    <div ref={ref} className="flex min-h-14 items-center justify-center py-4 text-sm text-muted-foreground">
      {loading ? (
        <Loader2Icon className="size-5 animate-spin text-primary" aria-label="Loading more" />
      ) : hasMore ? (
        <Button variant="ghost" size="sm" onClick={onLoad}>
          Load more
        </Button>
      ) : (
        endLabel ?? null
      )}
    </div>
  );
}
