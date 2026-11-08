// Invite landing page: GET /r/:code (vercel.json rewrite → /api/r/:code).
// Resolves a user or partner referral code, shows who invited you, sets the referral cookie.
import { route, html, escapeHtml } from '../../lib/http.js';
import { env } from '../../lib/env.js';
import { one } from '../../lib/db.js';
import { track, EVENT } from '../../lib/events.js';
import { resolveCode } from '../../lib/referrals.js';
import { findPartnerByCode } from '../../lib/partners.js';
import { page, notFoundPage, installCta, setRefCookie, cleanRef, initials, STARTING_POINTS } from '../../lib/landing.js';

async function GET(req, res) {
  const raw = req.query?.code ?? req.url.split('?')[0].split('/').filter(Boolean).pop();
  const code = cleanRef(raw);
  const resolved = code ? await resolveCode(code) : null;

  if (!resolved) {
    await track(EVENT.share_landing_view, { props: { kind: 'invite', code, found: false } });
    return html(
      res,
      notFoundPage({ title: 'Invite link not found', text: 'This invite code is invalid or has expired. You can still join Pawtella for free.' }),
      404,
    );
  }

  let hero;
  let title;
  let description;
  if (resolved.kind === 'partner') {
    const partner = (await findPartnerByCode(code)) || (resolved.partnerId ? await one(`SELECT * FROM partners WHERE id = $1`, [resolved.partnerId]) : null);
    const name = partner?.business_name || partner?.businessName || 'a Pawtella partner';
    const logo = partner?.logo_url || partner?.logoUrl || null;
    title = `${name} invited you to Pawtella`;
    description = `Join Pawtella through ${name} and start with ${STARTING_POINTS} Paw Points for AI pet videos and store discounts.`;
    hero = `
<section class="card hero">
  ${logo ? `<img class="avatar" src="${escapeHtml(logo)}" alt="${escapeHtml(name)}">` : `<span class="avatar">${initials(name)}</span>`}
  <h1>${escapeHtml(name)} invited you</h1>
  <p class="sub">${escapeHtml(partner?.city ? `${partner.type || 'Partner'} · ${partner.city}` : 'Pawtella partner')}</p>
</section>`;
  } else {
    const user = await one(`SELECT id, handle, display_name, avatar_url FROM users WHERE id = $1 AND status = 'active'`, [resolved.userId]);
    if (!user) {
      return html(res, notFoundPage({ title: 'Invite link not found', text: 'This invite is no longer valid.' }), 404);
    }
    title = `@${user.handle} invited you to Pawtella`;
    description = `Join @${user.handle} on Pawtella and start with ${STARTING_POINTS} Paw Points for AI pet videos and store discounts.`;
    hero = `
<section class="card hero">
  ${user.avatar_url ? `<img class="avatar" src="${escapeHtml(user.avatar_url)}" alt="">` : `<span class="avatar">${initials(user.display_name || user.handle)}</span>`}
  <h1>You've been invited by @${escapeHtml(user.handle)}</h1>
  <p class="sub">${escapeHtml(user.display_name || '')}</p>
</section>`;
  }

  const canonical = `${env.appUrl}/r/${encodeURIComponent(code)}`;
  const deepLink = `${env.appScheme}://invite/${encodeURIComponent(code)}`;
  const markup = page({
    title,
    description,
    canonical,
    meta: [
      ['og:site_name', 'Pawtella'],
      ['og:type', 'website'],
      ['og:title', title],
      ['og:description', description],
      ['og:url', canonical],
      ['twitter:card', 'summary'],
      ['twitter:title', title],
      ['twitter:description', description],
    ],
    bodyHtml: `${hero}${installCta({
      deepLink,
      headline: `Start with ${STARTING_POINTS} Paw Points`,
      sub: 'Make AI videos of your pet, ask the pet assistant anything and save on supplies. Free to start.',
    })}`,
  });

  await track(EVENT.share_landing_view, { props: { kind: 'invite', code, found: true, refKind: resolved.kind } });
  setRefCookie(res, code);
  return html(res, markup, 200);
}

export default route({ GET });
