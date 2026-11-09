-- Social graph, posts, moderation (report + block are required by the App Store for UGC), challenges.

CREATE TABLE IF NOT EXISTS challenges (
  id              SERIAL PRIMARY KEY,
  slug            TEXT UNIQUE NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  preset_id       TEXT,                                -- lib/ai-presets.js id pre-filled in Studio
  cover_url       TEXT,
  reward_points   INTEGER NOT NULL DEFAULT 50,
  runner_up_points INTEGER NOT NULL DEFAULT 15,
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL,
  status          TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'closed')),
  winner_post_id  INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS challenges_window_idx ON challenges(starts_at, ends_at);

CREATE TABLE IF NOT EXISTS posts (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pet_id           INTEGER REFERENCES pets(id) ON DELETE SET NULL,
  generation_id    INTEGER REFERENCES ai_generations(id) ON DELETE SET NULL,
  challenge_id     INTEGER REFERENCES challenges(id) ON DELETE SET NULL,
  caption          TEXT,
  media_url        TEXT NOT NULL,
  media_type       TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  thumbnail_url    TEXT,
  width            INTEGER,
  height           INTEGER,
  duration_seconds NUMERIC(6,2),
  visibility       TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'followers', 'private')),
  feature_consent  BOOLEAN NOT NULL DEFAULT false,     -- "OK to feature me" on brand channels
  like_count       INTEGER NOT NULL DEFAULT 0,
  comment_count    INTEGER NOT NULL DEFAULT 0,
  share_count      INTEGER NOT NULL DEFAULT 0,
  is_hidden        BOOLEAN NOT NULL DEFAULT false,     -- moderation
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS posts_feed_idx ON posts(created_at DESC) WHERE is_hidden = false AND visibility = 'public';
CREATE INDEX IF NOT EXISTS posts_user_idx ON posts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS posts_challenge_idx ON posts(challenge_id, like_count DESC);
CREATE TRIGGER posts_updated_at BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE ai_generations ADD CONSTRAINT ai_generations_post_fk FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE SET NULL;
ALTER TABLE ai_generations ADD CONSTRAINT ai_generations_challenge_fk FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON DELETE SET NULL;
ALTER TABLE challenges ADD CONSTRAINT challenges_winner_fk FOREIGN KEY (winner_post_id) REFERENCES posts(id) ON DELETE SET NULL;
ALTER TABLE referrals ADD CONSTRAINT referrals_shared_post_fk FOREIGN KEY (shared_post_id) REFERENCES posts(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS post_likes (
  post_id     INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS post_likes_user_idx ON post_likes(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS post_comments (
  id          SERIAL PRIMARY KEY,
  post_id     INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL CHECK (char_length(body) <= 1000),
  is_hidden   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS post_comments_post_idx ON post_comments(post_id, created_at);

CREATE TABLE IF NOT EXISTS follows (
  follower_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);
CREATE INDEX IF NOT EXISTS follows_followee_idx ON follows(followee_id);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id            SERIAL PRIMARY KEY,
  reporter_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type   TEXT NOT NULL CHECK (target_type IN ('post', 'comment', 'user')),
  target_id     INTEGER NOT NULL,
  reason        TEXT NOT NULL,                        -- spam | abuse | animal_welfare | nudity | other
  details       TEXT,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'actioned', 'dismissed')),
  reviewed_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reports_open_idx ON reports(status, created_at);
