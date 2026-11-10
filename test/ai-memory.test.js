// Per-user AI context memory: extraction storage/dedupe, the injected context block, privacy
// scrubbing, the enable toggle, and the settings mutations. Runs against local Postgres in mock
// Claude mode (no API key), with random handles and full cleanup.
import '../scripts/load-env.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { query, one, many, closePool } from '../lib/db.js';
import {
  storeExtraction,
  getMemory,
  buildMemoryContext,
  setEnabled,
  setHealthConsent,
  setHealthSummary,
  hasHealthConsent,
  scrubSecrets,
  updateFact,
  deleteFact,
  clearMemory,
  purgeMemory,
  extractForConversation,
} from '../lib/ai-memory.js';

const RUN = Math.random().toString(36).slice(2, 8);
const userIds = [];

async function makeUser() {
  const u = await one(
    `INSERT INTO users (handle, display_name, status) VALUES ($1, $2, 'active') RETURNING id`,
    [`memtest_${RUN}_${userIds.length}`, 'Memory Tester'],
  );
  userIds.push(u.id);
  return u.id;
}

async function makePet(userId, name) {
  const p = await one(`INSERT INTO pets (user_id, name, species, is_primary) VALUES ($1, $2, 'dog', true) RETURNING id`, [userId, name]);
  return p.id;
}

after(async () => {
  if (userIds.length) {
    await query('DELETE FROM ai_user_facts WHERE user_id = ANY($1)', [userIds]);
    await query('DELETE FROM ai_user_memory WHERE user_id = ANY($1)', [userIds]);
    await query('DELETE FROM ai_conversations WHERE user_id = ANY($1)', [userIds]);
    await query('DELETE FROM pets WHERE user_id = ANY($1)', [userIds]);
    await query('DELETE FROM users WHERE id = ANY($1)', [userIds]);
  }
  await closePool();
});

test('storeExtraction writes owner, pet, vendor facts and a health summary', async () => {
  const userId = await makeUser();
  const petId = await makePet(userId, 'Biscuit');
  await storeExtraction({
    userId,
    conversationId: null,
    pets: [{ id: petId, name: 'Biscuit' }],
    healthConsent: true,
    extracted: {
      owner: { tone: 'casual', budgetSensitivity: 'price-conscious', preferences: null, household: null, locationCity: 'Toronto' },
      pets: [{ name: 'Biscuit', diet: 'grain-free kibble', allergies: 'chicken', personality: 'anxious', conditions: null, meds: null, vetNotes: null, likes: null, dislikes: null }],
      vendors: [{ name: 'College St Vet', type: 'vet', notes: 'does annual checkups' }],
      healthSummary: 'Asked about itchy skin; advised a vet visit for a possible chicken allergy.',
    },
  });

  const mem = await getMemory(userId);
  const byKey = new Map(mem.facts.map((f) => [`${f.category}:${f.fact_key}`, f]));
  assert.equal(byKey.get('owner:tone').fact_value, 'casual');
  assert.equal(byKey.get('owner:budgetSensitivity').fact_value, 'price-conscious');
  assert.equal(byKey.get('owner:locationCity').fact_value, 'Toronto');
  const petDiet = byKey.get('pet:biscuit.diet');
  assert.equal(petDiet.fact_value, 'grain-free kibble');
  assert.equal(petDiet.pet_id, petId, 'pet fact links to the matched pet row');
  assert.equal(byKey.get('pet:biscuit.allergies').fact_value, 'chicken');
  assert.ok(byKey.get('vendor:college-st-vet').fact_value.includes('College St Vet'));
  assert.ok(mem.healthSummary.includes('itchy skin'));
});

