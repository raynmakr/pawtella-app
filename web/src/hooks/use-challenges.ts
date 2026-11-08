"use client";

import { useQuery } from "@tanstack/react-query";
import { challengesService } from "@/services/challenges";
import { queryKeys } from "@/lib/query-keys";

export function useChallenges() {
  return useQuery({
    queryKey: queryKeys.challenges.all,
    queryFn: () => challengesService.list(),
    staleTime: 60_000,
  });
}

export function useChallenge(id: number | string) {
  return useQuery({
    queryKey: queryKeys.challenges.detail(id),
    queryFn: () => challengesService.get(id),
    enabled: !!id,
    staleTime: 30_000,
  });
}
