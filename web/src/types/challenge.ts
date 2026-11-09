import type { Post } from "./post";

export type ChallengeStatus = "scheduled" | "active" | "closed";

/** Mirrors lib/challenges.js serializeChallenge(). */
export interface Challenge {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  presetId: string | null;
  coverUrl: string | null;
  rewardPoints: number;
  runnerUpPoints: number;
  startsAt: string;
  endsAt: string;
  status: ChallengeStatus;
  winnerPostId: number | null;
  entryCount?: number;
  createdAt: string;
}

export interface LeaderboardEntry extends Post {
  rank: number;
}

export interface ChallengeWithTop extends Challenge {
  topEntries: LeaderboardEntry[];
}

/** GET /api/challenges */
export interface ChallengesResponse {
  active: ChallengeWithTop[];
  upcoming: ChallengeWithTop[];
  recent: ChallengeWithTop[];
}

/** GET /api/challenges/:id */
export interface ChallengeDetailResponse {
  challenge: Challenge;
  leaderboard: LeaderboardEntry[];
}
