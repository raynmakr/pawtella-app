"use client";

import { ListSkeleton } from "@/components/list-skeleton";
import { ErrorState } from "@/components/error-state";
import { LoadMore } from "@/components/load-more";
import { useFeed } from "@/hooks/use-posts";
import type { FeedMode } from "@/types/post";
import { PostCard } from "./post-card";

interface FeedListProps {
  mode: FeedMode;
  challengeId?: number | string | null;
  empty: React.ReactNode;
}

export function FeedList({ mode, challengeId, empty }: FeedListProps) {
  const q = useFeed(mode, challengeId);
  if (q.isPending) return <ListSkeleton variant="card" rows={3} />;
  if (q.isError) return <ErrorState title="Couldn't load the feed" error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} />;
  const posts = q.data.pages.flatMap((p) => p.posts);
  if (posts.length === 0) return <>{empty}</>;
  return (
    <div className="flex flex-col gap-5">
      {posts.map((post, i) => (
        <PostCard key={post.id} post={post} priority={i === 0} />
      ))}
      <LoadMore
        hasMore={!!q.hasNextPage}
        loading={q.isFetchingNextPage}
        onLoad={() => void q.fetchNextPage()}
        endLabel={posts.length > 3 ? "You're all caught up" : null}
      />
    </div>
  );
}
