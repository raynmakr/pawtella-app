// Pet assistant: system prompt builder, pet-context injection, vet triage, catalog-grounded product
// suggestions, the `find_partners` tool and a strict JSON reply envelope.
// Owner: Backend B. Used by api/ai/chat.js.
//
// Reply envelope: { text, vetAlert?: {level:'emergency'|'soon', reason}, productSuggestions?: [{handle,title,reason}],
//                   petProfileUpdates?: { weightKg?, birthday?, allergies? }, partnerResults?: [...] }
import * as claude from './claude.js';
import * as shopify from './shopify.js';
import * as partners from './partners.js';
import { env } from './env.js';

// ------------------------------------------------------------------------------------------------
// Triage
// ------------------------------------------------------------------------------------------------

export const RED_FLAGS = Object.freeze([
  { level: 'emergency', re: /\b(not|isn'?t|stopped|can'?t|cannot|trouble|difficulty|labou?red|struggling to)\s+breath/i, reason: 'Breathing difficulty' },
  { level: 'emergency', re: /\bbloat(ed|ing)?\b|\bdistended\b|\bswollen (belly|abdomen|stomach)/i, reason: 'Possible bloat (GDV)' },
  { level: 'emergency', re: /\bseizur|\bconvuls|\bfitting\b/i, reason: 'Seizure' },
  { level: 'emergency', re: /\bcollaps|\bunconscious|\bunresponsive|\bwon'?t wake/i, reason: 'Collapse or unresponsiveness' },
  { level: 'emergency', re: /\b(hit by|run over|car accident|fell from|fall from)\b/i, reason: 'Trauma' },
  { level: 'emergency', re: /\b(chocolate|xylitol|grapes?|raisins?|antifreeze|rat poison|onions?|ibuprofen|advil|tylenol|acetaminophen|lil(y|ies)|marijuana|edibles?)\b/i, reason: 'Possible poisoning' },
  { level: 'emergency', re: /\b(poison|toxic|ate (a|some|the) [^.]*(pill|medic|battery|sock|string|yarn|bone))/i, reason: 'Possible poisoning or dangerous ingestion' },
  { level: 'emergency', re: /\b(straining|unable|can'?t|cannot|trying)\s+to\s+(pee|urinate)|\bno urine|\bnot peeing|\bhasn'?t peed/i, reason: 'Urinary blockage risk' },
  { level: 'emergency', re: /\bpale (gums|tongue)|\bblue (gums|tongue)|\bwhite gums/i, reason: 'Pale or blue gums' },
  { level: 'emergency', re: /\b(heat ?stroke|overheat|panting heavily)/i, reason: 'Heat stroke' },
  { level: 'emergency', re: /\b(bleeding (heavily|a lot|won'?t stop)|blood (everywhere|gushing)|deep (cut|wound|bite))/i, reason: 'Severe bleeding or wound' },
  { level: 'emergency', re: /\b(eye|eyes)\b[^.]*\b(bulg|popped|injur|puncture)/i, reason: 'Eye injury' },
  { level: 'soon', re: /\b(vomit|throwing up|puk)\w*\b[^.]*\b(blood|repeated|again and again|all day|multiple|keeps|several times)/i, reason: 'Repeated vomiting or vomiting blood' },
  { level: 'soon', re: /\bblood(y)?\s+(stool|poop|diarrh|urine|pee)|\b(stool|poop|diarrh\w*|urine|pee)\b[^.]*\bblood/i, reason: 'Blood in stool or urine' },
  { level: 'soon', re: /\b(not|hasn'?t|won'?t|refus\w+ to|stopped)\s+(eat|eaten|eating|drink|drinking)\b[^.]*\b(day|days|24|48)/i, reason: 'Not eating or drinking for a day or more' },
  { level: 'soon', re: /\b(lethargic|very weak|limp|can'?t stand|won'?t stand|wobbl)/i, reason: 'Lethargy or weakness' },
  { level: 'soon', re: /\b(limping|won'?t put weight|not bearing weight|broken leg|fracture)/i, reason: 'Lameness or possible fracture' },
  { level: 'soon', re: /\b(yellow (gums|eyes|skin)|jaundice)/i, reason: 'Jaundice' },
  { level: 'soon', re: /\b(diarrh\w+)\b[^.]*\b(days|week|won'?t stop|severe)/i, reason: 'Persistent diarrhea' },
  { level: 'soon', re: /\b(fever|temperature of (3[9]|4[0-9]|10[3-9]))/i, reason: 'Fever' },
  { level: 'soon', re: /\b(lump|mass|growth|tumou?r)\b/i, reason: 'New lump or growth' },
  { level: 'soon', re: /\b(pregnan|in labou?r|giving birth)\w*\b[^.]*\b(stuck|hours|struggl|bleed)/i, reason: 'Complicated labour' },
]);

/** Rules-based triage: returns { level, reason } for the most severe match, or null. */
export function triage(text) {
  const t = String(text || '');
  let best = null;
  for (const flag of RED_FLAGS) {
    if (!flag.re.test(t)) continue;
    if (!best || (flag.level === 'emergency' && best.level !== 'emergency')) best = { level: flag.level, reason: flag.reason };
  }
  return best;
}

// ------------------------------------------------------------------------------------------------
// Pet context
// ------------------------------------------------------------------------------------------------

export function ageFromBirthday(birthday, now = new Date()) {
  if (!birthday) return null;
  const b = new Date(birthday);
  if (Number.isNaN(b.getTime())) return null;
  let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth());
  if (now.getDate() < b.getDate()) months--;
  if (months < 0) return null;
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} old`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem ? `${years} year${years === 1 ? '' : 's'} ${rem} month${rem === 1 ? '' : 's'} old` : `${years} year${years === 1 ? '' : 's'} old`;
}

export function describePet(pet) {
  if (!pet) return '';
  const parts = [`Pet name: ${pet.name}`, `Species: ${pet.species}`];
  if (pet.breed) parts.push(`Breed: ${pet.breed}`);
  if (pet.sex && pet.sex !== 'unknown') parts.push(`Sex: ${pet.sex}`);
  const age = ageFromBirthday(pet.birthday);
  if (age) parts.push(`Age: ${age} (birthday ${new Date(pet.birthday).toISOString().slice(0, 10)})`);
  const w = pet.weight_kg ?? pet.weightKg;
  if (w) parts.push(`Weight: ${Number(w)} kg`);
  if (pet.notes) parts.push(`Owner notes (allergies, meds, quirks): ${pet.notes}`);
  return parts.join('\n');
}

const SHOPPING_RE = /\b(food|kibble|treats?|toys?|chew|leash|harness|collar|bed|crate|litter|scratch|shampoo|brush|supplement|flea|tick|dewormer|recommend|product|buy|shop|order|bowl|feeder|carrier|coat|sweater|puzzle|dental|teeth|chews?)\b/i;
const PARTNER_RE = /\b(vet|veterinar|groomer|grooming|walker|dog walk|trainer|training class|sitter|boarding|daycare|near me|nearby|in my area|close to me)\b/i;

export function buildSystemPrompt({ user, pet, pets = [], location, catalog = [] } = {}) {
  const lines = [];
  lines.push(
    `You are the Pawtella pet assistant: a warm, concise and practical helper for cat and dog owners. Pawtella is a pet companion app with a community feed, an AI studio and a pet-supply shop with pickup and local delivery in Toronto and shipping across Canada and the US.`,
    '',
    'Voice: friendly and calm, plain language, short paragraphs or a few bullet points, no fluff. Answer the question first, then one or two practical next steps. Use the pet\'s name.',
    '',
    'Safety rules (always):',
    '- You are not a veterinarian. Never diagnose a condition as certain and never prescribe medication or give drug doses (not even over-the-counter). You may explain what a vet typically does.',
    '- Triage: if the message describes any red-flag sign (breathing trouble, bloat, seizure, collapse, trauma, suspected poisoning or toxic food such as chocolate, xylitol, grapes, onions, lilies, human painkillers; straining to pee; pale/blue gums; heavy bleeding; heat stroke; eye injury) set vetAlert.level = "emergency" and tell the owner to contact a vet or emergency clinic now. For worrying-but-not-immediate signs (repeated vomiting, blood in stool/urine, not eating or drinking for 24h+, lethargy, limping, jaundice, persistent diarrhea, fever, a new lump) set vetAlert.level = "soon" (see a vet within 24 to 48 hours). Otherwise leave vetAlert null.',
    '- Be honest when something is unknown; do not invent facts about the pet.',
    '',
    'Products: suggest at most 3 products and ONLY from the catalog candidates listed below (use their exact handles). If no candidates are listed or none fit, return an empty productSuggestions array. Do not invent products.',
    '',
    'Partners: when the owner asks for a nearby vet, groomer, walker, trainer or similar service, call the find_partners tool (once) and summarise the results in your text. Do not call it otherwise.',
    '',
    'Profile updates: if the owner states a new fact about the pet (current weight, birthday/age, allergies), put it in petProfileUpdates so they can accept it: weightKg as a number in kilograms (convert pounds: 1 lb = 0.4536 kg), birthday as YYYY-MM-DD, allergies as a short string. Leave fields you did not learn as null and petProfileUpdates null when nothing new.',
    '',
    'Output: respond ONLY with a JSON object matching this shape, no prose outside it:',
    '{"text": string, "vetAlert": {"level": "emergency"|"soon", "reason": string} | null, "productSuggestions": [{"handle": string, "title": string, "reason": string}], "petProfileUpdates": {"weightKg": number|null, "birthday": string|null, "allergies": string|null} | null}',
  );
  if (user) {
    lines.push('', `Owner: ${user.display_name || user.displayName || user.handle || 'a Pawtella member'}${user.country ? ` (${user.country})` : ''}.`);
  }
  if (pet) lines.push('', 'The pet this conversation is about:', describePet(pet));
  const others = (pets || []).filter((p) => !pet || p.id !== pet.id);
  if (others.length) {
    lines.push('', 'Other pets in the household:', ...others.map((p) => `- ${p.name} (${p.species}${p.breed ? ', ' + p.breed : ''}${ageFromBirthday(p.birthday) ? ', ' + ageFromBirthday(p.birthday) : ''})`));
  }
  if (location?.lat && location?.lng) lines.push('', `Owner location: lat ${Number(location.lat).toFixed(3)}, lng ${Number(location.lng).toFixed(3)}${location.label ? ` (${location.label})` : ''}.`);
  if (catalog.length) {
    lines.push('', 'Catalog candidates (handle — title — price):', ...catalog.map((p) => `- ${p.handle} — ${p.title} — $${(p.priceCents / 100).toFixed(2)}${p.tags?.length ? ` [${p.tags.slice(0, 4).join(', ')}]` : ''}`));
  }
  lines.push('', `Today's date: ${new Date().toISOString().slice(0, 10)}.`);
  return lines.join('\n');
}

// ------------------------------------------------------------------------------------------------
// Tools
// ------------------------------------------------------------------------------------------------

export const TOOLS = [
  {
    name: 'find_partners',
    description: 'Search the Pawtella partner directory (approved local vets, groomers, walkers, trainers, sitters) near the owner. Returns up to 5 partners sorted by distance.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Service type: vet, groomer, walker, trainer, sitter, daycare, other, or "any"' },
        query: { type: 'string', description: 'Free-text filter (name, neighbourhood, speciality) or empty string' },
      },
      required: ['type', 'query'],
      additionalProperties: false,
    },
  },
];

export const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    vetAlert: {
      anyOf: [
        { type: 'object', properties: { level: { type: 'string', enum: ['emergency', 'soon'] }, reason: { type: 'string' } } },
        { type: 'null' },
      ],
    },
    productSuggestions: {
      type: 'array',
      items: { type: 'object', properties: { handle: { type: 'string' }, title: { type: 'string' }, reason: { type: 'string' } } },
    },
    petProfileUpdates: {
      anyOf: [
        {
          type: 'object',
          properties: {
            weightKg: { anyOf: [{ type: 'number' }, { type: 'null' }] },
            birthday: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            allergies: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          },
        },
        { type: 'null' },
      ],
    },
  },
};

export async function findPartners({ type, query, location } = {}) {
  if (typeof partners.searchPartners !== 'function') return [];
  try {
    const rows = await partners.searchPartners({
      lat: location?.lat,
      lng: location?.lng,
      type: type && type !== 'any' ? type : undefined,
      q: query || undefined,
      limit: 5,
    });
    return (rows || []).slice(0, 5).map((p) => ({
      id: p.id,
      name: p.business_name ?? p.businessName ?? p.name,
      type: p.type,
      city: p.city,
      distanceKm: p.distance_km ?? p.distanceKm ?? null,
      rating: p.rating_avg ?? p.rating ?? null,
      phone: p.phone ?? null,
      website: p.website ?? null,
    }));
  } catch (err) {
    console.error('[ai-assistant] find_partners failed', { error: err.message });
    return [];
  }
}

async function catalogCandidates(message) {
  if (!SHOPPING_RE.test(message) || typeof shopify.getProducts !== 'function') return [];
  try {
    const query = String(message).replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && SHOPPING_RE.test(w)).slice(0, 3).join(' ');
    const { products = [] } = (await shopify.getProducts({ query: query || undefined, first: 6 })) || {};
    return products.slice(0, 6).map((p) => ({ handle: p.handle, title: p.title, priceCents: p.priceCents, tags: p.tags || [] }));
  } catch (err) {
    console.error('[ai-assistant] catalog lookup failed', { error: err.message });
    return [];
  }
}

// ------------------------------------------------------------------------------------------------
// Mock helpers (deterministic extraction so the flow is testable offline)
// ------------------------------------------------------------------------------------------------

export function extractProfileUpdates(text) {
  const t = String(text || '');
  const out = {};
  const w = /(\d+(?:\.\d+)?)\s*(kg|kilos?|kilograms?|lbs?|pounds?)\b/i.exec(t);
  if (w && /weigh|weight|kg|lb|pound/i.test(t)) {
    const n = parseFloat(w[1]);
    out.weightKg = /lb|pound/i.test(w[2]) ? Math.round(n * 0.4536 * 10) / 10 : n;
  }
  const b = /\b(?:born|birthday)(?: is| was| on)?\s+(\d{4}-\d{2}-\d{2})/i.exec(t);
  if (b) out.birthday = b[1];
  const a = /allergic to ([^.,;!?\n]+)/i.exec(t);
  if (a) out.allergies = a[1].trim();
  return Object.keys(out).length ? out : null;
}

// ------------------------------------------------------------------------------------------------
// reply()
// ------------------------------------------------------------------------------------------------

function userContent(message, imageUrl) {
  const blocks = [];
  if (imageUrl) blocks.push({ type: 'image', url: imageUrl });
  blocks.push({ type: 'text', text: message });
  return blocks;
}

/** Normalise whatever the model returned into the envelope. */
export function normalizeEnvelope(obj, fallbackText) {
  const o = obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  const env_ = { text: typeof o.text === 'string' && o.text.trim() ? o.text.trim() : fallbackText || '' };
  const va = o.vetAlert || o.vet_alert;
  if (va && ['emergency', 'soon'].includes(va.level)) env_.vetAlert = { level: va.level, reason: String(va.reason || '') };
  const ps = o.productSuggestions || o.product_suggestions;
  if (Array.isArray(ps) && ps.length) {
    env_.productSuggestions = ps
      .filter((p) => p && p.handle)
      .slice(0, 3)
      .map((p) => ({ handle: String(p.handle), title: String(p.title || p.handle), reason: String(p.reason || '') }));
  }
  const pu = o.petProfileUpdates || o.pet_profile_updates;
  if (pu && typeof pu === 'object') {
    const clean = {};
    const w = pu.weightKg ?? pu.weight_kg;
    if (typeof w === 'number' && w > 0 && w < 150) clean.weightKg = w;
    if (typeof pu.birthday === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(pu.birthday)) clean.birthday = pu.birthday;
    if (typeof pu.allergies === 'string' && pu.allergies.trim()) clean.allergies = pu.allergies.trim();
    if (Object.keys(clean).length) env_.petProfileUpdates = clean;
  }
  const pr = o.partnerResults || o.partner_results;
  if (Array.isArray(pr) && pr.length) env_.partnerResults = pr;
  return env_;
}

/**
 * Produce the assistant reply for one user turn.
 * `history` is [{ role, content }] in our internal block format (assistant turns may be envelope objects).
 */
export async function reply({ user, pet, pets = [], history = [], message, imageUrl, location } = {}) {
  const catalog = await catalogCandidates(message);
  const system = buildSystemPrompt({ user, pet, pets, location, catalog });

  const messages = history.map((m) => ({
    role: m.role,
    content: m.role === 'assistant' && m.content && typeof m.content === 'object' && !Array.isArray(m.content) ? JSON.stringify(m.content) : m.content,
  }));
  messages.push({ role: 'user', content: userContent(message, imageUrl) });

  let partnerResults;
  let result;
  let usage = { inputTokens: 0, outputTokens: 0 };
  let model = env.claude.chatModel;

  for (let i = 0; i < 3; i++) {
    result = await claude.chat({ system, messages, tools: TOOLS, outputSchema: REPLY_SCHEMA, maxTokens: 1500, model: env.claude.chatModel });
    usage = { inputTokens: usage.inputTokens + result.usage.inputTokens, outputTokens: usage.outputTokens + result.usage.outputTokens };
    model = result.model || model;
    if (!result.toolCalls?.length) break;
    messages.push({ role: 'assistant', content: result.content });
    const toolResults = [];
    for (const call of result.toolCalls) {
      let content;
      if (call.name === 'find_partners') {
        partnerResults = await findPartners({ ...call.input, location });
        content = JSON.stringify(partnerResults.length ? partnerResults : { results: [], note: 'No approved partners found nearby yet.' });
      } else {
        content = JSON.stringify({ error: `Unknown tool ${call.name}` });
      }
      toolResults.push({ type: 'tool_result', tool_use_id: call.id, content });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  const parsed = claude.extractJson(result?.text || '');
  const envelope = normalizeEnvelope(parsed, result?.text?.trim() || "I'm sorry, I couldn't come up with an answer just now. Please try again.");

  // Deterministic safety net: rules-based triage always wins when it is more severe.
  const rule = triage(message);
  if (rule && (!envelope.vetAlert || (rule.level === 'emergency' && envelope.vetAlert.level !== 'emergency'))) {
    envelope.vetAlert = rule;
    if (claude.isMock && !/vet/i.test(envelope.text)) {
      envelope.text = `${rule.level === 'emergency' ? 'Please contact a vet or emergency clinic right now.' : 'Please book a vet visit in the next day or two.'} ${envelope.text}`;
    }
  }

  // Mock mode: keep the flow realistic without a model.
  if (claude.isMock) {
    if (!envelope.productSuggestions && catalog.length) {
      envelope.productSuggestions = catalog.slice(0, 3).map((p) => ({ handle: p.handle, title: p.title, reason: `Popular pick for ${pet?.species || 'pets'} like ${pet?.name || 'yours'}` }));
    }
    if (!envelope.petProfileUpdates) {
      const upd = extractProfileUpdates(message);
      if (upd) envelope.petProfileUpdates = upd;
    }
    if (!partnerResults && PARTNER_RE.test(message)) {
      const type = /vet/i.test(message) ? 'vet' : /groom/i.test(message) ? 'groomer' : /walk/i.test(message) ? 'walker' : /train/i.test(message) ? 'trainer' : 'any';
      partnerResults = await findPartners({ type, query: '', location });
    }
  }

  // Only keep suggestions grounded in the catalog we showed the model.
  if (envelope.productSuggestions && catalog.length) {
    const allowed = new Set(catalog.map((p) => p.handle));
    envelope.productSuggestions = envelope.productSuggestions.filter((p) => allowed.has(p.handle));
    if (!envelope.productSuggestions.length) delete envelope.productSuggestions;
  } else if (envelope.productSuggestions && !catalog.length) {
    delete envelope.productSuggestions;
  }
  if (partnerResults) envelope.partnerResults = partnerResults;

  return { reply: envelope, usage, model };
}

export default { reply, buildSystemPrompt, triage, RED_FLAGS, TOOLS, REPLY_SCHEMA, ageFromBirthday, describePet, normalizeEnvelope, findPartners };
