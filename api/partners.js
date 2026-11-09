// Partner program routes: /api/partners/* (directory, apply, dashboard, QR, poster, redeem,
// payout, attribution, reviews). vercel.json rewrites /api/partners/:path* here.
import QRCode from 'qrcode';
import { route, segments, body, badRequest, notFound, forbidden, escapeHtml } from '../lib/http.js';
import { requireAuth } from '../lib/auth.js';
import { env } from '../lib/env.js';
import { camelize } from '../lib/serialize.js';
import { PARTNER_RULES, tierById } from '../lib/partner-rules.js';
import * as partners from '../lib/partners.js';

async function requirePartner(req) {
  const { userId } = await requireAuth(req);
  const partner = await partners.getPartnerByOwner(userId);
  if (!partner) throw notFound('You have not applied to the partner program yet');
  return { userId, partner };
}

async function requireApprovedPartner(req) {
  const ctx = await requirePartner(req);
  if (ctx.partner.status !== 'approved') throw forbidden(`Your partner application is ${ctx.partner.status}`);
  return ctx;
}

function parseId(s) {
  const id = parseInt(s, 10);
  if (!Number.isInteger(id) || id <= 0) throw notFound();
  return id;
}

export default route({
  GET: async (req, res) => {
    const seg = segments(req, '/api/partners');

    if (seg.length === 0) {
      const { lat, lng, type, q, limit } = req.query || {};
      const list = await partners.searchPartners({ lat, lng, type, q, limit });
      return { partners: list, types: PARTNER_RULES.partnerTypes };
    }

    if (seg[0] === 'me') {
      if (seg.length === 1) {
        const { partner } = await requirePartner(req);
        if (partner.status !== 'approved') {
          return { partner: partners.toOwnerPartner(partner), status: partner.status, rules: { tiers: PARTNER_RULES.tiers } };
        }
        return partners.getDashboard(partner.id);
      }
      if (seg[1] === 'qr' && seg.length === 2) {
        const { partner } = await requireApprovedPartner(req);
        const png = await QRCode.toBuffer(partners.partnerLinks(partner).referral, { type: 'png', width: 512, margin: 2, errorCorrectionLevel: 'M' });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Disposition', `inline; filename="pawtella-${partner.code}.png"`);
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.end(png);
        return;
      }
      if (seg[1] === 'poster' && seg.length === 2) {
        const { partner } = await requireApprovedPartner(req);
        const markup = await renderPoster(partner);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'private, no-store');
        res.end(markup);
        return;
      }
      throw notFound();
    }

    if (seg.length === 1) {
      const partner = await partners.getPartnerPublic(parseId(seg[0]));
      if (!partner) throw notFound('Partner not found');
      return { partner };
    }
    throw notFound();
  },

  POST: async (req, res) => {
    const seg = segments(req, '/api/partners');

    if (seg[0] === 'apply' && seg.length === 1) {
      const { userId } = await requireAuth(req);
      const partner = await partners.applyPartner(userId, body(req));
      res.status(201).json({ partner: partners.toOwnerPartner(partner) });
      return;
    }

    if (seg[0] === 'attribute' && seg.length === 1) {
      const { userId } = await requireAuth(req);
      const { code } = body(req);
      if (!code || typeof code !== 'string') throw badRequest('code is required');
      const { attribution, partner, alreadyAttributed } = await partners.attributeByCode(userId, code, 'qr_scan');
      return {
        attribution: camelize(attribution),
        partner: partners.toPublicPartner(partner),
        alreadyAttributed,
        bonusPoints: alreadyAttributed ? 0 : PARTNER_RULES.referredCustomerBonus,
      };
    }

    if (seg[0] === 'me' && seg[1] === 'redeem' && seg.length === 2) {
      const { partner } = await requireApprovedPartner(req);
      const { type, amountCents } = body(req);
      const result = await partners.redeemEarnings(partner.id, { type, amountCents });
      return camelize(result);
    }

    if (seg[0] === 'me' && seg[1] === 'payout' && seg.length === 2) {
      const { partner } = await requireApprovedPartner(req);
      const { amountCents, method, details } = body(req);
      const earning = await partners.requestPayout(partner.id, { amountCents, method, details });
      res.status(201).json({ payout: camelize(earning) });
      return;
    }

    if (seg.length === 2 && seg[1] === 'reviews') {
      const { userId } = await requireAuth(req);
      const result = await partners.addReview(parseId(seg[0]), userId, body(req));
      res.status(201).json(result);
      return;
    }
    throw notFound();
  },
});

// ---------------------------------------------------------------------------------------------
// Printable poster (letter size)
// ---------------------------------------------------------------------------------------------

