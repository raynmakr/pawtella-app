"use client";

import Image from "next/image";
import Link from "next/link";
import { SparklesIcon, TrophyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useChallenges } from "@/hooks/use-challenges";
import { daysLeft, studioHref } from "@/components/challenges/challenge-utils";
import { isOptimizableImage } from "@/lib/media";
import { cn } from "@/lib/utils";

/** Active weekly challenge strip for the home feed. Renders nothing when there is none. */
export function ChallengeBanner({ className }: { className?: string }) {
  const q = useChallenges();
  if (q.isPending) return <Skeleton className={cn("h-36 rounded-card", className)} />;
  const ch = q.data?.active?.[0];
  if (!ch) return null;
  const left = daysLeft(ch.endsAt);
  return (
    <section
      aria-label="Weekly challenge"
      className={cn("relative overflow-hidden rounded-card bg-secondary text-secondary-foreground shadow-soft", className)}
    >
      {ch.coverUrl && isOptimizableImage(ch.coverUrl) && (
        <Image src={ch.coverUrl} alt="" fill sizes="(min-width: 768px) 700px, 100vw" className="object-cover opacity-30" />
      )}
      <div className="absolute -top-10 -right-10 size-40 rounded-full bg-points/30 blur-2xl" aria-hidden />
      <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-bold tracking-wider uppercase opacity-90">
            <TrophyIcon className="size-4" /> This week&apos;s challenge
          </p>
          <h2 className="mt-1 truncate text-xl font-extrabold text-secondary-foreground sm:text-2xl">{ch.title}</h2>
          <p className="mt-1 text-sm opacity-90">
            {left} · {ch.entryCount ?? 0} {ch.entryCount === 1 ? "entry" : "entries"} · +{ch.rewardPoints} Paw Points to the winner
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="points"
            nativeButton={false}
            render={<Link href={studioHref(ch)} />}
          >
            <SparklesIcon data-icon="inline-start" /> Enter
          </Button>
          <Button
            variant="outline"
            className="border-secondary-foreground/30 bg-transparent text-secondary-foreground hover:bg-secondary-foreground/10 hover:text-secondary-foreground"
            nativeButton={false}
            render={<Link href={`/challenges/${ch.id}`} />}
          >
            See entries
          </Button>
        </div>
      </div>
    </section>
  );
}
