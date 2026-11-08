// POST /api/ai/shop-assist { message, petId? } → { intent, query, productHandles, reply, products }
// Claude Haiku turns a plain-language shopping request into a catalog search grounded in real handles.
import { route, body, badRequest, notFound } from '../../lib/http.js';
import { one } from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { env } from '../../lib/env.js';
import * as claude from '../../lib/claude.js';
import * as shopify from '../../lib/shopify.js';
import { describePet } from '../../lib/ai-assistant.js';

const INTENTS = ['search', 'reorder', 'recommend', 'question', 'other'];
const SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: INTENTS },
    query: { type: 'string' },
    productHandles: { type: 'array', items: { type: 'string' } },
    reply: { type: 'string' },
  },
};

function keywords(message) {
  const stop = new Set(['the', 'a', 'an', 'for', 'my', 'me', 'some', 'something', 'i', 'need', 'want', 'to', 'and', 'of', 'with', 'please', 'find', 'buy', 'get', 'reorder', 'every', 'month', 'week', 'is', 'are', 'that', 'this', 'can', 'you']);
  return message.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !stop.has(w)).slice(0, 5).join(' ');
}

async function catalogSearch(query, first = 10) {
  if (typeof shopify.getProducts !== 'function') return [];
  try {
    const { products = [] } = (await shopify.getProducts({ query: query || undefined, first })) || {};
    return products;
  } catch (err) {
    console.error('[shop-assist] catalog search failed', { error: err.message });
    return [];
  }
}

export default route({
  POST: async (req) => {
    const { userId } = await requireAuth(req);
    const b = body(req);
    const message = typeof b.message === 'string' ? b.message.trim() : '';
    if (!message) throw badRequest('message is required');
    if (message.length > 1000) throw badRequest('message is too long');

    let pet = null;
    if (b.petId) {
      pet = await one('SELECT * FROM pets WHERE id = $1 AND user_id = $2', [parseInt(b.petId, 10) || 0, userId]);
      if (!pet) throw notFound('Pet not found');
    } else {
      pet = await one('SELECT * FROM pets WHERE user_id = $1 ORDER BY is_primary DESC, id ASC LIMIT 1', [userId]);
    }

    // Recent orders give "reorder" something to resolve against.
    const recent = await one(
      `SELECT COALESCE(json_agg(li) FILTER (WHERE li IS NOT NULL), '[]'::json) AS items FROM (
         SELECT DISTINCT ON (x->>'handle') jsonb_build_object('handle', x->>'handle', 'title', x->>'title') AS li
           FROM shop_orders o, jsonb_array_elements(o.line_items) x WHERE o.user_id = $1 ORDER BY x->>'handle', o.placed_at DESC
       ) s`,
      [userId],
    );
    const recentItems = (recent?.items || []).slice(0, 10);

    // Two-pass grounding: a keyword search gives the model real candidates to choose from.
    let candidates = await catalogSearch(keywords(message), 10);
    if (!candidates.length) candidates = await catalogSearch(undefined, 12);
    const catalogLines = candidates.map((p) => `- ${p.handle} — ${p.title} — $${(p.priceCents / 100).toFixed(2)}${p.tags?.length ? ` [${p.tags.slice(0, 4).join(', ')}]` : ''}${p.availableForSale === false ? ' (sold out)' : ''}`);

    const system = [
      'You are the shopping helper of Pawtella, a pet-supply shop (cats and dogs) with pickup and local delivery in Toronto and shipping in Canada and the US.',
      'Turn the shopper\'s message into: intent (search | reorder | recommend | question | other), a short catalog search query, up to 3 productHandles chosen ONLY from the candidates below (exact handles, best matches first, empty if none fit), and a one- or two-sentence friendly reply that names the picks.',
      'Never invent products or handles. If the request is a question rather than shopping, answer briefly in reply and leave productHandles empty.',
      pet ? `\nThe shopper's pet:\n${describePet(pet)}` : '',
      recentItems.length ? `\nPreviously ordered (for "reorder" requests):\n${recentItems.map((i) => `- ${i.handle} — ${i.title}`).join('\n')}` : '',
      catalogLines.length ? `\nCatalog candidates:\n${catalogLines.join('\n')}` : '\nCatalog candidates: none found.',
    ].join('\n');

    const out = await claude.json({ system, prompt: message, schema: SCHEMA, model: env.claude.fastModel });
    const allowed = new Set(candidates.map((p) => p.handle));
    let handles = Array.isArray(out?.productHandles) ? out.productHandles.filter((h) => allowed.has(h)).slice(0, 3) : [];
    if (!handles.length && claude.isMock) handles = candidates.slice(0, 3).map((p) => p.handle);
    const intent = INTENTS.includes(out?.intent) ? out.intent : 'search';
    const queryText = typeof out?.query === 'string' && out.query.trim() ? out.query.trim().slice(0, 80) : keywords(message);
    const products = handles.map((h) => candidates.find((p) => p.handle === h)).filter(Boolean);
    const reply = !claude.isMock && typeof out?.reply === 'string' && out.reply.trim()
      ? out.reply.trim()
      : products.length
        ? `Here are a few picks${pet ? ` for ${pet.name}` : ''}: ${products.map((p) => p.title).join(', ')}.`
        : `I couldn't find a close match for "${queryText}" yet. Try another word or browse the collections.`;

    return { intent, query: queryText, productHandles: handles, reply, products };
  },
});
