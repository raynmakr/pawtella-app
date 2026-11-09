"use client";

import Link from "next/link";
import { ArrowRightIcon, ImagePlusIcon, SparklesIcon, TrophyIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { challengesService } from "@/services/challenges";
import { queryKeys } from "@/lib/query-keys";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

function BigCard({ href, icon, tone, title, description }: { href: string; icon: React.ReactNode; tone: string; title: string; description: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-card bg-card p-5 ring-1 ring-border transition hover:ring-primary/40 hover:shadow-soft active:scale-[0.99] sm:flex-col sm:items-start sm:gap-5 sm:p-6"
    >
      <span className={cn("flex size-14 shrink-0 items-center justify-center rounded-3xl [&_svg]:size-7", tone)}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-heading text-lg font-extrabold sm:text-xl">{title}</span>
        <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{description}</span>
      </span>
      <ArrowRightIcon className="size-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary sm:self-end" />
    </Link>
  );
}

export function CreateHub() {
  const q = useQuery({ queryKey: queryKeys.challenges.all, queryFn: () => challengesService.list(), staleTime: 60_000 });
  const challenge = q.data?.active?.[0] ?? null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <BigCard
          href="/post/new"
          icon={<ImagePlusIcon />}
          tone="bg-teal-soft text-secondary"
          title="Post a photo or video"
          description="Share a moment from your camera roll. Add a caption or let the assistant suggest one."
        />
        <BigCard
          href="/studio"
          icon={<SparklesIcon />}
          tone="bg-coral-soft text-primary"
          title="AI Studio"
          description="Make an image or video of your pet: astronaut, royal portrait, surf's up and more."
        />
      </div>

      {q.isLoading ? (
        <Skeleton className="h-28 rounded-card" />
      ) : challenge ? (
        <Link
          href={`/studio?challengeId=${challenge.id}${challenge.presetId ? `&presetId=${encodeURIComponent(challenge.presetId)}` : ""}`}
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
              {challenge.entryCount ?? 0} entries · ends {timeAgo(challenge.endsAt).replace(" ago", "")}
              {challenge.endsAt && new Date(challenge.endsAt) > new Date() ? " from now" : ""}
            </span>
          </span>
          <ArrowRightIcon className="size-5 shrink-0 transition group-hover:translate-x-0.5" />
        </Link>
      ) : null}
    </div>
  );
}
