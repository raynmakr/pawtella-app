// Per-user AI context memory. After a conversation, a background job extracts a structured profile
// (owner traits, per-pet profiles, health-advice summary, third-party vendors) and stores it as
// deduped, user-editable facts. A compact, token-budgeted version is injected into future prompts.
// Order history is computed from the orders tables at prompt time, never duplicated here.
//
// Privacy (Canada / PIPEDA): never stores payment data or passwords — the extraction prompt forbids
// it and a guard scrubs obvious payment/credential patterns. Respects the per-user enable toggle.
// Owner: Backend B. Contract additions documented in docs/CONVENTIONS.md.
import { query, one, many, withTransaction } from './db.js';
import * as claude from './claude.js';
import { env } from './env.js';

export const isMock = claude.isMock;

const OWNER_FIELDS = ['tone', 'preferences', 'budgetSensitivity', 'household', 'locationCity'];
const PET_FIELDS = ['personality', 'diet', 'allergies', 'conditions', 'meds', 'vetNotes', 'likes', 'dislikes'];
const MAX_FACT_CHARS = 600;
const MAX_SUMMARY_CHARS = 600;

const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };

export const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    owner: {
      type: 'object',
      properties: {
        tone: nullableString,
        preferences: nullableString,
        budgetSensitivity: nullableString,
        household: nullableString,
        locationCity: nullableString,
      },
    },
    pets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          personality: nullableString,
          diet: nullableString,
          allergies: nullableString,
          conditions: nullableString,
          meds: nullableString,
          vetNotes: nullableString,
          likes: nullableString,
          dislikes: nullableString,
        },
      },
    },
    vendors: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, type: nullableString, notes: nullableString },
      },
    },
    healthSummary: nullableString,
  },
};

// Never persist obvious payment data or credentials, even if the model slips it in.
const PAYMENT_RE = /(?:\d[ -]?){13,19}|\bcvv\b|\bcvc\b|card number|credit card|\bexpiry\b|password|passcode|\bpin\b/i;
function looksLikePayment(text) {
  return PAYMENT_RE.test(String(text || ''));
}

function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

function label(key) {
  return String(key || '').replace(/([A-Z])/g, ' $1').replace(/[._-]+/g, ' ').toLowerCase().trim();
}

// ------------------------------------------------------------------------------------------------
// Reads
// ------------------------------------------------------------------------------------------------

export async function getMemoryRow(userId) {
  return one('SELECT * FROM ai_user_memory WHERE user_id = $1', [userId]);
}

export async function isEnabled(userId) {
  const row = await getMemoryRow(userId);
  return row ? row.enabled !== false : true; // default on until the user turns it off
}

/** Full memory for the settings screen: toggle, health summary and every individual fact. */
export async function getMemory(userId) {
  const [row, facts] = await Promise.all([
    getMemoryRow(userId),
    many(
      `SELECT id, pet_id, category, fact_key, fact_value, source_conversation_id, updated_at
         FROM ai_user_facts WHERE user_id = $1 ORDER BY category, fact_key`,
      [userId],
    ),
  ]);
  return {
    enabled: row ? row.enabled !== false : true,
    healthSummary: row?.health_summary ?? null,
    updatedAt: row?.updated_at ?? null,
    facts,
  };
}

/** Distinct product titles the user has bought, newest first. Computed, never stored. */
async function recentOrderTitles(userId, limit = 8) {
  try {
    const row = await one(
      `SELECT COALESCE(json_agg(t.title), '[]'::json) AS titles FROM (
         SELECT DISTINCT ON (x->>'handle') x->>'title' AS title, MAX(o.placed_at) AS placed_at
           FROM shop_orders o, jsonb_array_elements(o.line_items) x
          WHERE o.user_id = $1 AND COALESCE(x->>'title', '') <> ''
          GROUP BY x->>'handle', x->>'title'
          ORDER BY x->>'handle', placed_at DESC
       ) t`,
      [userId],
    );
    return (row?.titles || []).filter(Boolean).slice(0, limit);
  } catch (err) {
    console.warn('[ai-memory] order summary failed', { userId, error: err?.message });
    return [];
  }
}

/**
 * Compact, token-budgeted context block for the assistant system prompt. Returns '' when memory is
 * off or empty. Includes computed order history. `maxChars` caps the total size.
 */
