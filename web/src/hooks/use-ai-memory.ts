"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { aiMemoryService } from "@/services/ai-memory";
import type { AiMemory } from "@/types/ai-memory";

export function useAiMemory() {
  return useQuery({ queryKey: queryKeys.ai.memory, queryFn: aiMemoryService.get });
}

export function useAiMemoryMutations() {
  const qc = useQueryClient();
  const onData = (data: AiMemory) => qc.setQueryData(queryKeys.ai.memory, data);

  const setEnabled = useMutation({ mutationFn: aiMemoryService.setEnabled, onSuccess: onData });
  const setHealthSummary = useMutation({ mutationFn: aiMemoryService.setHealthSummary, onSuccess: onData });
  const updateFact = useMutation({
    mutationFn: ({ id, value }: { id: number; value: string }) => aiMemoryService.updateFact(id, value),
    onSuccess: onData,
  });
  const deleteFact = useMutation({ mutationFn: (id: number) => aiMemoryService.deleteFact(id), onSuccess: onData });
  const clearAll = useMutation({ mutationFn: aiMemoryService.clearAll, onSuccess: onData });

  return { setEnabled, setHealthSummary, updateFact, deleteFact, clearAll };
}
