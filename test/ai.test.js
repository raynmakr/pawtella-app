// AI flow in mock mode: generate image debits points; failed video refunds; presets; claude/xai parsing.
import '../scripts/load-env.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { one, query, closePool } from '../lib/db.js';
import { signToken } from '../lib/auth.js';
import { getBalance } from '../lib/points.js';
import { generationCost } from '../lib/points-rules.js';
import * as claude from '../lib/claude.js';
import * as xai from '../lib/xai.js';
import { triage, ageFromBirthday, normalizeEnvelope, extractProfileUpdates } from '../lib/ai-assistant.js';
import { PRESETS, renderPrompt } from '../lib/ai-presets.js';
import generateHandler from '../api/ai/generate.js';
import presetsHandler from '../api/ai/presets.js';
import chatHandler from '../api/ai/chat.js';
import captionHandler from '../api/ai/caption.js';
import finalizeCron from '../api/cron/finalize-generations.js';

process.env.XAI_MOCK_VIDEO_SECONDS = '0'; // mock video jobs complete immediately

const suffix = () => crypto.randomBytes(5).toString('hex');

function call(handler, method, url, { body, token, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url, 'http://localhost');
    const req = {
      method,
      url: u.pathname + u.search,
      headers: { 'content-type': 'application/json', ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) },
      query: Object.fromEntries(u.searchParams.entries()),
      body,
      socket: { remoteAddress: '127.0.0.1' },
    };
    const res = {
      statusCode: 200,
      headersSent: false,
      writableEnded: false,
      _headers: {},
      setHeader(k, v) { this._headers[k.toLowerCase()] = v; },
      getHeader(k) { return this._headers[k.toLowerCase()]; },
      status(code) { this.statusCode = code; return this; },
      json(obj) { this.end(JSON.stringify(obj)); return this; },
      end(data) {
        this.headersSent = true;
        this.writableEnded = true;
        let parsed = null;
        if (data) { try { parsed = JSON.parse(data); } catch { parsed = data; } }
        resolve({ status: this.statusCode, body: parsed });
      },
    };
    handler(req, res).catch(reject);
  });
}

async function makeUser(points = 50) {
  const s = suffix();
  const user = await one(`INSERT INTO users (email, handle, display_name, paw_points) VALUES ($1, $2, 'AI Tester', $3) RETURNING *`, [`ai-${s}@test.local`, `ai_${s}`, points]);
  const pet = await one(`INSERT INTO pets (user_id, name, species, breed, birthday, weight_kg, is_primary) VALUES ($1, 'Luna', 'dog', 'Corgi', '2022-03-01', 11.5, true) RETURNING *`, [user.id]);
  return { user, pet, token: signToken({ id: user.id, role: 'user' }) };
}

after(() => closePool());

test('mock mode is on for both providers in tests', () => {
  assert.equal(claude.isMock, true);
  assert.equal(xai.isMock, true);
});

