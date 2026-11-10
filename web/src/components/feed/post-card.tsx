"use client";

import Link from "next/link";
import { MessageCircleIcon, TrophyIcon } from "lucide-react";
import { PostMedia } from "@/components/post/post-media";
import { LikeButton } from "@/components/post/like-button";
import { ShareButton } from "@/components/post/share-button";
import { PostMenu } from "@/components/post/post-menu";
import { AuthorRow } from "@/components/post/author-row";
import { useToggleLike } from "@/hooks/use-posts";
import { formatPoints } from "@/lib/format";
import type { Post } from "@/types/post";

export function PostCard({ post, priority }: { post: Post; priority?: boolean }) {
  const toggle = useToggleLike();
  const onDoubleLike = () => {
    if (!post.likedByViewer) toggle.mutate(post);
  };
  return (
    <article className="overflow-hidden rounded-card bg-card shadow-soft ring-1 ring-border">
      <div className="px-4 pt-4 pb-3">
        <AuthorRow author={post.author} pet={post.pet} createdAt={post.createdAt} trailing={<PostMenu post={post} />} />
      </div>
      <PostMedia
        src={post.mediaUrl}
        type={post.mediaType}
        poster={post.thumbnailUrl}
        width={post.width}
        height={post.height}
        alt={post.caption ?? `Post by @${post.author.handle}`}
        onDoubleLike={onDoubleLike}
        priority={priority}
        processing={post.mediaType === "video" && post.mediaStatus === "processing"}
      />
      <div className="flex items-center gap-1 px-2 pt-2">
        <LikeButton post={post} />
        <Link
          href={`/post/${post.id}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold text-foreground/80 transition hover:bg-muted active:scale-95"
          aria-label={`${post.commentCount} comments`}
        >
          <MessageCircleIcon className="size-[21px]" />
          <span className="tabular-nums">{formatPoints(post.commentCount)}</span>
        </Link>
        <ShareButton post={post} />
        {post.challenge && (
          <Link
            href={`/challenges/${post.challenge.id}`}
            className="ml-auto inline-flex h-7 max-w-[55%] items-center gap-1 truncate rounded-full bg-accent px-2.5 text-xs font-semibold text-points-foreground dark:text-points"
          >
            <TrophyIcon className="size-3.5 shrink-0" />
            <span className="truncate">{post.challenge.title}</span>
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
  );
}
