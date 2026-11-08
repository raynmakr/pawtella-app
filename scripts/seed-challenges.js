#!/usr/bin/env node
// Seed the first 4 weekly challenges, starting next Monday 00:00 (APP_TIMEZONE is not applied; UTC).
// Idempotent: upserts by slug. Usage: node scripts/seed-challenges.js
import './load-env.js';
import { query, closePool } from '../lib/db.js';

const THEMES = [
  {
    slug: 'cozy-season-portrait',
    title: 'Cozy Season Portrait',
    description: 'Blankets, mugs and golden light. Show us your pet at their snuggliest.',
    preset_id: 'cozy_portrait',
  },
  {
    slug: 'zoomies-in-space',
    title: 'Zoomies in Space',
    description: 'Launch your pet into orbit. Astronaut suits strongly encouraged.',
    preset_id: 'astronaut',
  },
  {
    slug: 'halloween-costume-reveal',
    title: 'Halloween Costume Reveal',
    description: 'The big reveal: your pet in the costume of the year.',
    preset_id: 'costume',
  },
  {
    slug: 'snow-day-adventure',
    title: 'Snow Day Adventure',
    description: 'First snow, big paws, bigger adventures.',
    preset_id: 'snow_day',
  },
];

function nextMonday(from = new Date()) {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const day = d.getUTCDay(); // 0 Sun .. 6 Sat
  const add = ((8 - day) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + add);
  return d;
}

const WEEK = 7 * 24 * 3600 * 1000;

async function main() {
  const start = nextMonday();
  for (let i = 0; i < THEMES.length; i++) {
    const t = THEMES[i];
    const startsAt = new Date(start.getTime() + i * WEEK);
    const endsAt = new Date(startsAt.getTime() + WEEK);
    const { rows } = await query(
      `INSERT INTO challenges (slug, title, description, preset_id, reward_points, runner_up_points, starts_at, ends_at, status)
       VALUES ($1, $2, $3, $4, 50, 15, $5, $6, 'scheduled')
       ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description,
         preset_id = EXCLUDED.preset_id,
         starts_at = CASE WHEN challenges.status = 'scheduled' THEN EXCLUDED.starts_at ELSE challenges.starts_at END,
         ends_at   = CASE WHEN challenges.status = 'scheduled' THEN EXCLUDED.ends_at   ELSE challenges.ends_at   END
       RETURNING id, slug, starts_at, ends_at, status`,
      [t.slug, t.title, t.description, t.preset_id, startsAt.toISOString(), endsAt.toISOString()],
    );
    console.log('[seed-challenges]', rows[0]);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
