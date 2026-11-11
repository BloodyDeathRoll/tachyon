"""One SQLite file per client: clients/<name>/tachyon.db (docs/PLAN.md §3 station 6).

Tables: posts, metric_snapshots, experiments, conversions, engage_log, costs, journal.
Every state change and every write to Meta goes through `journal` (append-only).

With a Worker configured (spine/remote.py), `DB.for_client` gives a `RemoteDB` instead:
the same methods against D1 through the Worker, one request per method
(docs/CLOUDFLARE-PLAN.md). Callers never touch `.conn`; the raw SQL they need is a method here.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from . import remote as R
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
CREATE TABLE IF NOT EXISTS follower_snapshots (   -- one Instagram data export (spine/audience.py)
  id          INTEGER PRIMARY KEY,
  taken_at    TEXT NOT NULL,
  file_sha    TEXT NOT NULL UNIQUE,
  source      TEXT,
  n_followers INTEGER NOT NULL,
  n_following INTEGER
);
CREATE TABLE IF NOT EXISTS follower_members (
  snapshot_id INTEGER NOT NULL REFERENCES follower_snapshots(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,        -- follower | following
  username    TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, kind, username)
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
    def for_client(cls, client_dir: str | Path) -> "DB | RemoteDB":
        cfg = R.config()
        if cfg:
            return RemoteDB(Path(client_dir).name, cfg)
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

    def set_permalink(self, slot_id: str, permalink: str) -> None:
        """Backfill only: a published post whose permalink lookup failed at publish time."""
        self.conn.execute("UPDATE posts SET permalink=? WHERE slot_id=? AND ig_media_id IS NOT NULL AND permalink IS NULL",
                          (permalink, slot_id))

    def journal_outcome(self, journal_id: int, outcome: dict) -> None:
        self.conn.execute("UPDATE journal SET outcome=? WHERE id=? AND outcome IS NULL", (json.dumps(outcome), journal_id))   # write-once, as on the Worker

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

    def delete_post(self, slot_id: str) -> None:
        """Drop a video from the plan (its journal history stays)."""
        self.conn.execute("DELETE FROM posts WHERE slot_id=?", (slot_id,))   # autocommit

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
               "APPROVED", "QUEUED", "PAUSED", "REJECTED")

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

    # ── the raw SQL the callers used to run themselves ───────────────────────
    def scheduled_times(self, states) -> list[sqlite3.Row]:
        """(slot_id, scheduled_at) of every post in one of `states` that has a time (spine/schedule.py)."""
        states = tuple(states)
        if not states:
            return []
        return self.conn.execute(
            f"SELECT slot_id, scheduled_at FROM posts WHERE state IN ({','.join('?' * len(states))}) AND scheduled_at IS NOT NULL",
            states).fetchall()

    def set_scheduled(self, slot_id: str, at: str) -> None:
        """Publish now: the slot's time becomes `at`, journaled. Atomic."""
        self.post(slot_id)
        self.conn.execute("BEGIN IMMEDIATE")
        try:
            self.journal("post.scheduled_now", slot_id, {"scheduled_at": at})
            self.conn.execute("UPDATE posts SET scheduled_at=?, updated_at=? WHERE slot_id=?", (at, now(), slot_id))
            self.conn.execute("COMMIT")
        except Exception:
            self.conn.execute("ROLLBACK")
            raise

    def fail_count(self, slot_id: str) -> int:
        """How many times the slot went to FAILED (publish.py hands off after the second)."""
        return self.conn.execute(
            "SELECT count(*) FROM journal WHERE target=? AND action='post.state' AND json_extract(intent, '$.to')='FAILED'",
            (slot_id,)).fetchone()[0]

    def delete_snapshots(self, post_id: str | None, source: str, window: str) -> None:
        self.conn.execute("DELETE FROM metric_snapshots WHERE post_id IS ? AND source=? AND window=?", (post_id, source, window))

    def import_followers(self, got: dict, source: str) -> int | None:
        """One parsed Instagram export (spine/audience.py parse_export) as a snapshot with its
        members; None when this exact export is already in. One step."""
        self.conn.execute("BEGIN IMMEDIATE")   # the duplicate check and the insert are one step
        try:
            if self.conn.execute("SELECT 1 FROM follower_snapshots WHERE file_sha=?", (got["sha"],)).fetchone():
                self.conn.execute("ROLLBACK")
                return None
            cur = self.conn.execute(
                "INSERT INTO follower_snapshots(taken_at, file_sha, source, n_followers, n_following) VALUES (?,?,?,?,?)",
                (got["written"], got["sha"], source, len(got["followers"]), None if got["following"] is None else len(got["following"])))
            sid = cur.lastrowid
            self.conn.executemany("INSERT INTO follower_members VALUES (?,?,?)",
                                  [(sid, "follower", u) for u in sorted(got["followers"])]
                                  + [(sid, "following", u) for u in sorted(got["following"] or ())])
            self.conn.execute("COMMIT")
            return sid
        except Exception:
            if self.conn.in_transaction:
                self.conn.execute("ROLLBACK")
            raise

    def follower_dropped(self) -> dict:
        """Followers in the previous export who are gone from the newest one."""
        snaps = self.conn.execute("SELECT * FROM follower_snapshots ORDER BY taken_at DESC, id DESC LIMIT 2").fetchall()
        out = {"snapshots": len(snaps), "since": None, "at": snaps[0]["taken_at"] if snaps else None,
               "followers": snaps[0]["n_followers"] if snaps else None, "dropped": []}
        if len(snaps) == 2:
            new, old = snaps
            out["since"] = old["taken_at"]
            out["dropped"] = [r[0] for r in self.conn.execute(
                "SELECT username FROM follower_members WHERE snapshot_id=? AND kind='follower' "
                "AND username NOT IN (SELECT username FROM follower_members WHERE snapshot_id=? AND kind='follower') "
                "ORDER BY username", (old["id"], new["id"]))]
        return out


