export type NotificationJourney = string;

/** Mirrors lib/notifications.js listInapp(). */
export interface AppNotification {
  id: number;
  journey: NotificationJourney;
  title: string;
  body: string | null;
  payload: Record<string, unknown> | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsPage {
  notifications: AppNotification[];
  unreadCount: number;
  total: number;
  page: number;
  hasMore: boolean;
}

export interface MarkReadResponse {
  updated: number;
  unreadCount: number;
}
