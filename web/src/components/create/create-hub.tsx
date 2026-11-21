"use client";

import Link from "next/link";
import { ArrowRightIcon, CameraIcon, SparklesIcon, TrophyIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { challengesService } from "@/services/challenges";
import { queryKeys } from "@/lib/query-keys";
import { timeAgo } from "@/lib/format";
import { postHref } from "@/components/challenges/challenge-utils";

/** Create: posting a real photo or video is the main action. The Studio is an optional extra. */
export function CreateHub() {
  const q = useQuery({ queryKey: queryKeys.challenges.all, queryFn: () => challengesService.list(), staleTime: 60_000 });
  const challenge = q.data?.active?.[0] ?? null;

  return (
    <div className="space-y-6">
      <Link
        href="/post/new"
        className="group flex items-center gap-4 rounded-card bg-primary p-5 text-primary-foreground shadow-soft transition hover:shadow-lift active:scale-[0.99] sm:p-6"
      >
        <span className="flex size-14 shrink-0 items-center justify-center rounded-3xl bg-primary-foreground/15 [&_svg]:size-7">
          <CameraIcon />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-heading text-lg font-extrabold sm:text-xl">Post a photo or video</span>
          <span className="mt-1 block text-sm leading-relaxed opacity-90">
            Naps, zoomies, first walks, goofy faces. Share a real moment from your camera roll.
          </span>
        </span>
        <ArrowRightIcon className="size-5 shrink-0 transition group-hover:translate-x-0.5" />
      </Link>

      {q.isLoading ? (
        <Skeleton className="h-28 rounded-card" />
      ) : challenge ? (
        <Link
          href={postHref(challenge)}
          className="group relative flex items-center gap-4 overflow-hidden rounded-card bg-points p-5 text-points-foreground ring-1 ring-points/60 transition hover:shadow-lift"
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-points-foreground/10">
            <TrophyIcon className="size-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold tracking-wider uppercase opacity-80">This week&apos;s challenge</span>
              <Badge className="bg-points-foreground/15 text-points-foreground">+{challenge.rewardPoints} PP to win</Badge>
            </span>
            <span className="mt-0.5 block font-heading text-lg font-extrabold">{challenge.title}</span>
            <span className="block text-sm opacity-80">
              Post a photo to enter · {challenge.entryCount ?? 0} {challenge.entryCount === 1 ? "entry" : "entries"} · ends {timeAgo(challenge.endsAt).replace(" ago", "")}
              {challenge.endsAt && new Date(challenge.endsAt) > new Date() ? " from now" : ""}
            </span>
          </span>
          <ArrowRightIcon className="size-5 shrink-0 transition group-hover:translate-x-0.5" />
        </Link>
      ) : null}

      <Link
        href="/studio"
        className="flex items-center gap-3 rounded-card p-4 text-sm text-muted-foreground ring-1 ring-border transition hover:text-foreground hover:ring-primary/30"
      >
        <SparklesIcon className="size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="font-medium text-foreground">Studio</span> · optional fun styles for a photo you already have
        </span>
        <ArrowRightIcon className="size-4 shrink-0" />
      </Link>
    </div>
  );
}
