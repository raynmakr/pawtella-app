/** api/follows.js */
export interface FollowResponse {
  following: boolean;
  handle: string;
  counts: { followers: number; following: number; isFollowing: boolean };
}

/** api/blocks.js */
export interface BlockedUser {
  id: number;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  blockedAt: string;
}

export interface BlockResponse {
  blocked: boolean;
  user?: { id: number; handle: string; displayName: string | null; avatarUrl: string | null };
  handle?: string;
}

/** api/reports.js */
export type ReportReason = "spam" | "abuse" | "animal_welfare" | "nudity" | "other";
export type ReportTargetType = "post" | "comment" | "user";

export const REPORT_REASONS: Array<{ value: ReportReason; label: string }> = [
  { value: "spam", label: "Spam or misleading" },
  { value: "abuse", label: "Harassment or abuse" },
  { value: "animal_welfare", label: "Animal welfare concern" },
  { value: "nudity", label: "Nudity or sexual content" },
  { value: "other", label: "Something else" },
];

export interface ReportInput {
  targetType: ReportTargetType;
  targetId: number;
  reason: ReportReason;
  details?: string;
}

export interface ReportResponse {
  ok: true;
  reportId: number;
  duplicate: boolean;
  autoHidden: boolean;
}
