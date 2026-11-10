// Email transport (Resend) + the shared responsive layout every Pawtella email uses.
// Mock mode when RESEND_API_KEY is missing: logs subject/recipient and returns { mock: true }.
//
//   import { sendEmail, renderLayout } from '../lib/email.js';
//   await sendEmail({ to, subject, html, text });
import { env, flags } from './env.js';
import { escapeHtml } from './http.js';

export const isMock = !flags.hasEmail;

let client = null;

async function getClient() {
  if (!flags.hasEmail) return null;
  if (!client) {
    const { Resend } = await import('resend');
    client = new Resend(env.email.resendApiKey);
  }
  return client;
}

/**
 * Send one email. Resolves to `{ id }` from Resend, or `{ mock: true }` when no key is configured.
 * Throws on transport errors so callers (deliverQueued) can mark the row failed.
 */
export async function sendEmail({ to, subject, html, text, replyTo }) {
  if (!to) throw new Error('sendEmail: missing recipient');
  if (!subject) throw new Error('sendEmail: missing subject');
  const resend = await getClient();
  if (!resend) {
    console.log('[email] mock send', { to, subject });
    return { mock: true };
  }
  const { data, error } = await resend.emails.send({
    from: env.email.from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text: text || htmlToText(html),
    ...(replyTo ? { replyTo } : {}),
  });
  if (error) throw new Error(`Resend: ${error.message || JSON.stringify(error)}`);
  console.log('[email] sent', { to, subject, id: data?.id });
  return { id: data?.id };
}

/** Very small HTML → text fallback for the plain-text part. */
export function htmlToText(html = '') {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const BRAND = {
  coral: '#FF6B4A',
  coralDark: '#E4532F',
  cream: '#FFF8F1',
  ink: '#2B2320',
  muted: '#7A6B64',
  card: '#FFFFFF',
  line: '#F1E4DA',
};

export const FOOTER_TEXT =
  'You are receiving this because you have a Pawtella account. Manage your email preferences or unsubscribe in the app under Profile → Notifications.';

/**
 * Wrap body HTML in the Pawtella email shell: coral accent, cream background, single column,
 * dark-mode safe (explicit colors on every block + prefers-color-scheme overrides), 600px max.
 * `bodyHtml` is trusted markup produced by lib/email-templates.js; text values must already
 * be escaped by the caller.
 */
export function renderLayout({ title, preheader = '', bodyHtml, ctaText, ctaUrl, footerNote }) {
  const safeTitle = escapeHtml(title);
  const appUrl = env.appUrl;
  const prefsUrl = `${appUrl}/settings/notifications`;
  const cta =
    ctaText && ctaUrl
      ? `
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px auto 8px;">
          <tr>
            <td style="border-radius:999px;background:${BRAND.coral};">
              <a href="${escapeHtml(ctaUrl)}" class="btn"
                 style="display:inline-block;padding:14px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">
                ${escapeHtml(ctaText)}
              </a>
            </td>
          </tr>
        </table>`
      : '';

  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${safeTitle}</title>
  <style>
    body { margin:0; padding:0; background:${BRAND.cream}; -webkit-text-size-adjust:100%; }
    a { color:${BRAND.coral}; }
    .wrap { width:100%; background:${BRAND.cream}; }
    .card { background:${BRAND.card}; border:1px solid ${BRAND.line}; border-radius:16px; }
    .ink { color:${BRAND.ink}; }
    .muted { color:${BRAND.muted}; }
    .pill { display:inline-block; padding:4px 12px; border-radius:999px; background:#FFE9E2; color:${BRAND.coralDark}; font-weight:600; font-size:13px; }
    @media (max-width: 620px) {
      .container { width:100% !important; }
      .pad { padding:24px 20px !important; }
      h1 { font-size:22px !important; }
    }
    @media (prefers-color-scheme: dark) {
      body, .wrap { background:#1C1614 !important; }
      .card { background:#2A221F !important; border-color:#3A2F2B !important; }
      .ink, h1, h2, h3, p, li, td { color:#F6EDE6 !important; }
      .muted, .footer, .footer a { color:#B8A79E !important; }
      .pill { background:#4A2B23 !important; color:#FFB7A6 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${BRAND.cream};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
  <table role="presentation" class="wrap" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${BRAND.cream};">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" class="container" width="600" cellspacing="0" cellpadding="0" border="0" style="width:600px;max-width:100%;">
          <tr>
            <td style="padding:0 8px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <a href="${escapeHtml(appUrl)}" style="text-decoration:none;color:${BRAND.coral};font-size:22px;font-weight:800;letter-spacing:-0.3px;">
                <img src="${escapeHtml(appUrl)}/pip-mark.png" width="28" height="28" alt="" style="width:28px;height:28px;margin-right:8px;vertical-align:middle;border:0;">Pawtella
              </a>
            </td>
          </tr>
          <tr>
            <td class="card pad" style="padding:36px 40px;background:${BRAND.card};border:1px solid ${BRAND.line};border-radius:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:${BRAND.ink};">
              <h1 class="ink" style="margin:0 0 18px;font-size:26px;line-height:1.25;font-weight:700;color:${BRAND.ink};">${safeTitle}</h1>
              ${bodyHtml}
              ${cta}
            </td>
          </tr>
          <tr>
            <td class="footer muted" style="padding:20px 12px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:${BRAND.muted};text-align:center;">
              ${footerNote ? `<p style="margin:0 0 8px;">${footerNote}</p>` : ''}
              <p style="margin:0 0 8px;">${escapeHtml(FOOTER_TEXT)}</p>
              <p style="margin:0;">
                <a href="${escapeHtml(prefsUrl)}" style="color:${BRAND.muted};">Email preferences &amp; unsubscribe</a>
                &nbsp;·&nbsp; Pawtella, Toronto, Canada
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Build a paragraph with escaped text. Helper for templates. */
export function p(text, opts = {}) {
  const cls = opts.muted ? 'muted' : 'ink';
  const color = opts.muted ? BRAND.muted : BRAND.ink;
  const size = opts.small ? 'font-size:14px;' : '';
  return `<p class="${cls}" style="margin:0 0 14px;${size}color:${color};">${escapeHtml(text)}</p>`;
}

/** Escaped bullet list. */
export function ul(items) {
  return `<ul style="margin:0 0 16px;padding-left:20px;">${items
    .map((i) => `<li class="ink" style="margin:0 0 8px;color:${BRAND.ink};">${escapeHtml(i)}</li>`)
    .join('')}</ul>`;
}

/** A highlighted pill ("+5 Paw Points"). */
export function pill(text) {
  return `<p style="margin:0 0 16px;"><span class="pill" style="display:inline-block;padding:4px 12px;border-radius:999px;background:#FFE9E2;color:${BRAND.coralDark};font-weight:600;font-size:13px;">${escapeHtml(text)}</span></p>`;
}

/** Simple two-column key/value table used in statements and digests. */
export function kv(rows) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px;border-collapse:collapse;">${rows
    .map(
      ([k, v]) =>
        `<tr><td class="muted" style="padding:8px 0;border-bottom:1px solid ${BRAND.line};font-size:14px;color:${BRAND.muted};">${escapeHtml(k)}</td><td class="ink" style="padding:8px 0;border-bottom:1px solid ${BRAND.line};font-size:14px;text-align:right;font-weight:600;color:${BRAND.ink};">${escapeHtml(v)}</td></tr>`,
    )
    .join('')}</table>`;
}
