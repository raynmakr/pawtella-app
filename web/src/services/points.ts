import { api } from "@/lib/api";
import type { PointsSummary } from "@/types/points";

/** Minimal client for the Paw Points area; Web C extends this file (transactions, holds, packs). */
export const pointsService = {
  summary: () => api<PointsSummary>("/api/points"),
};
