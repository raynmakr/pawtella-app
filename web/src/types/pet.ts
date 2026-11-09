export type Species = "dog" | "cat";
export type PetSex = "male" | "female" | "unknown";

/** Mirrors api/pets.js toApiPet(). */
export interface Pet {
  id: number;
  userId: number;
  name: string;
  species: Species;
  breed: string | null;
  sex: PetSex | null;
  birthday: string | null; // YYYY-MM-DD
  weightKg: number | null;
  photoUrl: string | null;
  notes: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt?: string;
}

/** Public view used on other people's profiles. */
export type PublicPet = Pick<Pet, "id" | "name" | "species" | "breed" | "sex" | "birthday" | "photoUrl" | "isPrimary">;

export interface PetInput {
  name: string;
  species: Species;
  breed?: string | null;
  sex?: PetSex | null;
  birthday?: string | null;
  weightKg?: number | null;
  photoUrl?: string | null;
  notes?: string | null;
  isPrimary?: boolean;
}

export interface CreatePetResponse {
  pet: Pet;
  isFirst: boolean;
  bonusAwarded: boolean;
}
