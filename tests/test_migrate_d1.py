"""spine/migrate_d1.py: the SQL it writes loads into the Worker's schema and can run twice."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest
import yaml

from spine import clients as C
from spine import migrate_d1
from spine.db import DB

ROOT = Path(__file__).resolve().parent.parent
SCHEMA = ROOT / "deploy" / "worker" / "schema.sql"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(C, "CLIENTS", tmp_path)
    d = tmp_path / "t"
    (d / "posts" / "w01-s1").mkdir(parents=True)
    (d / "grants.yaml").write_text(yaml.safe_dump({**C.DEFAULT_GRANTS, "page_id": "1", "ig_user_id": "178",
                                                   "display_name": "Tee", "slots": ["06:30"], "bio_link": {"key": "k"}}))
    (d / "brand.md").write_text("# Tee's brand\n")
    (d / "posts" / "w01-s1" / "caption.txt").write_text("It's a caption; with 'quotes'.\n")
    (d / "posts" / "w01-s1" / "meta.json").write_text('{"title": "x"}\n')
    db = DB.for_client(d)
    db.create_post("w01-s1", "t", pillar="proof", trial=1)
    db.create_post("w01-s2", "t")
    for s in ("BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL", "APPROVED", "QUEUED", "PUBLISHING"):
        db.set_state("w01-s1", s)
    db.set_state("w01-s1", "PUBLISHED", ig_media_id="1789", permalink="https://x")
    db.add_snapshot("w01-s1", "ig_media", "24h", {"views": 10})
    db.add_snapshot(None, "ig_account", "daily", {"date": "2026-01-01"})
    db.add_experiment("e1", "w01", "hook", "h", "views", "reach", 7)
    db.add_cost("render", 2.0, "min", "w01-s1")
    db.import_followers({"written": "2026-01-01T00:00:00+00:00", "sha": "a", "followers": {"ann", "bo"}, "following": None}, "a.zip")
    db.close()
    return "t"


def load(sql: str) -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA.read_text())
    conn.executescript(sql)
    return conn


def test_dump_loads_into_the_worker_schema_and_is_rerunnable(client):
    sql = migrate_d1.dump(client, now_ms=5)
    conn = load(sql)
    count = lambda t: conn.execute(f"SELECT count(*) FROM {t}").fetchone()[0]  # noqa: E731
    assert count("posts") == 2
    assert count("journal") == 11
    assert count("metric_snapshots") == 2
    assert count("experiments") == 1
    assert count("costs") == 1
    assert count("follower_snapshots") == 1
    assert count("follower_members") == 2
    assert count("post_files") == 2
    assert count("client_files") == 1
    row = conn.execute("SELECT client, state, ig_media_id, trial, version FROM posts WHERE slot_id='w01-s1'").fetchone()
    assert row == ("t", "PUBLISHED", "1789", 1, 0)
    assert conn.execute("SELECT text FROM post_files WHERE name='caption.txt'").fetchone()[0] == "It's a caption; with 'quotes'.\n"
    c = conn.execute("SELECT id, name, page_id, ig_user_id, grants, publisher, created_at FROM clients").fetchone()
    assert c[:4] == ("t", "Tee", "1", "178")
    assert '"slots": ["06:30"]' in c[4] and '"bio_link"' in c[4] and "page_id" not in c[4]
    assert c[5:] == ("local", 5)
    assert conn.execute("SELECT json_extract(intent, '$.to') FROM journal WHERE action='post.state' ORDER BY id DESC LIMIT 1").fetchone()[0] == "PUBLISHED"
    # a second run replaces, never doubles
    conn.executescript(sql)
    assert count("posts") == 2 and count("journal") == 11 and count("follower_members") == 2 and count("clients") == 1


def test_quote():
    assert migrate_d1.quote(None) == "NULL"
    assert migrate_d1.quote(True) == "1"
    assert migrate_d1.quote(1.5) == "1.5"
    assert migrate_d1.quote("it's") == "'it''s'"
    assert migrate_d1.quote(b"\x00\xff") == "X'00ff'"