test('re-extraction updates a fact in place instead of piling up duplicates', async () => {
  const userId = await makeUser();
  const petId = await makePet(userId, 'Biscuit');
  const base = { owner: {}, pets: [], vendors: [], healthSummary: null };
  await storeExtraction({ userId, pets: [{ id: petId, name: 'Biscuit' }], extracted: { ...base, pets: [{ name: 'Biscuit', diet: 'grain-free kibble' }] } });
  await storeExtraction({ userId, pets: [{ id: petId, name: 'Biscuit' }], extracted: { ...base, pets: [{ name: 'Biscuit', diet: 'fresh cooked food' }] } });
  const rows = await many('SELECT fact_value FROM ai_user_facts WHERE user_id = $1 AND category = $2 AND fact_key = $3', [userId, 'pet', 'biscuit.diet']);
  assert.equal(rows.length, 1, 'only one diet fact for the pet');
  assert.equal(rows[0].fact_value, 'fresh cooked food', 'updated to the newest value');
});

test('payment-like values are scrubbed, never stored verbatim', async () => {
  const userId = await makeUser();
  await storeExtraction({
    userId,
    extracted: { owner: { preferences: 'my card is 4111 1111 1111 1111', tone: 'formal' }, pets: [], vendors: [], healthSummary: null },
  });
  const mem = await getMemory(userId);
  const pref = mem.facts.find((f) => f.fact_key === 'preferences');
  assert.ok(pref, 'the benign part of the fact is kept');
  assert.ok(!/4111/.test(pref.fact_value), 'the card number is redacted');
  assert.ok(pref.fact_value.includes('[redacted]'), 'card number replaced with a redaction marker');
  assert.ok(mem.facts.some((f) => f.fact_key === 'tone'), 'benign fact still stored');
});

test('scrubSecrets redacts cards, passwords, one-time codes and government IDs', () => {
  assert.ok(!/4111/.test(scrubSecrets('card 4111 1111 1111 1111')));
  assert.ok(!/hunter2/.test(scrubSecrets('my password is hunter2')));
  assert.ok(!/123456/.test(scrubSecrets('the verification code is 123456')));
  assert.ok(!/987654321/.test(scrubSecrets('SIN 987 654 321')));
  assert.ok(!/078051120/.test(scrubSecrets('SSN 078-05-1120')));
  // Benign numbers survive.
  assert.equal(scrubSecrets('Biscuit weighs 12 kg'), 'Biscuit weighs 12 kg');
});

test('pet health facts and summary need express consent; withdrawing it deletes them', async () => {
  const userId = await makeUser();
  const petId = await makePet(userId, 'Biscuit');
  const pets = [{ id: petId, name: 'Biscuit' }];
  const extracted = {
    owner: { tone: 'casual' },
    pets: [{ name: 'Biscuit', diet: 'kibble', allergies: 'chicken', conditions: 'arthritis', meds: 'carprofen' }],
    vendors: [],
    healthSummary: 'Discussed joint pain.',
  };

  // No consent: health fields (allergies/conditions/meds) and the summary are not stored.
  await storeExtraction({ userId, pets, extracted, healthConsent: false });
  let mem = await getMemory(userId);
  const keys = () => mem.facts.map((f) => f.fact_key);
  assert.ok(keys().includes('biscuit.diet'), 'non-health pet fact is stored');
  assert.ok(!keys().includes('biscuit.allergies'), 'allergies not stored without consent');
  assert.ok(!keys().includes('biscuit.conditions'), 'conditions not stored without consent');
  assert.equal(mem.healthSummary, null, 'no health summary without consent');
  assert.equal(mem.healthConsent, false);

  // Consent given: health fields and summary are stored.
  await setHealthConsent(userId, true);
  assert.equal(await hasHealthConsent(userId), true);
  await storeExtraction({ userId, pets, extracted, healthConsent: true });
  mem = await getMemory(userId);
  assert.ok(keys().includes('biscuit.allergies'), 'allergies stored with consent');
  assert.ok(keys().includes('biscuit.meds'), 'meds stored with consent');
  assert.ok(mem.healthSummary?.includes('joint pain'));

  // Withdrawing consent deletes stored health facts and the summary, keeps non-health facts.
  await setHealthConsent(userId, false);
  mem = await getMemory(userId);
  assert.ok(keys().includes('biscuit.diet'), 'non-health fact kept');
  assert.ok(!keys().includes('biscuit.allergies'), 'allergies deleted on withdrawal');
  assert.ok(!keys().includes('biscuit.conditions'), 'conditions deleted on withdrawal');
  assert.ok(!keys().includes('biscuit.meds'), 'meds deleted on withdrawal');
  assert.equal(mem.healthSummary, null, 'summary deleted on withdrawal');
  assert.equal(mem.healthConsent, false);
});

