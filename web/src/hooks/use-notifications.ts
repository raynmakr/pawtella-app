"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationsService } from "@/services/notifications";
import { queryKeys } from "@/lib/query-keys";
import { useSession } from "@/stores/session";
import type { NotificationsPage } from "@/types/notification";

export function useNotifications(page = 1) {
  const { isAuthenticated } = useSession();
  return useQuery({
    queryKey: queryKeys.notifications.list(page),
    queryFn: () => notificationsService.list(page),
    enabled: isAuthenticated,
  });
}

/** Lightweight unread badge; piggybacks on the first inbox page when it is cached. */
export function useUnreadCount() {
  const { isAuthenticated } = useSession();
  const q = useQuery({
    queryKey: queryKeys.notifications.unread,
    queryFn: async () => (await notificationsService.list(1, 1)).unreadCount,
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });
  return q.data ?? 0;
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids?: number[]) => notificationsService.markRead(ids),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: queryKeys.notifications.all });
      const pages = qc.getQueriesData<NotificationsPage>({ queryKey: [...queryKeys.notifications.all, "list"] });
      for (const [key, data] of pages) {
        if (!data) continue;
        qc.setQueryData<NotificationsPage>(key, {
          ...data,
          notifications: data.notifications.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)),
          unreadCount: ids ? Math.max(0, data.unreadCount - ids.length) : 0,
        });
      }
      qc.setQueryData<number>(queryKeys.notifications.unread, (prev) =>
        ids ? Math.max(0, (prev ?? 0) - ids.length) : 0,
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  });
}