export async function buildMemoryContext(userId, { pets = [], maxChars = 1200 } = {}) {
  const row = await getMemoryRow(userId);
  if (row && row.enabled === false) return '';
  const [facts, orderTitles] = await Promise.all([
    many('SELECT pet_id, category, fact_key, fact_value FROM ai_user_facts WHERE user_id = $1 ORDER BY category, fact_key', [userId]),
    recentOrderTitles(userId),
  ]);
  const healthSummary = row?.health_summary || '';
  if (!facts.length && !healthSummary && !orderTitles.length) return '';

  const petNameById = new Map((pets || []).map((p) => [p.id, p.name]));
  const owner = [];
  const petLines = [];
  const vendors = [];
  const health = [];
  for (const f of facts) {
    if (f.category === 'owner') owner.push(`${label(f.fact_key)}: ${f.fact_value}`);
    else if (f.category === 'pet') {
      const [nameSlug, field] = String(f.fact_key).split('.');
      const name = (f.pet_id && petNameById.get(f.pet_id)) || nameSlug;
      petLines.push(`${name} ${label(field)}: ${f.fact_value}`);
    } else if (f.category === 'vendor') vendors.push(f.fact_value);
    else if (f.category === 'health') health.push(f.fact_value);
  }

  const lines = ['Context remembered from past chats (may be out of date — always defer to what the owner says now):'];
  if (owner.length) lines.push(`- Owner: ${owner.join('; ')}`);
  if (petLines.length) lines.push(`- Pets: ${petLines.join('; ')}`);
  if (vendors.length) lines.push(`- Their vendors/services: ${vendors.join('; ')}`);
  if (healthSummary) lines.push(`- Health history: ${healthSummary}`);
  if (health.length) lines.push(`- Health notes: ${health.join('; ')}`);
  if (orderTitles.length) lines.push(`- Recently ordered: ${orderTitles.join(', ')}`);
  let text = lines.join('\n');
  if (text.length > maxChars) text = `${text.slice(0, maxChars - 1)}…`;
  return text;
}

// ------------------------------------------------------------------------------------------------
// Extraction + storage
// ------------------------------------------------------------------------------------------------

function conversationTranscript(messages, maxChars = 8000) {
  const parts = [];
  for (const m of messages || []) {
    if (m.role === 'user') {
      const c = m.content;
      const text = Array.isArray(c) ? c.filter((b) => b?.type === 'text').map((b) => b.text).join(' ') : typeof c === 'string' ? c : '';
      if (text.trim()) parts.push(`User: ${text.trim()}`);
    } else if (m.role === 'assistant') {
      const t = (m.content && typeof m.content === 'object' && !Array.isArray(m.content)) ? (m.content.text ?? '') : typeof m.content === 'string' ? m.content : '';
      if (t.trim()) parts.push(`Assistant: ${t.trim()}`);
    }
  }
  const joined = parts.join('\n');
  return joined.length > maxChars ? joined.slice(-maxChars) : joined;
}

function extractionSystem({ pets, existingSummary }) {
  return [
    'You maintain a long-term memory profile for a Pawtella pet-care user so the assistant can be more helpful next time.',
    'From the transcript, extract only durable, useful facts the user stated or clearly implied. Ignore one-off small talk and anything you are unsure about.',
    'NEVER record payment details, card numbers, bank info, passwords, PINs or any credential. If such data appears, omit it entirely.',
    'Owner: communication tone, shopping preferences, budget sensitivity, household makeup, and city-level location only (never a street address).',
    'Pets: for each pet named, capture durable traits — personality, diet, allergies, medical conditions, medications, vet notes, likes and dislikes.',
    'Vendors: third-party services the user mentions (vets, groomers, walkers, trainers, other stores) with a type and a short note.',
    existingSummary
      ? `Health summary: update this running summary of health-advice questions and outcomes with anything new, keeping it under ${MAX_SUMMARY_CHARS} characters:\n${existingSummary}`
      : `Health summary: write a short (under ${MAX_SUMMARY_CHARS} characters) summary of any health-advice questions discussed and their outcomes, or null if none.`,
    pets?.length ? `The user's pets on file: ${pets.map((p) => p.name).join(', ')}.` : '',
    'Leave any field null when the transcript does not establish it. Do not invent facts.',
  ].filter(Boolean).join('\n');
}

