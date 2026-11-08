"use client";

import { useState } from "react";
import Link from "next/link";
import { ClockIcon, ImageIcon, LoaderCircleIcon, SparklesIcon, TriangleAlertIcon, VideoIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { useGenerations } from "@/hooks/use-generation";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Generation } from "@/types/ai";

function StatusBadge({ g }: { g: Generation }) {
  if (g.status === "done") return null;
  if (g.status === "failed")
    return (
      <Badge variant="destructive" className="absolute top-2 left-2">
        <TriangleAlertIcon /> Failed
      </Badge>
    );
  return (
    <Badge className="absolute top-2 left-2 bg-points text-points-foreground">
      <LoaderCircleIcon className="animate-spin" /> {g.progress ? `${g.progress}%` : "Queued"}
    </Badge>
  );
}

export function GenerationHistory() {
  const [page, setPage] = useState(1);
  const q = useGenerations(page);
  const items = q.data?.generations ?? [];

  return (
    <>
      <PageHeader
        eyebrow="AI Studio"
        title="Your creations"
        description="Everything you've made, newest first."
        actions={
          <Button size="sm" nativeButton={false} render={<Link href="/studio" />}>
            <SparklesIcon data-icon="inline-start" /> New
          </Button>
        }
      />
      {q.isLoading ? (
        <ListSkeleton variant="tile" rows={6} />
      ) : q.isError ? (
        <ErrorState title="Couldn't load your creations" error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<SparklesIcon />}
          title="Nothing here yet"
          description="Your images and videos will show up here once you make one."
          action={
            <Button nativeButton={false} render={<Link href="/studio" />}>
              Open the Studio
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((g) => {
              const ok = (u: string | null) => (u && /^(https?:\/\/|data:image\/)/i.test(u) ? u : null);
              const thumb = ok(g.thumbnailUrl) || (g.kind === "image" ? ok(g.outputUrl) : null) || ok(g.sourceImageUrl);
              return (
                <Link
                  key={g.id}
                  href={`/studio/${g.id}`}
                  className={cn("group relative aspect-square overflow-hidden rounded-2xl bg-muted ring-1 ring-border transition hover:ring-primary/40", g.status === "failed" && "opacity-70")}
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt={g.prompt} className={cn("size-full object-cover transition group-hover:scale-[1.03]", g.status !== "done" && "blur-[2px]")} />
                  ) : (
                    <div className="flex size-full items-center justify-center text-muted-foreground">
                      {g.kind === "video" ? <VideoIcon className="size-8" /> : <ImageIcon className="size-8" />}
                    </div>
                  )}
                  <StatusBadge g={g} />
                  <span className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-black/50 text-white">
                    {g.kind === "video" ? <VideoIcon className="size-3.5" /> : <ImageIcon className="size-3.5" />}
                  </span>
                  <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/70 to-transparent px-2.5 pt-6 pb-2 text-[11px] font-medium text-white">
                    <ClockIcon className="size-3" /> {timeAgo(g.createdAt)}
                    <span className="ml-auto">{g.pointsCharged} PP</span>
                  </span>
                </Link>
              );
            })}
          </div>
          {(page > 1 || q.data?.hasMore) && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <span className="text-sm text-muted-foreground">Page {page}</span>
              <Button variant="outline" size="sm" disabled={!q.data?.hasMore} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
