// Pure-logic tests: every template renders with sample vars and carries the footer/unsubscribe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, TEMPLATE_NAMES, SAMPLE_VARS, renderTemplate } from '../lib/email-templates.js';
import { renderLayout, htmlToText, FOOTER_TEXT } from '../lib/email.js';

const EXPECTED = [
  'welcome_d0', 'welcome_d1', 'welcome_d3', 'first_creation_nudge', 'generation_ready', 'pet_birthday',
  'replenishment', 'winback_30d', 'points_expiring_30d', 'post_purchase_review_request', 'abandoned_hold',
  'back_in_stock', 'challenge_won', 'partner_applied', 'partner_approved', 'partner_tier_up',
  'partner_monthly_statement', 'partner_inactive_60d', 'admin_digest', 'password_reset',
];

test('all required templates exist and have sample vars', () => {
  for (const name of EXPECTED) {
    assert.equal(typeof TEMPLATES[name], 'function', `missing template ${name}`);
    assert.ok(SAMPLE_VARS[name], `missing sample vars for ${name}`);
  }
});

for (const name of TEMPLATE_NAMES) {
  test(`template ${name} renders with sample vars`, () => {
    const out = renderTemplate(name, SAMPLE_VARS[name] || {});
    assert.ok(out.subject && out.subject.length > 4, 'subject');
    assert.ok(out.html.includes('<!doctype html>'), 'html shell');
    assert.ok(out.html.includes('#FF6B4A'), 'coral accent');
    assert.ok(out.html.includes('prefers-color-scheme: dark'), 'dark mode styles');
    assert.ok(out.html.includes('unsubscribe'), 'unsubscribe link text');
    assert.ok(out.html.includes('Pawtella, Toronto'), 'footer');
    assert.ok(out.text.includes(FOOTER_TEXT), 'text footer');
    assert.ok(out.text.includes('unsubscribe'), 'text unsubscribe');
    assert.ok(!/undefined|\[object Object\]|NaN/.test(out.html), `leaked placeholders in ${name}`);
    assert.ok(!/undefined|\[object Object\]|NaN/.test(out.subject), `leaked placeholder in subject of ${name}`);
  });
}

test('templates render with empty vars without throwing', () => {
  for (const name of TEMPLATE_NAMES) {
    const out = renderTemplate(name, {});
    assert.ok(out.html.length > 500, name);
  }
});

test('unknown template falls back to generic title/body', () => {
  const out = renderTemplate('does_not_exist', { title: 'Hello', body: 'Body <b>text</b>' });
  assert.equal(out.subject, 'Hello');
  assert.ok(out.html.includes('Body &lt;b&gt;text&lt;/b&gt;'), 'body escaped');
});

test('renderLayout escapes title and preheader, renders CTA', () => {
  const html = renderLayout({ title: 'A <script>', preheader: 'x"y', bodyHtml: '<p>hi</p>', ctaText: 'Go', ctaUrl: 'https://e.com/?a=1&b=2' });
  assert.ok(html.includes('A &lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('href="https://e.com/?a=1&amp;b=2"'));
  assert.ok(html.includes('>Go<') || html.includes('Go\n'));
});

test('specific copy: welcome_d0 mentions 30 Paw Points, pet_birthday +5, winback +15, review +5', () => {
  assert.ok(renderTemplate('welcome_d0', SAMPLE_VARS.welcome_d0).subject.includes('30 Paw Points'));
  assert.ok(renderTemplate('pet_birthday', SAMPLE_VARS.pet_birthday).html.includes('+5 Paw Points'));
  assert.ok(renderTemplate('winback_30d', SAMPLE_VARS.winback_30d).html.includes('+15 Paw Points'));
  assert.ok(renderTemplate('post_purchase_review_request', SAMPLE_VARS.post_purchase_review_request).html.includes('+5 Paw Points'));
  assert.ok(renderTemplate('replenishment', SAMPLE_VARS.replenishment).html.includes('5 days'));
  assert.ok(renderTemplate('partner_approved', SAMPLE_VARS.partner_approved).html.includes('poster'));
});

test('htmlToText strips markup and keeps links', () => {
  const t = htmlToText('<p>Hi <a href="https://x.y">there</a></p><p>Bye &amp; co</p>');
  assert.equal(t, 'Hi there (https://x.y)\nBye & co');
});
