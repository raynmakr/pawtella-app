"use client";

import { useQuery } from "@tanstack/react-query";
import { pointsService } from "@/services/points";
import { queryKeys } from "@/lib/query-keys";
import { useSession } from "@/stores/session";

/** Paw Points balance: GET /api/points, falling back to the session snapshot while loading/unavailable. */
export function usePointsBalance() {
  const { user, isAuthenticated } = useSession();
  const q = useQuery({
    queryKey: queryKeys.points.summary,
    queryFn: () => pointsService.summary(),
    enabled: isAuthenticated,
    staleTime: 15_000,
  });
  const balance = q.data?.balance ?? user?.pawPoints ?? 0;
  return { balance, isLoading: q.isLoading && !user, query: q };
}
