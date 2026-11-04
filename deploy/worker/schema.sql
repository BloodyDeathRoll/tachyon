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
  cover_key      TEXT,                         -- the cover in R2, kept
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
  schedule       TEXT NOT NULL DEFAULT '{}',   -- json: slots, week_prep
  autonomy       TEXT NOT NULL DEFAULT '{}',   -- json: auto_reply, auto_approve_pillars
  emergency_stop INTEGER NOT NULL DEFAULT 0,
  publisher      TEXT NOT NULL DEFAULT 'local',  -- local (a PC's crontab) | worker (the cron here)
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
  kind       TEXT NOT NULL,                    -- plan | produce | revise | formats | voice | upload | spec
  client     TEXT NOT NULL,
  slot_id    TEXT,
  state      TEXT NOT NULL DEFAULT 'queued',   -- queued | running | done | failed
  holder     TEXT,                             -- hosts.id while running
  until      INTEGER,                          -- lease end. A running job past it is claimable again
  payload    TEXT,                             -- json
  result     TEXT,                             -- json, or the error text
  by         INTEGER,                          -- users.id that asked
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_open ON jobs(state, client, created_at);
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
