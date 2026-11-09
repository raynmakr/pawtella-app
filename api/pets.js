// Pets: GET/POST /api/pets, GET/PATCH/DELETE /api/pets/:id
import { route, segments, body, requireFields, badRequest, notFound } from '../lib/http.js';
import { MOCK_UPLOAD_MAX_BYTES } from '../lib/media.js';
import { withTransaction, many, one } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';
import { maybeAwardProfilePetBonus } from '../lib/users.js';
import { track, EVENT } from '../lib/events.js';
import { camelize } from '../lib/serialize.js';

const SPECIES = new Set(['dog', 'cat']);
const SEX = new Set(['male', 'female', 'unknown']);

export function toApiPet(row) {
  if (!row) return null;
  const p = camelize(row);
  return {
    ...p,
    weightKg: p.weightKg === null || p.weightKg === undefined ? null : Number(p.weightKg),
    birthday: p.birthday instanceof Date ? p.birthday.toISOString().slice(0, 10) : p.birthday ?? null,
  };
}

/** Public view of a pet (for GET /api/users/:handle). */
export function toPublicPet(row) {
  const p = toApiPet(row);
  if (!p) return null;
  return { id: p.id, name: p.name, species: p.species, breed: p.breed, sex: p.sex, birthday: p.birthday, photoUrl: p.photoUrl, isPrimary: p.isPrimary };
}

function optStr(v, max, field) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  if (typeof v !== 'string') throw badRequest(`${field} must be a string`);
  const s = v.trim();
  if (s.length > max) throw badRequest(`${field} is too long (max ${max})`);
  return s || null;
}

/** Validate a pet payload. `partial` for PATCH. Returns { column: value } for provided fields. */
function validatePet(b, { partial = false } = {}) {
  const out = {};
  if (!partial || b.name !== undefined) {
    const name = optStr(b.name, 40, 'name');
    if (!name) throw badRequest('name is required');
    out.name = name;
  }
  if (!partial || b.species !== undefined) {
    const species = typeof b.species === 'string' ? b.species.trim().toLowerCase() : '';
    if (!SPECIES.has(species)) throw badRequest('species must be "dog" or "cat"');
    out.species = species;
  }
  const breed = optStr(b.breed, 60, 'breed');
  if (breed !== undefined) out.breed = breed;
  if (b.sex !== undefined) {
    if (b.sex === null || b.sex === '') out.sex = null;
    else if (typeof b.sex === 'string' && SEX.has(b.sex.toLowerCase())) out.sex = b.sex.toLowerCase();
    else throw badRequest('sex must be male, female or unknown');
  }
  if (b.birthday !== undefined) {
    if (b.birthday === null || b.birthday === '') out.birthday = null;
    else {
      const s = String(b.birthday).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw badRequest('birthday must be YYYY-MM-DD');
      if (Date.parse(s) > Date.now()) throw badRequest('birthday cannot be in the future');
      out.birthday = s;
    }
  }
  if (b.weightKg !== undefined) {
    if (b.weightKg === null || b.weightKg === '') out.weight_kg = null;
    else {
      const w = Number(b.weightKg);
      if (!Number.isFinite(w) || w <= 0 || w > 200) throw badRequest('weightKg must be a number between 0 and 200');
      out.weight_kg = Math.round(w * 100) / 100;
    }
  }
  // Large cap: in mock mode (no Cloudinary) the uploader returns an inline data URL, not a short https URL.
  const photoUrl = optStr(b.photoUrl, MOCK_UPLOAD_MAX_BYTES, 'photoUrl');
  if (photoUrl !== undefined) out.photo_url = photoUrl;
  const notes = optStr(b.notes, 2000, 'notes');
  if (notes !== undefined) out.notes = notes;
  if (b.isPrimary !== undefined) out.is_primary = !!b.isPrimary;
  return out;
}

async function ownedPet(tx, userId, id) {
  const n = parseInt(id, 10);
  if (!Number.isInteger(n)) throw notFound('Pet not found');
  const pet = await (tx ? tx.one : one)('SELECT * FROM pets WHERE id = $1 AND user_id = $2' + (tx ? ' FOR UPDATE' : ''), [n, userId]);
  if (!pet) throw notFound('Pet not found');
  return pet;
}

async function list(req) {
  const { userId } = await requireAuth(req);
  const rows = await many('SELECT * FROM pets WHERE user_id = $1 ORDER BY is_primary DESC, created_at ASC', [userId]);
  return { pets: rows.map(toApiPet) };
}

