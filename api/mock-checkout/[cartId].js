// Dev-only stand-in for Shopify's hosted checkout. GET renders the mock cart; POST "completes" it by
// building an orders/paid payload and running the same code path the webhook uses, so points, holds,
// pack grants, commissions and inventory reservations can be exercised without a Shopify store.
// Disabled in production and whenever a real Storefront token is configured.
import { route, html, escapeHtml, notFound, forbidden, body } from '../../lib/http.js';
import { env } from '../../lib/env.js';
import * as shopify from '../../lib/shopify.js';
import * as mock from '../../lib/shopify-mock.js';
import { upsertOrderFromWebhook } from '../../lib/orders.js';
import { one } from '../../lib/db.js';

function guard() {
  if (env.isProd || !shopify.isMock) throw forbidden('Mock checkout is only available in development with the mock Shopify adapter');
}

const cartIdFrom = (req) => decodeURIComponent(req.query?.cartId || '');
const money = (c) => `$${(Number(c || 0) / 100).toFixed(2)}`;

let orderSeq = 0;

/** Build a Shopify-shaped orders/paid payload from a mock cart. */
export async function buildOrderPayload(cart, { fulfillment = 'pickup', email } = {}) {
  const id = Date.now() * 10 + (++orderSeq % 10);
  const userId = cart.attributes?.pawtella_user_id;
  let buyerEmail = email || cart.buyerEmail || null;
  if (!buyerEmail && userId) {
    const u = await one('SELECT email FROM users WHERE id = $1', [parseInt(userId, 10)]);
    buyerEmail = u?.email || null;
  }
  const shippingLine =
    fulfillment === 'pickup'
      ? { code: 'Pickup', title: 'Pickup at Pawtella Toronto Depot', price: '0.00', source: 'shopify' }
      : fulfillment === 'local_delivery'
        ? { code: 'Local Delivery', title: 'Local Delivery (Toronto)', price: cart.subtotalCents >= 4900 ? '0.00' : '7.99', source: 'shopify' }
        : { code: 'Standard', title: 'Standard Shipping', price: cart.subtotalCents >= 7900 ? '0.00' : '12.99', source: 'shopify' };
  const shippingCents = Math.round(parseFloat(shippingLine.price) * 100);
  const subtotal = cart.totalCents; // after discounts, before tax/shipping
  const tax = Math.round(subtotal * 0.13);
  const total = subtotal + tax + shippingCents;
  return {
    id,
    admin_graphql_api_id: `gid://shopify/Order/${id}`,
    name: `#M${String(id).slice(-6)}`,
    order_number: Number(String(id).slice(-6)),
    email: buyerEmail,
    currency: cart.currency || 'CAD',
    financial_status: 'paid',
    fulfillment_status: null,
    subtotal_price: (subtotal / 100).toFixed(2),
    current_subtotal_price: (subtotal / 100).toFixed(2),
    total_discounts: ((cart.discountCents || 0) / 100).toFixed(2),
    total_tax: (tax / 100).toFixed(2),
    total_shipping_price_set: { shop_money: { amount: (shippingCents / 100).toFixed(2), currency_code: cart.currency || 'CAD' } },
    total_price: (total / 100).toFixed(2),
    discount_codes: (cart.discountCodes || []).filter((d) => d.applicable).map((d) => ({ code: d.code, amount: ((cart.discountCents || 0) / 100).toFixed(2), type: 'fixed_amount' })),
    line_items: cart.lines.map((l, i) => ({
      id: id * 100 + i,
      sku: l.sku,
      title: l.title,
      name: l.title,
      quantity: l.quantity,
      price: (l.priceCents / 100).toFixed(2),
      variant_id: Number(String(l.merchandiseId).split('/').pop()),
      product_id: Number(String(l.productId || '').split('/').pop()) || null,
      requires_shipping: !l.pawPointsPack,
    })),
    shipping_lines: cart.lines.every((l) => l.pawPointsPack) ? [] : [shippingLine],
    note_attributes: Object.entries(cart.attributes || {}).map(([name, value]) => [{ name, value }][0]),
    customer: buyerEmail ? { id: 9_000_000 + (parseInt(userId, 10) || 0), email: buyerEmail } : null,
    created_at: new Date().toISOString(),
    processed_at: new Date().toISOString(),
    cancelled_at: null,
    fulfillments: [],
    source_name: 'pawtella-mock-checkout',
  };
}

