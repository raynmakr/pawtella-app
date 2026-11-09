import { api } from "@/lib/api";
import type { PacksResponse, PointsSummary, TransactionsPage } from "@/types/points";

/** Client for the Paw Points area (api/points.js). */
export const pointsService = {
  summary: () => api<PointsSummary>("/api/points"),
  transactions: (page = 1, limit = 20) => api<TransactionsPage>("/api/points/transactions", { query: { page, limit } }),
  packs: () => api<PacksResponse>("/api/points/packs"),
};
