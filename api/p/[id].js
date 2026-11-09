// Public share landing page for a post: GET /p/:id (vercel.json rewrite → /api/p/:id).
// OG/Twitter meta for link previews, autoplaying media, install CTA, deep link, referral cookie.
import { route, html, escapeHtml } from '../../lib/http.js';
import { env } from '../../lib/env.js';
import { track, EVENT } from '../../lib/events.js';
import { getPostForLanding } from '../../lib/posts.js';
import { page, notFoundPage, installCta, setRefCookie, cleanRef, initials } from '../../lib/landing.js';

function describe(post, pet) {
  if (post.caption) return post.caption.length > 200 ? `${post.caption.slice(0, 197)}…` : post.caption;
  const who = pet?.name ? `${pet.name} the ${pet.species}` : 'a pet';
  return `Watch ${who} made with Pawtella — AI videos and photos of your pet.`;
}

async function GET(req, res) {
  const id = req.query?.id ?? req.url.split('?')[0].split('/').filter(Boolean).pop();
  const ref = cleanRef(req.query?.ref);
  const data = await getPostForLanding(id);

  if (!data) {
    await track(EVENT.share_landing_view, { props: { postId: Number(id) || null, ref, found: false } });
    return html(res, notFoundPage(), 404);
  }

  const { post, user, pet } = data;
  const petName = pet?.name || user.displayName || `@${user.handle}`;
  const title = `${petName} on Pawtella`;
  const description = describe(post, pet);
  const canonical = `${env.appUrl}/p/${post.id}`;
  const isVideo = post.mediaType === 'video';
  const image = post.thumbnailUrl || (isVideo ? null : post.mediaUrl);
  const deepLink = `${env.appScheme}://post/${post.id}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`;

  const meta = [
    ['og:site_name', 'Pawtella'],
    ['og:type', isVideo ? 'video.other' : 'article'],
    ['og:title', title],
    ['og:description', description],
    ['og:url', canonical],
    ['og:image', image || post.mediaUrl],
    ['twitter:card', isVideo ? 'player' : 'summary_large_image'],
    ['twitter:title', title],
    ['twitter:description', description],
    ['twitter:image', image || post.mediaUrl],
  ];
  if (post.width) meta.push(['og:image:width', String(post.width)]);
  if (post.height) meta.push(['og:image:height', String(post.height)]);
  if (isVideo) {
    meta.push(
      ['og:video', post.mediaUrl],
      ['og:video:secure_url', post.mediaUrl],
      ['og:video:type', 'video/mp4'],
      ['twitter:player', canonical],
    );
    if (post.width) meta.push(['og:video:width', String(post.width)], ['twitter:player:width', String(post.width)]);
    if (post.height) meta.push(['og:video:height', String(post.height)], ['twitter:player:height', String(post.height)]);
  }

  const portrait = post.width && post.height && post.height > post.width ? '1' : '0';
  const mediaHtml = isVideo
    ? `<video autoplay muted loop playsinline preload="metadata" ${image ? `poster="${escapeHtml(image)}"` : ''} src="${escapeHtml(post.mediaUrl)}"></video>`
    : `<img src="${escapeHtml(post.mediaUrl)}" alt="${escapeHtml(description)}" loading="eager">`;

  const avatar = user.avatarUrl
    ? `<img class="avatar" src="${escapeHtml(user.avatarUrl)}" alt="">`
    : `<span class="avatar">${initials(user.displayName || user.handle)}</span>`;

  const body = `
<article class="card">
  <div class="media" data-portrait="${portrait}">${mediaHtml}</div>
  <div class="meta">
    <div class="author">${avatar}
      <div><div class="handle">@${escapeHtml(user.handle)}</div>
      <div class="sub">${pet ? `${escapeHtml(pet.name)} · ${escapeHtml(pet.species)}${pet.breed ? ` · ${escapeHtml(pet.breed)}` : ''}` : 'on Pawtella'}</div></div>
    </div>
    ${post.caption ? `<p class="caption">${escapeHtml(post.caption)}</p>` : ''}
    <div class="stats"><span>&#10084; ${post.likeCount}</span><span>&#128172; ${post.commentCount}</span><span>&#8599; ${post.shareCount}</span></div>
  </div>
</article>
${installCta({ deepLink, headline: 'Make yours free', sub: 'Made with Pawtella — make yours free, 30 Paw Points to start.' })}`;

  const markup = page({ title, description, meta, canonical, bodyHtml: body });

  await track(EVENT.share_landing_view, { props: { postId: post.id, authorId: user.id, ref, found: true } });
  if (ref) setRefCookie(res, ref);
  return html(res, markup, 200);
}

export default route({ GET });
