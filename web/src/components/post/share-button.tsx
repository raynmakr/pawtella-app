"use client";

import { SendIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { shareUrl, appUrl } from "@/lib/share";
import { useSharePost } from "@/hooks/use-posts";
import { errorMessage } from "@/lib/api";
import { toast } from "sonner";
import type { Post } from "@/types/post";

export function ShareButton({ post, className, label }: { post: Pick<Post, "id" | "caption" | "author" | "shareCount">; className?: string; label?: string }) {
  const share = useSharePost();
  const onShare = async () => {
    let url = appUrl(`/p/${post.id}`);
    try {
      const res = await share.mutateAsync({ id: post.id, channel: typeof navigator !== "undefined" && "share" in navigator ? "web_share" : "copy_link" });
      url = res.shareUrl || url;
    } catch (err) {
      // Still let the user share the plain link.
      toast.error(errorMessage(err, "Couldn't register the share"));
    }
    await shareUrl({
      title: `${post.author.displayName ?? `@${post.author.handle}`} on Pawtella`,
      text: post.caption ?? "Look at this on Pawtella",
      url,
    });
  };
  return (
    <button
      type="button"
      aria-label="Share"
      onClick={onShare}
      disabled={share.isPending}
      className={cn("inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold text-foreground/80 transition hover:bg-muted active:scale-95 disabled:opacity-60", className)}
    >
      <SendIcon className="size-[21px]" />
      {label && <span>{label}</span>}
    </button>
  );
}
