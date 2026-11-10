#!/usr/bin/env node
// Apply ONE named migration from scripts/migrations/ and record it in schema_migrations, without
// touching any other pending file. Use this (instead of `npm run migrate`) when some migrations are
// intentionally unapplied on a target DB — e.g. 011_subscriptions.sql is deliberately skipped on prod.
//
//   DATABASE_URL='postgresql://...' DATABASE_SSL=true node scripts/migrate-one.js 013_ai_context.sql
//
// Idempotent: a migration already recorded in schema_migrations is a no-op. Never prints DATABASE_URL.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './load-env.js';
import { query, withTransaction, closePool } from '../lib/db.js';

const name = process.argv[2];
if (!name) {
  console.error('usage: node scripts/migrate-one.js <migration-file.sql>');
  process.exit(1);
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const file = path.join(dir, name);
if (!fs.existsSync(file)) {
  console.error(`migration not found: ${name}`);
  process.exit(1);
}

async function main() {
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const applied = new Set((await query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  if (applied.has(name)) {
    console.log(`${name} already applied — nothing to do`);
    return;
  }
  const sql = fs.readFileSync(file, 'utf8');
  process.stdout.write(`applying ${name} ... `);
  await withTransaction(async (tx) => {
    await tx.query(sql);
    await tx.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
  });
  console.log('ok');
}

main()
  .catch((err) => {
    console.error('\nmigration failed:', err.message);
    process.exitCode = 1;
  })
  .finally(closePool);
