"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { postsService } from "@/services/posts";
import { queryKeys } from "@/lib/query-keys";
import { errorMessage } from "@/lib/api";
import { useSession } from "@/stores/session";
import type { FeedMode, FeedPage, Post } from "@/types/post";

/** Infinite feed; cursor comes straight from the API. */
export function useFeed(mode: FeedMode, challengeId?: number | string | null, enabled = true) {
  return useInfiniteQuery({
    queryKey: queryKeys.posts.feed(mode, challengeId ?? undefined),
    queryFn: ({ pageParam }) => postsService.feed(mode, { cursor: pageParam, challengeId }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: FeedPage) => last.nextCursor ?? undefined,
    enabled,
    staleTime: 30_000,
  });
}

export function usePost(id: number | string) {
  return useQuery({
    queryKey: queryKeys.posts.detail(id),
    queryFn: () => postsService.get(id),
    enabled: !!id,
  });
}

export function useComments(id: number | string, enabled = true) {
  return useInfiniteQuery({
    queryKey: queryKeys.posts.comments(id),
    queryFn: ({ pageParam }) => postsService.comments(id, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!id && enabled,
  });
}

type PostPatch = Partial<Pick<Post, "likeCount" | "likedByViewer" | "commentCount" | "shareCount">>;

/** Recursively patch every cached object that looks like this post (id + mediaUrl). */
function patchDeep(value: unknown, postId: number, patch: PostPatch): unknown {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((v) => {
      const r = patchDeep(v, postId, patch);
      if (r !== v) changed = true;
      return r;
    });
    return changed ? next : value;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (obj.id === postId && typeof obj.mediaUrl === "string" && "likeCount" in obj) {
      return { ...obj, ...patch };
    }
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      const r = patchDeep(v, postId, patch);
      if (r !== v) changed = true;
      next[k] = r;
    }
    return changed ? next : value;
  }
  return value;
}

export function patchPostEverywhere(qc: QueryClient, postId: number, patch: PostPatch) {
  for (const prefix of [queryKeys.posts.all, queryKeys.challenges.all]) {
    for (const [key, data] of qc.getQueriesData({ queryKey: prefix })) {
      if (!data) continue;
      const next = patchDeep(data, postId, patch);
      if (next !== data) qc.setQueryData(key, next);
    }
  }
}

/** Optimistic like toggle. Pass the current post so we know the direction. */
export function useToggleLike() {
  const qc = useQueryClient();
  const { isAuthenticated } = useSession();
  return useMutation({
    mutationFn: async (post: Pick<Post, "id" | "likedByViewer">) =>
      post.likedByViewer ? postsService.unlike(post.id) : postsService.like(post.id),
    onMutate: async (post) => {
      if (!isAuthenticated) throw new Error("Sign in to like posts");
      await qc.cancelQueries({ queryKey: queryKeys.posts.all });
      const snapshot = qc.getQueriesData({ queryKey: queryKeys.posts.all });
      const snapshotCh = qc.getQueriesData({ queryKey: queryKeys.challenges.all });
      const current = findPost(qc, post.id);
      const delta = post.likedByViewer ? -1 : 1;
      patchPostEverywhere(qc, post.id, {
        likedByViewer: !post.likedByViewer,
        likeCount: Math.max(0, (current?.likeCount ?? 0) + delta),
      });
      return { snapshot, snapshotCh };
    },
    onError: (err, _post, ctx) => {
      for (const [key, data] of ctx?.snapshot ?? []) qc.setQueryData(key, data);
      for (const [key, data] of ctx?.snapshotCh ?? []) qc.setQueryData(key, data);
      toast.error(errorMessage(err, "Couldn't update your like"));
    },
    onSuccess: (res, post) => {
      patchPostEverywhere(qc, post.id, { likedByViewer: res.liked, likeCount: res.likeCount });
    },
  });
}

function findPost(qc: QueryClient, postId: number): Post | null {
  let found: Post | null = null;
  const visit = (v: unknown) => {
    if (found) return;
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (o.id === postId && typeof o.mediaUrl === "string" && "likeCount" in o) {
        found = o as unknown as Post;
        return;
      }
      Object.values(o).forEach(visit);
    }
  };
  for (const [, data] of qc.getQueriesData({ queryKey: queryKeys.posts.all })) visit(data);
  return found;
}

export function useSharePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, channel }: { id: number; channel?: string }) => postsService.share(id, channel),
    onSuccess: (res, { id }) => patchPostEverywhere(qc, id, { shareCount: res.shareCount }),
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => postsService.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.posts.all });
      void qc.invalidateQueries({ queryKey: ["users"] });
      void qc.invalidateQueries({ queryKey: queryKeys.challenges.all });
    },
  });
}

export function useAddComment(postId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => postsService.addComment(postId, body),
    onSuccess: (res) => {
      patchPostEverywhere(qc, postId, { commentCount: res.commentCount });
      void qc.invalidateQueries({ queryKey: queryKeys.posts.comments(postId) });
      void qc.invalidateQueries({ queryKey: queryKeys.posts.detail(postId) });
    },
    onError: (err) => toast.error(errorMessage(err, "Couldn't post your comment")),
  });
}

export function useDeleteComment(postId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: number) => postsService.deleteComment(postId, commentId),
    onSuccess: (res) => {
      patchPostEverywhere(qc, postId, { commentCount: res.commentCount });
      void qc.invalidateQueries({ queryKey: queryKeys.posts.comments(postId) });
      void qc.invalidateQueries({ queryKey: queryKeys.posts.detail(postId) });
    },
    onError: (err) => toast.error(errorMessage(err, "Couldn't delete the comment")),
  });
}

export function useUserPosts(handle: string | null | undefined) {
  return useInfiniteQuery({
    queryKey: queryKeys.users.posts(handle ?? ""),
    queryFn: ({ pageParam }) => postsService.userPosts(handle!, pageParam),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!handle,
  });
}
