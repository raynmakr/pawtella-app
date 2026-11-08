// /api/reviews — product reviews. GET ?handle lists; POST creates (auth). A photo review of a
// purchased product earns RULES.reviewBonus once per (user, product).
import { route, segments, body, badRequest, notFound, forbidden, conflict, pagination } from '../lib/http.js';
import { requireAuth } from '../lib/auth.js';
import { one, many, withTransaction } from '../lib/db.js';
import { camelize } from '../lib/serialize.js';
import { track, EVENT } from '../lib/events.js';
import { RULES } from '../lib/points-rules.js';
import { env } from '../lib/env.js';
import * as points from '../lib/points.js';

const BASE = '/api/reviews';

function toApiReview(row) {
  const r = camelize(row);
  return {
    id: r.id,
    productHandle: r.productHandle,
    rating: r.rating,
    body: r.body,
    photoUrl: r.photoUrl,
    pointsAwarded: r.pointsAwarded,
    verifiedPurchase: !!r.orderId,
    createdAt: r.createdAt,
    user: { id: r.userId, handle: r.handle, displayName: r.displayName, avatarUrl: r.avatarUrl },
    pet: r.petName ? { id: r.petId, name: r.petName, species: r.petSpecies, photoUrl: r.petPhotoUrl } : null,
  };
}

async function get(req) {
  const seg = segments(req, BASE);
  if (seg.length) throw notFound();
  const handle = req.query?.handle;
  if (!handle) throw badRequest('handle is required');
  const { limit, offset, page } = pagination(req);
  const rows = await many(
    `SELECT r.*, u.handle, u.display_name, u.avatar_url, p.name AS pet_name, p.species AS pet_species, p.photo_url AS pet_photo_url
       FROM product_reviews r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN pets p ON p.id = r.pet_id
      WHERE r.product_handle = $1 AND r.is_hidden = false
      ORDER BY (r.photo_url IS NOT NULL) DESC, r.created_at DESC
      LIMIT $2 OFFSET $3`,
    [handle, limit, offset],
  );
  const summary = await one(
    `SELECT COUNT(*)::int AS count, COALESCE(AVG(rating), 0)::float AS avg,
            COUNT(*) FILTER (WHERE rating = 5)::int AS r5, COUNT(*) FILTER (WHERE rating = 4)::int AS r4,
            COUNT(*) FILTER (WHERE rating = 3)::int AS r3, COUNT(*) FILTER (WHERE rating = 2)::int AS r2,
            COUNT(*) FILTER (WHERE rating = 1)::int AS r1
       FROM product_reviews WHERE product_handle = $1 AND is_hidden = false`,
    [handle],
  );
  return {
    reviews: rows.map(toApiReview),
    summary: {
      avg: Math.round((summary?.avg || 0) * 10) / 10,
      count: summary?.count || 0,
      histogram: { 5: summary?.r5 || 0, 4: summary?.r4 || 0, 3: summary?.r3 || 0, 2: summary?.r2 || 0, 1: summary?.r1 || 0 },
    },
    page,
    limit,
  };
}

async function post(req) {
  const seg = segments(req, BASE);
  if (seg.length) throw notFound();
  const { userId } = await requireAuth(req);
  const b = body(req);
  const productHandle = String(b.productHandle || b.handle || '').trim();
  if (!productHandle) throw badRequest('productHandle is required');
  const rating = parseInt(b.rating, 10);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw badRequest('rating must be 1–5');
  const text = typeof b.body === 'string' ? b.body.trim().slice(0, 2000) : null;
  // Hosted URLs only in production; the dev mock uploader returns data URLs.
  const photoOk =
    typeof b.photoUrl === 'string' &&
    (/^https?:\/\//.test(b.photoUrl) || (!env.isProd && /^data:image\/(png|jpe?g|webp);base64,/.test(b.photoUrl)));
  const photoUrl = photoOk ? b.photoUrl : null;
  const petId = b.petId != null ? parseInt(b.petId, 10) : null;
  const orderId = b.orderId != null ? parseInt(b.orderId, 10) : null;

  if (petId != null) {
    const pet = await one('SELECT id FROM pets WHERE id = $1 AND user_id = $2', [petId, userId]);
    if (!pet) throw badRequest('Unknown pet');
  }

  let verified = false;
  if (orderId != null) {
    if (!Number.isInteger(orderId)) throw badRequest('Invalid orderId');
    const order = await one('SELECT id, user_id, line_items FROM shop_orders WHERE id = $1', [orderId]);
    if (!order) throw notFound('Order not found');
    if (order.user_id !== userId) throw forbidden('Not your order');
    const items = Array.isArray(order.line_items) ? order.line_items : [];
    const inOrder = items.some((li) => li.handle === productHandle || (li.sku && li.sku === b.sku) || (b.sku && li.sku === b.sku));
    if (!inOrder) throw badRequest('That order does not contain this product');
    verified = true;
  }

  const result = await withTransaction(async (tx) => {
    const dup = await tx.one(
      `SELECT id FROM product_reviews WHERE user_id = $1 AND product_handle = $2 AND order_id IS NOT DISTINCT FROM $3`,
      [userId, productHandle, orderId],
    );
    if (dup) throw conflict('You already reviewed this product for this order');

    const bonusEligible = !!photoUrl && (RULES.reviewBonus || 0) > 0;
    const already = bonusEligible
      ? await tx.one('SELECT 1 FROM product_reviews WHERE user_id = $1 AND product_handle = $2 AND points_awarded > 0', [userId, productHandle])
      : null;
    const pointsAwarded = bonusEligible && !already ? RULES.reviewBonus : 0;

    const row = await tx.one(
      `INSERT INTO product_reviews (user_id, product_handle, order_id, rating, body, photo_url, pet_id, points_awarded)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [userId, productHandle, orderId, rating, text, photoUrl, petId, pointsAwarded],
    );
    if (pointsAwarded > 0) {
      await points.awardPoints(
        userId,
        pointsAwarded,
        { type: 'bonus', source: 'review', refType: 'review', refId: row.id, description: `Photo review of ${productHandle}` },
        tx,
      );
    }
    await track(EVENT.review_created, { userId, props: { reviewId: row.id, productHandle, rating, hasPhoto: !!photoUrl, verified, pointsAwarded } }, tx);
    return { row, pointsAwarded };
  });

  const full = await one(
    `SELECT r.*, u.handle, u.display_name, u.avatar_url, p.name AS pet_name, p.species AS pet_species, p.photo_url AS pet_photo_url
       FROM product_reviews r JOIN users u ON u.id = r.user_id LEFT JOIN pets p ON p.id = r.pet_id WHERE r.id = $1`,
    [result.row.id],
  );
  return { review: toApiReview(full), pointsAwarded: result.pointsAwarded };
}

export default route({ GET: get, POST: post });
