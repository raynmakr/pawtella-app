import { api } from "@/lib/api";
import type { BlockedUser, BlockResponse, FollowResponse, ReportInput, ReportResponse } from "@/types/social";

export const socialService = {
  follow: (handle: string) => api<FollowResponse>("/api/follows", { method: "POST", json: { handle } }),
  unfollow: (handle: string) => api<FollowResponse>("/api/follows", { method: "DELETE", json: { handle } }),
  blocks: () => api<{ blocks: BlockedUser[] }>("/api/blocks"),
  block: (handle: string) => api<BlockResponse>("/api/blocks", { method: "POST", json: { handle } }),
  unblock: (handle: string) => api<BlockResponse>(`/api/blocks/${encodeURIComponent(handle)}`, { method: "DELETE" }),
  report: (input: ReportInput) => api<ReportResponse>("/api/reports", { method: "POST", json: input }),
};
