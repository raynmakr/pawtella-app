// Daily admin digest: counts for the last 24h, moderation/partner queues, inventory changes,
// top feature-consented posts with suggested captions (Claude, mock ok) and the drained
// enqueueAdmin() rows. buildDigest() is pure read; sendDigest() emails env.adminEmail.
import { many, one } from './db.js';
import { env } from './env.js';
import { pointsToCents } from './points-rules.js';
import * as claude from './claude.js';
import { sendEmail } from './email.js';
import { renderTemplate } from './email-templates.js';
import { listAdminQueue, markAdminQueueSent } from './notifications.js';

const app = (path = '') => `${env.appUrl}${path}`;

async function suggestCaptions(posts) {
  if (!posts.length) return {};
  try {
    const out = await claude.json({
      system:
        'You write short, warm Instagram/TikTok captions for a pet brand called Pawtella. One sentence, at most one emoji, no hashtags, no exclamation marks. Credit the creator with their @handle. Answer with JSON only.',
      prompt: `Write one caption per post:\n${posts
        .map((p) => `- postId ${p.id}: @${p.handle}'s ${p.petName ? `${p.species || 'pet'} ${p.petName}` : 'pet'}, ${p.mediaType}, original caption: ${JSON.stringify(p.caption || '')}`)
        .join('\n')}`,
      schema: {
        type: 'object',
        properties: {
          captions: { type: 'array', items: { type: 'object', properties: { postId: { type: 'integer' }, caption: { type: 'string' } }, required: ['postId', 'caption'] } },
        },
        required: ['captions'],
      },
    });
    const map = {};
    for (const c of out?.captions || []) if (c && c.postId != null && typeof c.caption === 'string') map[c.postId] = c.caption;
    return map;
  } catch (err) {
    console.warn('[digest] caption suggestion failed', { error: err?.message });
    return {};
  }
}

/** Assemble the digest data for the 24h ending at `now`. */
export async function buildDigest({ now = new Date() } = {}) {
  const [counts, points, inventory, topPostsRaw, payouts, adminQueue] = await Promise.all([
    one(
      `SELECT
         (SELECT count(*)::int FROM events WHERE name = 'signup' AND created_at > $1::timestamptz - interval '24 hours') AS signups,
         (SELECT count(*)::int FROM ai_generations WHERE status = 'done' AND COALESCE(finished_at, created_at) > $1::timestamptz - interval '24 hours') AS creations,
         (SELECT count(*)::int FROM posts WHERE created_at > $1::timestamptz - interval '24 hours') AS posts,
         (SELECT count(*)::int FROM shop_orders WHERE placed_at > $1::timestamptz - interval '24 hours' AND status NOT IN ('cancelled', 'refunded')) AS orders,
         (SELECT COALESCE(sum(total_cents), 0)::bigint FROM shop_orders WHERE placed_at > $1::timestamptz - interval '24 hours' AND status NOT IN ('cancelled', 'refunded')) AS revenue_cents,
         (SELECT count(*)::int FROM reports WHERE status = 'open') AS open_reports,
         (SELECT count(*)::int FROM partners WHERE status = 'pending') AS pending_partners`,
      [now],
    ),
    one(
      `SELECT
         COALESCE((SELECT sum(amount) FROM point_transactions WHERE amount > 0 AND type IN ('earn','bonus','purchase','refund','admin') AND created_at > $1::timestamptz - interval '24 hours'), 0)::int AS issued,
         COALESCE((SELECT -sum(amount) FROM point_transactions WHERE amount < 0 AND type IN ('spend','hold','admin') AND created_at > $1::timestamptz - interval '24 hours'), 0)::int AS redeemed,
         COALESCE((SELECT sum(paw_points) FROM users WHERE status <> 'deleted'), 0)::bigint
           + COALESCE((SELECT sum(points) FROM point_holds WHERE status = 'held'), 0)::bigint AS liability`,
      [now],
    ),
    one(
      `SELECT
         (SELECT count(*)::int FROM inventory_items WHERE first_seen_at > $1::timestamptz - interval '24 hours') AS new_skus,
         (SELECT count(*)::int FROM inventory_items WHERE went_out_of_stock_at > $1::timestamptz - interval '24 hours') AS newly_out_of_stock,
         (SELECT COALESCE(json_agg(json_build_object('sku', sku, 'name', name) ORDER BY first_seen_at DESC), '[]'::json)
            FROM (SELECT sku, name, first_seen_at FROM inventory_items WHERE first_seen_at > $1::timestamptz - interval '24 hours' ORDER BY first_seen_at DESC LIMIT 10) s) AS new_sku_list,
         (SELECT COALESCE(json_agg(json_build_object('sku', sku, 'name', name) ORDER BY went_out_of_stock_at DESC), '[]'::json)
            FROM (SELECT sku, name, went_out_of_stock_at FROM inventory_items WHERE went_out_of_stock_at > $1::timestamptz - interval '24 hours' ORDER BY went_out_of_stock_at DESC LIMIT 10) s) AS out_of_stock_list`,
      [now],
    ),
    many(
      `SELECT p.id, p.caption, p.media_url, p.media_type, p.thumbnail_url, p.like_count, p.created_at,
              u.handle, pet.name AS pet_name, pet.species
       FROM posts p JOIN users u ON u.id = p.user_id LEFT JOIN pets pet ON pet.id = p.pet_id
       WHERE p.feature_consent = true AND p.is_hidden = false AND p.visibility = 'public'
         AND p.created_at > $1::timestamptz - interval '7 days'
       ORDER BY p.like_count DESC, p.created_at DESC LIMIT 5`,
      [now],
    ),
    many(
      `SELECT e.id, e.partner_id, p.business_name, e.amount_cents, e.currency, e.metadata, e.created_at
       FROM partner_earnings e JOIN partners p ON p.id = e.partner_id
       WHERE e.type = 'payout' AND e.status = 'pending' ORDER BY e.created_at ASC`,
    ),
    listAdminQueue(),
  ]);

  const posts = topPostsRaw.map((p) => ({
    id: p.id,
    handle: p.handle,
    petName: p.pet_name,
    species: p.species,
    caption: p.caption,
    mediaUrl: p.media_url,
    mediaType: p.media_type,
    thumbnailUrl: p.thumbnail_url,
    likeCount: p.like_count,
    postUrl: app(`/p/${p.id}`),
  }));
  const captions = await suggestCaptions(posts);
  for (const p of posts) p.suggestedCaption = captions[p.id] || p.caption || `${p.petName || 'A good one'} by @${p.handle}`;

  return {
    dateLabel: now.toLocaleDateString('en-CA', { timeZone: env.timezone }),
    generatedAt: now.toISOString(),
    counts: {
      signups: counts.signups,
      creations: counts.creations,
      posts: counts.posts,
      orders: counts.orders,
      revenueCents: Number(counts.revenue_cents),
      openReports: counts.open_reports,
      pendingPartners: counts.pending_partners,
    },
    points: {
      issued: points.issued,
      redeemed: points.redeemed,
      liability: Number(points.liability),
      liabilityCents: pointsToCents(Number(points.liability)),
    },
    inventory: {
      newSkus: inventory.new_skus,
      newlyOutOfStock: inventory.newly_out_of_stock,
      newSkuList: inventory.new_sku_list,
      outOfStockList: inventory.out_of_stock_list,
    },
    topPosts: posts,
    pendingPayouts: payouts.map((p) => ({
      id: p.id,
      partnerId: p.partner_id,
      businessName: p.business_name,
      amountCents: p.amount_cents,
      currency: p.currency,
      method: p.metadata?.method,
      requestedAt: p.created_at,
    })),
    adminQueue,
    links: {
      metrics: app('/api/admin/metrics'),
      reports: app('/api/admin/reports?status=open'),
      partners: app('/api/admin/partners?status=pending'),
      sourcing: app('/api/admin/sourcing'),
      challenges: app('/api/admin/challenges'),
    },
  };
}

/** Build, email to env.adminEmail, and mark the drained admin queue rows sent. */
export async function sendDigest({ now = new Date() } = {}) {
  const digest = await buildDigest({ now });
  const { subject, html, text } = renderTemplate('admin_digest', { digest });
  if (!env.adminEmail) {
    console.warn('[digest] ADMIN_EMAIL not set; digest built but not sent');
    return { sent: false, reason: 'ADMIN_EMAIL not set', digest };
  }
  const result = await sendEmail({ to: env.adminEmail, subject, html, text });
  const drained = await markAdminQueueSent(digest.adminQueue.map((q) => q.id));
  return { sent: true, mock: !!result.mock, to: env.adminEmail, drained, digest };
}

export default { buildDigest, sendDigest };
