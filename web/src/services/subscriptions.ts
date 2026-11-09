"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { Subscription, SubscriptionsResponse } from "@/types/subscription";

type One = { subscription: Subscription };

/** Client for the "My subscriptions" area (api/subscriptions.js). 404s while the feature is off. */
export const subscriptionsService = {
  list: () => api<SubscriptionsResponse>("/api/subscriptions"),
  pause: (id: number) => api<One>(`/api/subscriptions/${id}/pause`, { method: "POST" }),
  resume: (id: number) => api<One>(`/api/subscriptions/${id}/resume`, { method: "POST" }),
  cancel: (id: number) => api<One>(`/api/subscriptions/${id}/cancel`, { method: "POST" }),
  skip: (id: number) => api<One>(`/api/subscriptions/${id}/skip`, { method: "POST" }),
  cadence: (id: number, weeks: number) => api<One>(`/api/subscriptions/${id}/cadence`, { method: "POST", json: { weeks } }),
};

export function useSubscriptions() {
  return useQuery({ queryKey: queryKeys.subscriptions.all, queryFn: subscriptionsService.list });
}

/** One mutation hook covering every contract action; invalidates the list on success. */
export function useSubscriptionAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, weeks }: { id: number; action: "pause" | "resume" | "cancel" | "skip" | "cadence"; weeks?: number }) => {
      if (action === "cadence") return subscriptionsService.cadence(id, weeks!);
      return subscriptionsService[action](id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.subscriptions.all }),
  });
}
