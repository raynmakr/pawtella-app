"use client";

import { HeartIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPoints } from "@/lib/format";
import { useToggleLike } from "@/hooks/use-posts";
import type { Post } from "@/types/post";

export function LikeButton({ post, className, showCount = true }: { post: Pick<Post, "id" | "likedByViewer" | "likeCount">; className?: string; showCount?: boolean }) {
  const toggle = useToggleLike();
  return (
    <button
      type="button"
      aria-pressed={post.likedByViewer}
      aria-label={post.likedByViewer ? "Unlike" : "Like"}
      onClick={() => toggle.mutate(post)}
      className={cn(
        "group inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold transition active:scale-95",
        post.likedByViewer ? "text-primary" : "text-foreground/80 hover:bg-muted",
        className,
      )}
    >
      <HeartIcon
        className={cn("size-[22px] transition-transform group-active:scale-125", post.likedByViewer && "fill-primary animate-in zoom-in-75 duration-200")}
        strokeWidth={post.likedByViewer ? 2.2 : 2}
      />
      {showCount && <span className="tabular-nums">{formatPoints(post.likeCount)}</span>}
    </button>
  );
}