async function renderPoster(partner) {
  const links = partners.partnerLinks(partner);
  const qrDataUrl = await QRCode.toDataURL(links.referral, { width: 900, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1f1a17', light: '#ffffff' } });
  const tier = tierById(partner.tier);
  const tierLabel = tier.id[0].toUpperCase() + tier.id.slice(1);
  const name = escapeHtml(partner.business_name);
  const logo = partner.logo_url ? `<img class="logo" src="${escapeHtml(partner.logo_url)}" alt="">` : '';
  const bonus = PARTNER_RULES.referredCustomerBonus;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pawtella poster – ${name}</title>
<style>
  @page { size: letter; margin: 0.5in; }
  :root { --bg:#fff8f1; --ink:#1f1a17; --muted:#6b625c; --coral:#ff6b57; --amber:#f5b041; --card:#ffffff; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; background:#e9e4df; color:var(--ink); font-family: -apple-system, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif; }
  .page { width:8.5in; min-height:11in; margin:16px auto; background:var(--bg); padding:0.6in 0.6in 0.5in; display:flex; flex-direction:column; align-items:center; text-align:center; position:relative; }
  .brand { display:flex; align-items:center; gap:10px; font-weight:800; letter-spacing:0.02em; font-size:22px; color:var(--coral); }
  .brand .paw { width:32px; height:32px; }
  .badge { position:absolute; top:0.55in; right:0.6in; background:var(--ink); color:#fff; font-size:12px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; padding:6px 12px; border-radius:999px; }
  .badge.gold { background:var(--amber); color:var(--ink); } .badge.silver { background:#c9ced6; color:var(--ink); } .badge.bronze { background:#c8835a; color:#fff; }
  h1 { font-size:40px; line-height:1.1; margin:0.35in 0 8px; letter-spacing:-0.02em; }
  h1 span { color:var(--coral); }
  .sub { font-size:18px; color:var(--muted); margin:0 0 0.35in; max-width:6.4in; }
  .qr { background:var(--card); padding:22px; border-radius:28px; box-shadow:0 10px 30px rgba(31,26,23,.08); }
  .qr img { width:4.3in; height:4.3in; display:block; }
  .steps { display:flex; gap:18px; margin-top:0.35in; width:100%; }
  .step { flex:1; background:var(--card); border-radius:18px; padding:14px 12px; font-size:14px; line-height:1.35; }
  .step b { display:block; font-size:22px; color:var(--coral); margin-bottom:4px; }
  .biz { margin-top:0.3in; display:flex; align-items:center; gap:14px; font-size:18px; }
  .biz .logo { width:48px; height:48px; border-radius:12px; object-fit:cover; }
  .biz small { display:block; color:var(--muted); font-size:13px; }
  .code { margin-top:10px; font-family: ui-monospace, Menlo, Consolas, monospace; font-size:15px; color:var(--muted); }
  .code b { color:var(--ink); letter-spacing:0.12em; }
  .foot { margin-top:auto; padding-top:0.25in; font-size:12px; color:var(--muted); }
  .print { position:fixed; right:16px; bottom:16px; background:var(--ink); color:#fff; border:0; border-radius:999px; padding:12px 18px; font-size:15px; font-weight:600; cursor:pointer; }
  @media print { html, body { background:#fff; } .page { margin:0; min-height:auto; box-shadow:none; } .print { display:none; } }
</style>
</head>
<body>
<div class="page">
  <div class="brand"><svg class="paw" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="9" r="2.4"/><circle cx="9.5" cy="5" r="2.4"/><circle cx="14.5" cy="5" r="2.4"/><circle cx="19" cy="9" r="2.4"/><path d="M12 9.5c-3.6 0-6.5 3.5-6.5 6.6 0 2 1.4 3.4 3.3 3.4 1.2 0 2-.5 3.2-.5s2 .5 3.2.5c1.9 0 3.3-1.4 3.3-3.4 0-3.1-2.9-6.6-6.5-6.6z"/></svg> Pawtella</div>
  <div class="badge ${tier.id}">${tierLabel} partner</div>
  <h1>Scan to get <span>${bonus} Paw Points</span> free on Pawtella</h1>
  <p class="sub">The app for your pet: AI pet photos &amp; videos, a pet-care assistant, and supplies delivered in Toronto. Paw Points pay for AI creations and store discounts.</p>
  <div class="qr"><img src="${qrDataUrl}" alt="QR code for ${name}"></div>
  <div class="steps">
    <div class="step"><b>1</b>Scan the code with your phone camera</div>
    <div class="step"><b>2</b>Download Pawtella and add your pet</div>
    <div class="step"><b>3</b>Your ${bonus} bonus Paw Points land instantly</div>
  </div>
  <div class="biz">${logo}<div><strong>${name}</strong><small>Recommended by your ${escapeHtml(partner.type)} · Pawtella partner</small></div></div>
  <div class="code">Or enter code <b>${escapeHtml(partner.code)}</b> in the app · ${escapeHtml(links.referral)}</div>
  <div class="foot">${escapeHtml(env.appUrl.replace(/^https?:\/\//, ''))} · Paw Points are promotional credit with no cash value.</div>
</div>
<button class="print" onclick="window.print()">Print poster</button>
</body>
</html>`;
}
