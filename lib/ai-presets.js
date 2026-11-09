// AI Studio presets: prompt templates served by GET /api/ai/presets and pre-filled by challenges.
// Templates use {petName} and {species} (and {breed} when known). Pure module.
// Owner: Backend B.

export const PRESETS = Object.freeze([
  // --- portrait ---
  { id: 'astronaut', title: 'Space explorer', emoji: '🚀', kind: 'both', category: 'portrait', aspectRatio: '3:4', suggestedDuration: 6,
    prompt: 'Cinematic portrait of {petName}, a {species}, wearing a detailed astronaut suit, floating inside a spaceship with Earth glowing through the window, soft rim light, ultra detailed fur, photorealistic' },
  { id: 'royal', title: 'Royal portrait', emoji: '👑', kind: 'image', category: 'portrait', aspectRatio: '3:4', suggestedDuration: 6,
    prompt: 'Regal oil painting of {petName} the {species} as 18th-century royalty, velvet robe, golden crown, ornate gilded frame, dramatic chiaroscuro lighting, museum quality' },
  { id: 'superhero', title: 'Superhero', emoji: '🦸', kind: 'both', category: 'portrait', aspectRatio: '9:16', suggestedDuration: 6,
    prompt: '{petName} the {species} as a superhero with a flowing cape, standing heroically on a skyscraper rooftop at sunset, wind in the fur, comic-book cinematic lighting, highly detailed' },
  { id: 'watercolor', title: 'Watercolor sketch', emoji: '🎨', kind: 'image', category: 'portrait', aspectRatio: '1:1', suggestedDuration: 6,
    prompt: 'Loose expressive watercolor illustration of {petName}, a {species}, soft washes of color, visible brush strokes, white paper background, charming and warm' },
  { id: 'pixar', title: '3D cartoon', emoji: '🎬', kind: 'both', category: 'portrait', aspectRatio: '1:1', suggestedDuration: 6,
    prompt: 'Adorable 3D animated-movie style character of {petName} the {species}, big expressive eyes, soft studio lighting, pastel background, high quality render' },

  // --- fun ---
  { id: 'chef', title: 'Head chef', emoji: '👨‍🍳', kind: 'both', category: 'fun', aspectRatio: '4:3', suggestedDuration: 6,
    prompt: '{petName} the {species} wearing a chef hat and apron in a busy restaurant kitchen, tasting sauce from a wooden spoon, steam and warm lights, photorealistic, funny and charming' },
  { id: 'surfer', title: 'Surf’s up', emoji: '🏄', kind: 'video', category: 'fun', aspectRatio: '16:9', suggestedDuration: 10,
    prompt: '{petName} the {species} riding a surfboard on a sparkling turquoise wave, sunglasses on, splashes of water frozen in motion, golden hour, action shot' },
  { id: 'dj', title: 'DJ night', emoji: '🎧', kind: 'video', category: 'fun', aspectRatio: '9:16', suggestedDuration: 6,
    prompt: '{petName} the {species} as a DJ with headphones behind turntables, neon club lights, confetti, crowd silhouettes, energetic and fun' },
  { id: 'pirate', title: 'Pirate captain', emoji: '🏴‍☠️', kind: 'both', category: 'fun', aspectRatio: '3:4', suggestedDuration: 6,
    prompt: '{petName} the {species} as a pirate captain with a tricorn hat and eye patch at the wheel of a ship, stormy sea, treasure map, dramatic lighting, playful' },
  { id: 'zoomies', title: 'Zoomies in slow motion', emoji: '💨', kind: 'video', category: 'fun', aspectRatio: '9:16', suggestedDuration: 10,
    prompt: 'Slow-motion cinematic shot of {petName} the {species} sprinting joyfully through a sunlit meadow, ears flying, grass and petals swirling, shallow depth of field' },

  // --- seasonal ---
  { id: 'winter', title: 'Winter wonderland', emoji: '❄️', kind: 'both', category: 'seasonal', aspectRatio: '3:4', suggestedDuration: 6,
    prompt: '{petName} the {species} in a cozy knitted scarf in a snowy pine forest, gentle snowflakes falling, warm fairy lights, soft winter light, magical atmosphere' },
  { id: 'halloween', title: 'Spooky season', emoji: '🎃', kind: 'both', category: 'seasonal', aspectRatio: '1:1', suggestedDuration: 6,
    prompt: '{petName} the {species} in a tiny witch hat next to glowing carved pumpkins on a misty autumn porch, bats in the moonlit sky, cute not scary, cinematic' },
  { id: 'spring', title: 'Spring blossoms', emoji: '🌸', kind: 'image', category: 'seasonal', aspectRatio: '4:3', suggestedDuration: 6,
    prompt: '{petName} the {species} sitting among cherry blossoms in full bloom, petals drifting in the breeze, soft pastel light, dreamy spring portrait' },
  { id: 'beach', title: 'Summer beach day', emoji: '🏖️', kind: 'both', category: 'seasonal', aspectRatio: '16:9', suggestedDuration: 6,
    prompt: '{petName} the {species} relaxing on a beach towel under a striped umbrella, sunglasses, tropical drink with a tiny umbrella, turquoise sea, bright summer light' },

  // --- challenge ---
  { id: 'birthday', title: 'Birthday party', emoji: '🎂', kind: 'both', category: 'challenge', aspectRatio: '1:1', suggestedDuration: 6,
    prompt: '{petName} the {species} wearing a party hat in front of a birthday cake with candles, balloons and confetti, joyful celebration, warm indoor lighting, photorealistic' },
  { id: 'movie-poster', title: 'Movie poster', emoji: '🍿', kind: 'image', category: 'challenge', aspectRatio: '3:4', suggestedDuration: 6,
    prompt: 'Blockbuster movie poster starring {petName} the {species}, dramatic pose, epic background, bold title typography "{petName}", cinematic color grading' },
]);

export const CATEGORIES = Object.freeze(['seasonal', 'fun', 'portrait', 'challenge']);

export function getPreset(id) {
  return PRESETS.find((p) => p.id === id) || null;
}

export function listPresets({ kind, category } = {}) {
  return PRESETS.filter((p) => (!kind || p.kind === kind || p.kind === 'both') && (!category || p.category === category));
}

/** Fill a template with pet details. `pet` is a pets row (snake_case) or a camelCase object. */
export function renderPrompt(template, pet = {}) {
  const name = pet?.name || 'my pet';
  const species = pet?.species || 'pet';
  const breed = pet?.breed || '';
  return String(template || '')
    .replace(/\{petName\}/g, name)
    .replace(/\{species\}/g, breed ? `${breed} ${species}` : species)
    .replace(/\{breed\}/g, breed)
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export default { PRESETS, CATEGORIES, getPreset, listPresets, renderPrompt };
