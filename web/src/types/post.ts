import type { PublicUser } from "./user";
import type { Species } from "./pet";

export type MediaType = "image" | "video";

export interface PostAuthor {
  id: number;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface PostPet {
  id: number;
  name: string;
  species: Species;
}

/** Mirrors lib/posts.js serializePost(). */
export interface Post {
  id: number;
  userId: number;
  petId: number | null;
  generationId: number | null;
  challengeId: number | null;
  caption: string | null;
  mediaUrl: string;
  mediaType: MediaType;
  thumbnailUrl: string | null;
  /** 'processing' while a user-uploaded video is being transcoded; the original plays meanwhile. */
  mediaStatus: "ready" | "processing" | "failed";
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  visibility: "public" | "private";
  featureConsent: boolean;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  isHidden: boolean;
  createdAt: string;
  likedByViewer: boolean;
  author: PostAuthor;
  pet: PostPet | null;
  challenge: { id: number; title: string } | null;
}

/** Mirrors lib/posts.js serializeComment(). */
export interface PostComment {
  id: number;
  postId: number;
  body: string;
  createdAt: string;
  author: PostAuthor;
}

export type FeedMode = "following" | "discover" | "challenge";

export interface FeedPage {
  posts: Post[];
  nextCursor: string | null;
}

export interface CommentsPage {
  comments: PostComment[];
  nextCursor: string | null;
}

/** GET /api/posts/:id */
export interface PostDetailResponse {
  post: Post;
  comments: PostComment[];
  commentsNextCursor: string | null;
}

export interface CreatePostInput {
  mediaUrl: string;
  mediaType: MediaType;
  thumbnailUrl?: string | null;
  /** Videos only: the original object key so the server can transcode it asynchronously. */
  mediaKey?: string | null;
  petId?: number | null;
  generationId?: number | null;
  challengeId?: number | null;
  caption?: string | null;
  featureConsent?: boolean;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
}

export interface LikeResponse {
  liked: boolean;
  likeCount: number;
}

export interface ShareResponse {
  shareUrl: string;
  watermarkedUrl: string;
  shareCount: number;
}

/** GET /api/users/:handle/posts (api/users.js userPosts): lighter shape, `user` instead of `author`. */
export interface UserPost {
  id: number;
  userId: number;
  petId: number | null;
  challengeId: number | null;
  caption: string | null;
  mediaUrl: string;
  mediaType: MediaType;
  thumbnailUrl: string | null;
  mediaStatus: "ready" | "processing" | "failed";
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  createdAt: string;
  user: PublicUser;
  pet: PostPet | null;
}

export interface UserPostsPage {
  posts: UserPost[];
  nextCursor: number | null;
}
