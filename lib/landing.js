// Shared HTML shell for the public landing pages (/p/:id, /r/:code). No framework, inline CSS,
// mobile-first, light/dark via prefers-color-scheme. Owner: Backend D.
import { escapeHtml } from './http.js';
import { env } from './env.js';

export const REF_COOKIE = 'pawtella_ref';
export const REF_COOKIE_DAYS = 30;
export const STARTING_POINTS = 30;

/** Persist a referral code for 30 days so a later web signup can read it. */
export function setRefCookie(res, code) {
  if (!code) return;
  const safe = String(code).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  if (!safe) return;
  const attrs = [
    `${REF_COOKIE}=${safe}`,
    `Max-Age=${REF_COOKIE_DAYS * 24 * 3600}`,
    'Path=/',
    'SameSite=Lax',
    env.isProd ? 'Secure' : null,
  ].filter(Boolean);
  res.setHeader('Set-Cookie', attrs.join('; '));
}

/** Sanitize a `ref` query value. */
export function cleanRef(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  return s || null;
}

export const CSS = `
:root{--bg:#fffaf5;--fg:#1f1a17;--muted:#6f655e;--card:#ffffff;--accent:#f26b3a;--accent-fg:#fff;--border:#efe3d8;--shadow:0 10px 30px rgba(60,30,10,.08)}
@media(prefers-color-scheme:dark){:root{--bg:#141110;--fg:#f6efe9;--muted:#a79a90;--card:#1f1a18;--accent:#ff7d4d;--accent-fg:#1a0d06;--border:#2c2420;--shadow:0 10px 30px rgba(0,0,0,.4)}}
*{box-sizing:border-box}html,body{margin:0;padding:0}
body{background:var(--bg);color:var(--fg);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit}
.wrap{max-width:520px;margin:0 auto;padding:16px 16px 48px}
header.top{display:flex;align-items:center;justify-content:space-between;padding:8px 0 16px}
.logo{display:flex;align-items:center;gap:8px;font-weight:800;letter-spacing:-.02em;text-decoration:none;font-size:18px}
.logo .paw{width:28px;height:28px;border-radius:9px;background:var(--accent);display:inline-grid;place-items:center;color:var(--accent-fg);font-size:16px}
.pill{font-size:13px;color:var(--muted);border:1px solid var(--border);border-radius:999px;padding:4px 10px}
.card{background:var(--card);border:1px solid var(--border);border-radius:20px;overflow:hidden;box-shadow:var(--shadow)}
.media{position:relative;background:#000;aspect-ratio:1/1;display:grid;place-items:center}
.media img,.media video{width:100%;height:100%;object-fit:cover;display:block}
.media[data-portrait="1"]{aspect-ratio:4/5}
.meta{padding:14px 16px 16px}
.author{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.avatar{width:36px;height:36px;border-radius:50%;background:var(--border);object-fit:cover;display:inline-grid;place-items:center;font-weight:700;color:var(--muted)}
.handle{font-weight:700}.sub{color:var(--muted);font-size:14px}
.caption{margin:6px 0 0;white-space:pre-wrap;word-break:break-word}
.stats{display:flex;gap:14px;color:var(--muted);font-size:14px;margin-top:10px}
.cta{margin-top:20px;text-align:center}
.cta h2{font-size:22px;letter-spacing:-.02em;margin:0 0 6px}
.cta p{margin:0 0 14px;color:var(--muted)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:14px 18px;border-radius:14px;font-weight:700;text-decoration:none;border:1px solid var(--border);background:var(--card)}
.btn.primary{background:var(--accent);color:var(--accent-fg);border-color:transparent}
.btn+.btn{margin-top:10px}
.badges{display:flex;gap:10px;justify-content:center;margin-top:14px}
.badge{flex:1;display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:12px;background:#111;color:#fff;text-decoration:none;font-size:12px;line-height:1.1;border:1px solid #333}
.badge b{display:block;font-size:14px}
.badge span{opacity:.75}
footer{margin-top:28px;text-align:center;color:var(--muted);font-size:12px}
footer a{color:var(--muted)}
.hero{padding:28px 20px;text-align:center}
.hero .avatar{width:84px;height:84px;margin:0 auto 12px;font-size:32px}
.hero h1{margin:0 0 6px;font-size:24px;letter-spacing:-.02em}
.notfound{text-align:center;padding:48px 16px}
.notfound h1{font-size:28px;margin:0 0 8px}
`;

export function pawLogo() {
  return `<a class="logo" href="${escapeHtml(env.appUrl)}"><span class="paw" aria-hidden="true">&#128062;</span>Pawtella</a>`;
}

/** Install CTA block: headline, deep link, store badges. */
export function installCta({ deepLink, headline, sub } = {}) {
  const h = headline || `Make yours free`;
  const s = sub || `Made with Pawtella — make yours free, ${STARTING_POINTS} Paw Points to start.`;
  return `
<section class="cta">
  <h2>${escapeHtml(h)}</h2>
  <p>${escapeHtml(s)}</p>
  ${deepLink ? `<a class="btn primary" href="${escapeHtml(deepLink)}" id="openApp">Open in Pawtella</a>` : ''}
  <a class="btn${deepLink ? '' : ' primary'}" href="${escapeHtml(env.appUrl)}">Get the app</a>
  <div class="badges">
    <a class="badge" href="${escapeHtml(env.appUrl)}" aria-label="Download on the App Store"><span>&#63743;</span><span><span>Download on the</span><b>App Store</b></span></a>
    <a class="badge" href="${escapeHtml(env.appUrl)}" aria-label="Get it on Google Play"><span>&#9654;</span><span><span>Get it on</span><b>Google Play</b></span></a>
  </div>
</section>`;
}

/**
 * Full HTML document. `meta` is a list of [property|name, content] pairs added to <head>.
 */
export function page({ title, description, meta = [], bodyHtml, canonical, extraHead = '' }) {
  const metaTags = meta
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => {
      const attr = k.startsWith('og:') || k.startsWith('fb:') ? 'property' : 'name';
      return `<meta ${attr}="${escapeHtml(k)}" content="${escapeHtml(v)}">`;
    })
    .join('\n  ');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="light dark">
  <title>${escapeHtml(title)}</title>
  ${description ? `<meta name="description" content="${escapeHtml(description)}">` : ''}
  ${canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}">` : ''}
  <meta name="apple-itunes-app" content="app-id=APP_STORE_ID_PLACEHOLDER">
  ${metaTags}
  ${extraHead}
  <style>${CSS}</style>
</head>
<body>
<div class="wrap">
  <header class="top">${pawLogo()}<span class="pill">Free to start · ${STARTING_POINTS} Paw Points</span></header>
  ${bodyHtml}
  <footer>&copy; ${new Date().getFullYear()} Pawtella · <a href="${escapeHtml(env.appUrl)}">pawtella.app</a></footer>
</div>
</body>
</html>`;
}

export function notFoundPage({ title = 'This post is unavailable', text = 'It may have been removed or made private.' } = {}) {
  return page({
    title: `${title} · Pawtella`,
    description: text,
    meta: [['robots', 'noindex']],
    bodyHtml: `<div class="notfound"><h1>${escapeHtml(title)}</h1><p class="sub">${escapeHtml(text)}</p></div>${installCta({})}`,
  });
}

export function initials(name) {
  return escapeHtml(
    String(name || '?')
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?',
  );
}
