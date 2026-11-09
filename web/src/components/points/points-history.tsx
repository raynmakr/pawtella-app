"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  BanIcon,
  ClockIcon,
  GiftIcon,
  LockIcon,
  ReceiptIcon,
  RotateCcwIcon,
  ShoppingBagIcon,
  SparklesIcon,
  UnlockIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { pointsService } from "@/services/points";
import { queryKeys } from "@/lib/query-keys";
import { formatPoints, timeAgo } from "@/lib/format";
import { useSession } from "@/stores/session";
import { cn } from "@/lib/utils";
import type { PointTransaction, TransactionsPage } from "@/types/points";

function style(t: PointTransaction): { Icon: LucideIcon; tone: string } {
  switch (t.type) {
    case "earn":
      return { Icon: ShoppingBagIcon, tone: "bg-teal-soft text-secondary" };
    case "bonus":
      return { Icon: GiftIcon, tone: "bg-accent text-points-foreground dark:text-points" };
    case "purchase":
      return { Icon: ReceiptIcon, tone: "bg-accent text-points-foreground dark:text-points" };
    case "refund":
      return { Icon: RotateCcwIcon, tone: "bg-success/15 text-success" };
    case "spend":
      return { Icon: t.source?.startsWith("ai") ? SparklesIcon : ShoppingBagIcon, tone: "bg-coral-soft text-primary" };
    case "hold":
      return { Icon: LockIcon, tone: "bg-muted text-muted-foreground" };
    case "release":
      return { Icon: UnlockIcon, tone: "bg-muted text-muted-foreground" };
    case "expire":
      return { Icon: BanIcon, tone: "bg-destructive/10 text-destructive" };
    case "admin":
      return { Icon: WrenchIcon, tone: "bg-muted text-muted-foreground" };
    default:
      return { Icon: ClockIcon, tone: "bg-muted text-muted-foreground" };
  }
}

export function PointsHistory() {
  const { isAuthenticated } = useSession();
  const [page, setPage] = useState(1);
  const q = useQuery<TransactionsPage>({
    queryKey: queryKeys.points.transactions(page),
    queryFn: () => pointsService.transactions(page, 20),
    enabled: isAuthenticated,
    placeholderData: (prev) => prev,
  });
  const rows = q.data?.transactions ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Rewards"
        title="Points history"
        description="Every earn, spend and refund with your running balance."
        actions={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/points" />}>
            <ArrowLeftIcon data-icon="inline-start" /> Back
          </Button>
        }
      />
      {q.isLoading ? (
        <ListSkeleton rows={6} />
      ) : q.isError ? (
        <ErrorState title="Couldn't load your history" error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<ClockIcon />} title="No activity yet" description="Your first Paw Points land here when you post, create or shop." />
      ) : (
        <>
          <ul className={cn("divide-y divide-border overflow-hidden rounded-card bg-card ring-1 ring-border", q.isFetching && "opacity-70")}>
            {rows.map((t) => {
              const { Icon, tone } = style(t);
              const positive = t.amount > 0;
              return (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-2xl", tone)}>
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{t.description}</span>
                    <span className="block text-xs text-muted-foreground">{timeAgo(t.createdAt)}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={cn("block font-heading text-base font-extrabold tabular-nums", positive ? "text-success" : t.amount < 0 ? "text-foreground" : "text-muted-foreground")}>
                      {positive ? "+" : ""}{formatPoints(t.amount)}
                    </span>
                    <span className="block text-[11px] tabular-nums text-muted-foreground">bal. {formatPoints(t.balanceAfter)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mt-5 flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <span className="text-sm text-muted-foreground">Page {page}</span>
            <Button variant="outline" size="sm" disabled={!q.data?.hasMore} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </>
      )}
    </>
  );
}
