// Claude (Anthropic Messages API) wrapper via the official SDK. Mock mode when ANTHROPIC_API_KEY
// is missing: deterministic text and schema-shaped JSON so every flow is testable offline.
// Owner: Backend B. Contract in docs/CONVENTIONS.md.
//
// Message content accepted by chat(): a plain string, or an array of our internal blocks
//   { type: 'text', text } | { type: 'image', url }  (data: URLs are sent as base64 sources)
// plus raw Anthropic blocks (tool_use / tool_result / image with `source`) passed through.
import Anthropic from '@anthropic-ai/sdk';
import { env, flags } from './env.js';

export const isMock = !flags.hasClaude;

let client;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: env.claude.apiKey, maxRetries: 2, timeout: 60_000 });
  return client;
}

if (isMock) console.log('[claude] ANTHROPIC_API_KEY missing: running in mock mode');

// ------------------------------------------------------------------------------------------------
// Content conversion
// ------------------------------------------------------------------------------------------------

function imageBlockFromUrl(url) {
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(url || '');
  if (m) return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2].replace(/\s+/g, '') } };
  return { type: 'image', source: { type: 'url', url } };
}

function toApiContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return String(content ?? '');
  return content
    .map((b) => {
      if (!b || typeof b !== 'object') return { type: 'text', text: String(b ?? '') };
      if (b.type === 'image' && b.url && !b.source) return imageBlockFromUrl(b.url);
      return b;
    })
    .filter((b) => !(b.type === 'text' && !b.text));
}

function toApiMessages(messages) {
  const out = [];
  for (const m of messages || []) {
    if (!m || !m.role) continue;
    const content = toApiContent(m.content);
    if (Array.isArray(content) && content.length === 0) continue;
    if (typeof content === 'string' && !content.trim()) continue;
    out.push({ role: m.role, content });
  }
  // The API requires the first message to be from the user.
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

/** Make a JSON schema acceptable to structured outputs: additionalProperties:false + required on every object. */
export function strictSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(strictSchema);
  const out = { ...schema };
  if (out.type === 'object' || out.properties) {
    out.type = out.type || 'object';
    out.properties = Object.fromEntries(Object.entries(out.properties || {}).map(([k, v]) => [k, strictSchema(v)]));
    out.additionalProperties = false;
    out.required = Object.keys(out.properties);
  }
  if (out.items) out.items = strictSchema(out.items);
  for (const key of ['anyOf', 'oneOf', 'allOf']) if (out[key]) out[key] = out[key].map(strictSchema);
  return out;
}

// ------------------------------------------------------------------------------------------------
// chat()
// ------------------------------------------------------------------------------------------------

/**
 * One Messages API round trip.
 * @returns {{ text: string, toolCalls: Array<{id,name,input}>, usage: {inputTokens, outputTokens}, stopReason, raw? }}
 * `temperature` is accepted for API compatibility but not sent (removed in API version 2026-10-21).
 * `outputSchema` (JSON schema) turns on structured outputs for the text reply.
 */
export async function chat({ system, messages, model, maxTokens = 1024, temperature, tools, toolChoice, outputSchema, effort } = {}) {
  void temperature;
  const useModel = model || env.claude.chatModel;
  if (isMock) return mockChat({ system, messages, tools, outputSchema });

  const params = {
    model: useModel,
    max_tokens: maxTokens,
    messages: toApiMessages(messages),
  };
  if (system) params.system = system;
  if (tools?.length) {
    params.tools = tools;
    params.tool_choice = toolChoice || { type: 'auto' };
  }
  const outputConfig = {};
  if (effort) outputConfig.effort = effort;
  if (outputSchema) outputConfig.format = { type: 'json_schema', schema: strictSchema(outputSchema) };
  if (Object.keys(outputConfig).length) params.output_config = outputConfig;

  let response;
  try {
    response = await getClient().messages.create(params);
  } catch (err) {
    // Some model/tool combinations reject structured output together with tools: retry without the format.
    if (err instanceof Anthropic.BadRequestError && params.output_config?.format && params.tools) {
      console.warn('[claude] retrying without output format', { error: err.message });
      delete params.output_config.format;
      if (!Object.keys(params.output_config).length) delete params.output_config;
      response = await getClient().messages.create(params);
    } else {
      logApiError(err);
      throw err;
    }
  }
  return normalize(response);
}

