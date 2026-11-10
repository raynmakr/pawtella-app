// "What Pawtella AI remembers": view, edit and delete the per-user AI context memory.
//   GET    /api/ai/memory                 → { enabled, healthSummary, facts, updatedAt }
//   PATCH  /api/ai/memory                 { enabled?, healthSummary? }
//   PATCH  /api/ai/memory/facts/:id       { value }   (empty value deletes the fact)
//   DELETE /api/ai/memory/facts/:id
//   DELETE /api/ai/memory                 → clear everything (facts + summary; keeps the toggle)
import { route, segments, body, badRequest, notFound } from '../../lib/http.js';
import { requireAuth } from '../../lib/auth.js';
import { camelize } from '../../lib/serialize.js';
import {
  getMemory,
  setEnabled,
  setHealthConsent,
  setHealthSummary,
  updateFact,
  deleteFact,
  clearMemory,
} from '../../lib/ai-memory.js';

const BASE = '/api/ai/memory';

function serialize(mem) {
  return { ...mem, facts: mem.facts.map(camelize) };
}

function factId(seg) {
  if (seg[0] !== 'facts' || seg.length !== 2) throw notFound();
  const id = parseInt(seg[1], 10);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Invalid fact id');
  return id;
}

export default route({
  GET: async (req) => {
    const { userId } = await requireAuth(req);
    const seg = segments(req, BASE);
    if (seg.length) throw notFound();
    return serialize(await getMemory(userId));
  },

  PATCH: async (req) => {
    const { userId } = await requireAuth(req);
    const seg = segments(req, BASE);
    const b = body(req);
    if (seg.length === 0) {
      if (typeof b.enabled === 'boolean') await setEnabled(userId, b.enabled);
      if (typeof b.healthConsent === 'boolean') await setHealthConsent(userId, b.healthConsent);
      if (b.healthSummary !== undefined) await setHealthSummary(userId, typeof b.healthSummary === 'string' ? b.healthSummary : null);
      return serialize(await getMemory(userId));
    }
    const id = factId(seg);
    if (typeof b.value !== 'string') throw badRequest('value is required');
    const result = await updateFact(userId, id, b.value);
    if (!result.updated && !result.deleted) throw notFound('Fact not found');
    return serialize(await getMemory(userId));
  },

  DELETE: async (req) => {
    const { userId } = await requireAuth(req);
    const seg = segments(req, BASE);
    if (seg.length === 0) {
      await clearMemory(userId);
      return serialize(await getMemory(userId));
    }
    const id = factId(seg);
    const result = await deleteFact(userId, id);
    if (!result.deleted) throw notFound('Fact not found');
    return serialize(await getMemory(userId));
  },
});
