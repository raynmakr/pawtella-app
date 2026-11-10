// GET /partners → recruiting page for local pet businesses (vercel.json rewrites /partners here).
import { route, html, escapeHtml } from '../lib/http.js';
import { env } from '../lib/env.js';
import { PARTNER_RULES } from '../lib/partner-rules.js';

const cap = (s) => s[0].toUpperCase() + s.slice(1);

function render() {
  const R = PARTNER_RULES;
  const deepLink = `${env.appScheme}://partner/apply`;
  const tierRows = R.tiers
    .map((t, i) => {
      const next = R.tiers[i + 1];
      const range = next ? `${t.minActive}–${next.minActive - 1}` : `${t.minActive}+`;
      return `<tr class="tier-${t.id}">
        <td><span class="pill ${t.id}">${cap(t.id)}</span></td>
        <td>${range} active clients</td>
        <td><strong>${t.discountPercent}% off</strong> supplies</td>
        <td>${t.perks.map(escapeHtml).join(' · ')}</td>
      </tr>`;
    })
    .join('');
  const faq = [
    ['Who can join?', 'Vets, groomers, walkers, trainers, sitters, boarding facilities, rescues and pet boutiques in Canada. Apply in the app; we review every application by hand, usually within two business days.'],
    ['How do my clients get linked to me?', `They scan your QR poster, open your link, or enter your code in the app within ${R.attributionWindowDaysAfterSignup} days of signing up. Each client is linked to one partner for ${R.attributionMonths} months and gets ${R.referredCustomerBonus} Paw Points for joining through you.`],
    ['When do I get paid?', `Commissions become available ${R.commissionMaturityDays} days after the order (our returns window). Redeem them as Paw Points at any time, convert them to a Pawtella gift card instantly, or request an e-transfer once you have $${(R.minPayoutCents / 100).toFixed(0)} or more.`],
    ['What counts as an "active" client?', `A linked client who used the Pawtella app in the last ${R.activeWindowDays} days. Tiers are recalculated daily, and your supplies discount code updates automatically.`],
    ['Does it cost anything?', 'No. There are no fees and no minimums. Your listing in the directory is free, and the Ask assistant recommends nearby partners to pet parents looking for your services.'],
  ]
    .map(([q, a]) => `<details><summary>${escapeHtml(q)}</summary><p>${escapeHtml(a)}</p></details>`)
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pawtella Partners – Grow your pet business</title>
<meta name="description" content="Join the Pawtella partner program: ${R.commissionPercent}% commission on your clients' orders, up to ${R.tiers.at(-1).discountPercent}% off supplies, and new clients from the Pawtella directory.">
<meta property="og:title" content="Grow your pet business with Pawtella">
<meta property="og:description" content="Earn ${R.commissionPercent}% on every order your clients place and get up to ${R.tiers.at(-1).discountPercent}% off supplies.">
<meta property="og:url" content="${escapeHtml(env.appUrl)}/partners">
<style>
  :root { --bg:#fff8f1; --surface:#ffffff; --ink:#1f1a17; --muted:#6b625c; --line:#eadfd5; --coral:#ff6b57; --coral-ink:#c93f2d; --mint:#2fb37f; --amber:#f5b041; --shadow:0 10px 30px rgba(31,26,23,.08); }
  @media (prefers-color-scheme: dark) { :root { --bg:#17130f; --surface:#221c17; --ink:#f6efe8; --muted:#b6aba2; --line:#352c25; --coral:#ff7b68; --coral-ink:#ffb3a8; --shadow:0 10px 30px rgba(0,0,0,.35); } }
  * { box-sizing:border-box; }
  html, body { margin:0; background:var(--bg); color:var(--ink); font-family:-apple-system,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif; line-height:1.5; -webkit-font-smoothing:antialiased; }
  a { color:var(--coral-ink); }
  .wrap { max-width:1040px; margin:0 auto; padding:0 20px; }
  header { display:flex; align-items:center; justify-content:space-between; padding:18px 0; }
  .brand { display:flex; align-items:center; gap:8px; font-weight:800; font-size:20px; color:var(--coral); text-decoration:none; }
  .brand svg { width:28px; height:28px; }
  .btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; background:var(--coral); color:#fff; text-decoration:none; font-weight:700; padding:14px 22px; border-radius:999px; border:0; font-size:16px; box-shadow:var(--shadow); }
  .btn.ghost { background:transparent; color:var(--ink); border:1px solid var(--line); box-shadow:none; }
  .hero { padding:36px 0 28px; display:grid; gap:28px; align-items:center; }
  .hero h1 { font-size:clamp(34px,6vw,56px); line-height:1.05; letter-spacing:-0.02em; margin:0 0 14px; }
  .hero h1 span { color:var(--coral); }
  .hero p { font-size:18px; color:var(--muted); margin:0 0 22px; max-width:34em; }
  .hero .cta { display:flex; flex-wrap:wrap; gap:12px; align-items:center; }
  .stats { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
  .stat { background:var(--surface); border:1px solid var(--line); border-radius:18px; padding:16px; box-shadow:var(--shadow); }
  .stat b { display:block; font-size:30px; color:var(--coral); letter-spacing:-0.02em; }
  .stat span { font-size:14px; color:var(--muted); }
  section { padding:34px 0; }
  h2 { font-size:clamp(26px,4vw,34px); letter-spacing:-0.02em; margin:0 0 8px; }
  .lead { color:var(--muted); margin:0 0 22px; max-width:40em; }
  .steps { display:grid; gap:14px; grid-template-columns:1fr; }
  .step { background:var(--surface); border:1px solid var(--line); border-radius:20px; padding:20px; box-shadow:var(--shadow); }
  .step b { display:inline-flex; width:34px; height:34px; align-items:center; justify-content:center; border-radius:50%; background:var(--coral); color:#fff; margin-bottom:10px; }
  .step h3 { margin:0 0 6px; font-size:19px; }
  .step p { margin:0; color:var(--muted); }
  .table { overflow-x:auto; background:var(--surface); border:1px solid var(--line); border-radius:20px; box-shadow:var(--shadow); }
  table { width:100%; border-collapse:collapse; min-width:620px; }
  th, td { text-align:left; padding:14px 16px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); }
  tr:last-child td { border-bottom:0; }
  .pill { display:inline-block; padding:4px 12px; border-radius:999px; font-weight:700; font-size:14px; }
  .pill.bronze { background:#c8835a; color:#fff; } .pill.silver { background:#c9ced6; color:#1f1a17; } .pill.gold { background:var(--amber); color:#1f1a17; }
  .commission { display:grid; gap:14px; grid-template-columns:1fr; }
  .card { background:var(--surface); border:1px solid var(--line); border-radius:20px; padding:20px; box-shadow:var(--shadow); }
  .card h3 { margin:0 0 6px; font-size:18px; }
  .card p { margin:0; color:var(--muted); }
  .example { background:linear-gradient(135deg, var(--coral), #ff9a6b); color:#fff; }
  .example p, .example h3 { color:#fff; }
  .example b { font-size:28px; display:block; }
  details { background:var(--surface); border:1px solid var(--line); border-radius:16px; padding:14px 18px; margin-bottom:10px; }
  summary { font-weight:700; cursor:pointer; }
  details p { color:var(--muted); margin:10px 0 0; }
  .final { text-align:center; padding:48px 0 30px; }
  .badges { display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin-top:18px; }
  .badge { display:inline-flex; align-items:center; gap:8px; background:#111; color:#fff; border-radius:10px; padding:9px 14px; text-decoration:none; font-size:14px; border:1px solid #333; }
  .badge small { display:block; font-size:10px; opacity:.8; line-height:1; }
  .badge svg { width:20px; height:20px; fill:#fff; }
  footer { color:var(--muted); font-size:13px; padding:20px 0 40px; text-align:center; }
  @media (min-width:760px) { .hero { grid-template-columns:1.1fr .9fr; padding:56px 0 40px; } .steps { grid-template-columns:repeat(3,1fr); } .commission { grid-template-columns:repeat(3,1fr); } }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <a class="brand" href="${escapeHtml(env.appUrl)}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="9" r="2.4"/><circle cx="9.5" cy="5" r="2.4"/><circle cx="14.5" cy="5" r="2.4"/><circle cx="19" cy="9" r="2.4"/><path d="M12 9.5c-3.6 0-6.5 3.5-6.5 6.6 0 2 1.4 3.4 3.3 3.4 1.2 0 2-.5 3.2-.5s2 .5 3.2.5c1.9 0 3.3-1.4 3.3-3.4 0-3.1-2.9-6.6-6.5-6.6z"/></svg>Pawtella</a>
    <a class="btn ghost" href="${escapeHtml(deepLink)}">Apply in the app</a>
  </header>

  <section class="hero">
    <div>
      <h1>Grow your pet business <span>with Pawtella</span></h1>
      <p>Pawtella is the Toronto pet app: AI pet photos and videos, a pet-care assistant, and supplies delivered or picked up. Partners send clients our way and earn on every order. We send pet parents your way through the in-app directory.</p>
      <div class="cta">
        <a class="btn" href="${escapeHtml(deepLink)}">Apply in the app</a>
        <span style="color:var(--muted);font-size:14px">Free to join · no minimums · approval in ~2 days</span>
      </div>
    </div>
    <div class="stats">
      <div class="stat"><b>${R.commissionPercent}%</b><span>commission on your clients' orders for ${R.attributionMonths} months</span></div>
      <div class="stat"><b>${R.tiers.at(-1).discountPercent}%</b><span>off supplies for your own practice at Gold</span></div>
      <div class="stat"><b>+${R.referredCustomerBonus} PP</b><span>welcome gift for every client you refer</span></div>
    </div>
  </section>

  <section id="how">
    <h2>How it works</h2>
    <p class="lead">Three steps. We handle the app, the store, the delivery and the payouts.</p>
    <div class="steps">
      <div class="step"><b>1</b><h3>Apply and get your kit</h3><p>Tell us about your business in the app. Once approved you get a referral code, a QR code and a printable poster for your front desk.</p></div>
      <div class="step"><b>2</b><h3>Your clients scan and join</h3><p>They get ${R.referredCustomerBonus} Paw Points on signup and are linked to you for ${R.attributionMonths} months. You also appear in the Pawtella directory and in Ask recommendations.</p></div>
      <div class="step"><b>3</b><h3>Earn on every order</h3><p>${R.commissionPercent}% of everything they spend on supplies lands in your partner dashboard. Redeem as Paw Points, a gift card, or an e-transfer.</p></div>
    </div>
  </section>

  <section id="tiers">
    <h2>Partner tiers</h2>
    <p class="lead">Tiers follow the number of your linked clients active in the last ${R.activeWindowDays} days. They are recalculated every day, and your supplies discount updates automatically.</p>
    <div class="table"><table>
      <thead><tr><th>Tier</th><th>Active clients</th><th>Supplies discount</th><th>Perks</th></tr></thead>
      <tbody>${tierRows}</tbody>
    </table></div>
  </section>

  <section id="commission">
    <h2>How commission works</h2>
    <p class="lead">Simple, transparent, and paid the way you prefer.</p>
    <div class="commission">
      <div class="card example"><h3>Example</h3><p>A client you referred spends <b>$80</b> on food and treats. You earn <b>$${((8000 * R.commissionPercent) / 100 / 100).toFixed(2)}</b>, available ${R.commissionMaturityDays} days later.</p></div>
      <div class="card"><h3>What counts</h3><p>${R.commissionPercent}% of the cash subtotal (after discounts, before tax and shipping) on every store order from a linked client, for ${R.attributionMonths} months from the day they joined.</p></div>
      <div class="card"><h3>Getting paid</h3><p>Paw Points at $${(R.redeemPointsCentsPerPoint / 100).toFixed(2)} per point (a 25% boost over cash), an instant Pawtella gift card, or an e-transfer from $${(R.minPayoutCents / 100).toFixed(0)}.</p></div>
    </div>
  </section>

  <section id="faq">
    <h2>FAQ</h2>
    ${faq}
  </section>

  <section class="final">
    <h2>Ready to partner with us?</h2>
    <p class="lead" style="margin-left:auto;margin-right:auto">Download Pawtella, open Profile → Become a partner, and apply in two minutes.</p>
    <a class="btn" href="${escapeHtml(deepLink)}">Apply in the app</a>
    <div class="badges">
      <a class="badge" href="${escapeHtml(env.appUrl)}/download/ios" aria-label="Download on the App Store"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.9-.8-3.1-.8-1.6 0-3.1.9-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.6.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8 1.5 0 1.9.8 3.1.8 1.3 0 2.1-1.2 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.7-1-2.7-4.2zM14.1 5.6c.6-.8 1.1-1.9.9-3-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1.1.1 2.1-.5 2.8-1.3z"/></svg><span><small>Download on the</small>App Store</span></a>
      <a class="badge" href="${escapeHtml(env.appUrl)}/download/android" aria-label="Get it on Google Play"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.6 2.3 13 12l-9.4 9.7c-.4-.2-.6-.7-.6-1.2V3.5c0-.5.2-1 .6-1.2zm1.5-.3 11 6.3-2.6 2.7L5.1 2zm0 20 8.4-9 2.6 2.7-11 6.3zm12.5-7.2-3-3 3-3 3.3 1.9c1 .6 1 1.6 0 2.2l-3.3 1.9z"/></svg><span><small>Get it on</small>Google Play</span></a>
    </div>
  </section>
  <footer>© ${new Date().getFullYear()} Bone &amp; Biscuit College West (operating as Pawtella) · Toronto, Canada · Questions? <a href="mailto:${escapeHtml(env.adminEmail || 'partners@pawtella.app')}">Email us</a></footer>
</div>
</body>
</html>`;
}

export default route({
  GET: async (req, res) => {
    html(res, render());
  },
});
