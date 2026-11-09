"use client";

import { useQuery } from "@tanstack/react-query";
import { partnersService, type PartnerSearch } from "@/services/partners";
import { queryKeys } from "@/lib/query-keys";
import { useSession } from "@/stores/session";
import { isApiError } from "@/lib/api";
import type { PartnerMeResponse } from "@/types/partner";

export function usePartners(params: PartnerSearch) {
  const key: Record<string, string | undefined> = {
    lat: params.lat != null ? String(params.lat) : undefined,
    lng: params.lng != null ? String(params.lng) : undefined,
    type: params.type || undefined,
    q: params.q || undefined,
  };
  return useQuery({
    queryKey: queryKeys.partners.list(key),
    queryFn: () => partnersService.list(params),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

export function usePartner(id: number | string) {
  return useQuery({
    queryKey: queryKeys.partners.detail(id),
    queryFn: () => partnersService.get(id),
    enabled: !!id,
  });
}

/** GET /api/partners/me. `null` data means the user has not applied (API 404). */
export function usePartnerMe() {
  const { isAuthenticated } = useSession();
  return useQuery<PartnerMeResponse | null>({
    queryKey: queryKeys.partners.me,
    queryFn: async () => {
      try {
        return await partnersService.me();
      } catch (err) {
        if (isApiError(err) && err.status === 404) return null;
        throw err;
      }
    },
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
}
