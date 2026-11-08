"use client";

import Image from "next/image";
import Link from "next/link";
import { HeartIcon, ImageIcon, MessageCircleIcon, PlayIcon } from "lucide-react";
import { ListSkeleton } from "@/components/list-skeleton";
import { ErrorState } from "@/components/error-state";
import { EmptyState } from "@/components/empty-state";
import { LoadMore } from "@/components/load-more";
import { useUserPosts } from "@/hooks/use-posts";
import { isOptimizableImage } from "@/lib/media";
import { formatPoints } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MediaType } from "@/types/post";

export interface GridTile {
  id: number;
  mediaUrl: string;
  mediaType: MediaType;
  thumbnailUrl?: string | null;
  likeCount: number;
  commentCount: number;
  caption?: string | null;
  /** Optional rank badge (challenge leaderboard). */
  rank?: number;
}

export function PostTile({ tile, className, sizes = "(min-width: 768px) 33vw, 50vw" }: { tile: GridTile; className?: string; sizes?: string }) {
  const src = tile.mediaType === "video" ? tile.thumbnailUrl : tile.mediaUrl;
  return (
    <Link
      href={`/post/${tile.id}`}
      className={cn("group relative block aspect-square overflow-hidden rounded-2xl bg-muted ring-1 ring-border transition hover:ring-primary/40", className)}
      aria-label={tile.caption ?? "Open post"}
    >
      {tile.mediaType === "video" && !src ? (
        <video src={tile.mediaUrl} muted playsInline preload="metadata" className="absolute inset-0 size-full object-cover" />
      ) : src && isOptimizableImage(src) ? (
        <Image src={src} alt="" fill sizes={sizes} className="object-cover transition duration-300 group-hover:scale-[1.03]" />
      ) : src ? (
        // eslint-disable-next-line @next/next/no-img-element -- data: URLs can't go through the optimizer
        <img src={src} alt="" className="absolute inset-0 size-full object-cover transition duration-300 group-hover:scale-[1.03]" />
      ) : null}
      {tile.mediaType === "video" && (
        <span className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-background/80 text-foreground backdrop-blur">
          <PlayIcon className="ml-px size-3.5 fill-current" />
        </span>
      )}
      {tile.rank !== undefined && (
        <span
          className={cn(
            "absolute top-2 left-2 flex h-7 min-w-7 items-center justify-center rounded-full px-2 font-heading text-xs font-extrabold shadow-soft",
            tile.rank === 1 ? "bg-points text-points-foreground" : tile.rank <= 3 ? "bg-card text-foreground" : "bg-background/80 text-foreground backdrop-blur",
          )}
        >
          #{tile.rank}
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/60 to-transparent px-3 pt-8 pb-2.5 text-xs font-bold text-white">
        <span className="inline-flex items-center gap-1">
          <HeartIcon className="size-3.5 fill-current" /> {formatPoints(tile.likeCount)}
        </span>
        <span className="inline-flex items-center gap-1">
          <MessageCircleIcon className="size-3.5" /> {formatPoints(tile.commentCount)}
        </span>
      </span>
    </Link>
  );
}

export function PostsGrid({ tiles, className }: { tiles: GridTile[]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3", className)}>
      {tiles.map((t) => (
        <PostTile key={t.id} tile={t} />
      ))}
    </div>
  );
}

/** A user's posts (GET /api/users/:handle/posts) with infinite scroll. */
export function UserPostsGrid({ handle, isMe, emptyAction }: { handle: string; isMe?: boolean; emptyAction?: React.ReactNode }) {
  const q = useUserPosts(handle);
  if (q.isPending) return <ListSkeleton variant="tile" rows={6} />;
  if (q.isError) return <ErrorState title="Couldn't load posts" error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} />;
  const posts = q.data.pages.flatMap((p) => p.posts);
  if (posts.length === 0) {
    return (
      <EmptyState
        icon={<ImageIcon />}
        title={isMe ? "No posts yet" : "Nothing posted yet"}
        description={isMe ? "Share your first photo or video and earn +5 Paw Points." : `@${handle} hasn't shared anything yet.`}
        action={emptyAction}
      />
    );
  }
  return (
    <>
      <PostsGrid tiles={posts} />
      <LoadMore hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onLoad={() => void q.fetchNextPage()} />
    </>
  );
}
