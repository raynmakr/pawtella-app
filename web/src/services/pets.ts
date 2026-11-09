import { api } from "@/lib/api";
import type { CreatePetResponse, Pet, PetInput } from "@/types/pet";

export const petsService = {
  list: () => api<{ pets: Pet[] }>("/api/pets"),
  get: (id: number | string) => api<{ pet: Pet }>(`/api/pets/${id}`),
  create: (input: PetInput) => api<CreatePetResponse>("/api/pets", { method: "POST", json: input }),
  update: (id: number | string, input: Partial<PetInput>) =>
    api<{ pet: Pet }>(`/api/pets/${id}`, { method: "PATCH", json: input }),
  remove: (id: number | string) => api<{ ok: true }>(`/api/pets/${id}`, { method: "DELETE" }),
};
