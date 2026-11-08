"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BellIcon,
  CheckCheckIcon,
  GiftIcon,
  HeartIcon,
  MessageCircleIcon,
  PackageIcon,
  SparklesIcon,
  TrophyIcon,
  UserPlusIcon,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { useMarkRead, useNotifications } from "@/hooks/use-notifications";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@/types/notification";

/** Journey name → icon + tint. Unknown journeys fall back to the bell. */
function journeyStyle(journey: string): { Icon: LucideIcon; tone: string } {
  const j = journey.toLowerCase();
  if (j.includes("like")) return { Icon: HeartIcon, tone: "bg-coral-soft text-primary" };
  if (j.includes("comment")) return { Icon: MessageCircleIcon, tone: "bg-teal-soft text-secondary" };
  if (j.includes("follow") || j.includes("referral") || j.includes("invite")) return { Icon: UserPlusIcon, tone: "bg-teal-soft text-secondary" };
  if (j.includes("order") || j.includes("ship") || j.includes("pickup") || j.includes("stock")) return { Icon: PackageIcon, tone: "bg-accent text-points-foreground dark:text-points" };
  if (j.includes("point") || j.includes("bonus") || j.includes("welcome")) return { Icon: GiftIcon, tone: "bg-accent text-points-foreground dark:text-points" };
  if (j.includes("challenge") || j.includes("win")) return { Icon: TrophyIcon, tone: "bg-accent text-points-foreground dark:text-points" };
  if (j.includes("generation") || j.includes("studio") || j.includes("video")) return { Icon: SparklesIcon, tone: "bg-coral-soft text-primary" };
  return { Icon: BellIcon, tone: "bg-muted text-muted-foreground" };
}

function hrefFor(n: AppNotification): string | null {
  const p = n.payload ?? {};
  if (typeof p.url === "string") return p.url;
  if (typeof p.href === "string") return p.href;
  if (p.postId) return `/post/${p.postId}`;
  if (p.orderId) return `/shop/orders/${p.orderId}`;
  if (p.generationId) return `/studio/${p.generationId}`;
  if (p.challengeId) return `/challenge/${p.challengeId}`;
  return null;
}

function NotificationRow({ n, onRead }: { n: AppNotification; onRead: (id: number) => void }) {
  const { Icon, tone } = journeyStyle(n.journey);
  const href = hrefFor(n);
  const inner = (
    <>
      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-2xl", tone)}>
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-3">
          <span className={cn("text-[15px] leading-snug", n.read ? "font-medium" : "font-bold")}>{n.title}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(n.createdAt)}</span>
        </span>
        {n.body && <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{n.body}</span>}
      </span>
      {!n.read && <span aria-label="Unread" className="mt-2 size-2.5 shrink-0 rounded-full bg-primary" />}
    </>
  );
  const className = cn(
    "flex w-full items-start gap-3.5 rounded-card p-4 text-left ring-1 transition",
    n.read ? "bg-card/70 ring-border" : "bg-card ring-primary/20 shadow-soft",
    "hover:ring-primary/40",
  );
  if (href) {
    return (
      <Link href={href} className={className} onClick={() => !n.read && onRead(n.id)}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" className={className} onClick={() => !n.read && onRead(n.id)} disabled={n.read}>
      {inner}
    </button>
  );
}

export function InboxList() {
  const [page, setPage] = useState(1);
  const q = useNotifications(page);
  const markRead = useMarkRead();
  const unread = q.data?.unreadCount ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Inbox"
        title="Notifications"
        description={unread ? `${unread} unread` : "You're all caught up."}
        actions={
          <Button variant="outline" size="sm" onClick={() => markRead.mutate(undefined)} disabled={!unread || markRead.isPending}>
            <CheckCheckIcon data-icon="inline-start" /> Mark all read
          </Button>
        }
      />
      {q.isPending ? (
        <ListSkeleton rows={5} />
      ) : q.isError ? (
        <ErrorState title="Couldn't load your inbox" error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} />
      ) : q.data.notifications.length === 0 ? (
        <EmptyState
          icon={<BellIcon />}
          title="Nothing here yet"
          description="Likes, comments, order updates and Paw Points bonuses will show up here."
        />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {q.data.notifications.map((n) => (
              <li key={n.id}>
                <NotificationRow n={n} onRead={(id) => markRead.mutate([id])} />
              </li>
            ))}
          </ul>
          {(q.data.hasMore || page > 1) && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                Newer
              </Button>
              <span className="text-sm text-muted-foreground">Page {page}</span>
              <Button variant="outline" size="sm" disabled={!q.data.hasMore} onClick={() => setPage((p) => p + 1)}>
                Older
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
