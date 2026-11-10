export type MemoryCategory = "owner" | "pet" | "health" | "vendor";

export interface MemoryFact {
  id: number;
  petId: number | null;
  category: MemoryCategory;
  factKey: string;
  factValue: string;
  sourceConversationId: number | null;
  updatedAt: string | null;
}

export interface AiMemory {
  enabled: boolean;
  healthSummary: string | null;
  updatedAt: string | null;
  facts: MemoryFact[];
}
