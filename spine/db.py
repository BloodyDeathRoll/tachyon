"""One SQLite file per client: clients/<name>/tachyon.db (docs/PLAN.md §3 station 6).

Tables: posts, metric_snapshots, experiments, conversions, engage_log, costs, journal.
Every state change and every write to Meta goes through `journal` (append-only).
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from . import state as S

SCHEMA = """
CREATE TABLE IF NOT EXISTS posts (
  slot_id        TEXT PRIMARY KEY,
  client         TEXT NOT NULL,
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
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS metric_snapshots (
  id           INTEGER PRIMARY KEY,
  post_id      TEXT,
  source       TEXT NOT NULL,       -- ig_media | ig_account | ga4 | discovery
  window       TEXT NOT NULL,       -- 24h | 72h | 7d | daily | monthly
  collected_at TEXT NOT NULL,
  metrics      TEXT NOT NULL,       -- json
  UNIQUE(post_id, source, window)
);
CREATE TABLE IF NOT EXISTS experiments (
  id               TEXT PRIMARY KEY,
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
  created_at       TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS conversions (
  id           INTEGER PRIMARY KEY,
  post_id      TEXT,
  source       TEXT NOT NULL,       -- ga4 | dm | comment
  event        TEXT NOT NULL,
  value        REAL,
  utm_campaign TEXT,
  occurred_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS engage_log (
  id            INTEGER PRIMARY KEY,
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
  post_id    TEXT,
  kind       TEXT NOT NULL,         -- model | render | voice | operator_minutes
  amount     REAL NOT NULL,
  unit       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS journal (
  id      INTEGER PRIMARY KEY,
  ts      TEXT NOT NULL,
  action  TEXT NOT NULL,
  target  TEXT,
  intent  TEXT,                     -- json, written before the act
  outcome TEXT                      -- json, written after
);
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class DB:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(self.path, isolation_level=None)  # autocommit; we use BEGIN explicitly
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA foreign_keys=ON")
        self.conn.executescript(SCHEMA)

    @classmethod
    def for_client(cls, client_dir: str | Path) -> "DB":
        return cls(Path(client_dir) / "tachyon.db")

    def close(self) -> None:
        self.conn.close()

    # ── journal ──────────────────────────────────────────────────────────────
    def journal(self, action: str, target: str | None, intent: dict | None = None) -> int:
        cur = self.conn.execute(
            "INSERT INTO journal(ts, action, target, intent) VALUES (?,?,?,?)",
            (now(), action, target, json.dumps(intent) if intent is not None else None),
        )
        return cur.lastrowid

    def journal_outcome(self, journal_id: int, outcome: dict) -> None:
        self.conn.execute("UPDATE journal SET outcome=? WHERE id=?", (json.dumps(outcome), journal_id))

    # ── posts ────────────────────────────────────────────────────────────────
    def create_post(self, slot_id: str, client: str, **fields) -> sqlite3.Row:
        allowed = {"scheduled_at", "pillar", "angle", "hook_formula", "length_target", "cta",
                   "audio_type", "experiment_id", "trial", "engine", "note"}
        bad = set(fields) - allowed
        if bad:
            raise ValueError(f"unknown post fields {sorted(bad)}")
        cols = ["slot_id", "client", "state", "created_at", "updated_at", *fields]
        vals = [slot_id, client, "IDEA", now(), now(), *fields.values()]
        self.conn.execute(
            f"INSERT INTO posts({','.join(cols)}) VALUES ({','.join('?' * len(cols))})", vals
        )
        self.journal("post.create", slot_id, {"client": client, **fields})
        return self.post(slot_id)

    def post(self, slot_id: str) -> sqlite3.Row:
        row = self.conn.execute("SELECT * FROM posts WHERE slot_id=?", (slot_id,)).fetchone()
        if row is None:
            raise KeyError(slot_id)
        return row

    def posts(self, state: str | None = None) -> list[sqlite3.Row]:
        if state:
            return self.conn.execute(
                "SELECT * FROM posts WHERE state=? ORDER BY scheduled_at, slot_id", (state,)).fetchall()
        return self.conn.execute("SELECT * FROM posts ORDER BY scheduled_at, slot_id").fetchall()

    def set_state(self, slot_id: str, to: str, note: str | None = None, **updates) -> sqlite3.Row:
        """Transition with the state machine as the gatekeeper. Atomic.

        Extra keyword updates (ig_media_id, permalink, published_at, qa_verdict, ...) are
        written in the same transaction. Publishing is idempotent: QUEUED->PUBLISHING is
        refused if the post already has an ig_media_id.
        """
        allowed = {"ig_media_id", "permalink", "published_at", "qa_verdict", "qa_rounds",
                   "engine", "scheduled_at"}
        bad = set(updates) - allowed
        if bad:
            raise ValueError(f"unknown update fields {sorted(bad)}")
        self.conn.execute("BEGIN IMMEDIATE")
        try:
            row = self.post(slot_id)
            frm = row["state"]
            S.check(frm, to)
            if frm == "QUEUED" and to == "PUBLISHING" and row["ig_media_id"]:
                raise S.IllegalTransition(f"{slot_id} already published as {row['ig_media_id']}")
            if to == "PUBLISHED" and not (updates.get("ig_media_id") or row["ig_media_id"]):
                raise S.IllegalTransition("PUBLISHED requires an ig_media_id from Meta")
            if frm == "QA" and to == "SCRIPTED":
                updates["qa_rounds"] = row["qa_rounds"] + 1
            sets = ["state=?", "updated_at=?"]
            vals: list = [to, now()]
            if note is not None:
                sets.append("note=?"); vals.append(note)
            for k, v in updates.items():
                sets.append(f"{k}=?"); vals.append(v)
            vals.append(slot_id)
            self.conn.execute(f"UPDATE posts SET {', '.join(sets)} WHERE slot_id=?", vals)
            self.journal("post.state", slot_id, {"from": frm, "to": to, "note": note, **updates})
            self.conn.execute("COMMIT")
        except Exception:
            self.conn.execute("ROLLBACK")
            raise
        return self.post(slot_id)

    MOVABLE = ("IDEA", "BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL", "NEEDS_INPUT",
               "APPROVED", "QUEUED", "REJECTED")

    def move(self, slot_id: str, at: str, swap_with: str | None = None) -> None:
        """Calendar drag and drop: set a post's scheduled_at (and give the other post the old
        time when swapping). Live or publishing posts never move. Atomic, journaled."""
        self.conn.execute("BEGIN IMMEDIATE")
        try:
            a = self.post(slot_id)
            if a["state"] not in self.MOVABLE:
                raise ValueError(f"{slot_id} is {a['state']} and cannot move")
            if swap_with:
                b = self.post(swap_with)
                if b["state"] not in self.MOVABLE:
                    raise ValueError(f"{swap_with} is {b['state']} and cannot move")
                at = b["scheduled_at"]
                self.conn.execute("UPDATE posts SET scheduled_at=?, updated_at=? WHERE slot_id=?",
                                  (a["scheduled_at"], now(), swap_with))
            self.conn.execute("UPDATE posts SET scheduled_at=?, updated_at=? WHERE slot_id=?", (at, now(), slot_id))
            self.journal("post.move", slot_id, {"from": a["scheduled_at"], "to": at, "swap_with": swap_with})
            self.conn.execute("COMMIT")
        except Exception:
            self.conn.execute("ROLLBACK")
            raise

    # ── metrics, experiments, conversions, engagement, costs ─────────────────
    def add_snapshot(self, post_id: str | None, source: str, window: str, metrics: dict) -> None:
        self.conn.execute(
            "INSERT OR REPLACE INTO metric_snapshots(post_id, source, window, collected_at, metrics) VALUES (?,?,?,?,?)",
            (post_id, source, window, now(), json.dumps(metrics)),
        )

    def snapshots(self, post_id: str | None = None) -> list[dict]:
        q = "SELECT * FROM metric_snapshots" + (" WHERE post_id=?" if post_id else "") + " ORDER BY collected_at"
        rows = self.conn.execute(q, (post_id,) if post_id else ()).fetchall()
        return [{**dict(r), "metrics": json.loads(r["metrics"])} for r in rows]

    def add_experiment(self, id: str, week: str, variable: str, hypothesis: str,
                       primary_metric: str, guardrail_metric: str, window_days: int, min_samples: int = 3) -> None:
        self.conn.execute(
            "INSERT INTO experiments(id, week, variable, hypothesis, primary_metric, guardrail_metric, window_days, min_samples, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
            (id, week, variable, hypothesis, primary_metric, guardrail_metric, window_days, min_samples, now()),
        )

    def decide_experiment(self, id: str, verdict: str, directional_only: bool) -> None:
        self.conn.execute(
            "UPDATE experiments SET status='decided', verdict=?, directional_only=? WHERE id=?",
            (verdict, int(directional_only), id),
        )

    def add_conversion(self, source: str, event: str, occurred_at: str, post_id: str | None = None,
                       value: float | None = None, utm_campaign: str | None = None) -> None:
        self.conn.execute(
            "INSERT INTO conversions(post_id, source, event, value, utm_campaign, occurred_at) VALUES (?,?,?,?,?,?)",
            (post_id, source, event, value, utm_campaign, occurred_at),
        )

    def add_engage(self, date: str, account: str, post_url: str | None, planned_at: str | None, comment: str) -> int:
        cur = self.conn.execute(
            "INSERT INTO engage_log(date, account, post_url, planned_at, comment) VALUES (?,?,?,?,?)",
            (date, account, post_url, planned_at, comment),
        )
        return cur.lastrowid

    def tick_engage(self, id: int) -> None:
        self.conn.execute("UPDATE engage_log SET posted=1, posted_at=? WHERE id=?", (now(), id))

    def add_cost(self, kind: str, amount: float, unit: str, post_id: str | None = None) -> None:
        self.conn.execute(
            "INSERT INTO costs(post_id, kind, amount, unit, created_at) VALUES (?,?,?,?,?)",
            (post_id, kind, amount, unit, now()),
        )
