"use client";

import { TrophyIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { useChallenges } from "@/hooks/use-challenges";
import type { ChallengeWithTop } from "@/types/challenge";
import { ChallengeCard } from "./challenge-card";

function Group({ title, items, hint }: { title: string; items: ChallengeWithTop[]; hint?: string }) {
  if (items.length === 0) return null;
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex flex-col gap-3">
        {items.map((c) => (
          <ChallengeCard key={c.id} challenge={c} />
        ))}
      </div>
    </section>
  );
}

export function ChallengesScreen() {
  const q = useChallenges();
  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
      <PageHeader eyebrow="Weekly" title="Challenges" description="A new theme every Monday. Most-liked entry wins Paw Points, runner-ups get a little too." />
      {q.isPending ? (
        <ListSkeleton variant="card" rows={2} />
      ) : q.isError ? (
        <ErrorState title="Couldn't load challenges" error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} />
      ) : q.data.active.length + q.data.upcoming.length + q.data.recent.length === 0 ? (
        <EmptyState icon={<TrophyIcon />} title="No challenges yet" description="The first weekly challenge is on its way. Check back on Monday." />
      ) : (
        <>
          <Group title="Happening now" items={q.data.active} hint="Most likes wins" />
          <Group title="Coming up" items={q.data.upcoming} />
          <Group title="Recent winners" items={q.data.recent} />
        </>
      )}
    </div>
  );
}
