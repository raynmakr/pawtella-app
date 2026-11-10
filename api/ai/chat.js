// Pet assistant: POST /api/ai/chat, GET /api/ai/chat (conversations), GET /api/ai/chat/:id (messages)
import { route, segments, body, badRequest, notFound, forbidden, pagination } from '../../lib/http.js';
import { one, many, withTransaction } from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { camelize } from '../../lib/serialize.js';
import { reply as assistantReply } from '../../lib/ai-assistant.js';
import { buildMemoryContext } from '../../lib/ai-memory.js';

const MAX_MESSAGE = 4000;
const HISTORY_TURNS = 20;

/** Stored assistant content is snake_case (see migration 003); API JSON is camelCase. */
function envelopeToRow(env_) {
  return {
    text: env_.text,
    vet_alert: env_.vetAlert ?? null,
    product_suggestions: env_.productSuggestions ?? [],
    pet_profile_updates: env_.petProfileUpdates ?? null,
    partner_results: env_.partnerResults ?? [],
  };
}

function toApiMessage(row) {
  const m = camelize(row);
  if (row.role === 'assistant' && row.content && typeof row.content === 'object' && !Array.isArray(row.content)) {
    const c = row.content;
    m.content = {
      text: c.text,
      vetAlert: c.vet_alert ?? c.vetAlert ?? null,
      productSuggestions: c.product_suggestions ?? c.productSuggestions ?? [],
      petProfileUpdates: c.pet_profile_updates ?? c.petProfileUpdates ?? null,
      partnerResults: c.partner_results ?? c.partnerResults ?? [],
    };
  }
  return m;
}

function historyFromRows(rows) {
  return rows.map((r) => ({
    role: r.role,
    content: r.role === 'assistant' ? { text: r.content?.text ?? '' } : r.content,
  }));
}

export default route({
  GET: async (req) => {
    const { userId } = await requireAuth(req);
    const [id] = segments(req, '/api/ai/chat');
    if (!id) {
      const { page, limit, offset } = pagination(req);
      const rows = await many(
        `SELECT c.*, p.name AS pet_name,
                (SELECT m.content->>'text' FROM ai_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_text
           FROM ai_conversations c LEFT JOIN pets p ON p.id = c.pet_id
          WHERE c.user_id = $1 ORDER BY c.updated_at DESC LIMIT $2 OFFSET $3`,
        [userId, limit + 1, offset],
      );
      return { conversations: rows.slice(0, limit).map(camelize), page, hasMore: rows.length > limit };
    }
    const conv = await one('SELECT * FROM ai_conversations WHERE id = $1', [parseInt(id, 10) || 0]);
    if (!conv) throw notFound('Conversation not found');
    if (conv.user_id !== userId) throw forbidden();
    const rows = await many('SELECT * FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at ASC, id ASC LIMIT 200', [conv.id]);
    return { conversation: camelize(conv), messages: rows.map(toApiMessage) };
  },

  POST: async (req) => {
    const { userId } = await requireAuth(req);
    const [first] = segments(req, '/api/ai/chat');
    if (first) throw notFound();
    const b = body(req);
    const message = typeof b.message === 'string' ? b.message.trim() : '';
    if (!message && !b.imageUrl) throw badRequest('message is required');
    if (message.length > MAX_MESSAGE) throw badRequest(`message is too long (max ${MAX_MESSAGE} characters)`);
    const imageUrl = typeof b.imageUrl === 'string' && /^(https?:\/\/|data:image\/)/i.test(b.imageUrl) ? b.imageUrl : null;
    const location = b.location && Number.isFinite(Number(b.location.lat)) && Number.isFinite(Number(b.location.lng))
      ? { lat: Number(b.location.lat), lng: Number(b.location.lng), label: typeof b.location.label === 'string' ? b.location.label.slice(0, 80) : undefined }
      : null;

    const user = await one('SELECT id, handle, display_name, country, lat, lng FROM users WHERE id = $1', [userId]);
    if (!user) throw notFound('User not found');
    const pets = await many('SELECT * FROM pets WHERE user_id = $1 ORDER BY is_primary DESC, id ASC', [userId]);

    let conv = null;
    if (b.conversationId) {
      conv = await one('SELECT * FROM ai_conversations WHERE id = $1', [parseInt(b.conversationId, 10) || 0]);
      if (!conv) throw notFound('Conversation not found');
      if (conv.user_id !== userId) throw forbidden();
    }
    let pet = null;
    const petId = b.petId ?? conv?.pet_id ?? null;
    if (petId) {
      pet = pets.find((p) => p.id === Number(petId)) || null;
      if (!pet) throw notFound('Pet not found');
    } else {
      pet = pets[0] || null;
    }
    if (!conv) {
      conv = await one(
        `INSERT INTO ai_conversations (user_id, pet_id, title) VALUES ($1, $2, $3) RETURNING *`,
        [userId, pet?.id ?? null, (message || 'Photo question').slice(0, 60)],
      );
    } else if (b.petId && conv.pet_id !== pet?.id) {
      await one('UPDATE ai_conversations SET pet_id = $2 WHERE id = $1 RETURNING id', [conv.id, pet?.id ?? null]);
    }

    const historyRows = await many(
      `SELECT role, content FROM (SELECT role, content, created_at, id FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2) h ORDER BY created_at ASC, id ASC`,
      [conv.id, HISTORY_TURNS],
    );

    const userContent = [];
    if (imageUrl) userContent.push({ type: 'image', url: imageUrl });
    if (message) userContent.push({ type: 'text', text: message });

    // Inject the user's remembered context (never blocks the reply if it fails).
    const memoryContext = await buildMemoryContext(userId, { pets }).catch((err) => {
      console.warn('[ai] memory context failed', { userId, error: err?.message });
      return '';
    });

    const { reply, usage, model } = await assistantReply({
      user,
      pet,
      pets,
      history: historyFromRows(historyRows),
      message: message || 'What do you see in this photo of my pet?',
      imageUrl,
      location: location || (user.lat && user.lng ? { lat: user.lat, lng: user.lng } : null),
      memoryContext,
    });

    await withTransaction(async (tx) => {
      await tx.query(`INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1, 'user', $2::jsonb)`, [conv.id, JSON.stringify(userContent)]);
      await tx.query(
        `INSERT INTO ai_messages (conversation_id, role, content, model, input_tokens, output_tokens) VALUES ($1, 'assistant', $2::jsonb, $3, $4, $5)`,
        [conv.id, JSON.stringify(envelopeToRow(reply)), model, usage.inputTokens, usage.outputTokens],
      );
      await tx.query('UPDATE ai_conversations SET updated_at = now() WHERE id = $1', [conv.id]);
    });

    return { conversationId: conv.id, petId: pet?.id ?? null, reply };
  },

  DELETE: async (req) => {
    const { userId } = await requireAuth(req);
    const [id] = segments(req, '/api/ai/chat');
    if (!id) throw notFound();
    const conv = await one('SELECT * FROM ai_conversations WHERE id = $1', [parseInt(id, 10) || 0]);
    if (!conv) throw notFound('Conversation not found');
    if (conv.user_id !== userId) throw forbidden();
    await one('DELETE FROM ai_conversations WHERE id = $1 RETURNING id', [conv.id]);
    return { ok: true };
  },
});
