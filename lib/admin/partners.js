// Admin partner management. api/admin.js (Backend E) dynamically imports this file and calls
// the default export with (req, res, segments) where segments are the parts after /api/admin/partners.
import { query, one, many, withTransaction } from '../db.js';
import { body, badRequest, notFound, conflict } from '../http.js';
import { camelize } from '../serialize.js';
import { PARTNER_RULES, tierById } from '../partner-rules.js';
import { approvePartner, getPartnerById } from '../partners.js';

const STATUSES = ['pending', 'approved', 'suspended', 'rejected'];

function parseId(s) {
  const id = parseInt(s, 10);
  if (!Number.isInteger(id) || id <= 0) throw notFound();
  return id;
}

async function listPartners(req) {
  const status = req.query?.status;
  const params = [];
  let where = '';
  if (status) {
    if (!STATUSES.includes(status)) throw badRequest(`status must be one of ${STATUSES.join(', ')}`);
    params.push(status);
    where = 'WHERE p.status = $1';
  }
  const rows = await many(
    `SELECT p.*, u.email AS owner_email, u.handle AS owner_handle,
            (SELECT COUNT(*)::int FROM partner_attributions pa WHERE pa.partner_id = p.id AND pa.expires_at > now()) AS current_referred,
            (SELECT COALESCE(SUM(amount_cents), 0)::int FROM partner_earnings e WHERE e.partner_id = p.id AND e.status <> 'cancelled' AND NOT (e.status = 'pending' AND e.amount_cents > 0)) AS available_cents,
            (SELECT COALESCE(SUM(amount_cents), 0)::int FROM partner_earnings e WHERE e.partner_id = p.id AND e.status = 'pending' AND e.amount_cents > 0) AS pending_cents
       FROM partners p LEFT JOIN users u ON u.id = p.owner_user_id ${where}
      ORDER BY CASE p.status WHEN 'pending' THEN 0 ELSE 1 END, p.applied_at DESC LIMIT 200`,
    params,
  );
  return { partners: camelize(rows), counts: camelize(await one(`SELECT ${STATUSES.map((s) => `COUNT(*) FILTER (WHERE status = '${s}')::int AS ${s}`).join(', ')} FROM partners`)) };
}

async function patchPartner(req, id, adminId) {
  const partner = await getPartnerById(id);
  if (!partner) throw notFound('Partner not found');
  const b = body(req);
  const sets = [];
  const params = [id];
  const add = (col, val) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  };
  if (b.tier !== undefined) {
    const t = tierById(b.tier);
    if (t.id !== b.tier) throw badRequest(`tier must be one of ${PARTNER_RULES.tiers.map((x) => x.id).join(', ')}`);
    add('tier', t.id);
    add('discount_percent', t.discountPercent);
    if (b.isFeatured === undefined) add('is_featured', t.featured);
  }
  if (b.isFeatured !== undefined) add('is_featured', !!b.isFeatured);
  if (b.notesAdmin !== undefined) add('notes_admin', b.notesAdmin === null ? null : String(b.notesAdmin).slice(0, 5000));
  if (b.status !== undefined) {
    if (!['approved', 'suspended', 'rejected', 'pending'].includes(b.status)) throw badRequest('status must be approved, suspended, rejected or pending');
    if (b.status !== 'approved') add('status', b.status);
  }
  if (sets.length) await query(`UPDATE partners SET ${sets.join(', ')} WHERE id = $1`, params);
  let updated;
  if (b.status === 'approved') {
    updated = await approvePartner(id, adminId);
  } else {
    updated = await getPartnerById(id);
  }
  console.log('[admin:partners] patched', { partnerId: id, adminId, status: b.status, tier: b.tier });
  return { partner: camelize(updated) };
}

async function listPayouts(req) {
  const status = req.query?.status || 'pending';
  const rows = await many(
    `SELECT e.*, p.business_name, p.code, p.email AS partner_email, u.email AS owner_email
       FROM partner_earnings e JOIN partners p ON p.id = e.partner_id LEFT JOIN users u ON u.id = p.owner_user_id
      WHERE e.type = 'payout' AND ($1 = 'all' OR e.status = $1)
      ORDER BY e.created_at ASC LIMIT 200`,
    [status],
  );
  return { payouts: camelize(rows.map((r) => ({ ...r, amount_cents: -r.amount_cents }))) };
}

async function patchPayout(req, id, adminId) {
  const { status, note } = body(req);
  if (!['paid', 'cancelled'].includes(status)) throw badRequest("status must be 'paid' or 'cancelled'");
  const result = await withTransaction(async (t) => {
    const payout = await t.one(`SELECT * FROM partner_earnings WHERE id = $1 AND type = 'payout' FOR UPDATE`, [id]);
    if (!payout) throw notFound('Payout request not found');
    if (payout.status !== 'pending') throw conflict(`Payout is already ${payout.status}`);
    const metadata = { ...payout.metadata, resolvedBy: adminId, resolvedAt: new Date().toISOString(), note: note ? String(note).slice(0, 500) : undefined };
    const updated = await t.one(`UPDATE partner_earnings SET status = $2, metadata = $3 WHERE id = $1 RETURNING *`, [id, status, JSON.stringify(metadata)]);
    let adjustment = null;
    if (status === 'cancelled') {
      // The cancelled payout row no longer counts against the balance; the adjustment row makes
      // the restoration visible in the partner's ledger without changing the total (amount 0).
      adjustment = await t.one(
        `INSERT INTO partner_earnings (partner_id, user_id, type, amount_cents, status, metadata)
         VALUES ($1, $2, 'adjustment', 0, 'available', $3) RETURNING *`,
        [payout.partner_id, payout.user_id, JSON.stringify({ reason: 'payout_cancelled', payoutId: id, restoredCents: -payout.amount_cents, by: adminId })],
      );
    }
    return { payout: updated, adjustment };
  });
  console.log('[admin:partners] payout resolved', { payoutId: id, status, adminId });
  return camelize(result);
}

export default async function adminPartners(req, res, segs = [], ctx = {}) {
  const adminId = ctx.userId ?? ctx.adminId ?? null;
  const method = req.method;
  if (segs.length === 0 && method === 'GET') return listPartners(req);
  if (segs[0] === 'payouts') {
    if (segs.length === 1 && method === 'GET') return listPayouts(req);
    if (segs.length === 2 && method === 'PATCH') return patchPayout(req, parseId(segs[1]), adminId);
    throw notFound();
  }
  if (segs.length === 1) {
    const id = parseId(segs[0]);
    if (method === 'GET') {
      const partner = await getPartnerById(id);
      if (!partner) throw notFound('Partner not found');
      const earnings = await many(`SELECT * FROM partner_earnings WHERE partner_id = $1 ORDER BY created_at DESC LIMIT 50`, [id]);
      return { partner: camelize(partner), earnings: camelize(earnings) };
    }
    if (method === 'PATCH') return patchPartner(req, id, adminId);
  }
  throw notFound();
}
