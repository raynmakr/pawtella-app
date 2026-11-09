import { api } from "@/lib/api";
import type { PrivateUser, UpdateMeInput, UserProfile } from "@/types/user";
import type { PublicPet } from "@/types/pet";

export const usersService = {
  me: () => api<{ user: PrivateUser }>("/api/users/me"),
  updateMe: (input: UpdateMeInput) =>
    api<{ user: PrivateUser; bonusAwarded: boolean }>("/api/users/me", { method: "PATCH", json: input }),
  profile: (handle: string) => api<{ user: UserProfile; pets: PublicPet[] }>(`/api/users/${encodeURIComponent(handle)}`),
  posts: (handle: string, cursor?: number | null) =>
    api<{ posts: unknown[]; nextCursor: number | null }>(`/api/users/${encodeURIComponent(handle)}/posts`, {
      query: { cursor: cursor ?? undefined },
    }),
};
