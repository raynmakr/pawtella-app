#!/usr/bin/env node
// Demo data for screenshots and local development. Idempotent: safe to run repeatedly.
//   - 6 demo users (password "pawtella123") with pets, avatars and bios
//   - ~15 posts with placedog.net / cataas.com images and captions, spread over the last 2 weeks
//   - follows, likes and comments between them
//   - an active weekly challenge (seed-challenges themes, first one activated) with entries
//   - 2 approved partners in Toronto (one owned by @olive_doodle so /partner/dashboard has data)
// Usage: npm run seed:demo
import './load-env.js';
import { query, one, many, closePool, withTransaction } from '../lib/db.js';
import { hashPassword } from '../lib/auth.js';
import { getUserByEmail, ensureHandle, awardBonusOnce } from '../lib/users.js';
import { getOrCreateReferralCode } from '../lib/referrals.js';
import { createPost } from '../lib/posts.js';
import { attributeUser, getPartnerByOwner, findPartnerByCode } from '../lib/partners.js';
import { RULES } from '../lib/points-rules.js';
import { PARTNER_RULES } from '../lib/partner-rules.js';

const PASSWORD = 'pawtella123';
const DAY = 86_400_000;
const dog = (id, w = 800, h = 800) => `https://placedog.net/${w}/${h}?id=${id}`;
const cat = (tag, w = 800, h = 800) => `https://cataas.com/cat/${tag}?width=${w}&height=${h}`;

const USERS = [
  { handle: 'luna_the_lab', displayName: 'Maya Chen', bio: 'Lab mom in Leslieville. Luna thinks every stick is hers.', avatar: dog(20, 300, 300), pets: [{ name: 'Luna', species: 'dog', breed: 'Labrador Retriever', sex: 'female', birthday: '2021-04-12', weightKg: 29.5, notes: 'Allergic to chicken. Loves tennis balls.' }] },
  { handle: 'mochi_cat', displayName: 'Dev Patel', bio: 'Two cats, one couch. Mochi runs the household.', avatar: dog(31, 300, 300), pets: [{ name: 'Mochi', species: 'cat', breed: 'Ragdoll', sex: 'male', birthday: '2020-09-03', weightKg: 5.2 }, { name: 'Pepper', species: 'cat', breed: 'Tabby', sex: 'female', birthday: '2022-02-14', weightKg: 3.9 }] },
  { handle: 'biscuit_corgi', displayName: 'Sofia Alvarez', bio: 'Corgi content, daily. Treat negotiator.', avatar: dog(45, 300, 300), pets: [{ name: 'Biscuit', species: 'dog', breed: 'Pembroke Welsh Corgi', sex: 'male', birthday: '2019-11-30', weightKg: 12.1, notes: 'Sensitive stomach. Grain-free kibble.' }] },
  { handle: 'rocky_husky', displayName: 'Jordan Blake', bio: 'High Park trail runs with Rocky. He talks back.', avatar: dog(57, 300, 300), pets: [{ name: 'Rocky', species: 'dog', breed: 'Siberian Husky', sex: 'male', birthday: '2018-06-21', weightKg: 24.8 }] },
  { handle: 'olive_doodle', displayName: 'Priya Nair', bio: 'Groomer by day, doodle wrangler always.', avatar: dog(66, 300, 300), pets: [{ name: 'Olive', species: 'dog', breed: 'Goldendoodle', sex: 'female', birthday: '2022-08-08', weightKg: 18.3 }] },
  { handle: 'theo_tabby', displayName: 'Sam Okafor', bio: 'Theo naps, I photograph. Fair trade.', avatar: dog(72, 300, 300), pets: [{ name: 'Theo', species: 'cat', breed: 'Orange Tabby', sex: 'male', birthday: '2021-01-19', weightKg: 6.1, notes: 'Indoor only. Obsessed with the laser pointer.' }] },
];

