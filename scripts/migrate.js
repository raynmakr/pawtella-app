#!/usr/bin/env node
// Apply scripts/migrations/*.sql in filename order. Each file runs once, inside a transaction,
// and is recorded in schema_migrations. Usage: npm run migrate  (reads DATABASE_URL from env / .env)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './load-env.js';
import { query, withTransaction, closePool } from '../lib/db.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

async function main() {
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const applied = new Set((await query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    process.stdout.write(`applying ${file} ... `);
    await withTransaction(async (tx) => {
      await tx.query(sql);
      await tx.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    console.log('ok');
    count++;
  }
  console.log(count ? `${count} migration(s) applied` : 'database is up to date');
}

main()
  .catch((err) => {
    console.error('\nmigration failed:', err.message);
    process.exitCode = 1;
  })
  .finally(closePool);
