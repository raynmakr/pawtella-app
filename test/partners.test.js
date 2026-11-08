import '../scripts/load-env.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { query, one, closePool } from '../lib/db.js';
import { PARTNER_RULES, tierFor, nextTier, commissionFor } from '../lib/partner-rules.js';
import * as partners from '../lib/partners.js';

const suffix = () => Math.random().toString(36).slice(2, 9);

async function makeUser(extra = {}) {
  const s = suffix();
  const row = await one(
    `INSERT INTO users (email, handle, display_name, created_at) VALUES ($1, $2, $3, $4) RETURNING *`,
    [`pt-${s}@example.com`, `pt_${s}`, 'Partner Test', extra.createdAt ?? new Date()],
  );
  return row;
}

after(() => closePool());

test('partner-rules helpers (pure)', () => {
  assert.equal(tierFor(0).id, 'bronze');
  assert.equal(tierFor(9).id, 'bronze');
  assert.equal(tierFor(10).id, 'silver');
  assert.equal(tierFor(50).id, 'gold');
  assert.equal(nextTier('bronze').id, 'silver');
  assert.equal(nextTier('gold'), null);
  assert.equal(commissionFor(8000), 800);
  assert.equal(commissionFor(1999), 199);
  assert.equal(PARTNER_RULES.redeemPointsCentsPerPoint, 4);
});

test('apply → approve → attribution → commission → mature → redeem → tier recompute', async () => {
  const owner = await makeUser();
  const name = `Happy Paws ${suffix()}`;
  const applied = await partners.applyPartner(owner.id, {
    businessName: name,
    type: 'groomer',
    email: `biz-${suffix()}@example.com`,
    city: 'Toronto',
    lat: 43.65,
    lng: -79.38,
    services: ['Nail trim', 'Full groom'],
  });
  assert.equal(applied.status, 'pending');
  assert.match(applied.code, /^HAPPYPAWS[A-Z0-9]?\d{2,3}$/);
  await assert.rejects(partners.applyPartner(owner.id, { businessName: 'Again', type: 'vet' }), /already have/);

  // Pending partners cannot attribute customers.
  const early = await makeUser();
  await assert.rejects(partners.attributeUser(early.id, applied.id, 'signup'), /not active/);

  const approved = await partners.approvePartner(applied.id, null);
  assert.equal(approved.status, 'approved');
  assert.ok(approved.approved_at);
  assert.equal(approved.discount_code, `PARTNER-${applied.code}`);
  assert.equal(approved.discount_percent, 10);
  assert.ok(approved.shopify_discount_id);
  const approvedNotif = await one(`SELECT * FROM notifications WHERE dedupe_key = $1`, [`partner_approved:partner:${applied.id}`]);
  assert.ok(approvedNotif, 'partner_approved email queued');
  assert.match(approvedNotif.payload.posterUrl, /\/api\/partners\/me\/poster$/);

  // Attribution on signup awards +10 PP exactly once.
  const customer = await makeUser();
  const found = await partners.findPartnerByCode(applied.code.toLowerCase());
  assert.equal(found.id, applied.id);
  const attr = await partners.attributeUser(customer.id, applied.id, 'signup');
  assert.equal(attr.partner_id, applied.id);
  assert.equal(attr.bonus_awarded, true);
  const again = await partners.attributeUser(customer.id, applied.id, 'qr_scan');
  assert.equal(again.id, attr.id);
  const cust = await one('SELECT paw_points, signup_source FROM users WHERE id = $1', [customer.id]);
  assert.equal(cust.paw_points, PARTNER_RULES.referredCustomerBonus);
  assert.equal(cust.signup_source, 'partner');
  const ptx = await query(`SELECT * FROM point_transactions WHERE user_id = $1`, [customer.id]);
  assert.equal(ptx.rowCount, 1);
  const active = await partners.getActiveAttribution(customer.id);
  assert.equal(active.id, attr.id);
  const p1 = await one('SELECT total_referred FROM partners WHERE id = $1', [applied.id]);
  assert.equal(p1.total_referred, 1);

  // A second partner cannot claim an attributed customer via code entry.
  const owner2 = await makeUser();
  const second = await partners.applyPartner(owner2.id, { businessName: `Other Vet ${suffix()}`, type: 'vet', lat: 43.7, lng: -79.4 });
  await partners.approvePartner(second.id, null);
  await assert.rejects(partners.attributeByCode(customer.id, second.code, 'qr_scan'), (err) => err.status === 409);
  const same = await partners.attributeByCode(customer.id, applied.code, 'qr_scan');
  assert.equal(same.alreadyAttributed, true);

  // Paid order → pending commission.
  const order = await one(
    `INSERT INTO shop_orders (user_id, shopify_order_id, order_number, subtotal_cents, total_cents, financial_status, placed_at)
     VALUES ($1, $2, '#1001', 8000, 9040, 'paid', now()) RETURNING *`,
    [customer.id, `gid://shopify/Order/test-${suffix()}`],
  );
  const earning = await partners.accrueCommission(order);
  assert.ok(earning);
  assert.equal(earning.type, 'commission');
  assert.equal(earning.status, 'pending');
  assert.equal(earning.amount_cents, 800);
  const dup = await partners.accrueCommission(order);
  assert.equal(dup.id, earning.id, 'idempotent per order');
  const o = await one('SELECT partner_id FROM shop_orders WHERE id = $1', [order.id]);
  assert.equal(o.partner_id, applied.id);
  const unattributed = await makeUser();
  assert.equal(await partners.accrueCommission({ user_id: unattributed.id, subtotal_cents: 5000 }), null);

  // Not available yet; mature after backdating.
  assert.equal(await partners.getAvailableBalance(applied.id), 0);
  await assert.rejects(partners.redeemEarnings(applied.id, { type: 'points', amountCents: 400 }), (err) => err.status === 402);
  await query(`UPDATE partner_earnings SET available_at = now() - interval '1 day' WHERE id = $1`, [earning.id]);
  const matured = await partners.matureEarnings();
  assert.ok(matured >= 1);
  assert.equal(await partners.getAvailableBalance(applied.id), 800);

  // Redeem $4.00 → 100 PP for the owner.
  const ownerBefore = await one('SELECT paw_points FROM users WHERE id = $1', [owner.id]);
  const redeemed = await partners.redeemEarnings(applied.id, { type: 'points', amountCents: 400 });
  assert.equal(redeemed.points, 100);
  const ownerAfter = await one('SELECT paw_points FROM users WHERE id = $1', [owner.id]);
  assert.equal(ownerAfter.paw_points - ownerBefore.paw_points, 100);
  assert.equal(await partners.getAvailableBalance(applied.id), 400);

  // Gift card redemption and payout validation.
  const gc = await partners.redeemEarnings(applied.id, { type: 'gift_card', amountCents: 100 });
  assert.ok(gc.giftCard.code);
  assert.equal(await partners.getAvailableBalance(applied.id), 300);
  await assert.rejects(partners.requestPayout(applied.id, { amountCents: 300, method: 'etransfer' }), /Minimum payout/);

  // Dashboard.
  const dash = await partners.getDashboard(applied.id);
  assert.equal(dash.code, applied.code);
  assert.equal(dash.tier.id, 'bronze');
  assert.equal(dash.tier.next.id, 'silver');
  assert.equal(dash.earnings.availableCents, 300);
  assert.equal(dash.earnings.lifetimeCents, 800);
  assert.equal(dash.referred.total, 1);
  assert.equal(dash.referred.recent[0].handle, customer.handle);
  assert.match(dash.links.referral, new RegExp(`/r/${applied.code}$`));
  assert.equal(dash.partner.notesAdmin, undefined);

  // Tier recompute: 10 active referred customers with recent events → silver, 15%, new code.
  for (let i = 0; i < 9; i++) {
    const u = await makeUser();
    await partners.attributeUser(u.id, applied.id, 'qr_scan');
    await query(`INSERT INTO events (user_id, name) VALUES ($1, 'app_open')`, [u.id]);
  }
  await query(`INSERT INTO events (user_id, name) VALUES ($1, 'app_open')`, [customer.id]);
  const oldDiscountId = approved.shopify_discount_id;
  const changed = await partners.recomputeTiers();
  assert.ok(changed >= 1);
  const silver = await one('SELECT * FROM partners WHERE id = $1', [applied.id]);
  assert.equal(silver.tier, 'silver');
  assert.equal(silver.active_referred_90d, 10);
  assert.equal(silver.discount_percent, 15);
  assert.equal(silver.is_featured, true);
  assert.notEqual(silver.shopify_discount_id, oldDiscountId);
  const tierUp = await one(`SELECT * FROM notifications WHERE dedupe_key = $1`, [`partner_tier_up:partner:${applied.id}:silver`]);
  assert.ok(tierUp);

  // Running again is stable.
  await partners.recomputeTiers();
  const still = await one('SELECT tier, shopify_discount_id FROM partners WHERE id = $1', [applied.id]);
  assert.equal(still.tier, 'silver');
  assert.equal(still.shopify_discount_id, silver.shopify_discount_id);

  // Reviews update the aggregate.
  const reviewer = await makeUser();
  const rv = await partners.addReview(applied.id, reviewer.id, { rating: 5, body: 'Great groom' });
  assert.equal(rv.ratingCount, 1);
  const pub = await partners.getPartnerPublic(applied.id);
  assert.equal(pub.reviews.count, 1);
  assert.equal(pub.shopifyCustomerId, undefined);
  assert.equal(pub.notesAdmin, undefined);
  assert.equal(pub.ownerUserId, undefined);
});

