"use client";

import Image from "next/image";
import Link from "next/link";
import { CalendarIcon, TrophyIcon, UsersIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/avatars";
import { isOptimizableImage } from "@/lib/media";
import { cn } from "@/lib/utils";
import type { ChallengeWithTop } from "@/types/challenge";
import { daysLeft, startsIn } from "./challenge-utils";

function formatRange(startsAt: string, endsAt: string) {
  const f = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" });
  return `${f.format(new Date(startsAt))} – ${f.format(new Date(endsAt))}`;
}

export function ChallengeCard({ challenge: ch, className }: { challenge: ChallengeWithTop; className?: string }) {
  const winner = ch.status === "closed" ? ch.topEntries.find((e) => e.id === ch.winnerPostId) ?? ch.topEntries[0] : null;
  const status =
    ch.status === "active" ? { label: daysLeft(ch.endsAt), tone: "bg-success text-success-foreground" }
    : ch.status === "scheduled" ? { label: startsIn(ch.startsAt), tone: "bg-accent text-points-foreground dark:text-points" }
    : { label: "Ended", tone: "bg-muted text-muted-foreground" };
  const cover = ch.coverUrl ?? ch.topEntries[0]?.mediaUrl ?? null;

  return (
    <Link
      href={`/challenges/${ch.id}`}
      className={cn("group flex flex-col overflow-hidden rounded-card bg-card shadow-soft ring-1 ring-border transition hover:ring-primary/40 sm:flex-row", className)}
    >
      <div className="relative aspect-[16/9] w-full shrink-0 bg-teal-soft sm:aspect-square sm:w-44">
        {cover && isOptimizableImage(cover) ? (
          <Image src={cover} alt="" fill sizes="(min-width: 640px) 176px, 100vw" className="object-cover transition duration-300 group-hover:scale-[1.03]" />
        ) : cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- data: URLs can't go through the optimizer
          <img src={cover} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-secondary">
            <TrophyIcon className="size-12" />
          </span>
        )}
        <Badge className={cn("absolute top-3 left-3 h-6 px-2.5 text-xs font-bold", status.tone)}>{status.label}</Badge>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4 sm:p-5">
        <h3 className="text-lg leading-snug">{ch.title}</h3>
        {ch.description && <p className="line-clamp-2 text-sm text-muted-foreground">{ch.description}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs font-semibold text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CalendarIcon className="size-3.5" /> {formatRange(ch.startsAt, ch.endsAt)}
          </span>
          <span className="inline-flex items-center gap-1">
            <UsersIcon className="size-3.5" /> {ch.entryCount ?? 0} {ch.entryCount === 1 ? "entry" : "entries"}
          </span>
          <span className="inline-flex items-center gap-1 text-points-foreground dark:text-points">
            <TrophyIcon className="size-3.5" /> +{ch.rewardPoints} PP
          </span>
        </div>
        {winner && (
          <div className="mt-1 flex items-center gap-2 rounded-2xl bg-accent/70 px-3 py-2">
            <UserAvatar src={winner.author.avatarUrl} name={winner.author.displayName ?? winner.author.handle} size="sm" />
            <span className="min-w-0 text-sm">
              <span className="font-bold">Winner:</span> <span className="truncate">@{winner.author.handle}</span>
              <span className="text-muted-foreground"> · {winner.likeCount} likes</span>
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