test('buildMemoryContext renders a compact block and respects the off toggle', async () => {
  const userId = await makeUser();
  const petId = await makePet(userId, 'Biscuit');
  await storeExtraction({
    userId,
    pets: [{ id: petId, name: 'Biscuit' }],
    healthConsent: true,
    extracted: { owner: { tone: 'casual' }, pets: [{ name: 'Biscuit', allergies: 'chicken' }], vendors: [], healthSummary: 'Discussed itchy skin.' },
  });
  const ctx = await buildMemoryContext(userId, { pets: [{ id: petId, name: 'Biscuit' }] });
  assert.ok(ctx.includes('casual'));
  assert.ok(ctx.includes('Biscuit'));
  assert.ok(ctx.includes('chicken'));
  assert.ok(ctx.includes('itchy skin'));

  await setEnabled(userId, false);
  assert.equal(await buildMemoryContext(userId, { pets: [] }), '', 'no context when memory is off');
  await setEnabled(userId, true);
  assert.notEqual(await buildMemoryContext(userId, { pets: [{ id: petId, name: 'Biscuit' }] }), '');
});

test('settings mutations: edit, delete, set summary, clear everything', async () => {
  const userId = await makeUser();
  await storeExtraction({ userId, extracted: { owner: { tone: 'casual', preferences: 'likes salmon recipes' }, pets: [], vendors: [], healthSummary: null } });
  let mem = await getMemory(userId);
  const toneFact = mem.facts.find((f) => f.fact_key === 'tone');

  await updateFact(userId, toneFact.id, 'very formal');
  mem = await getMemory(userId);
  assert.equal(mem.facts.find((f) => f.id === toneFact.id).fact_value, 'very formal');

  const prefFact = mem.facts.find((f) => f.fact_key === 'preferences');
  await deleteFact(userId, prefFact.id);
  mem = await getMemory(userId);
  assert.ok(!mem.facts.some((f) => f.id === prefFact.id));

  await setHealthConsent(userId, true);
  await setHealthSummary(userId, 'Talked about dental care.');
  mem = await getMemory(userId);
  assert.equal(mem.healthSummary, 'Talked about dental care.');

  await clearMemory(userId);
  mem = await getMemory(userId);
  assert.equal(mem.facts.length, 0);
  assert.equal(mem.healthSummary, null);
  assert.equal(mem.enabled, true, 'clearing keeps the toggle as-is');
});

test('extractForConversation runs in mock mode and marks the conversation processed', async () => {
  const userId = await makeUser();
  const petId = await makePet(userId, 'Rex');
  const conv = await one('INSERT INTO ai_conversations (user_id, pet_id, title) VALUES ($1, $2, $3) RETURNING id', [userId, petId, 'Diet question']);
  await query(`INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1, 'user', $2::jsonb)`, [conv.id, JSON.stringify([{ type: 'text', text: 'Rex is allergic to chicken, what food is best?' }])]);
  await query(`INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1, 'assistant', $2::jsonb)`, [conv.id, JSON.stringify({ text: 'Try a limited-ingredient fish recipe.' })]);

  const res = await extractForConversation(conv.id);
  assert.equal(res.ok, true);
  const row = await one('SELECT memory_extracted_at FROM ai_conversations WHERE id = $1', [conv.id]);
  assert.ok(row.memory_extracted_at, 'high-water mark is set');
});

test('purgeMemory removes all facts and the memory row (account deletion path)', async () => {
  const userId = await makeUser();
  await storeExtraction({ userId, extracted: { owner: { tone: 'casual' }, pets: [], vendors: [], healthSummary: 'x' } });
  await purgeMemory(userId);
  assert.equal((await many('SELECT 1 FROM ai_user_facts WHERE user_id = $1', [userId])).length, 0);
  assert.equal(await one('SELECT 1 FROM ai_user_memory WHERE user_id = $1', [userId]), null);
});