test('generate image (mock) debits points and returns a done generation', async () => {
  const { user, pet, token } = await makeUser(10);
  const res = await call(generateHandler, 'POST', '/api/ai/generate', { token, body: { kind: 'image', presetId: 'astronaut', petId: pet.id } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const g = res.body;
  assert.equal(g.status, 'done');
  assert.equal(g.kind, 'image');
  assert.equal(g.pointsCharged, generationCost({ kind: 'image' }));
  assert.match(g.prompt, /Luna/);
  assert.ok(g.outputUrl);
  assert.ok(g.watermarkedUrl);
  assert.equal(g.providerOutputUrl, undefined);
  const b = await getBalance(user.id);
  assert.equal(b.pawPoints, 10 - 2);
  const tx = await one(`SELECT * FROM point_transactions WHERE user_id = $1 AND type = 'spend'`, [user.id]);
  assert.equal(tx.ref_type, 'generation');
  assert.equal(tx.ref_id, String(g.id));
  const ev = await one(`SELECT 1 FROM events WHERE user_id = $1 AND name = 'generation_done'`, [user.id]);
  assert.ok(ev);
  const notif = await one(`SELECT 1 FROM notifications WHERE user_id = $1 AND journey = 'generation_ready'`, [user.id]);
  assert.ok(notif);

  // list + detail
  const list = await call(generateHandler, 'GET', '/api/ai/generate', { token });
  assert.equal(list.body.generations.length, 1);
  const detail = await call(generateHandler, 'GET', `/api/ai/generate/${g.id}`, { token });
  assert.equal(detail.body.status, 'done');
});

test('generate rejects when points are short (402) and nothing is created', async () => {
  const { user, token } = await makeUser(1);
  const res = await call(generateHandler, 'POST', '/api/ai/generate', { token, body: { kind: 'image', prompt: 'a dog' } });
  assert.equal(res.status, 402);
  assert.equal(res.body.needed, 2);
  assert.equal(res.body.balance, 1);
  const n = await one('SELECT count(*)::int AS n FROM ai_generations WHERE user_id = $1', [user.id]);
  assert.equal(n.n, 0);
});

test('generate validation: kind, preset kind, video needs a source image', async () => {
  const { token } = await makeUser(50);
  assert.equal((await call(generateHandler, 'POST', '/api/ai/generate', { token, body: { kind: 'gif', prompt: 'x' } })).status, 400);
  assert.equal((await call(generateHandler, 'POST', '/api/ai/generate', { token, body: { kind: 'image' } })).status, 400);
  assert.equal((await call(generateHandler, 'POST', '/api/ai/generate', { token, body: { kind: 'video', presetId: 'royal', sourceImageUrl: 'https://x/y.jpg' } })).status, 400);
  assert.equal((await call(generateHandler, 'POST', '/api/ai/generate', { token, body: { kind: 'video', prompt: 'runs' } })).status, 400);
  assert.equal((await call(generateHandler, 'GET', '/api/ai/generate')).status, 401);
});

test('video: running → poll → done, HD pricing and duration snapping', async () => {
  const { user, token } = await makeUser(50);
  const res = await call(generateHandler, 'POST', '/api/ai/generate', {
    token,
    body: { kind: 'video', prompt: 'Luna runs on the beach', sourceImageUrl: 'https://placedog.net/500/500', duration: 9, hd: true },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.status, 'running');
  assert.equal(res.body.durationSeconds, 10);
  assert.equal(res.body.pointsCharged, 24); // 12 × HD 2
  assert.equal(res.body.resolution, '1080p');
  assert.match(res.body.providerRequestId, /^mock-/);
  assert.equal((await getBalance(user.id)).pawPoints, 26);
  const poll = await call(generateHandler, 'GET', `/api/ai/generate/${res.body.id}`, { token });
  assert.equal(poll.body.status, 'done');
  assert.equal(poll.body.outputUrl, xai.MOCK_VIDEO_URL);
  assert.equal(poll.body.progress, 100);
  assert.equal((await getBalance(user.id)).pawPoints, 26);
});

test('failed video refunds the charge', async () => {
  const { user, token } = await makeUser(50);
  const res = await call(generateHandler, 'POST', '/api/ai/generate', {
    token,
    body: { kind: 'video', prompt: 'please FAIL this one', sourceImageUrl: 'https://placedog.net/500/500', duration: 6 },
  });
  assert.equal(res.body.status, 'running');
  assert.equal((await getBalance(user.id)).pawPoints, 42);
  const poll = await call(generateHandler, 'GET', `/api/ai/generate/${res.body.id}`, { token });
  assert.equal(poll.body.status, 'failed');
  assert.match(poll.body.error, /Mock generation failed/);
  assert.equal(poll.body.pointsRefunded, 8);
  assert.equal((await getBalance(user.id)).pawPoints, 50);
  const refund = await one(`SELECT * FROM point_transactions WHERE user_id = $1 AND type = 'refund'`, [user.id]);
  assert.equal(refund.amount, 8);
  // polling again doesn't double refund
  await call(generateHandler, 'GET', `/api/ai/generate/${res.body.id}`, { token });
  assert.equal((await getBalance(user.id)).pawPoints, 50);
});

test('finalize-generations cron times out stale jobs with a refund', async () => {
  const { user } = await makeUser(50);
  const gen = await one(
    `INSERT INTO ai_generations (user_id, kind, model, prompt, status, points_charged, provider_request_id, created_at, started_at)
     VALUES ($1, 'video', 'm', 'p', 'running', 8, 'real-abc', now() - interval '2 hours', now() - interval '2 hours') RETURNING *`,
    [user.id],
  );
  await query('UPDATE users SET paw_points = 42 WHERE id = $1', [user.id]);
  const res = await call(finalizeCron, 'GET', '/api/cron/finalize-generations');
  assert.equal(res.status, 200);
  assert.ok(res.body.ok);
  const row = await one('SELECT status, points_refunded FROM ai_generations WHERE id = $1', [gen.id]);
  assert.equal(row.status, 'failed');
  assert.equal(row.points_refunded, 8);
  assert.equal((await getBalance(user.id)).pawPoints, 50);
});

test('presets endpoint lists presets with costs; templates render', async () => {
  const res = await call(presetsHandler, 'GET', '/api/ai/presets');
  assert.equal(res.status, 200);
  assert.ok(res.body.presets.length >= 16);
  assert.ok(res.body.presets.every((p) => p.id && p.title && p.emoji && ['image', 'video', 'both'].includes(p.kind) && Number.isInteger(p.cost)));
  assert.deepEqual(res.body.prices.video, { 6: 8, 10: 12, 15: 16 });
  const videos = await call(presetsHandler, 'GET', '/api/ai/presets?kind=video&category=fun');
  assert.ok(videos.body.presets.every((p) => p.category === 'fun' && p.kind !== 'image'));
  assert.equal(renderPrompt('{petName} the {species}', { name: 'Milo', species: 'cat', breed: 'Bengal' }), 'Milo the Bengal cat');
  assert.equal(new Set(PRESETS.map((p) => p.id)).size, PRESETS.length);
});

test('chat (mock) returns the envelope, flags emergencies, extracts profile updates, keeps history', async () => {
  const { user, pet, token } = await makeUser(10);
  const r1 = await call(chatHandler, 'POST', '/api/ai/chat', { token, body: { petId: pet.id, message: 'Luna ate a bar of chocolate an hour ago, what do I do?' } });
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  assert.ok(r1.body.conversationId);
  assert.equal(r1.body.reply.vetAlert?.level, 'emergency');
  assert.ok(r1.body.reply.text.length > 20);
  const r2 = await call(chatHandler, 'POST', '/api/ai/chat', { token, body: { conversationId: r1.body.conversationId, message: 'She now weighs 12.5 kg and is allergic to chicken.' } });
  assert.equal(r2.body.conversationId, r1.body.conversationId);
  assert.deepEqual(r2.body.reply.petProfileUpdates, { weightKg: 12.5, allergies: 'chicken' });
  const r3 = await call(chatHandler, 'POST', '/api/ai/chat', { token, body: { conversationId: r1.body.conversationId, message: 'What treats would you recommend for her?' } });
  assert.ok(Array.isArray(r3.body.reply.productSuggestions), 'catalog-grounded suggestions');
  const list = await call(chatHandler, 'GET', '/api/ai/chat', { token });
  assert.equal(list.body.conversations.length, 1);
  const detail = await call(chatHandler, 'GET', `/api/ai/chat/${r1.body.conversationId}`, { token });
  assert.equal(detail.body.messages.length, 6);
  assert.equal(detail.body.messages[1].role, 'assistant');
  assert.equal(detail.body.messages[1].content.vetAlert.level, 'emergency');
  assert.equal((await one('SELECT count(*)::int AS n FROM ai_messages m JOIN ai_conversations c ON c.id = m.conversation_id WHERE c.user_id = $1', [user.id])).n, 6);
});

test('caption (mock) returns 3 captions', async () => {
  const { token, pet } = await makeUser(10);
  const res = await call(captionHandler, 'POST', '/api/ai/caption', { token, body: { imageUrl: 'https://placedog.net/400/400', petId: pet.id } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.captions.length, 3);
  assert.ok(res.body.captions.some((c) => c.includes('Luna')));
  assert.equal((await call(captionHandler, 'POST', '/api/ai/caption', { token, body: { imageUrl: 'ftp://x' } })).status, 400);
});

test('pure helpers: triage, age, envelope normalisation, JSON extraction, xai mock video lifecycle', async () => {
  assert.equal(triage('my dog is struggling to breathe').level, 'emergency');
  assert.equal(triage('he has been vomiting all day').level, 'soon');
  assert.equal(triage('what is the best leash?'), null);
  assert.match(ageFromBirthday(new Date(Date.now() - 400 * 86400000)), /1 year/);
  assert.equal(ageFromBirthday(null), null);
  const env_ = normalizeEnvelope({ text: ' hi ', vet_alert: { level: 'soon', reason: 'x' }, productSuggestions: [{ handle: 'a' }, {}], petProfileUpdates: { weightKg: 500, birthday: '2020-01-01' } });
  assert.deepEqual(env_, { text: 'hi', vetAlert: { level: 'soon', reason: 'x' }, productSuggestions: [{ handle: 'a', title: 'a', reason: '' }], petProfileUpdates: { birthday: '2020-01-01' } });
  assert.deepEqual(extractProfileUpdates('he weighs 22 lbs'), { weightKg: 10 });
  assert.deepEqual(claude.extractJson('Sure! ```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(claude.extractJson('prefix {"a":{"b":"}"}} suffix'), { a: { b: '}' } });
  assert.equal(claude.extractJson('nothing'), null);
  const strict = claude.strictSchema({ type: 'object', properties: { a: { type: 'string' }, b: { type: 'object', properties: { c: { type: 'number' } } } } });
  assert.equal(strict.additionalProperties, false);
  assert.deepEqual(strict.required, ['a', 'b']);
  assert.equal(strict.properties.b.additionalProperties, false);
  const img = await xai.generateImage({ prompt: 'a cute cat' });
  assert.match(img.url, /^https:\/\//);
  const { requestId } = await xai.startVideo({ prompt: 'x', imageUrl: 'https://x/y.jpg', duration: 6 });
  const v = await xai.getVideo(requestId);
  assert.equal(v.status, 'done');
  assert.equal(v.url, xai.MOCK_VIDEO_URL);
  assert.equal((await xai.getVideo('mock-garbage')).status, 'failed');
});
