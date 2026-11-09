"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2Icon, SendHorizontalIcon, Trash2Icon } from "lucide-react";
import { UserAvatar } from "@/components/avatars";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/error-state";
import { LoadMore } from "@/components/load-more";
import { useAddComment, useComments, useDeleteComment } from "@/hooks/use-posts";
import { useSession } from "@/stores/session";
import { timeAgo } from "@/lib/format";
import type { Post, PostComment } from "@/types/post";

function CommentRow({ c, canDelete, onDelete, deleting }: { c: PostComment; canDelete: boolean; onDelete: () => void; deleting: boolean }) {
  const name = c.author.displayName ?? c.author.handle;
  return (
    <li className="group flex items-start gap-3">
      <Link href={`/u/${c.author.handle}`} className="mt-0.5 shrink-0">
        <UserAvatar src={c.author.avatarUrl} name={name} size="sm" />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-snug">
          <Link href={`/u/${c.author.handle}`} className="mr-1.5 font-bold hover:underline">
            {c.author.handle}
          </Link>
          <span className="whitespace-pre-line break-words">{c.body}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{timeAgo(c.createdAt)}</p>
      </div>
      {canDelete && (
        <Button variant="ghost" size="icon-sm" aria-label="Delete comment" className="text-muted-foreground opacity-70 group-hover:opacity-100" onClick={onDelete} disabled={deleting}>
          {deleting ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
        </Button>
      )}
    </li>
  );
}

export function Comments({ post }: { post: Post }) {
  const { user } = useSession();
  const q = useComments(post.id);
  const add = useAddComment(post.id);
  const del = useDeleteComment(post.id);
  const [text, setText] = useState("");
  const comments = q.data?.pages.flatMap((p) => p.comments) ?? [];

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body) return;
    await add.mutateAsync(body);
    setText("");
  };

  return (
    <section aria-label="Comments" className="flex flex-col gap-4">
      <h2 className="text-lg">
        Comments <span className="text-muted-foreground">({post.commentCount})</span>
      </h2>
      {q.isPending ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/5" />
              </div>
            </div>
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState title="Couldn't load comments" error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} className="py-8" />
      ) : comments.length === 0 ? (
        <p className="rounded-2xl bg-muted/60 px-4 py-5 text-center text-sm text-muted-foreground">No comments yet. Say something nice.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-4">
            {comments.map((c) => (
              <CommentRow
                key={c.id}
                c={c}
                canDelete={!!user && (user.id === c.author.id || user.id === post.userId || user.role === "admin")}
                onDelete={() => del.mutate(c.id)}
                deleting={del.isPending && del.variables === c.id}
              />
            ))}
          </ul>
          <LoadMore hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onLoad={() => void q.fetchNextPage()} />
        </>
      )}
      <form onSubmit={submit} className="flex items-end gap-2 rounded-2xl bg-muted/50 p-2 ring-1 ring-border">
        <UserAvatar src={user?.avatarUrl} name={user?.displayName ?? user?.handle} size="sm" className="mb-1.5 ml-1 hidden sm:inline-flex" />
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="Add a comment"
          maxLength={1000}
          rows={1}
          aria-label="Add a comment"
          className="min-h-10 flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        <Button type="submit" size="icon" aria-label="Post comment" disabled={!text.trim() || add.isPending}>
          {add.isPending ? <Loader2Icon className="animate-spin" /> : <SendHorizontalIcon />}
        </Button>
      </form>
    </section>
  );
}