// [handle, petName|null, media, caption, daysAgo, challenge?]
const POSTS = [
  ['luna_the_lab', 'Luna', dog(101), 'First swim of the season and she refused to come out. Classic Luna.', 1, true],
  ['mochi_cat', 'Mochi', cat('cute'), 'Mochi has claimed the fresh laundry. Again.', 1.5, false],
  ['biscuit_corgi', 'Biscuit', dog(133), 'Sploot level: expert. Sunday is for sploots.', 2, true],
  ['rocky_husky', 'Rocky', dog(207), 'Rocky after a 10k in High Park. Still had zoomies left.', 2.5, false],
  ['olive_doodle', 'Olive', dog(66), 'Fresh groom, who dis? Olive feeling herself today.', 3, true],
  ['theo_tabby', 'Theo', cat('sleepy'), 'Theo found the one sunbeam in the apartment and will not be moving.', 3.5, false],
  ['luna_the_lab', 'Luna', dog(110), 'Found a stick. Found a bigger stick. Dropped both for a snack.', 4, false],
  ['mochi_cat', 'Pepper', cat('orange'), 'Pepper judging my life choices from the top of the fridge.', 5, false],
  ['biscuit_corgi', 'Biscuit', dog(150), 'Biscuit vs. the vacuum. The vacuum lost.', 6, false],
  ['rocky_husky', 'Rocky', dog(228), 'Snow day prep: Rocky approves of this weather forecast.', 7, true],
  ['olive_doodle', 'Olive', dog(170), 'Puppuccino payday. She earned it (she did not earn it).', 8, false],
  ['theo_tabby', 'Theo', cat('tabby'), 'Theo helping me work from home by sitting on the keyboard.', 9, false],
  ['luna_the_lab', 'Luna', dog(188), 'Golden hour with my golden girl. Leslieville looking good.', 10, false],
  ['mochi_cat', 'Mochi', cat('fluffy'), 'The box arrived yesterday. Mochi has not left it since.', 12, false],
  ['biscuit_corgi', 'Biscuit', dog(199), 'Corgi butt appreciation post. You are welcome.', 13, false],
];

const FOLLOWS = [
  ['luna_the_lab', ['mochi_cat', 'biscuit_corgi', 'rocky_husky', 'olive_doodle']],
  ['mochi_cat', ['luna_the_lab', 'theo_tabby', 'biscuit_corgi']],
  ['biscuit_corgi', ['luna_the_lab', 'mochi_cat', 'rocky_husky', 'olive_doodle', 'theo_tabby']],
  ['rocky_husky', ['luna_the_lab', 'biscuit_corgi']],
  ['olive_doodle', ['luna_the_lab', 'biscuit_corgi', 'theo_tabby']],
  ['theo_tabby', ['mochi_cat', 'olive_doodle']],
];

const COMMENTS = [
  [0, 'biscuit_corgi', 'The commitment to the swim is inspiring.'],
  [0, 'rocky_husky', 'Rocky would never. Rocky hates water. Respect, Luna.'],
  [1, 'theo_tabby', 'Theo does the exact same thing. Warm laundry is a cat magnet.'],
  [2, 'luna_the_lab', 'That is a professional sploot.'],
  [4, 'luna_the_lab', 'Gorgeous! Which groomer?'],
  [4, 'mochi_cat', 'The fluff. The FLUFF.'],
  [9, 'olive_doodle', 'Olive is also very pro-snow.'],
  [12, 'theo_tabby', 'Stunning light.'],
];

const PARTNERS = [
  {
    code: 'HAPPYPAWS01', owner: 'olive_doodle', businessName: 'Happy Paws Grooming', type: 'groomer',
    description: 'Gentle, fear-free grooming for dogs and cats in Leslieville. Walk-in nail trims, full grooms by appointment, de-shedding treatments and puppy intro sessions.',
    phone: '416-555-0142', website: 'https://happypawsgrooming.ca', bookingUrl: 'https://happypawsgrooming.ca/book', instagram: 'happypawsto',
    street1: '1120 Queen St E', city: 'Toronto', province: 'ON', postalCode: 'M4M 1K8', lat: 43.6616, lng: -79.3366,
    services: ['Full groom', 'Bath & brush', 'Nail trim', 'De-shedding', 'Puppy intro'], logo: dog(66, 300, 300), tier: 'silver', featured: true, ratingAvg: 4.8, ratingCount: 2,
  },
  {
    code: 'QUEENWESTVET7', owner: null, businessName: 'Queen West Veterinary Clinic', type: 'vet',
    description: 'Full-service small animal clinic: wellness exams, vaccines, dental, surgery and same-day urgent care. Independent and locally owned since 2009.',
    phone: '416-555-0188', website: 'https://queenwestvet.ca', bookingUrl: 'https://queenwestvet.ca/appointments', instagram: 'queenwestvet',
    street1: '812 Queen St W', city: 'Toronto', province: 'ON', postalCode: 'M6J 1G1', lat: 43.6456, lng: -79.4094,
    services: ['Wellness exams', 'Vaccinations', 'Dental cleaning', 'Urgent care', 'Surgery'], logo: null, tier: 'bronze', featured: false, ratingAvg: 4.5, ratingCount: 1,
  },
];

