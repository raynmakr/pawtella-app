"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { aiService } from "@/services/ai";
import { queryKeys } from "@/lib/query-keys";
import { useSession, useSessionStore } from "@/stores/session";
import type { GenerateInput, Generation, GenerationsPage, PresetsResponse } from "@/types/ai";

export const GENERATION_POLL_MS = 2500;

export function isInFlight(g: Generation | undefined | null): boolean {
  return !!g && (g.status === "queued" || g.status === "running");
}

/** GET /api/ai/generate/:id, polling every 2.5 s while queued/running. */
export function useGeneration(id: number | string | null) {
  const { isAuthenticated } = useSession();
  return useQuery<Generation>({
    queryKey: queryKeys.ai.generation(id ?? "none"),
    queryFn: () => aiService.generation(id as number),
    enabled: isAuthenticated && id !== null,
    refetchInterval: (query) => (isInFlight(query.state.data) ? GENERATION_POLL_MS : false),
    refetchIntervalInBackground: true,
  });
}

export function useGenerations(page = 1) {
  const { isAuthenticated } = useSession();
  return useQuery<GenerationsPage>({
    queryKey: [...queryKeys.ai.generations, page],
    queryFn: () => aiService.generations(page),
    enabled: isAuthenticated,
    refetchInterval: (query) => (query.state.data?.generations.some(isInFlight) ? GENERATION_POLL_MS * 2 : false),
  });
}

export function usePresets() {
  return useQuery<PresetsResponse>({
    queryKey: queryKeys.ai.presets,
    queryFn: () => aiService.presets(),
    staleTime: 5 * 60_000,
  });
}

/** POST /api/ai/generate with an optimistic Paw Points decrement; invalidates points + generations. */
export function useCreateGeneration() {
  const qc = useQueryClient();
  const adjustPoints = useSessionStore((s) => s.adjustPoints);
  return useMutation<Generation, unknown, GenerateInput & { expectedCost: number }>({
    mutationFn: ({ expectedCost: _c, ...input }) => {
      void _c;
      return aiService.generate(input);
    },
    onMutate: ({ expectedCost }) => adjustPoints(-expectedCost),
    onError: (_e, { expectedCost }) => adjustPoints(expectedCost),
    onSuccess: (gen) => {
      qc.setQueryData(queryKeys.ai.generation(gen.id), gen);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.points.all });
      void qc.invalidateQueries({ queryKey: queryKeys.ai.generations });
    },
  });
}

/** POST /api/ai/generate/:id/post → feed post. Invalidates points (first-post bonus), posts and the generation. */
export function usePostGeneration(id: number | string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { caption?: string; featureConsent?: boolean; challengeId?: number | null }) =>
      aiService.postGeneration(id, input),
    onSuccess: (res) => {
      qc.setQueryData(queryKeys.ai.generation(id), res.generation);
      void qc.invalidateQueries({ queryKey: queryKeys.points.all });
      void qc.invalidateQueries({ queryKey: queryKeys.posts.all });
      void qc.invalidateQueries({ queryKey: queryKeys.ai.generations });
      void useSessionStore.getState().refresh();
    },
  });
}
