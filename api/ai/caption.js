// POST /api/ai/caption { imageUrl, petName?, petId?, tone? } → { captions: string[] } (Claude Haiku, vision)
import { route, body, badRequest, notFound } from '../../lib/http.js';
import { one } from '../../lib/db.js';
import { requireAuth } from '../../lib/auth.js';
import { env } from '../../lib/env.js';
import * as claude from '../../lib/claude.js';

const SCHEMA = { type: 'object', properties: { captions: { type: 'array', items: { type: 'string' } } } };

export default route({
  POST: async (req) => {
    const { userId } = await requireAuth(req);
    const b = body(req);
    const imageUrl = typeof b.imageUrl === 'string' ? b.imageUrl.trim() : '';
    if (!/^(https?:\/\/|data:image\/)/i.test(imageUrl)) throw badRequest('imageUrl must be an http(s) URL or a data URL');

    let petName = typeof b.petName === 'string' ? b.petName.trim().slice(0, 40) : '';
    let species = '';
    if (!petName && b.petId) {
      const pet = await one('SELECT name, species FROM pets WHERE id = $1 AND user_id = $2', [parseInt(b.petId, 10) || 0, userId]);
      if (!pet) throw notFound('Pet not found');
      petName = pet.name;
      species = pet.species;
    }
    const tone = typeof b.tone === 'string' ? b.tone.slice(0, 40) : 'playful';

    const system = [
      'You write short social captions for pet photos and videos on Pawtella, a community app for cat and dog owners.',
      'Write exactly 3 different captions: one funny, one sweet, one short and punchy. Each under 120 characters, at most one emoji each, no hashtags unless asked, no quotes around the caption.',
      `Tone: ${tone}.`,
      petName ? `The pet's name is ${petName}${species ? ` (a ${species})` : ''}; use the name in at least two captions.` : 'The pet\'s name is unknown: do not invent one.',
    ].join('\n');

    const out = await claude.json({
      system,
      model: env.claude.fastModel,
      schema: SCHEMA,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', url: imageUrl },
            { type: 'text', text: `Pet name: ${petName || 'unknown'}. Write 3 captions for this ${species || 'pet'} photo.` },
          ],
        },
      ],
    });
    const captions = Array.isArray(out?.captions) ? out.captions.filter((c) => typeof c === 'string' && c.trim()).map((c) => c.trim().slice(0, 200)).slice(0, 3) : [];
    if (!captions.length) throw new Error('No captions returned');
    return { captions };
  },
});