/** Run the model extraction for one conversation. Returns the validated object (or null). */
export async function extractProfile({ messages, pets, existingSummary } = {}) {
  const transcript = conversationTranscript(messages);
  if (!transcript.trim()) return null;
  const system = extractionSystem({ pets, existingSummary });
  const result = await claude.json({ system, prompt: transcript, schema: EXTRACTION_SCHEMA, model: env.claude.fastModel, maxTokens: 1200 });
  return result && typeof result === 'object' ? result : null;
}

async function upsertFact(tx, { userId, petId = null, category, key, value, conversationId }) {
  const v = typeof value === 'string' ? value.trim().slice(0, MAX_FACT_CHARS) : '';
  if (!v) return;
  if (looksLikePayment(v) || looksLikePayment(key)) return; // privacy guard
  const existing = await tx.one(
    `SELECT id FROM ai_user_facts WHERE user_id = $1 AND category = $2 AND fact_key = $3 AND pet_id IS NOT DISTINCT FROM $4`,
    [userId, category, key, petId],
  );
  if (existing) {
    await tx.query('UPDATE ai_user_facts SET fact_value = $2, source_conversation_id = $3 WHERE id = $1', [existing.id, v, conversationId ?? null]);
  } else {
    await tx.query(
      `INSERT INTO ai_user_facts (user_id, pet_id, category, fact_key, fact_value, source_conversation_id) VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, petId, category, key, v, conversationId ?? null],
    );
  }
}

/** Persist a validated extraction: dedupe/update facts and refresh the health summary. */
export async function storeExtraction({ userId, conversationId, extracted, pets = [] }) {
  if (!extracted) return;
  const petByName = new Map((pets || []).map((p) => [String(p.name || '').toLowerCase(), p]));
  await withTransaction(async (tx) => {
    const owner = extracted.owner && typeof extracted.owner === 'object' ? extracted.owner : {};
    for (const field of OWNER_FIELDS) {
      await upsertFact(tx, { userId, category: 'owner', key: field, value: owner[field], conversationId });
    }
    for (const pet of Array.isArray(extracted.pets) ? extracted.pets : []) {
      if (!pet?.name) continue;
      const matched = petByName.get(String(pet.name).toLowerCase());
      const nameSlug = slug(pet.name);
      if (!nameSlug) continue;
      for (const field of PET_FIELDS) {
        await upsertFact(tx, { userId, petId: matched?.id ?? null, category: 'pet', key: `${nameSlug}.${field}`, value: pet[field], conversationId });
      }
    }
    for (const vendor of Array.isArray(extracted.vendors) ? extracted.vendors : []) {
      if (!vendor?.name) continue;
      const key = slug(vendor.name);
      if (!key) continue;
      const suffix = [vendor.type ? `(${vendor.type})` : '', vendor.notes || ''].filter(Boolean).join(' ').trim();
      await upsertFact(tx, { userId, category: 'vendor', key, value: suffix ? `${vendor.name} ${suffix}` : vendor.name, conversationId });
    }
    const healthSummary = typeof extracted.healthSummary === 'string' && !looksLikePayment(extracted.healthSummary)
      ? extracted.healthSummary.trim().slice(0, MAX_SUMMARY_CHARS)
      : '';
    await tx.query(
      `INSERT INTO ai_user_memory (user_id, health_summary, last_conversation_id)
         VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         health_summary = COALESCE(NULLIF(EXCLUDED.health_summary, ''), ai_user_memory.health_summary),
         last_conversation_id = EXCLUDED.last_conversation_id`,
      [userId, healthSummary || null, conversationId ?? null],
    );
  });
}

async function markExtracted(conversationId) {
  await query('UPDATE ai_conversations SET memory_extracted_at = now() WHERE id = $1', [conversationId]);
}

/** Extract + store for one conversation, honoring the user's memory toggle. */
export async function extractForConversation(conversationId) {
  const conv = await one('SELECT id, user_id FROM ai_conversations WHERE id = $1', [conversationId]);
  if (!conv) return { skipped: 'missing' };
  if (!(await isEnabled(conv.user_id))) {
    await markExtracted(conversationId);
    return { skipped: 'disabled' };
  }
  const [messages, pets, row] = await Promise.all([
    many('SELECT role, content FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at ASC, id ASC LIMIT 100', [conversationId]),
    many('SELECT id, name FROM pets WHERE user_id = $1', [conv.user_id]),
    getMemoryRow(conv.user_id),
  ]);
  const extracted = await extractProfile({ messages, pets, existingSummary: row?.health_summary });
  if (extracted) await storeExtraction({ userId: conv.user_id, conversationId, extracted, pets });
  await markExtracted(conversationId);
  return { ok: true };
}

/** Cron entry point: process conversations with new activity for memory-enabled users. */
export async function runMemoryExtraction({ limit = 25 } = {}) {
  const rows = await many(
    `SELECT c.id FROM ai_conversations c
       LEFT JOIN ai_user_memory m ON m.user_id = c.user_id
      WHERE (c.memory_extracted_at IS NULL OR c.updated_at > c.memory_extracted_at)
        AND COALESCE(m.enabled, true) = true
        AND EXISTS (SELECT 1 FROM ai_messages am WHERE am.conversation_id = c.id AND am.role = 'assistant')
      ORDER BY c.updated_at ASC
      LIMIT $1`,
    [limit],
  );
  let processed = 0;
  let errors = 0;
  for (const r of rows) {
    try {
      await extractForConversation(r.id);
      processed += 1;
    } catch (err) {
      errors += 1;
      console.error('[ai-memory] extraction failed', { conversationId: r.id, error: err?.message });
      // Leave memory_extracted_at unset so a transient failure retries on the next run.
    }
  }
  return { candidates: rows.length, processed, errors };
}

// ------------------------------------------------------------------------------------------------
// Settings mutations (the "What Pawtella AI remembers" screen)
// ------------------------------------------------------------------------------------------------

export async function setEnabled(userId, enabled) {
  await query(
    `INSERT INTO ai_user_memory (user_id, enabled) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET enabled = EXCLUDED.enabled`,
    [userId, !!enabled],
  );
  return getMemory(userId);
}

export async function setHealthSummary(userId, summary) {
  const value = typeof summary === 'string' && summary.trim() && !looksLikePayment(summary) ? summary.trim().slice(0, MAX_SUMMARY_CHARS) : null;
  await query(
    `INSERT INTO ai_user_memory (user_id, health_summary) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET health_summary = EXCLUDED.health_summary`,
    [userId, value],
  );
  return getMemory(userId);
}

export async function updateFact(userId, factId, value) {
  const v = typeof value === 'string' ? value.trim().slice(0, MAX_FACT_CHARS) : '';
  if (!v) return deleteFact(userId, factId);
  if (looksLikePayment(v)) return { updated: false };
  const row = await one('UPDATE ai_user_facts SET fact_value = $3 WHERE id = $1 AND user_id = $2 RETURNING id', [factId, userId, v]);
  return { updated: !!row };
}

export async function deleteFact(userId, factId) {
  const row = await one('DELETE FROM ai_user_facts WHERE id = $1 AND user_id = $2 RETURNING id', [factId, userId]);
  return { deleted: !!row };
}

/** Clear everything the AI remembers (facts + health summary); leaves the toggle as-is. */
export async function clearMemory(userId) {
  await withTransaction(async (tx) => {
    await tx.query('DELETE FROM ai_user_facts WHERE user_id = $1', [userId]);
    await tx.query('UPDATE ai_user_memory SET health_summary = NULL, last_conversation_id = NULL WHERE user_id = $1', [userId]);
  });
  return { cleared: true };
}

/** Hard-delete all memory for a user (used by account deletion, since the user row is anonymized, not removed). */
export async function purgeMemory(userId, tx) {
  const run = tx ? tx.query.bind(tx) : query;
  await run('DELETE FROM ai_user_facts WHERE user_id = $1', [userId]);
  await run('DELETE FROM ai_user_memory WHERE user_id = $1', [userId]);
}

export default {
  isMock,
  EXTRACTION_SCHEMA,
  getMemory,
  getMemoryRow,
  isEnabled,
  buildMemoryContext,
  extractProfile,
  storeExtraction,
  extractForConversation,
  runMemoryExtraction,
  setEnabled,
  setHealthSummary,
  updateFact,
  deleteFact,
  clearMemory,
  purgeMemory,
};
