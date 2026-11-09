import { api } from "@/lib/api";
import type { ChallengeDetailResponse, ChallengesResponse } from "@/types/challenge";

export const challengesService = {
  list: () => api<ChallengesResponse>("/api/challenges"),
  get: (id: number | string, limit = 20) => api<ChallengeDetailResponse>(`/api/challenges/${id}`, { query: { limit } }),
};
