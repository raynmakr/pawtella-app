// One function per journey → { subject, html, text }. Pure (no DB), so templates can be
// unit-tested and previewed. Every template receives the vars stored on notifications.payload
// plus `name`, `email`, `handle`, `appUrl` injected by lib/notifications.js deliverQueued().
//
//   import { renderTemplate, TEMPLATE_NAMES } from '../lib/email-templates.js';
//   const { subject, html, text } = renderTemplate('welcome_d0', { name: 'Sam', pawPoints: 30 });
import { env } from './env.js';
import { escapeHtml } from './http.js';
import { renderLayout, htmlToText, FOOTER_TEXT, p, ul, pill, kv } from './email.js';

const appUrl = () => env.appUrl;
const link = (path) => `${appUrl()}${path.startsWith('/') ? path : `/${path}`}`;
const first = (vars) => (vars.name || vars.displayName || vars.handle || 'there').toString().split(' ')[0];
const money = (cents, currency = 'CAD') =>
  `$${(Number(cents || 0) / 100).toFixed(2)}${currency && currency !== 'CAD' ? ` ${currency}` : ''}`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Finish a template: wrap in the layout and derive the text part. */
function finish({ subject, title, preheader, bodyHtml, ctaText, ctaUrl, footerNote }) {
  const html = renderLayout({ title, preheader: preheader || subject, bodyHtml, ctaText, ctaUrl, footerNote });
  const text = `${title}\n\n${htmlToText(bodyHtml)}${ctaText && ctaUrl ? `\n\n${ctaText}: ${ctaUrl}` : ''}\n\n—\n${FOOTER_TEXT}\nEmail preferences & unsubscribe: ${link('/settings/notifications')}`;
  return { subject, html, text };
}

