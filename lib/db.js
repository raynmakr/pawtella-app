// Postgres access: lazy pool, query helpers, transactions.
// Schema lives in scripts/migrations/*.sql and is applied with `npm run migrate`.
import pg from 'pg';
import { env } from './env.js';

let pool;

export function getPool() {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: env.databaseUrl,
      ssl: env.databaseSsl ? { rejectUnauthorized: false } : false,
      max: 5,
      idleTimeoutMillis: 10_000,
    });
    pool.on('error', (err) => console.error('[db] idle client error', err));
  }
  return pool;
}

/** Run a query against the pool. Returns the pg result. */
export function query(text, params = []) {
  return getPool().query(text, params);
}

/** First row or null. */
export async function one(text, params = []) {
  const { rows } = await query(text, params);
  return rows[0] ?? null;
}

/** All rows. */
export async function many(text, params = []) {
  const { rows } = await query(text, params);
  return rows;
}

/**
 * Run `fn(tx)` inside BEGIN/COMMIT. `tx` has the same query/one/many helpers bound to one client.
 * Rolls back and rethrows on error.
 */
export async function withTransaction(fn) {
  const client = await getPool().connect();
  const tx = {
    query: (text, params = []) => client.query(text, params),
    one: async (text, params = []) => (await client.query(text, params)).rows[0] ?? null,
    many: async (text, params = []) => (await client.query(text, params)).rows,
  };
  try {
    await client.query('BEGIN');
    const result = await fn(tx);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore rollback failure */
    }
    throw err;
  } finally {
    client.release();
  }
}

/** Build "$1, $2, ..." placeholders starting at `start`. */
export function placeholders(count, start = 1) {
  return Array.from({ length: count }, (_, i) => `$${start + i}`).join(', ');
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
