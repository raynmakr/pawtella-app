import { api } from "@/lib/api";
import type {
  CommentsPage,
  CreatePostInput,
  FeedMode,
  FeedPage,
  LikeResponse,
  Post,
  PostComment,
  PostDetailResponse,
  ShareResponse,
  UserPostsPage,
} from "@/types/post";

export const postsService = {
  feed: (mode: FeedMode, opts: { cursor?: string | null; challengeId?: number | string | null; limit?: number } = {}) =>
    api<FeedPage>("/api/posts", {
      query: { mode, cursor: opts.cursor ?? undefined, challengeId: opts.challengeId ?? undefined, limit: opts.limit },
    }),
  get: (id: number | string) => api<PostDetailResponse>(`/api/posts/${id}`),
  create: (input: CreatePostInput) => api<{ post: Post }>("/api/posts", { method: "POST", json: input }),
  remove: (id: number | string) => api<{ ok: true }>(`/api/posts/${id}`, { method: "DELETE" }),
  like: (id: number | string) => api<LikeResponse>(`/api/posts/${id}/like`, { method: "POST" }),
  unlike: (id: number | string) => api<LikeResponse>(`/api/posts/${id}/like`, { method: "DELETE" }),
  comments: (id: number | string, cursor?: string | null) =>
    api<CommentsPage>(`/api/posts/${id}/comments`, { query: { cursor: cursor ?? undefined, limit: 50 } }),
  addComment: (id: number | string, body: string) =>
    api<{ comment: PostComment; commentCount: number }>(`/api/posts/${id}/comments`, { method: "POST", json: { body } }),
  deleteComment: (id: number | string, commentId: number) =>
    api<{ ok: true; commentCount: number }>(`/api/posts/${id}/comments/${commentId}`, { method: "DELETE" }),
  share: (id: number | string, channel?: string) =>
    api<ShareResponse>(`/api/posts/${id}/share`, { method: "POST", json: { channel } }),
  /** GET /api/users/:handle/posts, typed (the shell's usersService.posts returns unknown[]). */
  userPosts: (handle: string, cursor?: number | null) =>
    api<UserPostsPage>(`/api/users/${encodeURIComponent(handle)}/posts`, { query: { cursor: cursor ?? undefined } }),
  /** POST /api/ai/caption */
  suggestCaptions: (input: { imageUrl: string; petName?: string; petId?: number }) =>
    api<{ captions: string[] }>("/api/ai/caption", { method: "POST", json: input }),
};
