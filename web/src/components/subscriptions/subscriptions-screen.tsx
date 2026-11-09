"use client";

import Link from "next/link";
import { CalendarClockIcon, Loader2Icon, PauseIcon, PlayIcon, RefreshCwIcon, SkipForwardIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { useSubscriptions, useSubscriptionAction } from "@/services/subscriptions";
import { errorMessage, isApiError } from "@/lib/api";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Subscription, TierProgress } from "@/types/subscription";

const CADENCES = [2, 4, 6, 8];

const STATUS_STYLE: Record<string, string> = {
  active: "bg-success/15 text-success",
  paused: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
  expired: "bg-muted text-muted-foreground",
  failed: "bg-destructive/10 text-destructive",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function SubscriptionsScreen() {
  const q = useSubscriptions();

  if (q.isLoading) return <SubscriptionsSkeleton />;
  if (q.isError) {
    if (isApiError(q.error) && q.error.status === 404) {
      return (
        <EmptyState
          title="Subscriptions aren't available yet"
          description="Subscribe & Save is coming soon. You'll be able to auto-ship food and litter and save 5–10%."
          action={
            <Button nativeButton={false} render={<Link href="/shop" />}>
              Browse the shop
            </Button>
          }
        />
      );
    }
    return <ErrorState title="Couldn't load your subscriptions" error={q.error} onRetry={() => void q.refetch()} retrying={q.isRefetching} />;
  }

  const subscriptions = q.data?.subscriptions ?? [];
  const tierProgress = q.data?.tierProgress;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl sm:text-3xl">My subscriptions</h1>
        <p className="mt-1 text-sm text-muted-foreground">Auto-ship your staples and save. Skip, pause, or cancel anytime.</p>
      </header>

      {tierProgress && <TierCard progress={tierProgress} />}

      {subscriptions.length === 0 ? (
        <EmptyState
          title="No subscriptions yet"
          description="Set up Subscribe & Save on any food or litter product to save 5% — and 10% once you pass $100/month."
          action={
            <Button nativeButton={false} render={<Link href="/shop" />}>
              Browse the shop
            </Button>
          }
        />
      ) : (
        <ul className="space-y-4">
          {subscriptions.map((s) => (
            <SubscriptionCard key={s.id} subscription={s} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TierCard({ progress }: { progress: TierProgress }) {
  const pct = Math.min(100, Math.round((progress.monthlyCents / progress.thresholdCents) * 100));
  return (
    <div className="rounded-card bg-card p-4 ring-1 ring-border">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">
            You&apos;re saving <span className="text-primary">{progress.tier}%</span> on every subscription
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatCents(progress.monthlyCents)}/month across your active subscriptions
          </p>
        </div>
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <RefreshCwIcon className="size-5" />
        </span>
      </div>
      {progress.nextTierPercent ? (
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Add {formatCents(progress.toNextTierCents)}/month more to unlock {progress.nextTierPercent}% off everything.
          </p>
        </div>
      ) : (
        <p className="mt-2 text-xs font-medium text-success">You&apos;ve unlocked the top discount tier. 🎉</p>
      )}
    </div>
  );
}

function SubscriptionCard({ subscription: s }: { subscription: Subscription }) {
  const action = useSubscriptionAction();
  const busy = action.isPending;
  const canManage = s.status === "active" || s.status === "paused";

  const run = (args: Parameters<typeof action.mutate>[0], successMsg: string) =>
    action.mutate(args, {
      onSuccess: () => toast.success(successMsg),
      onError: (err) => toast.error(errorMessage(err, "Couldn't update your subscription")),
    });

  return (
    <li className="rounded-card bg-card p-4 ring-1 ring-border">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <ul className="space-y-1">
            {s.lines.map((l) => (
              <li key={l.id} className="truncate text-sm font-semibold">
                {l.quantity}× {l.title || l.sku || "Item"}
                <span className="ml-1.5 font-normal text-muted-foreground">{formatCents(l.currentPriceCents, s.currency)} each</span>
              </li>
            ))}
          </ul>
        </div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-bold capitalize", STATUS_STYLE[s.status] ?? "bg-muted text-muted-foreground")}>
          {s.status}
        </span>
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <CalendarClockIcon className="size-3.5" />
          <dt className="sr-only">Next order</dt>
          <dd>{s.status === "active" ? `Next order ${formatDate(s.nextBillingAt)}` : "Not scheduled"}</dd>
        </div>
        <div>
          <dt className="sr-only">Discount</dt>
          <dd>Saving {Number(s.tierPercent)}%</dd>
        </div>
        {s.billingFailures > 0 && s.status !== "active" && (
          <div className="font-medium text-destructive">Payment failed — update your card to resume</div>
        )}
      </dl>

      {canManage && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground" htmlFor={`cadence-${s.id}`}>
              Every
            </label>
            <Select
              value={String(s.intervalWeeks ?? "")}
              onValueChange={(v) => run({ id: s.id, action: "cadence", weeks: Number(v) }, "Delivery frequency updated")}
              disabled={busy || s.status !== "active"}
            >
              <SelectTrigger id={`cadence-${s.id}`} className="h-9 w-32">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {CADENCES.map((w) => (
                  <SelectItem key={w} value={String(w)}>
                    {w} weeks
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {s.status === "active" && (
            <>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => run({ id: s.id, action: "skip" }, "Next delivery skipped")}>
                <SkipForwardIcon data-icon="inline-start" /> Skip next
              </Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => run({ id: s.id, action: "pause" }, "Subscription paused")}>
                <PauseIcon data-icon="inline-start" /> Pause
              </Button>
            </>
          )}
          {s.status === "paused" && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => run({ id: s.id, action: "resume" }, "Subscription resumed")}>
              <PlayIcon data-icon="inline-start" /> Resume
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => {
              if (typeof window !== "undefined" && !window.confirm("Cancel this subscription? This can't be undone.")) return;
              run({ id: s.id, action: "cancel" }, "Subscription cancelled");
            }}
          >
            <XIcon data-icon="inline-start" /> Cancel
          </Button>
          {busy && <Loader2Icon className="size-4 animate-spin text-muted-foreground" />}
        </div>
      )}
    </li>
  );
}

function SubscriptionsSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-24 w-full rounded-card" />
      <Skeleton className="h-40 w-full rounded-card" />
      <Skeleton className="h-40 w-full rounded-card" />
    </div>
  );
}