async function get(req, res) {
  guard();
  const cartId = cartIdFrom(req);
  const cart = await shopify.cartGet(cartId);
  if (!cart) throw notFound('Cart not found (mock carts live in memory and reset when the dev server restarts)');
  const rows = cart.lines
    .map(
      (l) => `<tr><td><img src="${escapeHtml(l.imageUrl || '')}" alt="" width="48" height="48" style="border-radius:8px;object-fit:cover"></td>
        <td>${escapeHtml(l.title)}${l.pawPointsPack ? ` <span class="pill">+${l.pawPointsPack} PP</span>` : ''}<br><small>${escapeHtml(l.sku || '')}</small></td>
        <td>×${l.quantity}</td><td class="r">${money(l.priceCents * l.quantity)}</td></tr>`,
    )
    .join('');
  const codes = (cart.discountCodes || []).map((d) => `<li><code>${escapeHtml(d.code)}</code> ${d.applicable ? '✓ applied' : '✗ not applicable'}</li>`).join('');
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mock checkout · Pawtella</title>
<style>
  :root{--bg:#fbf7f2;--fg:#2a2622;--muted:#7a716a;--card:#fff;--accent:#ff6b5a;--line:#eee5dc}
  @media (prefers-color-scheme: dark){:root{--bg:#1d1a18;--fg:#f4ede6;--muted:#a69c93;--card:#272321;--line:#3a332e}}
  body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  main{max-width:640px;margin:0 auto;padding:24px 16px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px;margin-bottom:16px}
  table{width:100%;border-collapse:collapse} td{padding:8px 4px;border-bottom:1px solid var(--line);vertical-align:middle} .r{text-align:right}
  .pill{background:#ffe8a3;color:#5a4300;border-radius:999px;padding:1px 8px;font-size:12px}
  button{background:var(--accent);color:#fff;border:0;border-radius:12px;padding:12px 18px;font-size:16px;cursor:pointer;width:100%}
  label{display:block;margin:8px 0} small,.muted{color:var(--muted)} code{font-size:13px}
  pre{white-space:pre-wrap;word-break:break-all;font-size:12px;background:var(--bg);padding:12px;border-radius:8px}
</style></head><body><main>
<h1>Mock checkout <small class="muted">dev only</small></h1>
<p class="muted">Stands in for Shopify's hosted checkout. Completing the order fires the same <code>orders/paid</code> flow the real webhook runs.</p>
<div class="card"><table>${rows || '<tr><td>Cart is empty</td></tr>'}
<tr><td colspan="3" class="r">Subtotal</td><td class="r">${money(cart.subtotalCents)}</td></tr>
${cart.discountCents ? `<tr><td colspan="3" class="r">Discounts</td><td class="r">−${money(cart.discountCents)}</td></tr>` : ''}
<tr><td colspan="3" class="r"><strong>Total before tax/shipping</strong></td><td class="r"><strong>${money(cart.totalCents)}</strong></td></tr></table>
${codes ? `<p>Discount codes:</p><ul>${codes}</ul>` : ''}
<p class="muted">Cart <code>${escapeHtml(cart.id)}</code>${cart.attributes?.pawtella_user_id ? ` · Pawtella user #${escapeHtml(cart.attributes.pawtella_user_id)}` : ' · anonymous (no points will be awarded)'}${cart.buyerEmail ? ` · ${escapeHtml(cart.buyerEmail)}` : ''}</p></div>
<form class="card" method="post" id="f">
  <label>Fulfillment
    <select name="fulfillment"><option value="pickup">Pickup at Toronto depot</option><option value="local_delivery">Local delivery</option><option value="shipping">Shipping</option></select></label>
  <label>Buyer email (optional override) <input name="email" type="email" placeholder="${escapeHtml(cart.buyerEmail || 'buyer@example.com')}" style="width:100%"></label>
  <button type="submit">Complete mock order</button>
</form>
<div class="card" id="out" hidden><h3>Result</h3><pre id="json"></pre></div>
<script>
  const f=document.getElementById('f');
  f.addEventListener('submit',async(e)=>{e.preventDefault();const fd=new FormData(f);
    const r=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fulfillment:fd.get('fulfillment'),email:fd.get('email')||undefined})});
    const j=await r.json();document.getElementById('out').hidden=false;document.getElementById('json').textContent=JSON.stringify(j,null,2);
    f.querySelector('button').disabled=r.ok;});
</script></main></body></html>`;
  res.setHeader('Cache-Control', 'no-store');
  html(res, page);
}

async function post(req) {
  guard();
  const cartId = cartIdFrom(req);
  const cart = await shopify.cartGet(cartId);
  if (!cart) throw notFound('Cart not found');
  if (!cart.lines.length) throw notFound('Cart is empty');
  const b = body(req);
  const fulfillment = ['pickup', 'local_delivery', 'shipping'].includes(b.fulfillment) ? b.fulfillment : 'pickup';
  const payload = await buildOrderPayload(cart, { fulfillment, email: b.email });
  const { order, isNew } = await upsertOrderFromWebhook(payload, { topic: 'orders/paid' });
  // Empty the cart so a refresh does not double-order.
  await mock.cartLinesRemove(cart.id, cart.lines.map((l) => l.id)).catch(() => {});
  return {
    ok: true,
    isNew,
    order: {
      id: order.id,
      orderNumber: order.order_number,
      status: order.status,
      fulfillmentType: order.fulfillment_type,
      subtotalCents: order.subtotal_cents,
      totalCents: order.total_cents,
      pointsEarned: order.points_earned,
      pointsRedeemed: order.points_redeemed,
      packPointsGranted: order.pack_points_granted,
      userId: order.user_id,
    },
    webhookPayload: payload,
  };
}

export default route({ GET: get, POST: post });