test('searchPartners orders featured first, then by distance', async () => {
  const tag = suffix();
  const mk = async (name, lat, lng, featured) => {
    const u = await makeUser();
    const p = await partners.applyPartner(u.id, { businessName: `${name} ${tag}`, type: 'walker', lat, lng, city: `City${tag}` });
    await partners.approvePartner(p.id, null);
    if (featured) await query('UPDATE partners SET is_featured = true WHERE id = $1', [p.id]);
    return p;
  };
  // Origin 43.65,-79.38 (Toronto). near ≈ 1 km, far ≈ 11 km, featured ≈ 22 km.
  const near = await mk('Near Walks', 43.66, -79.38, false);
  const far = await mk('Far Walks', 43.75, -79.38, false);
  const featured = await mk('Featured Walks', 43.85, -79.38, true);
  const results = await partners.searchPartners({ lat: 43.65, lng: -79.38, type: 'walker', q: tag });
  assert.deepEqual(
    results.map((r) => r.id),
    [featured.id, near.id, far.id],
  );
  assert.ok(results[1].distanceKm < results[2].distanceKm);
  assert.ok(Math.abs(results[1].distanceKm - 1.1) < 0.3);
  for (const r of results) {
    assert.equal(r.notesAdmin, undefined);
    assert.equal(r.email, undefined);
  }
  const byName = await partners.searchPartners({ q: `Near Walks ${tag}` });
  assert.equal(byName.length, 1);
  assert.equal(byName[0].distanceKm, null);
});
