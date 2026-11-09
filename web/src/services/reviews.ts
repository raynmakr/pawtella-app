import { api } from "@/lib/api";
import type { CreateReviewInput, Review, ReviewsResponse } from "@/types/shop";

export const reviewsService = {
  list: (handle: string, page = 1, limit = 20) => api<ReviewsResponse>("/api/reviews", { query: { handle, page, limit } }),
  create: (input: CreateReviewInput) => api<{ review: Review; pointsAwarded: number }>("/api/reviews", { method: "POST", json: input }),
};