const THEMES = [
  { slug: 'cozy-season-portrait', title: 'Cozy Season Portrait', description: 'Blankets, mugs and golden light. Show us your pet at their snuggliest.', preset_id: 'cozy_portrait', cover: dog(188, 1200, 600) },
  { slug: 'zoomies-in-space', title: 'Zoomies in Space', description: 'Launch your pet into orbit. Astronaut suits strongly encouraged.', preset_id: 'astronaut', cover: dog(207, 1200, 600) },
  { slug: 'halloween-costume-reveal', title: 'Halloween Costume Reveal', description: 'The big reveal: your pet in the costume of the year.', preset_id: 'costume', cover: dog(150, 1200, 600) },
  { slug: 'snow-day-adventure', title: 'Snow Day Adventure', description: 'First snow, big paws, bigger adventures.', preset_id: 'snow_day', cover: dog(228, 1200, 600) },
];

const log = (msg, extra) => console.log(`[seed-demo] ${msg}`, extra ?? '');

async function ensureUsers() {
  const byHandle = new Map();
  const passwordHash = await hashPassword(PASSWORD);
  for (const u of USERS) {
    const email = `demo.${u.handle}@pawtella.dev`;
    let row = await getUserByEmail(email);
    if (!row) {
      row = await withTransaction(async (tx) => {
        const handle = await ensureHandle(u.handle, tx);
        const created = await tx.one(
          `INSERT INTO users (email, password_hash, handle, display_name, avatar_url, bio, signup_source, email_verified_at, country, feature_consent_default)
           VALUES ($1, $2, $3, $4, $5, $6, 'organic', now(), 'CA', true) RETURNING *`,
          [email, passwordHash, handle, u.displayName, u.avatar, u.bio],
        );
        await awardBonusOnce(created.id, 'bonus_welcome', RULES.welcomeBonus, { source: 'welcome', description: 'Welcome to Pawtella' }, tx);
        await getOrCreateReferralCode(created.id, tx);
        return created;
      });
      log('user created', { handle: row.handle });
    }
    byHandle.set(u.handle, row);
    for (const [i, p] of u.pets.entries()) {
      const existing = await one('SELECT id FROM pets WHERE user_id = $1 AND name = $2', [row.id, p.name]);
      if (existing) continue;
      await query(
        `INSERT INTO pets (user_id, name, species, breed, sex, birthday, weight_kg, photo_url, notes, is_primary)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [row.id, p.name, p.species, p.breed, p.sex, p.birthday, p.weightKg, p.species === 'cat' ? cat(p.name.toLowerCase() === 'mochi' ? 'cute' : 'tabby', 400, 400) : dog(60 + i + row.id, 400, 400), p.notes ?? null, i === 0],
      );
      log('pet created', { handle: row.handle, name: p.name });
    }
  }
  return byHandle;
}

async function ensureChallenge() {
  let active = await one(`SELECT * FROM challenges WHERE status = 'active' ORDER BY ends_at ASC LIMIT 1`);
  if (!active) {
    // Same themes as scripts/seed-challenges.js; the first one is activated for the current week.
    const now = new Date();
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    for (let i = 0; i < THEMES.length; i++) {
      const t = THEMES[i];
      const startsAt = new Date(monday.getTime() + i * 7 * DAY);
      const endsAt = new Date(startsAt.getTime() + 7 * DAY);
      const status = i === 0 ? 'active' : 'scheduled';
      const { rows } = await query(
        `INSERT INTO challenges (slug, title, description, preset_id, cover_url, reward_points, runner_up_points, starts_at, ends_at, status)
         VALUES ($1, $2, $3, $4, $5, 50, 15, $6, $7, $8)
         ON CONFLICT (slug) DO UPDATE SET cover_url = COALESCE(challenges.cover_url, EXCLUDED.cover_url),
           status = CASE WHEN challenges.status = 'closed' THEN challenges.status ELSE EXCLUDED.status END,
           starts_at = CASE WHEN challenges.status = 'closed' THEN challenges.starts_at ELSE EXCLUDED.starts_at END,
           ends_at = CASE WHEN challenges.status = 'closed' THEN challenges.ends_at ELSE EXCLUDED.ends_at END
         RETURNING *`,
        [t.slug, t.title, t.description, t.preset_id, t.cover, startsAt.toISOString(), endsAt.toISOString(), status],
      );
      log('challenge upserted', { slug: rows[0].slug, status: rows[0].status });
    }
    active = await one(`SELECT * FROM challenges WHERE status = 'active' ORDER BY ends_at ASC LIMIT 1`);
  } else if (!active.cover_url) {
    await query('UPDATE challenges SET cover_url = $2 WHERE id = $1', [active.id, THEMES[0].cover]);
  }
  // Upcoming ones so /challenges has a "Coming up" section.
  const upcoming = await one(`SELECT count(*)::int AS n FROM challenges WHERE status = 'scheduled'`);
  if (upcoming.n === 0) {
    const base = new Date(active.ends_at);
    for (let i = 1; i < THEMES.length; i++) {
      const t = THEMES[i];
      const startsAt = new Date(base.getTime() + (i - 1) * 7 * DAY);
      await query(
        `INSERT INTO challenges (slug, title, description, preset_id, cover_url, reward_points, runner_up_points, starts_at, ends_at, status)
         VALUES ($1, $2, $3, $4, $5, 50, 15, $6, $7, 'scheduled') ON CONFLICT (slug) DO NOTHING`,
        [t.slug, t.title, t.description, t.preset_id, t.cover, startsAt.toISOString(), new Date(startsAt.getTime() + 7 * DAY).toISOString()],
      );
    }
  }
  return active;
}

async function ensurePosts(users, challenge) {
  const ids = [];
  for (const [handle, petName, media, caption, daysAgo, inChallenge] of POSTS) {
    const user = users.get(handle);
    let post = await one('SELECT id FROM posts WHERE user_id = $1 AND media_url = $2', [user.id, media]);
    if (!post) {
      const pet = petName ? await one('SELECT id FROM pets WHERE user_id = $1 AND name = $2', [user.id, petName]) : null;
      post = await createPost(user.id, {
        petId: pet?.id ?? null,
        challengeId: inChallenge && challenge ? challenge.id : null,
        caption,
        mediaUrl: media,
        mediaType: 'image',
        featureConsent: true,
        width: 800,
        height: 800,
      });
      await query('UPDATE posts SET created_at = now() - ($2 || \' days\')::interval WHERE id = $1', [post.id, String(daysAgo)]);
      log('post created', { id: post.id, handle });
    }
    ids.push(post.id);
  }
  return ids;
}

async function ensureSocial(users, postIds) {
  for (const [from, tos] of FOLLOWS) {
    for (const to of tos) {
      await query('INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [users.get(from).id, users.get(to).id]);
    }
  }
  // Likes: a deterministic spread so the leaderboard and discover ranking look alive.
  const handles = [...users.keys()];
  for (let i = 0; i < postIds.length; i++) {
    const post = await one('SELECT user_id FROM posts WHERE id = $1', [postIds[i]]);
    const likers = handles.filter((h, j) => users.get(h).id !== post.user_id && (i + j) % 3 !== 0);
    for (const h of likers) {
      await query('INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [postIds[i], users.get(h).id]);
    }
  }
  await query(`UPDATE posts p SET like_count = (SELECT count(*) FROM post_likes l WHERE l.post_id = p.id) WHERE p.id = ANY($1::int[])`, [postIds]);
  for (const [postIdx, handle, body] of COMMENTS) {
    const postId = postIds[postIdx];
    const user = users.get(handle);
    const exists = await one('SELECT id FROM post_comments WHERE post_id = $1 AND user_id = $2 AND body = $3', [postId, user.id, body]);
    if (exists) continue;
    await query('INSERT INTO post_comments (post_id, user_id, body) VALUES ($1, $2, $3)', [postId, user.id, body]);
  }
  await query(`UPDATE posts p SET comment_count = (SELECT count(*) FROM post_comments c WHERE c.post_id = p.id AND c.is_hidden = false) WHERE p.id = ANY($1::int[])`, [postIds]);
  log('follows, likes and comments ensured');
}

async function ensurePartners(users) {
  for (const p of PARTNERS) {
    let row = await findPartnerByCode(p.code);
    const owner = p.owner ? users.get(p.owner) : null;
    if (!row) {
      if (owner && (await getPartnerByOwner(owner.id))) {
        log('owner already has a partner; skipping', { code: p.code });
        continue;
      }
      row = await one(
        `INSERT INTO partners (owner_user_id, business_name, type, description, logo_url, email, phone, website, booking_url, instagram,
                               street1, city, province, postal_code, country, lat, lng, services, code, status, tier, is_featured,
                               discount_code, discount_percent, rating_avg, rating_count, approved_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'CA',$15,$16,$17,$18,'approved',$19,$20,$21,$22,$23,$24, now() - interval '40 days')
         RETURNING *`,
        [
          owner?.id ?? null, p.businessName, p.type, p.description, p.logo, owner ? `demo.${p.owner}@pawtella.dev` : `hello@${p.code.toLowerCase()}.example`,
          p.phone, p.website, p.bookingUrl, p.instagram, p.street1, p.city, p.province, p.postalCode, p.lat, p.lng, p.services, p.code,
          p.tier, p.featured, `PARTNER-${p.code}`, PARTNER_RULES.tiers.find((t) => t.id === p.tier)?.discountPercent ?? 10, p.ratingAvg, p.ratingCount,
        ],
      );
      log('partner created', { code: p.code, id: row.id });
    }
    // Reviews from demo users who are not the owner.
    const reviewers = [...users.values()].filter((u) => u.id !== row.owner_user_id).slice(0, p.ratingCount);
    const texts = ['Olive came back fluffier than ever and not a bit stressed. Fear-free is the real deal.', 'Quick nail trim, zero drama. We will be back.', 'Same-day visit when Rocky ate something he should not have. Calm, kind and clear.'];
    for (const [i, u] of reviewers.entries()) {
      await query(
        `INSERT INTO partner_reviews (partner_id, user_id, rating, body) VALUES ($1, $2, $3, $4) ON CONFLICT (partner_id, user_id) DO NOTHING`,
        [row.id, u.id, i === 0 ? 5 : 4, texts[(i + (p.type === 'vet' ? 2 : 0)) % texts.length]],
      );
    }
    const agg = await one('SELECT AVG(rating)::numeric(3,2) AS avg, COUNT(*)::int AS count FROM partner_reviews WHERE partner_id = $1', [row.id]);
    await query('UPDATE partners SET rating_avg = $2, rating_count = $3 WHERE id = $1', [row.id, agg.avg, agg.count]);

    // Dashboard data for the owned partner: attributed clients and a few earnings.
    if (owner) {
      const clients = [...users.values()].filter((u) => u.id !== owner.id).slice(0, 3);
      for (const c of clients) {
        const existing = await one('SELECT id FROM partner_attributions WHERE user_id = $1', [c.id]);
        if (!existing) {
          try {
            await attributeUser(c.id, row.id, 'qr_scan');
          } catch (err) {
            log('attribution skipped', { user: c.handle, err: err.message });
          }
        }
      }
      const earnings = await one('SELECT count(*)::int AS n FROM partner_earnings WHERE partner_id = $1', [row.id]);
      if (earnings.n === 0) {
        const rows = [
          [clients[0]?.id ?? null, 'commission', 640, 'available', -20, { subtotalCents: 6400, commissionPercent: 10, orderNumber: '#1041' }],
          [clients[1]?.id ?? null, 'commission', 1290, 'available', -16, { subtotalCents: 12900, commissionPercent: 10, orderNumber: '#1058' }],
          [clients[2]?.id ?? null, 'commission', 455, 'pending', -3, { subtotalCents: 4550, commissionPercent: 10, orderNumber: '#1102' }],
          [owner.id, 'redeem_points', -500, 'paid', -10, { points: 125, centsPerPoint: 4 }],
        ];
        for (const [userId, type, cents, status, days, meta] of rows) {
          await query(
            `INSERT INTO partner_earnings (partner_id, user_id, type, amount_cents, status, available_at, metadata, created_at)
             VALUES ($1, $2, $3, $4, $5, now() + ($6 || ' days')::interval, $7, now() + ($8 || ' days')::interval)`,
            [row.id, userId, type, cents, status, String(days + 14), JSON.stringify(meta), String(days)],
          );
        }
        await query('UPDATE partners SET active_referred_90d = $2, total_referred = GREATEST(total_referred, $2) WHERE id = $1', [row.id, clients.length]);
        log('partner earnings seeded', { code: p.code });
      }
    }
  }
}

async function main() {
  const users = await ensureUsers();
  const challenge = await ensureChallenge();
  const postIds = await ensurePosts(users, challenge);
  await ensureSocial(users, postIds);
  await ensurePartners(users);
  const counts = await many(`SELECT (SELECT count(*) FROM users WHERE email LIKE 'demo.%@pawtella.dev')::int AS users,
                                    (SELECT count(*) FROM posts WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'demo.%@pawtella.dev'))::int AS posts,
                                    (SELECT count(*) FROM partners WHERE code IN ('HAPPYPAWS01','QUEENWESTVET7'))::int AS partners`);
  log('done', counts[0]);
  console.log(`\nSign in with any demo user, e.g. demo.luna_the_lab@pawtella.dev / ${PASSWORD}`);
  console.log(`Partner dashboard: demo.olive_doodle@pawtella.dev / ${PASSWORD}\n`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
