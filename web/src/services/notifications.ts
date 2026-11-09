import { api } from "@/lib/api";
import type { MarkReadResponse, NotificationsPage } from "@/types/notification";

export const notificationsService = {
  list: (page = 1, limit = 20) => api<NotificationsPage>("/api/notifications", { query: { page, limit } }),
  unread: () => api<{ unreadCount: number }>("/api/notifications/unread"),
  /** Omit `ids` to mark everything read. */
  markRead: (ids?: number[]) => api<MarkReadResponse>("/api/notifications/read", { method: "POST", json: { ids } }),
};
