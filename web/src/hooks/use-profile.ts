"use client";

import { useQuery } from "@tanstack/react-query";
import { usersService } from "@/services/users";
import { petsService } from "@/services/pets";
import { queryKeys } from "@/lib/query-keys";

export function useProfile(handle: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.users.profile(handle ?? ""),
    queryFn: () => usersService.profile(handle!),
    enabled: !!handle,
    staleTime: 30_000,
  });
}

export function usePet(id: number | string) {
  return useQuery({
    queryKey: queryKeys.pets.detail(id),
    queryFn: () => petsService.get(id),
    enabled: !!id,
  });
}