export const TEMPLATES = {
  welcome_d0(v) {
    const pts = v.pawPoints ?? 30;
    return finish({
      subject: `Welcome to Pawtella, ${first(v)}. You have ${pts} Paw Points.`,
      title: `Welcome, ${first(v)}`,
      preheader: `${pts} Paw Points are waiting. Make your first creation.`,
      bodyHtml:
        pill(`${pts} Paw Points in your account`) +
        p(`Thanks for joining. Paw Points pay for AI photos and videos of your pet, and they take money off supplies in the shop.`) +
        p(`Your balance already covers a few creations. Pick a photo of your pet, choose a style, and see what the studio comes up with.`) +
        p(`Tip: an image costs 2 Paw Points, a short video 8.`, { muted: true, small: true }),
      ctaText: 'Make your first creation',
      ctaUrl: link('/studio'),
    });
  },

  welcome_d1(v) {
    return finish({
      subject: 'Two small things that make Pawtella better',
      title: `Hi ${first(v)}, two quick tips`,
      preheader: 'Add your pet and ask the assistant anything.',
      bodyHtml:
        ul([
          'Add your pet. Name, breed, birthday and weight help the studio match their look and let the assistant give advice that fits them. You also earn 3 Paw Points for completing a profile.',
          'Ask the assistant. Food amounts, odd behaviour, what to pack for a trip: it knows your pet once the profile is in, and it will point out when something needs a vet.',
        ]) + p(`Both take under a minute.`, { muted: true }),
      ctaText: 'Add your pet',
      ctaUrl: link('/pets/new'),
    });
  },

  welcome_d3(v) {
    const c = v.challenge || {};
    const title = c.title || 'This week’s challenge';
    return finish({
      subject: `Challenge of the week: ${title}`,
      title,
      preheader: `Enter with one creation. Winner takes ${c.rewardPoints ?? 50} Paw Points.`,
      bodyHtml:
        p(c.description || 'Every week we pick a theme. Make a creation in that style, post it to the feed, and the most-liked entry wins.') +
        pill(`Winner: ${c.rewardPoints ?? 50} Paw Points · Runner-up: ${c.runnerUpPoints ?? 15}`) +
        (c.endsAt ? p(`Entries close ${new Date(c.endsAt).toLocaleDateString('en-CA', { month: 'long', day: 'numeric' })}.`, { muted: true, small: true }) : ''),
      ctaText: 'Enter the challenge',
      ctaUrl: c.id ? link(`/challenges/${c.id}`) : link('/challenges'),
    });
  },

  first_creation_nudge(v) {
    return finish({
      subject: `${first(v)}, your Paw Points are still waiting`,
      title: 'Your first creation is on us',
      preheader: 'You still have points. Here is the fastest way to use them.',
      bodyHtml:
        p(`You signed up a couple of days ago and have not made anything yet. No pressure, but the studio is the fun part.`) +
        p(`Pick any photo of ${v.petName ? v.petName : 'your pet'}, tap a preset, and you will have something to share in about a minute.`) +
        pill(`${v.pawPoints ?? 30} Paw Points available`),
      ctaText: 'Open the studio',
      ctaUrl: link('/studio'),
    });
  },

  generation_ready(v) {
    const kind = v.kind === 'video' ? 'video' : 'image';
    return finish({
      subject: `Your ${kind} of ${v.petName || 'your pet'} is ready`,
      title: `Your ${kind} is ready`,
      preheader: 'Open Pawtella to see it, post it, or share it.',
      bodyHtml:
        p(`The studio finished your ${kind}${v.presetName ? ` in the ${v.presetName} style` : ''}. Take a look, post it to the feed or share it with friends.`) +
        (v.thumbnailUrl
          ? `<p style="margin:0 0 16px;"><img src="${escapeHtml(v.thumbnailUrl)}" alt="" width="520" style="width:100%;max-width:520px;border-radius:12px;display:block;"></p>`
          : ''),
      ctaText: `See your ${kind}`,
      ctaUrl: v.generationId ? link(`/studio/${v.generationId}`) : link('/studio'),
    });
  },

  pet_birthday(v) {
    const pet = v.petName || 'your pet';
    const bonus = v.bonusPoints ?? 5;
    const treat = v.treatSuggestion || (v.species === 'cat' ? 'a new wand toy or a pouch of freeze-dried salmon' : 'a frozen peanut-butter Kong or a long-lasting chew');
    return finish({
      subject: `Happy birthday, ${pet}`,
      title: `Happy birthday, ${pet}`,
      preheader: `We added ${bonus} Paw Points to celebrate.`,
      bodyHtml:
        pill(`+${bonus} Paw Points added`) +
        p(`${pet} turns ${v.age ? plural(v.age, 'year') : 'another year'} old today. We put ${bonus} Paw Points in your account to mark it.`) +
        p(`Treat idea: ${treat}.`) +
        p(`A birthday portrait from the studio makes a good keepsake too.`, { muted: true, small: true }),
      ctaText: 'Make a birthday portrait',
      ctaUrl: link('/studio?preset=birthday'),
    });
  },

  replenishment(v) {
    const days = v.daysLeft ?? 5;
    const item = v.title || v.sku || 'your usual';
    return finish({
      subject: `Running low on ${item}?`,
      title: `About ${plural(days, 'day')} of ${item} left`,
      preheader: 'Based on how often you reorder. Restock before you run out.',
      bodyHtml:
        p(`Going by your past orders, ${v.petName ? `${v.petName}’s` : 'your'} ${item} should run out in roughly ${plural(days, 'day')}.`) +
        p(`Reorder now and it will be ready for pickup or on its way before the bowl is empty. You earn 1 Paw Point for every dollar.`) +
        p(`Estimate off? Reply to this email and we will adjust it.`, { muted: true, small: true }),
      ctaText: 'Reorder',
      ctaUrl: v.reorderUrl || (v.handle ? link(`/shop/product/${v.handle}`) : link('/shop')),
    });
  },

  winback_30d(v) {
    const offer = v.offerPoints ?? 15;
    return finish({
      subject: `We added ${offer} Paw Points for you`,
      title: `It has been a while, ${first(v)}`,
      preheader: `${offer} Paw Points are in your account. Come see what is new.`,
      bodyHtml:
        pill(`+${offer} Paw Points added`) +
        p(`We missed you${v.petName ? ` and ${v.petName}` : ''}. There are new studio styles, a weekly challenge with points on the line, and the assistant has learned a few new tricks.`) +
        p(`Your balance is now ${v.pawPoints ?? offer} Paw Points.`),
      ctaText: 'Open Pawtella',
      ctaUrl: link('/'),
    });
  },

  points_expiring_30d(v) {
    return finish({
      subject: `${v.pawPoints ?? 'Your'} Paw Points expire in 30 days`,
      title: 'Your Paw Points expire soon',
      preheader: 'Points unused for 12 months expire. Any activity keeps them.',
      bodyHtml:
        p(`You have ${plural(v.pawPoints ?? 0, 'Paw Point')} that have not moved in almost a year. Points expire after 12 months without activity, so they go on ${v.expiresOn || 'the 30-day mark'}.`) +
        p(`Keeping them is easy: make a creation, use a few points on supplies, or post to the feed. Any of those resets the clock.`),
      ctaText: 'Use my points',
      ctaUrl: link('/points'),
    });
  },

  post_purchase_review_request(v) {
    const bonus = v.bonusPoints ?? 5;
    return finish({
      subject: `How is ${v.title || 'your order'} working out?`,
      title: 'How did it go?',
      preheader: `Leave a photo review and earn ${bonus} Paw Points.`,
      bodyHtml:
        p(`Your order${v.orderNumber ? ` #${v.orderNumber}` : ''} arrived a few days ago. If ${v.petName || 'your pet'} has a verdict, other owners would like to hear it.`) +
        pill(`+${bonus} Paw Points for a review with a photo`) +
        p(`One sentence and a picture is plenty.`, { muted: true, small: true }),
      ctaText: 'Write a review',
      ctaUrl: v.orderId ? link(`/shop/order/${v.orderId}`) : link('/shop/orders'),
    });
  },

  abandoned_hold(v) {
    return finish({
      subject: 'Your Paw Points are still holding your cart',
      title: 'Your cart is waiting',
      preheader: `${v.points ?? ''} Paw Points are reserved for this order until it expires.`,
      bodyHtml:
        p(`You applied ${plural(v.points ?? 0, 'Paw Point')} (${money(v.discountCents, v.currency)} off) to a cart but did not finish checking out.`) +
        p(`The discount is still attached. Finish the order whenever you are ready, or do nothing and the points return to your balance when the hold expires${v.expiresAt ? ` on ${new Date(v.expiresAt).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short', timeZone: env.timezone })}` : ''}.`),
      ctaText: 'Finish checkout',
      ctaUrl: v.checkoutUrl || link('/shop/cart'),
    });
  },

  back_in_stock(v) {
    return finish({
      subject: `${v.title || 'An item you wanted'} is back in stock`,
      title: 'Back in stock',
      preheader: 'The item you asked about is available again.',
      bodyHtml:
        p(`${v.title || 'The product you were waiting for'} is available again${v.qty ? ` (${v.qty} in stock)` : ''}. You asked us to let you know.`) +
        p(`Quantities are small, so this is first come, first served.`, { muted: true, small: true }),
      ctaText: 'View product',
      ctaUrl: v.handle ? link(`/shop/product/${v.handle}`) : link('/shop'),
    });
  },

  challenge_won(v) {
    const place = v.place === 'runner_up' ? 'runner-up' : 'winner';
    return finish({
      subject: `You are the ${place} of ${v.challengeTitle || 'this week’s challenge'}`,
      title: place === 'winner' ? 'You won this week’s challenge' : 'You placed runner-up',
      preheader: `${v.rewardPoints ?? ''} Paw Points have been added.`,
      bodyHtml:
        pill(`+${v.rewardPoints ?? 0} Paw Points`) +
        p(`Your entry in ${v.challengeTitle || 'the challenge'} finished as ${place} with ${plural(v.likeCount ?? 0, 'like')}. Points are already in your account.`) +
        p(`The next theme is live now if you want to defend the title.`, { muted: true }),
      ctaText: 'See the results',
      ctaUrl: v.challengeId ? link(`/challenges/${v.challengeId}`) : link('/challenges'),
    });
  },

  partner_applied(v) {
    return finish({
      subject: `New partner application: ${v.businessName || 'unknown business'}`,
      title: 'New partner application',
      preheader: `${v.type || ''} · ${v.city || ''}`,
      bodyHtml:
        kv([
          ['Business', v.businessName || '—'],
          ['Type', v.type || '—'],
          ['Location', [v.city, v.province].filter(Boolean).join(', ') || '—'],
          ['Contact', v.email || v.phone || '—'],
          ['Website', v.website || '—'],
        ]) + (v.description ? p(v.description, { muted: true, small: true }) : ''),
      ctaText: 'Review in admin',
      ctaUrl: link(`/api/admin/partners/${v.partnerId || ''}`),
    });
  },

  partner_approved(v) {
    return finish({
      subject: `${v.businessName || 'You'} are now a Pawtella partner`,
      title: 'Welcome aboard',
      preheader: 'Your welcome kit: code, QR poster and how earnings work.',
      bodyHtml:
        p(`${v.businessName || 'Your business'} is approved. Clients who join Pawtella through you get 10 Paw Points, and you earn 10% of what they spend on supplies for 12 months.`) +
        kv([
          ['Your code', v.code || '—'],
          ['Share link', v.shareUrl || link(`/r/${v.code || ''}`)],
          ['Supplies discount', `${v.discountPercent ?? 10}%${v.discountCode ? ` · code ${v.discountCode}` : ''}`],
        ]) +
        p(`Print the poster below for your front desk. Scanning it signs clients up and attributes them to you automatically.`) +
        ul([
          'Earnings become available 14 days after each order.',
          'Redeem as Paw Points (25% bonus), a store gift card, or a cash payout from $25.',
          'Reach 10 active clients for Silver, 50 for Gold.',
        ]),
      ctaText: 'Download your QR poster',
      ctaUrl: v.posterUrl || link('/api/partners/me/poster'),
    });
  },

  partner_tier_up(v) {
    const perks = { silver: '15% supplies discount, a featured badge and a boost in the directory', gold: '20% supplies discount and co-marketing with Pawtella' };
    return finish({
      subject: `${v.businessName || 'You'} just reached ${cap(v.tier)}`,
      title: `You are now ${cap(v.tier)}`,
      preheader: `${v.activeReferred ?? ''} active clients in the last 90 days.`,
      bodyHtml:
        pill(`${cap(v.tier)} partner`) +
        p(`${v.businessName || 'Your business'} has ${plural(v.activeReferred ?? 0, 'active referred client')} in the last 90 days. That unlocks ${perks[v.tier] || 'new perks'}.`) +
        (v.discountCode ? p(`Your new supplies code is ${v.discountCode}.`) : ''),
      ctaText: 'Open your dashboard',
      ctaUrl: link('/partner/dashboard'),
    });
  },

  partner_monthly_statement(v) {
    return finish({
      subject: `Your Pawtella statement for ${v.periodLabel || 'last month'}`,
      title: `Statement: ${v.periodLabel || 'last month'}`,
      preheader: `Commission earned ${money(v.commissionCents, v.currency)} · available ${money(v.availableCents, v.currency)}.`,
      bodyHtml:
        kv([
          ['Referred clients (total)', String(v.totalReferred ?? 0)],
          ['New clients this period', String(v.newReferred ?? 0)],
          ['Orders from your clients', String(v.orderCount ?? 0)],
          ['Commission earned', money(v.commissionCents, v.currency)],
          ['Available to redeem', money(v.availableCents, v.currency)],
          ['Pending (returns window)', money(v.pendingCents, v.currency)],
          ['Tier', cap(v.tier || 'bronze')],
        ]) + p(`Redeem any time as Paw Points, a gift card or a payout from your dashboard.`, { muted: true, small: true }),
      ctaText: 'View dashboard',
      ctaUrl: link('/partner/dashboard'),
    });
  },

  partner_inactive_60d(v) {
    return finish({
      subject: `${v.businessName || 'Your'} Pawtella code has been quiet`,
      title: 'No new clients in 60 days',
      preheader: 'A few easy ways to get the code in front of clients again.',
      bodyHtml:
        p(`${v.businessName || 'Your business'} has not had a new client sign up through Pawtella in the last two months. That is fine, but you might be leaving commission on the table.`) +
        ul([
          'Put the QR poster where people wait or pay.',
          'Add your share link to appointment reminders or receipts.',
          'Mention the 10 free Paw Points: it is the thing clients remember.',
        ]),
      ctaText: 'Get your poster and link',
      ctaUrl: link('/partner/dashboard'),
    });
  },

  admin_digest(v) {
    const d = v.digest || v;
    const c = d.counts || {};
    const pts = d.points || {};
    const inv = d.inventory || {};
    const posts = d.topPosts || [];
    const payouts = d.pendingPayouts || [];
    const queued = d.adminQueue || [];
    const rows = kv([
      ['Signups', String(c.signups ?? 0)],
      ['Creations', String(c.creations ?? 0)],
      ['Posts', String(c.posts ?? 0)],
      ['Orders', `${c.orders ?? 0} · ${money(c.revenueCents)}`],
      ['Points issued / redeemed', `${pts.issued ?? 0} / ${pts.redeemed ?? 0}`],
      ['Points liability', `${pts.liability ?? 0} PP (${money(pts.liabilityCents)})`],
      ['Open reports', String(c.openReports ?? 0)],
      ['Pending partner applications', String(c.pendingPartners ?? 0)],
      ['New SKUs / newly out of stock', `${inv.newSkus ?? 0} / ${inv.newlyOutOfStock ?? 0}`],
    ]);
    const postsHtml = posts.length
      ? `<h2 class="ink" style="font-size:18px;margin:24px 0 12px;">Top consented posts this week</h2>` +
        posts
          .map(
            (po) => `
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 14px;">
            <tr>
              <td width="96" valign="top" style="padding-right:12px;">
                ${po.thumbnailUrl || po.mediaUrl ? `<a href="${escapeHtml(po.mediaUrl)}"><img src="${escapeHtml(po.thumbnailUrl || po.mediaUrl)}" width="96" height="96" alt="" style="width:96px;height:96px;object-fit:cover;border-radius:10px;display:block;"></a>` : ''}
              </td>
              <td valign="top" class="ink" style="font-size:14px;line-height:1.45;">
                <strong>@${escapeHtml(po.handle || '')}</strong> · ${plural(po.likeCount ?? 0, 'like')} · ${escapeHtml(po.mediaType || '')}<br>
                <span class="muted" style="color:#7A6B64;">Suggested caption:</span> ${escapeHtml(po.suggestedCaption || po.caption || '')}<br>
                <a href="${escapeHtml(po.mediaUrl || '#')}">Download media</a> · <a href="${escapeHtml(po.postUrl || '#')}">Open post</a>
              </td>
            </tr>
          </table>`,
          )
          .join('')
      : p('No feature-consented posts this week.', { muted: true, small: true });
    const payoutsHtml = payouts.length
      ? `<h2 class="ink" style="font-size:18px;margin:24px 0 12px;">Pending partner payouts</h2>` +
        kv(payouts.map((pay) => [`${pay.businessName || `Partner ${pay.partnerId}`} · ${pay.method || 'e-transfer'}`, money(Math.abs(pay.amountCents), pay.currency)]))
      : '';
    const queuedHtml = queued.length
      ? `<h2 class="ink" style="font-size:18px;margin:24px 0 12px;">Needs your attention</h2>` +
        ul(queued.map((q) => `${q.title}${q.body ? `: ${q.body}` : ''}`))
      : '';
    const linksHtml =
      `<h2 class="ink" style="font-size:18px;margin:24px 0 12px;">Admin</h2>` +
      ul([
        `Metrics: ${link('/api/admin/metrics')}`,
        `Reports: ${link('/api/admin/reports?status=open')}`,
        `Partners: ${link('/api/admin/partners?status=pending')}`,
        `Sourcing: ${link('/api/admin/sourcing')}`,
        `Challenges: ${link('/api/admin/challenges')}`,
      ]);
    return finish({
      subject: `Pawtella daily digest · ${d.dateLabel || new Date().toLocaleDateString('en-CA', { timeZone: env.timezone })}`,
      title: `Daily digest · ${d.dateLabel || ''}`,
      preheader: `${c.signups ?? 0} signups, ${c.creations ?? 0} creations, ${c.orders ?? 0} orders.`,
      bodyHtml: rows + queuedHtml + postsHtml + payoutsHtml + linksHtml,
      footerNote: 'Sent to the Pawtella admin address once a day.',
    });
  },

  password_reset(v) {
    return finish({
      subject: 'Reset your Pawtella password',
      title: 'Reset your password',
      preheader: 'This link works for one hour.',
      bodyHtml:
        p(`Someone asked to reset the password for ${v.email || 'your account'}. If that was you, use the button below. The link works for ${v.expiresInMinutes ? `${v.expiresInMinutes} minutes` : 'one hour'}.`) +
        p(`If you did not ask for this, you can ignore this email. Your password stays the same.`, { muted: true, small: true }),
      ctaText: 'Choose a new password',
      ctaUrl: v.resetUrl || link(`/reset?token=${encodeURIComponent(v.token || '')}`),
    });
  },
};

function cap(s = '') {
  s = String(s);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const TEMPLATE_NAMES = Object.keys(TEMPLATES);

/** Render a named template. Unknown names fall back to a generic title/body layout. */
export function renderTemplate(name, vars = {}) {
  const fn = TEMPLATES[name];
  if (fn) return fn(vars);
  return finish({
    subject: vars.title || 'A note from Pawtella',
    title: vars.title || 'A note from Pawtella',
    bodyHtml: p(vars.body || ''),
    ctaText: vars.ctaText,
    ctaUrl: vars.ctaUrl,
  });
}

/** Example vars per template, used by tests and the admin preview. */
export const SAMPLE_VARS = {
  welcome_d0: { name: 'Sam Lee', pawPoints: 30 },
  welcome_d1: { name: 'Sam' },
  welcome_d3: { name: 'Sam', challenge: { id: 1, title: 'Autumn Walks', description: 'Leaves, scarves, golden light.', rewardPoints: 50, runnerUpPoints: 15, endsAt: '2026-11-15T04:00:00Z' } },
  first_creation_nudge: { name: 'Sam', petName: 'Milo', pawPoints: 30 },
  generation_ready: { petName: 'Milo', kind: 'video', presetName: 'Astronaut', generationId: 12, thumbnailUrl: 'https://example.com/t.jpg' },
  pet_birthday: { petName: 'Milo', species: 'dog', age: 3, bonusPoints: 5 },
  replenishment: { petName: 'Milo', title: 'Acana Puppy 11kg', sku: 'ACA-PUP-11', daysLeft: 5, handle: 'acana-puppy-11kg' },
  winback_30d: { name: 'Sam', petName: 'Milo', offerPoints: 15, pawPoints: 45 },
  points_expiring_30d: { pawPoints: 120, expiresOn: 'December 8' },
  post_purchase_review_request: { title: 'Acana Puppy 11kg', orderNumber: '1042', orderId: 7, petName: 'Milo', bonusPoints: 5 },
  abandoned_hold: { points: 100, discountCents: 500, currency: 'CAD', expiresAt: '2026-11-09T12:00:00Z', checkoutUrl: 'https://shop.example.com/checkout/abc' },
  back_in_stock: { title: 'Orijen Six Fish 2kg', handle: 'orijen-six-fish-2kg', qty: 4 },
  challenge_won: { challengeTitle: 'Autumn Walks', challengeId: 1, place: 'winner', rewardPoints: 50, likeCount: 87 },
  partner_applied: { partnerId: 3, businessName: 'Happy Tails Grooming', type: 'groomer', city: 'Toronto', province: 'ON', email: 'hi@happytails.ca', website: 'https://happytails.ca', description: 'Full-service grooming in Leslieville.' },
  partner_approved: { businessName: 'Happy Tails Grooming', code: 'HAPPYTAILS', discountPercent: 10, discountCode: 'PARTNER-HAPPYTAILS', posterUrl: 'https://example.com/poster' },
  partner_tier_up: { businessName: 'Happy Tails Grooming', tier: 'silver', activeReferred: 12, discountCode: 'PARTNER-HAPPYTAILS-15' },
  partner_monthly_statement: { periodLabel: 'October 2026', totalReferred: 31, newReferred: 4, orderCount: 18, commissionCents: 21450, availableCents: 18200, pendingCents: 3250, tier: 'silver', currency: 'CAD' },
  partner_inactive_60d: { businessName: 'Happy Tails Grooming' },
  admin_digest: {
    digest: {
      dateLabel: '2026-11-08',
      counts: { signups: 12, creations: 40, posts: 9, orders: 3, revenueCents: 18950, openReports: 1, pendingPartners: 2 },
      points: { issued: 900, redeemed: 200, liability: 15400, liabilityCents: 770000 },
      inventory: { newSkus: 5, newlyOutOfStock: 2 },
      topPosts: [{ id: 1, handle: 'sam', likeCount: 42, mediaType: 'image', mediaUrl: 'https://example.com/m.jpg', thumbnailUrl: 'https://example.com/t.jpg', postUrl: 'https://example.com/p/1', suggestedCaption: 'Milo, fully booked for autumn.' }],
      pendingPayouts: [{ partnerId: 3, businessName: 'Happy Tails Grooming', amountCents: -5000, method: 'e-transfer', currency: 'CAD' }],
      adminQueue: [{ title: 'Partner payout requested', body: 'Happy Tails Grooming asked for $50.00' }],
    },
  },
  password_reset: { email: 'sam@example.com', resetUrl: 'https://pawtella.app/reset?token=abc', expiresInMinutes: 60 },
};
