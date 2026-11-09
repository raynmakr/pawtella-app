// GET /api/ai/presets?kind=image|video&category=... → { presets, categories, prices }
import { route } from '../../lib/http.js';
import { optionalAuth } from '../../lib/auth.js';
import { one } from '../../lib/db.js';
import { listPresets, CATEGORIES, renderPrompt } from '../../lib/ai-presets.js';
import { RULES, generationCost, allowedDurations } from '../../lib/points-rules.js';

export default route({
  GET: async (req) => {
    const kind = ['image', 'video'].includes(req.query?.kind) ? req.query.kind : undefined;
    const category = CATEGORIES.includes(req.query?.category) ? req.query.category : undefined;
    // With a signed-in user, pre-render the prompt for their primary pet.
    const auth = await optionalAuth(req);
    const pet = auth ? await one('SELECT name, species, breed FROM pets WHERE user_id = $1 ORDER BY is_primary DESC, id ASC LIMIT 1', [auth.userId]) : null;
    const presets = listPresets({ kind, category }).map((p) => ({
      ...p,
      cost: p.kind === 'video' ? generationCost({ kind: 'video', duration: p.suggestedDuration }) : generationCost({ kind: 'image' }),
      example: pet ? renderPrompt(p.prompt, pet) : renderPrompt(p.prompt, { name: 'Luna', species: 'dog' }),
    }));
    return {
      presets,
      categories: CATEGORIES,
      prices: {
        image: generationCost({ kind: 'image' }),
        video: Object.fromEntries(allowedDurations.map((d) => [d, generationCost({ kind: 'video', duration: d })])),
        hdMultiplier: RULES.prices.hdMultiplier,
        allowedDurations,
      },
    };
  },
});
