"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeftIcon, CameraIcon, HeartIcon, SparklesIcon, TrophyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { LoadMore } from "@/components/load-more";
import { UserAvatar } from "@/components/avatars";
import { PostsGrid } from "@/components/profile/posts-grid";
import { useChallenge } from "@/hooks/use-challenges";
import { useFeed } from "@/hooks/use-posts";
import { isApiError } from "@/lib/api";
import { isOptimizableImage } from "@/lib/media";
import { formatPoints } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Challenge } from "@/types/challenge";
import { postHref, studioHref } from "./challenge-utils";

function useCountdown(endsAt: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, new Date(endsAt).getTime() - now);
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  return { diff, d, h, m, s };
}

function Countdown({ challenge }: { challenge: Challenge }) {
  const target = challenge.status === "scheduled" ? challenge.startsAt : challenge.endsAt;
  const { diff, d, h, m, s } = useCountdown(target);
  if (challenge.status === "closed" || diff === 0) {
    return <p className="text-sm font-semibold text-muted-foreground">This challenge has ended.</p>;
  }
  const cells = [
    { v: d, l: "days" },
    { v: h, l: "hrs" },
    { v: m, l: "min" },
    { v: s, l: "sec" },
  ];
  return (
    <div>
      <p className="mb-2 text-xs font-bold tracking-wider text-muted-foreground uppercase">{challenge.status === "scheduled" ? "Starts in" : "Ends in"}</p>
      <div className="flex gap-2" aria-live="off">
        {cells.map((c) => (
          <div key={c.l} className="flex min-w-14 flex-col items-center rounded-2xl bg-muted px-2 py-2">
            <span className="font-heading text-xl font-extrabold tabular-nums">{String(c.v).padStart(2, "0")}</span>
            <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">{c.l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Entries({ challengeId }: { challengeId: number }) {
  const q = useFeed("challenge", challengeId);
  if (q.isPending) return <ListSkeleton variant="tile" rows={6} />;
  if (q.isError) return <ErrorState title="Couldn't load entries" error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} />;
  const posts = q.data.pages.flatMap((p) => p.posts);
  if (posts.length === 0) return <EmptyState icon={<CameraIcon />} title="No entries yet" description="Be the first in. Post a photo or create one in the Studio with this challenge selected." />;
  return (
    <>
      <PostsGrid tiles={posts} />
      <LoadMore hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onLoad={() => void q.fetchNextPage()} />
    </>
  );
}

export function ChallengeDetail({ id }: { id: string }) {
  const q = useChallenge(id);
  if (q.isPending) {
    return (
      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-6">
        <Skeleton className="aspect-[16/7] rounded-card" />
        <Skeleton className="h-40 rounded-card" />
        <ListSkeleton variant="tile" rows={6} />
      </div>
    );
  }
  if (q.isError) {
    if (isApiError(q.error) && q.error.status === 404) {
      return (
        <EmptyState
          title="Challenge not found"
          action={
            <Button nativeButton={false} render={<Link href="/challenges" />}>
              All challenges
            </Button>
          }
        />
      );
    }
    return <ErrorState title="Couldn't load this challenge" error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} />;
  }
  const { challenge: ch, leaderboard } = q.data;
  const cover = ch.coverUrl ?? leaderboard[0]?.mediaUrl ?? null;
  const open = ch.status === "active";

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" nativeButton={false} render={<Link href="/challenges" />}>
          <ArrowLeftIcon data-icon="inline-start" /> Challenges
        </Button>
      </div>

      <section className="relative overflow-hidden rounded-card bg-secondary text-secondary-foreground shadow-soft">
        <div className="relative aspect-[16/8] sm:aspect-[16/6]">
          {cover && isOptimizableImage(cover) ? (
            <Image src={cover} alt="" fill priority sizes="(min-width: 768px) 860px, 100vw" className="object-cover opacity-50" />
          ) : cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- data: URLs can't go through the optimizer
            <img src={cover} alt="" className="absolute inset-0 size-full object-cover opacity-50" />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-secondary via-secondary/40 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
            <p className="flex items-center gap-1.5 text-xs font-bold tracking-wider uppercase opacity-90">
              <TrophyIcon className="size-4" /> {ch.status === "active" ? "This week's challenge" : ch.status === "scheduled" ? "Coming up" : "Finished challenge"}
            </p>
            <h1 className="mt-1 text-3xl text-secondary-foreground sm:text-4xl">{ch.title}</h1>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-[1fr_300px]">
        <section className="rounded-card bg-card p-5 shadow-soft ring-1 ring-border">
          <h2 className="text-lg">Rules</h2>
          {ch.description && <p className="mt-2 text-[15px] leading-relaxed">{ch.description}</p>}
          <ul className="mt-3 grid gap-2 text-sm text-muted-foreground">
            <li>Post a photo, video or Studio creation with this challenge selected.</li>
            <li>The entry with the most likes when the timer ends wins. Ties go to the earliest entry.</li>
            <li>
              Winner: <strong className="text-foreground">+{ch.rewardPoints} Paw Points</strong>. Runner-ups: <strong className="text-foreground">+{ch.runnerUpPoints}</strong> each.
            </li>
            <li>Keep it kind and pet-safe. Reported entries are hidden.</li>
          </ul>
        </section>
        <aside className="flex flex-col gap-4 rounded-card bg-card p-5 shadow-soft ring-1 ring-border">
          <Countdown challenge={ch} />
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{formatPoints(ch.entryCount ?? 0)}</strong> {ch.entryCount === 1 ? "entry" : "entries"} so far
          </p>
          {open && (
            <div className="flex flex-col gap-2">
              <Button size="lg" nativeButton={false} render={<Link href={studioHref(ch)} />}>
                <SparklesIcon data-icon="inline-start" /> Enter with Studio
              </Button>
              <Button size="lg" variant="soft" nativeButton={false} render={<Link href={postHref(ch)} />}>
                <CameraIcon data-icon="inline-start" /> Post a photo
              </Button>
            </div>
          )}
        </aside>
      </div>

      <section aria-labelledby="leaderboard-heading" className="rounded-card bg-card p-5 shadow-soft ring-1 ring-border">
        <h2 id="leaderboard-heading" className="text-lg">
          Leaderboard
        </h2>
        {leaderboard.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No entries yet. The first post takes the lead.</p>
        ) : (
          <ol className="mt-3 divide-y divide-border">
            {leaderboard.map((e) => (
              <li key={e.id}>
                <Link href={`/post/${e.id}`} className="flex items-center gap-3 py-2.5 transition hover:bg-muted/50">
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full font-heading text-sm font-extrabold",
                      e.rank === 1 ? "bg-points text-points-foreground" : e.rank <= 3 ? "bg-coral-soft text-primary" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {e.rank}
                  </span>
                  <UserAvatar src={e.author.avatarUrl} name={e.author.displayName ?? e.author.handle} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{e.author.displayName ?? e.author.handle}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      @{e.author.handle}
                      {e.pet ? ` · ${e.pet.name}` : ""}
                    </span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-sm font-bold tabular-nums">
                    <HeartIcon className="size-4 fill-primary text-primary" /> {formatPoints(e.likeCount)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="entries-heading">
        <h2 id="entries-heading" className="mb-3 text-lg">
          All entries
        </h2>
        <Entries challengeId={ch.id} />
      </section>
    </div>
  );
}
