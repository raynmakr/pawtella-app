// In-app inbox. Family `/api/notifications/*` (vercel.json rewrite).
//   GET  /api/notifications?page=1&limit=20 → { notifications, unreadCount, total, page, hasMore }
//   POST /api/notifications/read { ids? }    → { updated, unreadCount }
import { route, segments, body, pagination, notFound } from '../lib/http.js';
import { requireAuth } from '../lib/auth.js';
import { listInapp, markRead, unreadCount } from '../lib/notifications.js';

export default route({
  GET: async (req) => {
    const { userId } = await requireAuth(req);
    const seg = segments(req, '/api/notifications');
    if (seg.length === 0) {
      const { page, limit } = pagination(req);
      return listInapp(userId, { page, limit });
    }
    if (seg[0] === 'unread') return { unreadCount: await unreadCount(userId) };
    throw notFound();
  },
  POST: async (req) => {
    const { userId } = await requireAuth(req);
    const seg = segments(req, '/api/notifications');
    if (seg[0] === 'read') {
      const { ids } = body(req);
      const { updated } = await markRead(userId, Array.isArray(ids) ? ids : undefined);
      return { updated, unreadCount: await unreadCount(userId) };
    }
    throw notFound();
  },
});