function logApiError(err) {
  if (err instanceof Anthropic.RateLimitError) console.error('[claude] rate limited');
  else if (err instanceof Anthropic.AuthenticationError) console.error('[claude] invalid API key');
  else if (err instanceof Anthropic.APIError) console.error('[claude] API error', { status: err.status, message: err.message });
  else console.error('[claude] request failed', { message: err?.message });
}

function normalize(response) {
  let text = '';
  const toolCalls = [];
  for (const block of response.content || []) {
    if (block.type === 'text') text += block.text;
    else if (block.type === 'tool_use') toolCalls.push({ id: block.id, name: block.name, input: block.input });
  }
  if (response.stop_reason === 'refusal') {
    console.warn('[claude] refusal', { category: response.stop_details?.category });
  }
  return {
    text,
    toolCalls,
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    },
    stopReason: response.stop_reason,
    model: response.model,
    content: response.content,
  };
}

// ------------------------------------------------------------------------------------------------
// json()
// ------------------------------------------------------------------------------------------------

/** Robustly pull the first JSON object/array out of free text (handles ```json fences). */
export function extractJson(text) {
  if (text === null || text === undefined) return null;
  if (typeof text === 'object') return text;
  let s = String(text).trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  if (fence) s = fence[1].trim();
  try {
    return JSON.parse(s);
  } catch {
    /* fall through */
  }
  const starts = [s.indexOf('{'), s.indexOf('[')].filter((i) => i >= 0);
  if (!starts.length) return null;
  const start = Math.min(...starts);
  const open = s[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(s.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Ask for JSON. With `schema`, structured outputs guarantee the shape; otherwise the prompt asks
 * for JSON and we extract it. Returns the parsed object (never a string).
 */
export async function json({ system, prompt, schema, model, maxTokens = 1024, messages } = {}) {
  const sys = [system, schema ? null : 'Respond with a single JSON object and nothing else: no prose, no code fences.']
    .filter(Boolean)
    .join('\n\n');
  const msgs = messages || [{ role: 'user', content: prompt }];
  const result = await chat({ system: sys, messages: msgs, model: model || env.claude.fastModel, maxTokens, outputSchema: schema });
  const parsed = extractJson(result.text);
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error('Claude did not return valid JSON');
  }
  return parsed;
}

// ------------------------------------------------------------------------------------------------
// Mock mode
// ------------------------------------------------------------------------------------------------

function lastUserText(messages) {
  for (let i = (messages || []).length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'user') continue;
    if (typeof m.content === 'string') return m.content;
    if (Array.isArray(m.content)) {
      const texts = m.content.filter((b) => b.type === 'text').map((b) => b.text);
      if (texts.length) return texts.join('\n');
    }
  }
  return '';
}

function hasImage(messages) {
  return (messages || []).some((m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'image'));
}

function hash(s) {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

const MOCK_TIPS = [
  'Keep fresh water available and watch for any changes in appetite or energy over the next day or two.',
  'Short, positive training sessions (5 minutes, a few times a day) work far better than one long one.',
  'A gradual food switch over 7 to 10 days avoids most tummy upsets.',
  'Regular brushing cuts down on shedding and hairballs and doubles as a quick health check.',
];

function mockReplyText(prompt, system = '') {
  const p = String(prompt || '');
  const lower = p.toLowerCase();
  const pet = /pet(?:'s)? name[^\n]*?:\s*([A-Za-z][\w-]*)/i.exec(system)?.[1] || /\bname:\s*([A-Za-z][\w-]*)/i.exec(system)?.[1] || 'your pet';
  if (/vomit|blood|seizure|collapse|can'?t breathe|not breathing|poison|chocolate|xylitol|unconscious|bloat/.test(lower)) {
    return `This sounds like it could be serious. Please contact a vet or an emergency animal hospital right away rather than waiting. While you arrange that, keep ${pet} calm, warm and quiet, and don't give any food, water or medication unless the vet says so.`;
  }
  if (/food|feed|eat|kibble|diet|treat/.test(lower)) {
    return `Great question about feeding ${pet}. As a rule of thumb, split the daily amount on the bag into two meals, adjust by body condition rather than the label alone, and introduce any new food gradually over 7 to 10 days. ${MOCK_TIPS[2]}`;
  }
  if (/walk|exercise|play|energy|bored/.test(lower)) {
    return `${pet} will do best with a mix of physical and mental exercise: a couple of daily walks or play sessions plus a puzzle feeder or short training game. ${MOCK_TIPS[1]}`;
  }
  const tip = MOCK_TIPS[hash(p) % MOCK_TIPS.length];
  return `Here's what I'd suggest for ${pet}: ${tip} If anything seems off or gets worse, a quick call to your vet is always the safe move.`;
}

function mockCaptions(prompt) {
  const pet = /pet name[^\n]*?:\s*([A-Za-z][\w-]*)/i.exec(prompt)?.[1] || /named?\s+([A-Z][\w-]*)/.exec(prompt)?.[1] || 'This good boy';
  return [
    `${pet} woke up and chose chaos (adorable chaos). 🐾`,
    `Proof that ${pet} is the main character.`,
    `Zoomies: scheduled. Naps: mandatory. ${pet}: perfect.`,
  ];
}

function keywordQuery(prompt) {
  const stop = new Set(['the', 'a', 'an', 'for', 'my', 'me', 'some', 'something', 'i', 'need', 'want', 'to', 'and', 'of', 'with', 'please', 'find', 'buy', 'get', 'reorder', 'every', 'month', 'week', 'is', 'are']);
  return String(prompt || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !stop.has(w))
    .slice(0, 4)
    .join(' ');
}

/** Build a plausible object from a JSON schema and the prompt keywords. */
export function mockFromSchema(schema, context = {}) {
  const { prompt = '', system = '', key = '' } = context;
  if (!schema || typeof schema !== 'object') return null;
  if (schema.enum) return schema.enum[0];
  if (schema.const !== undefined) return schema.const;
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  switch (type) {
    case 'object': {
      const out = {};
      for (const [k, v] of Object.entries(schema.properties || {})) {
        if (/^(vetAlert|vet_alert|partnerResults|partner_results|petProfileUpdates|pet_profile_updates|productSuggestions|product_suggestions)$/.test(k)) {
          out[k] = v.type === 'array' ? [] : null;
          continue;
        }
        out[k] = mockFromSchema(v, { prompt, system, key: k });
      }
      return out;
    }
    case 'array': {
      if (/captions?/i.test(key)) return mockCaptions(prompt + '\n' + system);
      if (/handles?|products?/i.test(key)) {
        const handles = [...String(prompt).matchAll(/handle[:=]\s*([a-z0-9-]+)/gi)].map((m) => m[1]);
        return handles.slice(0, 3);
      }
      return [];
    }
    case 'boolean':
      return false;
    case 'integer':
    case 'number':
      return 0;
    case 'null':
      return null;
    case 'string':
    default: {
      if (/^(text|reply|answer|message|response)$/i.test(key)) return mockReplyText(prompt, system);
      if (/intent/i.test(key)) return /reorder|again|same/i.test(prompt) ? 'reorder' : /\?|how|what|why|should/i.test(prompt) ? 'question' : 'search';
      if (/query|search/i.test(key)) return keywordQuery(prompt.split('\n').pop());
      if (/title|name/i.test(key)) return 'Pawtella';
      if (/reason|summary|description/i.test(key)) return 'Mock suggestion based on your question.';
      if (/caption/i.test(key)) return mockCaptions(prompt)[0];
      return 'mock';
    }
  }
}

function mockChat({ system, messages, outputSchema }) {
  const prompt = lastUserText(messages);
  let text;
  if (outputSchema) {
    text = JSON.stringify(mockFromSchema(outputSchema, { prompt, system: system || '' }));
  } else if (/json/i.test(system || '')) {
    text = JSON.stringify({ text: mockReplyText(prompt, system), captions: mockCaptions(prompt), intent: 'search', query: keywordQuery(prompt) });
  } else {
    text = mockReplyText(prompt, system) + (hasImage(messages) ? ' (I looked at the photo you attached: a very photogenic pet.)' : '');
  }
  return {
    text,
    toolCalls: [],
    usage: { inputTokens: Math.ceil(String(prompt).length / 4) + 50, outputTokens: Math.ceil(text.length / 4) },
    stopReason: 'end_turn',
    model: 'mock',
    content: [{ type: 'text', text }],
  };
}

export default { isMock, chat, json, extractJson, strictSchema };
