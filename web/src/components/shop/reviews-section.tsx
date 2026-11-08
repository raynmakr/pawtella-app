"use client";

import Image from "next/image";
import { useState } from "react";
import { BadgeCheckIcon, MessageSquareTextIcon, PenLineIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { UserAvatar } from "@/components/avatars";
import { useReviews } from "@/hooks/use-shop";
import { useOrders } from "@/hooks/use-orders";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ReviewDialog } from "./review-dialog";
import { Stars } from "./stars";

export function ReviewsSection({ handle, title }: { handle: string; title: string }) {
  const reviews = useReviews(handle);
  const orders = useOrders();
  const [open, setOpen] = useState(false);

  // Write a review only when one of the user's orders contains this product.
  const purchasedOrder = orders.data?.orders.find((o) => o.lineItems.some((li) => li.handle === handle));

  const summary = reviews.data?.summary;
  const total = summary?.count ?? 0;

  return (
    <section className="mt-8" aria-labelledby="reviews-heading">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="reviews-heading" className="text-xl">
            Reviews
          </h2>
          {summary && total > 0 && (
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <Stars value={summary.avg} />
              <span className="font-semibold text-foreground">{summary.avg.toFixed(1)}</span>· {total} review{total === 1 ? "" : "s"}
            </p>
          )}
        </div>
        {orders.isLoading ? (
          <Skeleton className="h-10 w-36 rounded-full" />
        ) : purchasedOrder ? (
          <Button onClick={() => setOpen(true)}>
            <PenLineIcon data-icon="inline-start" /> Write a review
          </Button>
        ) : (
          <p className="rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">Buy to review · photo reviews earn +5 PP</p>
        )}
      </div>

      {reviews.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-card" />
          <Skeleton className="h-20 w-full rounded-card" />
        </div>
      ) : reviews.isError ? (
        <ErrorState title="Couldn't load reviews" error={reviews.error} onRetry={() => void reviews.refetch()} />
      ) : total === 0 ? (
        <EmptyState
          icon={<MessageSquareTextIcon />}
          title="No reviews yet"
          description={purchasedOrder ? "You bought this one. Be the first to share how it went." : "Buy it, try it, and come back to tell other pet parents."}
          className="py-10"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-[260px_1fr]">
          {/* Histogram */}
          <div className="rounded-card bg-card p-4 ring-1 ring-border md:self-start">
            <p className="font-heading text-4xl font-extrabold">{summary?.avg.toFixed(1)}</p>
            <Stars value={summary?.avg ?? 0} size="md" className="mt-1" />
            <ul className="mt-4 space-y-1.5">
              {([5, 4, 3, 2, 1] as const).map((n) => {
                const count = summary?.histogram[String(n) as "1" | "2" | "3" | "4" | "5"] ?? 0;
                const pct = total ? Math.round((count / total) * 100) : 0;
                return (
                  <li key={n} className="flex items-center gap-2 text-xs">
                    <span className="w-3 text-right font-semibold tabular-nums">{n}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-points" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="w-7 text-right text-muted-foreground tabular-nums">{count}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          {/* List */}
          <ul className="space-y-3">
            {reviews.data?.reviews.map((r) => (
              <li key={r.id} className="rounded-card bg-card p-4 ring-1 ring-border">
                <div className="flex items-start gap-3">
                  <UserAvatar src={r.user.avatarUrl} name={r.user.displayName ?? r.user.handle} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-sm font-semibold">{r.user.displayName ?? `@${r.user.handle}`}</span>
                      {r.pet && <span className="text-xs text-muted-foreground">with {r.pet.name}</span>}
                      {r.verifiedPurchase && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success">
                          <BadgeCheckIcon className="size-3.5" /> Verified purchase
                        </span>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground">{timeAgo(r.createdAt)}</span>
                    </div>
                    <Stars value={r.rating} className="mt-1" />
                    {r.body && <p className="mt-2 text-sm leading-relaxed">{r.body}</p>}
                    {r.photoUrl && (
                      <Image
                        src={r.photoUrl}
                        alt={`Photo by ${r.user.displayName ?? r.user.handle}`}
                        width={160}
                        height={160}
                        unoptimized
                        className={cn("mt-3 size-40 rounded-2xl object-cover ring-1 ring-border")}
                      />
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ReviewDialog open={open} onOpenChange={setOpen} productHandle={handle} productTitle={title} orderId={purchasedOrder?.id} />
    </section>
  );
}