class Row(dict):
    """A row from the Worker, read like a sqlite3.Row: by name or position; iterating gives the values."""

    def __getitem__(self, key):
        if isinstance(key, int):
            return list(self.values())[key]
        return super().__getitem__(key)

    def __iter__(self):
        return iter(self.values())


class RemoteDB:
    """`DB`'s methods against D1 through the Worker (deploy/worker/src/db.ts): one request per
    method, scoped to one client, journaled by the Worker with the signed-in user. The
    Worker's answers come back as the exceptions the callers expect: KeyError for a missing
    post, state.IllegalTransition for a refused transition, ValueError for bad fields; anything
    else is a remote.RemoteError."""

    RETRIES = 3   # on "changed": the post moved under a write; every op reads it again and decides again (set_state, move, set_scheduled)

    def __init__(self, client: str, cfg: dict | None = None):
        self.client = client
        self.cfg = cfg or R.config()
        if not self.cfg:
            raise R.RemoteError(0, "config", "no Worker configured")

    def close(self) -> None:
        pass

    def _op(self, op: str, **args):
        for i in range(self.RETRIES):
            try:
                return R.call("POST", f"/api/db/{self.client}/{op}", args, cfg=self.cfg)["result"]
            except R.RemoteError as e:
                if e.status == 409 and e.error == "changed" and i < self.RETRIES - 1:
                    continue
                if e.status == 404 and e.error == "slot":
                    raise KeyError(args.get("slot_id")) from None
                if e.status == 409 and e.error == "transition":
                    raise S.IllegalTransition(e.detail or e.error) from None
                if e.status == 409 and e.error == "exists":   # what the SQLite backend raises for the same row
                    raise sqlite3.IntegrityError(e.detail or e.error) from None
                if e.status == 400 and e.error in ("fields", "move", "value"):
                    raise ValueError(e.detail or e.error) from None
                raise
        raise AssertionError("unreachable")

    def _rows(self, op: str, **args) -> list[Row]:
        return [Row(r) for r in self._op(op, **args)]

    # ── journal ──────────────────────────────────────────────────────────────
    def journal(self, action: str, target: str | None, intent: dict | None = None) -> int:
        return self._op("journal", action=action, target=target, intent=intent)

    def journal_outcome(self, journal_id: int, outcome: dict) -> None:
        self._op("journal_outcome", id=journal_id, outcome=outcome)

    def set_permalink(self, slot_id: str, permalink: str) -> None:
        self._op("set_permalink", slot_id=slot_id, permalink=permalink)

    # ── posts ────────────────────────────────────────────────────────────────
    def create_post(self, slot_id: str, client: str, **fields) -> Row:
        if client != self.client:
            raise ValueError(f"this DB is {self.client}'s, not {client}'s")
        return Row(self._op("create_post", slot_id=slot_id, fields=fields))

    def post(self, slot_id: str) -> Row:
        return Row(self._op("post", slot_id=slot_id))

    def delete_post(self, slot_id: str) -> None:
        self._op("delete_post", slot_id=slot_id)

    def posts(self, state: str | None = None) -> list[Row]:
        return self._rows("posts", state=state)

    def set_state(self, slot_id: str, to: str, note: str | None = None, **updates) -> Row:
        return Row(self._op("set_state", slot_id=slot_id, to=to, note=note, updates=updates))

    MOVABLE = DB.MOVABLE

    def move(self, slot_id: str, at: str, swap_with: str | None = None) -> None:
        self._op("move", slot_id=slot_id, at=at, swap_with=swap_with)

    # ── metrics, experiments, conversions, engagement, costs ─────────────────
    def add_snapshot(self, post_id: str | None, source: str, window: str, metrics: dict) -> None:
        self._snaps = None
        self._op("add_snapshot", post_id=post_id, source=source, window=window, metrics=metrics)

    _snaps: list[dict] | None = None

    def snapshots(self, post_id: str | None = None) -> list[dict]:
        """Every snapshot of the client in one request, kept for this object's life (a page, a
        job): a page asks per video, and one round trip each made the overview take ~45 s."""
        if self._snaps is None:
            self._snaps = self._op("snapshots", post_id=None)
        return [s for s in self._snaps if not post_id or s.get("post_id") == post_id]

    def add_experiment(self, id: str, week: str, variable: str, hypothesis: str,
                       primary_metric: str, guardrail_metric: str, window_days: int, min_samples: int = 3) -> None:
        self._op("add_experiment", id=id, week=week, variable=variable, hypothesis=hypothesis,
                 primary_metric=primary_metric, guardrail_metric=guardrail_metric, window_days=window_days,
                 min_samples=min_samples)

    def decide_experiment(self, id: str, verdict: str, directional_only: bool) -> None:
        self._op("decide_experiment", id=id, verdict=verdict, directional_only=bool(directional_only))

    def add_conversion(self, source: str, event: str, occurred_at: str, post_id: str | None = None,
                       value: float | None = None, utm_campaign: str | None = None) -> None:
        self._op("add_conversion", source=source, event=event, occurred_at=occurred_at, post_id=post_id,
                 value=value, utm_campaign=utm_campaign)

    def add_engage(self, date: str, account: str, post_url: str | None, planned_at: str | None, comment: str) -> int:
        return self._op("add_engage", date=date, account=account, post_url=post_url, planned_at=planned_at, comment=comment)

    def tick_engage(self, id: int) -> None:
        self._op("tick_engage", id=id)

    def add_cost(self, kind: str, amount: float, unit: str, post_id: str | None = None) -> None:
        self._op("add_cost", kind=kind, amount=amount, unit=unit, post_id=post_id)

    # ── the raw SQL the callers used to run themselves ───────────────────────
    def scheduled_times(self, states) -> list[Row]:
        return self._rows("scheduled_times", states=list(states))

    def set_scheduled(self, slot_id: str, at: str) -> None:
        self._op("set_scheduled", slot_id=slot_id, at=at)

    def fail_count(self, slot_id: str) -> int:
        return self._op("fail_count", slot_id=slot_id)

    def delete_snapshots(self, post_id: str | None, source: str, window: str) -> None:
        self._snaps = None
        self._op("delete_snapshots", post_id=post_id, source=source, window=window)

    def import_followers(self, got: dict, source: str) -> int | None:
        return self._op("import_followers", taken_at=got["written"], sha=got["sha"], source=source,
                        followers=sorted(got["followers"]),
                        following=None if got["following"] is None else sorted(got["following"]))

    def follower_dropped(self) -> dict:
        return self._op("follower_dropped")

    # ── only online: the post's text files and the clients row ─────────────
    def set_files(self, slot_id: str, files: dict[str, str]) -> None:
        """posts/<slot>/caption.txt, first_comment.txt, meta.json as this PC has them."""
        self._op("set_files", slot_id=slot_id, files=files)

    def files(self, slot_id: str) -> dict[str, str]:
        return self._op("files", slot_id=slot_id)

    def client_row(self) -> dict:
        """The clients row (grants, publisher, connected, ...), never the token."""
        return self._op("client")

    def set_grants(self, grants: dict, emergency_stop: bool | None = None) -> None:
        self._op("set_grants", grants=grants, emergency_stop=emergency_stop)

    def client_files(self) -> list[dict]:
        """clients/<c>/*.md as rows: name, text, version, updated_by, updated_at."""
        return self._op("client_files")

    def set_client_file(self, name: str, text: str) -> None:
        self._op("set_client_file", name=name, text=text)
