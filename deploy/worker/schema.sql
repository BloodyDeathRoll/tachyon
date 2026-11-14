-- Tachyon D1 schema: every client in one database (docs/CLOUDFLARE-PLAN.md, "New tables").
--
-- The first block is spine/db.py's SCHEMA with a `client` column on every table and
-- per-client keys, so the Python's rows migrate as they are. Those tables keep the
-- Python's ISO-8601 TEXT timestamps. The second block is new; its times are unix ms,
-- like the session tokens (src/session.ts).
--
-- Apply: `npx wrangler d1 execute tachyon --local --file schema.sql` (idempotent).
-- Remote: the same with `--remote`, once the account exists (README.md).

CREATE TABLE IF NOT EXISTS posts (
  client         TEXT NOT NULL,
  slot_id        TEXT NOT NULL,
  state          TEXT NOT NULL,
  scheduled_at   TEXT,
  pillar         TEXT,
  angle          TEXT,
  hook_formula   TEXT,
  length_target  INTEGER,
  cta            TEXT,
  audio_type     TEXT,
  experiment_id  TEXT,
  trial          INTEGER NOT NULL DEFAULT 0,
  engine         TEXT,
  qa_rounds      INTEGER NOT NULL DEFAULT 0,
  qa_verdict     TEXT,
  ig_media_id    TEXT UNIQUE,
  permalink      TEXT,
  published_at   TEXT,
  note           TEXT,
  version        INTEGER NOT NULL DEFAULT 0,   -- optimistic lock: a stale save is refused
  r2_key         TEXT,                         -- the video in R2, from upload until published
  r2_sha         TEXT,                         -- sha256 of that file: a host re-uploads when its cut differs (spine/worker.py)
  cover_key      TEXT,                         -- the cover in R2, kept
  story_key      TEXT,                         -- the story cut in R2, from upload until published
  story_sha      TEXT,                         -- sha256 of that file, as r2_sha
  container_id   TEXT,                         -- the REELS container while PUBLISHING (src/publish.ts)
  publishing_at  TEXT,                         -- when PUBLISHING began: the stuck timer, the recovery window
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  PRIMARY KEY (client, slot_id)
);
CREATE INDEX IF NOT EXISTS posts_state ON posts(client, state, scheduled_at);
CREATE TABLE IF NOT EXISTS metric_snapshots (
  id           INTEGER PRIMARY KEY,
  client       TEXT NOT NULL,
  post_id      TEXT,
  source       TEXT NOT NULL,       -- ig_media | ig_account | ga4 | discovery
  window       TEXT NOT NULL,       -- 24h | 72h | 7d | daily | monthly
  collected_at TEXT NOT NULL,
  metrics      TEXT NOT NULL,       -- json
  UNIQUE(client, post_id, source, window)
);
-- every read of this table goes through one of these: a scan reads every row, and D1's free
-- tier allows 5M rows read a day (a minute cron scanning ~8k rows four times ran it out)
CREATE INDEX IF NOT EXISTS snaps_post ON metric_snapshots(client, post_id, source, collected_at);
CREATE INDEX IF NOT EXISTS snaps_window ON metric_snapshots(client, source, window, post_id);   -- covering: the cron reads post_id only
CREATE INDEX IF NOT EXISTS snaps_time ON metric_snapshots(client, source, collected_at);
-- views gained per hour over all a client's videos: the overview chart reads ~50 rows here,
-- not every video's hourly history (~4k rows for 48 h). putSnapshot (src/db.ts) adds to it.
CREATE TABLE IF NOT EXISTS view_gains (
  client TEXT NOT NULL,
  hour   TEXT NOT NULL,                  -- UTC, YYYY-MM-DDTHH
  gain   INTEGER NOT NULL,
  PRIMARY KEY (client, hour)
);
CREATE TABLE IF NOT EXISTS experiments (
  client           TEXT NOT NULL,
  id               TEXT NOT NULL,
  week             TEXT NOT NULL,
  variable         TEXT NOT NULL,
  hypothesis       TEXT NOT NULL,
  primary_metric   TEXT NOT NULL,
  guardrail_metric TEXT NOT NULL,
  window_days      INTEGER NOT NULL,
  min_samples      INTEGER NOT NULL DEFAULT 3,
  status           TEXT NOT NULL DEFAULT 'planned',  -- planned | running | decided
  verdict          TEXT,
  directional_only INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL,
  PRIMARY KEY (client, id)
);
CREATE TABLE IF NOT EXISTS conversions (
  id           INTEGER PRIMARY KEY,
  client       TEXT NOT NULL,
  post_id      TEXT,
  source       TEXT NOT NULL,       -- ga4 | dm | comment
  event        TEXT NOT NULL,
  value        REAL,
  utm_campaign TEXT,
  occurred_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS engage_log (
  id            INTEGER PRIMARY KEY,
  client        TEXT NOT NULL,
  date          TEXT NOT NULL,
  account       TEXT NOT NULL,
  post_url      TEXT,
  planned_at    TEXT,
  comment       TEXT,
  posted        INTEGER NOT NULL DEFAULT 0,
  posted_at     TEXT,
  replied_back  INTEGER,
  followed_back INTEGER
);
CREATE TABLE IF NOT EXISTS costs (
  id         INTEGER PRIMARY KEY,
  client     TEXT NOT NULL,
  post_id    TEXT,
  kind       TEXT NOT NULL,         -- model | render | voice | operator_minutes
  amount     REAL NOT NULL,
  unit       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS follower_snapshots (   -- one Instagram data export (spine/audience.py)
  id          INTEGER PRIMARY KEY,
  client      TEXT NOT NULL,
  taken_at    TEXT NOT NULL,
  file_sha    TEXT NOT NULL,
  source      TEXT,
  n_followers INTEGER NOT NULL,
  n_following INTEGER,
  UNIQUE(client, file_sha)
);
CREATE TABLE IF NOT EXISTS follower_members (
  snapshot_id INTEGER NOT NULL REFERENCES follower_snapshots(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,        -- follower | following
  username    TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, kind, username)
);
CREATE TABLE IF NOT EXISTS journal (
  id      INTEGER PRIMARY KEY,
  client  TEXT NOT NULL,
  ts      TEXT NOT NULL,
  action  TEXT NOT NULL,
  target  TEXT,
  intent  TEXT,                     -- json, written before the act
  outcome TEXT,                     -- json, written after
  by      INTEGER                   -- users.id, null for the cron and the migration
);
CREATE INDEX IF NOT EXISTS journal_target ON journal(client, target);
CREATE TABLE IF NOT EXISTS post_files (        -- posts/<slot>/caption.txt, first_comment.txt, meta.json
  client     TEXT NOT NULL,
  slot_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  text       TEXT NOT NULL,
  updated_by INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (client, slot_id, name)
);

-- New tables. Times are unix ms.

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE CHECK (email = lower(email)),   -- an admin invites by email
  google_sub    TEXT UNIQUE,                  -- null until the first sign-in binds it
  name          TEXT,
  picture       TEXT,
  admin         INTEGER NOT NULL DEFAULT 0,   -- adds and removes users, members and clients
  session_epoch INTEGER NOT NULL DEFAULT 0,   -- bump = every session token for this user dies
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER
);
CREATE TABLE IF NOT EXISTS memberships (       -- a member does everything for the client
  user   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client TEXT NOT NULL,
  PRIMARY KEY (user, client)
);
CREATE TABLE IF NOT EXISTS clients (           -- the former grants.yaml
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  ig_user_id     TEXT,
  page_id        TEXT,
  ig_username    TEXT,
  token_enc      TEXT,                         -- Page token, encrypted with a Worker secret
  token_expires  INTEGER,
  grants         TEXT NOT NULL DEFAULT '{}',   -- json: the former grants.yaml (slots, week_prep, auto_reply, bio_link, ...)
  emergency_stop INTEGER NOT NULL DEFAULT 0,
  publisher      TEXT NOT NULL DEFAULT 'local',  -- local (a PC's crontab) | worker (the cron here)
  status         TEXT NOT NULL DEFAULT 'active', -- setup | learning | review | active (src/pages/setup.ts): a client made here starts at setup
  created_by     INTEGER,
  created_at     INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS client_files (      -- brand.md, strategy.md, ... pulled to disk before a generation
  client     TEXT NOT NULL,
  name       TEXT NOT NULL,
  text       TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,
  updated_by INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (client, name)
);
CREATE TABLE IF NOT EXISTS client_intake (     -- what the operator tells Tachyon about a new client (src/pages/setup.ts)
  client     TEXT PRIMARY KEY,
  industry   TEXT NOT NULL DEFAULT '',
  summary    TEXT NOT NULL DEFAULT '',
  notes      TEXT NOT NULL DEFAULT '',
  sources    TEXT NOT NULL DEFAULT '[]',       -- json: [{type, url, note} | {type, file, key, size}]
  answers    TEXT NOT NULL DEFAULT '{}',       -- json: an open question of the industry file -> the operator's answer
  updated_by INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS hosts (             -- a PC running spine/worker.py
  id        TEXT PRIMARY KEY,
  user      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  clients   TEXT NOT NULL DEFAULT '[]',        -- json: clients whose assets/ it holds
  caps      TEXT NOT NULL DEFAULT '[]',        -- json: render, voice, claude
  last_seen INTEGER NOT NULL                   -- written at most every 5 min
);
CREATE TABLE IF NOT EXISTS jobs (              -- local work, claimed by a host for its clients
  id         INTEGER PRIMARY KEY,
  kind       TEXT NOT NULL,                    -- plan | produce | revise | formats | voice | upload | spec | learn
  client     TEXT NOT NULL,
  slot_id    TEXT,
  state      TEXT NOT NULL DEFAULT 'queued',   -- queued | running | done | failed
  holder     TEXT,                             -- hosts.id while running
  until      INTEGER,                          -- lease end. A running job past it is claimable again
  payload    TEXT,                             -- json
  result     TEXT,                             -- json, or the error text. A running learn job: its progress (heartbeat)
  by         INTEGER,                          -- users.id that asked
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_open ON jobs(state, client, created_at);
CREATE TABLE IF NOT EXISTS pending_connects (  -- Facebook Login done, the Page not picked yet (src/connect.ts)
  id        TEXT PRIMARY KEY,                  -- random, the form's secret
  user      INTEGER NOT NULL,
  client    TEXT NOT NULL,
  pages_enc TEXT NOT NULL,                     -- the Pages with their tokens, sealed
  expires   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS leases (            -- one publisher per client inside the cron
  name   TEXT PRIMARY KEY,
  holder TEXT,
  until  INTEGER NOT NULL DEFAULT 0,
  cursor TEXT
);
CREATE TABLE IF NOT EXISTS media (             -- which PC holds which file
  client  TEXT NOT NULL,
  slot_id TEXT NOT NULL,
  host    TEXT NOT NULL,
  path    TEXT NOT NULL,
  sha     TEXT,
  size    INTEGER,
  PRIMARY KEY (client, slot_id, host)
);
