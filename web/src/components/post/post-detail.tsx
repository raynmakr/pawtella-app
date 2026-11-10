"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, MessageCircleIcon, TrophyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/error-state";
import { EmptyState } from "@/components/empty-state";
import { usePost, useToggleLike } from "@/hooks/use-posts";
import { isApiError } from "@/lib/api";
import { formatPoints } from "@/lib/format";
import { AuthorRow } from "./author-row";
import { PostMedia } from "./post-media";
import { LikeButton } from "./like-button";
import { ShareButton } from "./share-button";
import { PostMenu } from "./post-menu";
import { Comments } from "./comments";

function DetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[720px]">
      <div className="overflow-hidden rounded-card bg-card ring-1 ring-border">
        <div className="flex items-center gap-3 p-4">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
        <Skeleton className="aspect-square w-full rounded-none" />
        <div className="space-y-2 p-4">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    </div>
  );
}

export function PostDetail({ id }: { id: string }) {
  const router = useRouter();
  const q = usePost(id);
  const toggle = useToggleLike();

  if (q.isPending) return <DetailSkeleton />;
  if (q.isError) {
    if (isApiError(q.error) && q.error.status === 404) {
      return (
        <EmptyState
          title="This post isn't available"
          description="It may have been removed, or the author's account is private."
          action={
            <Button nativeButton={false} render={<Link href="/home" />}>
              Back to the feed
            </Button>
          }
        />
      );
    }
    return <ErrorState title="Couldn't load this post" error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} />;
  }
  const { post } = q.data;

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={() => (window.history.length > 1 ? router.back() : router.push("/home"))}>
          <ArrowLeftIcon data-icon="inline-start" /> Back
        </Button>
      </div>
      <article className="overflow-hidden rounded-card bg-card shadow-soft ring-1 ring-border">
        <div className="px-4 pt-4 pb-3">
          <AuthorRow author={post.author} pet={post.pet} createdAt={post.createdAt} trailing={<PostMenu post={post} afterDelete={() => router.push("/profile")} />} />
        </div>
        <PostMedia
          src={post.mediaUrl}
          type={post.mediaType}
          poster={post.thumbnailUrl}
          width={post.width}
          height={post.height}
          alt={post.caption ?? `Post by @${post.author.handle}`}
          clampAspect={false}
          priority
          onDoubleLike={() => !post.likedByViewer && toggle.mutate(post)}
          processing={post.mediaType === "video" && post.mediaStatus === "processing"}
        />
        <div className="flex items-center gap-1 px-2 pt-2">
          <LikeButton post={post} />
          <span className="inline-flex h-9 items-center gap-1.5 px-2.5 text-sm font-semibold text-foreground/80">
            <MessageCircleIcon className="size-[21px]" />
            <span className="tabular-nums">{formatPoints(post.commentCount)}</span>
          </span>
          <ShareButton post={post} label={post.shareCount ? formatPoints(post.shareCount) : undefined} />
          {post.challenge && (
            <Link href={`/challenges/${post.challenge.id}`} className="ml-auto inline-flex h-7 items-center gap-1 rounded-full bg-accent px-2.5 text-xs font-semibold text-points-foreground dark:text-points">
              <TrophyIcon className="size-3.5" /> {post.challenge.title}
            </Link>
          )}
        </div>
        {post.caption && (
          <p className="px-4 pt-1.5 pb-4 text-[15px] leading-relaxed">
            <Link href={`/u/${post.author.handle}`} className="mr-1.5 font-bold hover:underline">
              {post.author.handle}
            </Link>
            <span className="whitespace-pre-line">{post.caption}</span>
          </p>
        )}
        {!post.caption && <div className="pb-3" />}
      </article>
      <div className="rounded-card bg-card p-4 shadow-soft ring-1 ring-border sm:p-5">
        <Comments post={post} />
      </div>
    </div>
  );
}