async function create(req) {
  const { userId } = await requireAuth(req);
  const b = requireFields(body(req), ['name', 'species']);
  const fields = validatePet(b);
  const { pet, isFirst } = await withTransaction(async (tx) => {
    // Lock the owner row so two concurrent first-pet inserts can't both become primary.
    await tx.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const { count } = await tx.one('SELECT count(*)::int AS count FROM pets WHERE user_id = $1', [userId]);
    const first = count === 0;
    const primary = first ? true : !!fields.is_primary;
    if (primary && !first) await tx.query('UPDATE pets SET is_primary = false WHERE user_id = $1 AND is_primary = true', [userId]);
    const row = await tx.one(
      `INSERT INTO pets (user_id, name, species, breed, sex, birthday, weight_kg, photo_url, notes, is_primary)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [userId, fields.name, fields.species, fields.breed ?? null, fields.sex ?? null, fields.birthday ?? null, fields.weight_kg ?? null, fields.photo_url ?? null, fields.notes ?? null, primary],
    );
    await track(EVENT.pet_added, { userId, props: { petId: row.id, species: row.species, isFirst: first } }, tx);
    return { pet: row, isFirst: first };
  });
  const bonus = await maybeAwardProfilePetBonus(userId);
  console.log('[pets] created', { userId, petId: pet.id, isFirst });
  return { pet: toApiPet(pet), isFirst, bonusAwarded: bonus.awarded };
}

async function get(req, id) {
  const { userId } = await requireAuth(req);
  return { pet: toApiPet(await ownedPet(null, userId, id)) };
}

async function update(req, id) {
  const { userId } = await requireAuth(req);
  const fields = validatePet(body(req), { partial: true });
  if (!Object.keys(fields).length) throw badRequest('Nothing to update');
  const pet = await withTransaction(async (tx) => {
    const current = await ownedPet(tx, userId, id);
    if (fields.is_primary === true) {
      await tx.query('UPDATE pets SET is_primary = false WHERE user_id = $1 AND is_primary = true AND id <> $2', [userId, current.id]);
    } else if (fields.is_primary === false && current.is_primary) {
      // Keep exactly one primary: refuse to unset the only primary unless another exists.
      const other = await tx.one('SELECT id FROM pets WHERE user_id = $1 AND id <> $2 ORDER BY created_at ASC LIMIT 1', [userId, current.id]);
      if (!other) throw badRequest('You need at least one primary pet');
      await tx.query('UPDATE pets SET is_primary = true WHERE id = $1', [other.id]);
    }
    const cols = Object.keys(fields);
    const sets = cols.map((c, i) => `${c} = $${i + 3}`).join(', ');
    return tx.one(`UPDATE pets SET ${sets} WHERE id = $1 AND user_id = $2 RETURNING *`, [current.id, userId, ...cols.map((c) => fields[c])]);
  });
  await maybeAwardProfilePetBonus(userId);
  return { pet: toApiPet(pet) };
}

async function remove(req, id) {
  const { userId } = await requireAuth(req);
  await withTransaction(async (tx) => {
    const current = await ownedPet(tx, userId, id);
    await tx.query('DELETE FROM pets WHERE id = $1', [current.id]);
    if (current.is_primary) {
      await tx.query(
        `UPDATE pets SET is_primary = true WHERE id = (SELECT id FROM pets WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1)`,
        [userId],
      );
    }
  });
  console.log('[pets] deleted', { userId, petId: id });
  return { ok: true };
}

export default route({
  GET: async (req) => {
    const [id, ...rest] = segments(req, '/api/pets');
    if (rest.length) throw notFound();
    return id ? get(req, id) : list(req);
  },
  POST: async (req) => {
    if (segments(req, '/api/pets').length) throw notFound();
    return create(req);
  },
  PATCH: async (req) => {
    const [id, ...rest] = segments(req, '/api/pets');
    if (!id || rest.length) throw notFound();
    return update(req, id);
  },
  PUT: async (req) => {
    const [id, ...rest] = segments(req, '/api/pets');
    if (!id || rest.length) throw notFound();
    return update(req, id);
  },
  DELETE: async (req) => {
    const [id, ...rest] = segments(req, '/api/pets');
    if (!id || rest.length) throw notFound();
    return remove(req, id);
  },
});
