import { api } from "@/lib/api";
import type { AiMemory } from "@/types/ai-memory";

export const aiMemoryService = {
  get: () => api<AiMemory>("/api/ai/memory"),
  setEnabled: (enabled: boolean) => api<AiMemory>("/api/ai/memory", { method: "PATCH", json: { enabled } }),
  setHealthSummary: (healthSummary: string | null) =>
    api<AiMemory>("/api/ai/memory", { method: "PATCH", json: { healthSummary } }),
  updateFact: (id: number, value: string) =>
    api<AiMemory>(`/api/ai/memory/facts/${id}`, { method: "PATCH", json: { value } }),
  deleteFact: (id: number) => api<AiMemory>(`/api/ai/memory/facts/${id}`, { method: "DELETE" }),
  clearAll: () => api<AiMemory>("/api/ai/memory", { method: "DELETE" }),
};
