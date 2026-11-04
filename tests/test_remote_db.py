"""spine/db.py RemoteDB: the Worker's answers come back as the local DB's exceptions (a
fake transport), and the same scenarios as test_state_db.py pass against the real Worker
in Miniflare (deploy/worker/test/serve.mjs; skipped when its node_modules are missing)."""

from __future__ import annotations

import io
import json
import subprocess
import urllib.error
from pathlib import Path

import pytest

from spine import remote as R
from spine import state as S
from spine.db import DB, RemoteDB, Row

ROOT = Path(__file__).resolve().parent.parent
WORKER = ROOT / "deploy" / "worker"
CFG = {"api": "http://w", "token": "t", "host": "pc"}


class Fake:
    """An opener answering from a script of (status, body) per call; records the requests."""

    def __init__(self, *answers):
        self.answers, self.calls = list(answers), []

    def __call__(self, req, timeout=0):
        self.calls.append((req.get_method(), req.full_url, json.loads(req.data) if req.data else None))
        status, body = self.answers.pop(0)
        if status >= 400:
            raise urllib.error.HTTPError(req.full_url, status, "x", {}, io.BytesIO(json.dumps(body).encode()))
        r = io.BytesIO(json.dumps(body).encode())
        r.status = status
        r.__enter__ = lambda *a: r
        r.__exit__ = lambda *a: None
        return r


def test_errors_map_to_the_local_exceptions(monkeypatch):
    fake = Fake((404, {"error": "slot", "detail": "no post s"}),
                (409, {"error": "transition", "detail": "IDEA -> PUBLISHED is not allowed"}),
                (400, {"error": "fields", "detail": 'unknown post fields ["colour"]'}),
                (401, {"error": "auth"}))
    monkeypatch.setattr(R, "opener", fake)
    db = RemoteDB("rosa", CFG)
    with pytest.raises(KeyError):
        db.post("s")
    with pytest.raises(S.IllegalTransition, match="not allowed"):
        db.set_state("s", "PUBLISHED")
    with pytest.raises(ValueError, match="colour"):
        db.create_post("s", "rosa", colour="blue")
    with pytest.raises(R.RemoteError) as e:
        db.posts()
    assert e.value.status == 401
    assert fake.calls[0] == ("POST", "http://w/api/db/rosa/post", {"slot_id": "s"})
    assert fake.calls[1][2] == {"slot_id": "s", "to": "PUBLISHED", "note": None, "updates": {}}
    with pytest.raises(ValueError, match="not acme"):
        db.create_post("s", "acme")


def test_a_changed_post_is_read_again(monkeypatch):
    fake = Fake((409, {"error": "changed"}), (200, {"result": {"slot_id": "s", "state": "BRIEFED"}}))
    monkeypatch.setattr(R, "opener", fake)
    row = RemoteDB("rosa", CFG).set_state("s", "BRIEFED")
    assert row["state"] == "BRIEFED" and len(fake.calls) == 2


def test_row_reads_like_sqlite():
    r = Row({"slot_id": "s", "state": "IDEA"})
    assert r["slot_id"] == "s" and r[1] == "IDEA" and tuple(r) == ("s", "IDEA") and dict(r) == {"slot_id": "s", "state": "IDEA"}
    assert list(r.keys()) == ["slot_id", "state"] and json.loads(json.dumps(r)) == dict(r)


def test_for_client_picks_the_worker_from_the_environment(monkeypatch, tmp_path):
    monkeypatch.setenv("TACHYON_API", "http://w/")
    monkeypatch.setenv("TACHYON_TOKEN", "t")
    db = DB.for_client(tmp_path / "rosa")
    assert isinstance(db, RemoteDB) and db.client == "rosa" and db.cfg["api"] == "http://w"
    monkeypatch.setenv("TACHYON_API", "")
    assert isinstance(DB.for_client(tmp_path), DB)
    monkeypatch.delenv("TACHYON_API")
    monkeypatch.setenv("TACHYON_HOME", str(tmp_path / "home"))
    assert R.config() is None
    R.save_config({"api": "http://x", "token": "k", "host": "pc"})
    assert R.config() == {"api": "http://x", "token": "k", "host": "pc"}
    assert isinstance(DB.for_client(tmp_path / "rosa"), RemoteDB)


# ── against the Worker in Miniflare ──────────────────────────────────────────

@pytest.fixture(scope="module")
def worker():
    if not (WORKER / "node_modules").exists():
        pytest.skip("deploy/worker has no node_modules (npm install)")
    p = subprocess.Popen(["node", "test/serve.mjs"], cwd=WORKER, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    try:
        line = p.stdout.readline()
        if not line:
            pytest.fail(f"serve.mjs gave no address (exit {p.wait()})")
        yield json.loads(line)
    finally:
        p.stdin.close()
        p.wait(timeout=30)


@pytest.fixture
def db(worker, monkeypatch, tmp_path):
    monkeypatch.setenv("TACHYON_API", worker["url"])
    monkeypatch.setenv("TACHYON_TOKEN", worker["token"])
    d = DB.for_client(tmp_path / "rosa")
    assert isinstance(d, RemoteDB)
    return d


def walk(db, slot, *states):
    for s in states:
        db.set_state(slot, s)


QUEUED = ("BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL", "APPROVED", "QUEUED")


def test_every_main_state_reachable_in_order(db):
    db.create_post("w01-s1", "rosa", pillar="proof")
    walk(db, "w01-s1", *QUEUED, "PUBLISHING")
    db.set_state("w01-s1", "PUBLISHED", ig_media_id="1789", permalink="https://instagram.com/reel/x")
    walk(db, "w01-s1", "MEASURING", "ANALYZED")
    row = db.post("w01-s1")
    assert row["state"] == "ANALYZED" and row["pillar"] == "proof" and row["version"] == 11
    assert [r["slot_id"] for r in db.posts("ANALYZED")] == ["w01-s1"]


def test_illegal_transition_is_refused(db):
    db.create_post("s", "rosa")
    with pytest.raises(S.IllegalTransition):
        db.set_state("s", "PUBLISHED")
    assert db.post("s")["state"] == "IDEA"
    with pytest.raises(KeyError):
        db.post("nope")
    with pytest.raises(ValueError):
        db.create_post("s2", "rosa", colour="blue")


def test_publish_is_idempotent_and_failures_count(db):
    db.create_post("p", "rosa")
    walk(db, "p", *QUEUED, "PUBLISHING", "FAILED")
    assert db.fail_count("p") == 1
    walk(db, "p", "QUEUED", "PUBLISHING")
    db.set_state("p", "PUBLISHED", ig_media_id="1790")
    with pytest.raises(ValueError, match="colour"):
        db.set_state("p", "MEASURING", **{"colour": "blue"})   # bad field: refused before anything
    assert db.post("p")["state"] == "PUBLISHED"


def test_qa_rounds_note_and_journal(db):
    db.create_post("q", "rosa")
    walk(db, "q", "BRIEFED", "SCRIPTED", "RENDERED", "QA", "SCRIPTED")
    assert db.post("q")["qa_rounds"] == 1
    walk(db, "q", "RENDERED", "QA", "NEEDS_APPROVAL")
    db.set_state("q", "REJECTED", note="hook is a question, not a claim")
    assert db.post("q")["note"].startswith("hook")
    j = db.journal("meta.container.create", "q", {"a": 1})
    db.journal_outcome(j, {"id": "c1"})
    assert isinstance(j, int)


def test_move_swap_and_times(db):
    db.create_post("m1", "rosa", scheduled_at="2030-01-01T06:30:00+00:00")
    db.create_post("m2", "rosa", scheduled_at="2030-01-01T18:30:00+00:00")
    db.move("m1", "", swap_with="m2")
    assert db.post("m1")["scheduled_at"] == "2030-01-01T18:30:00+00:00"
    db.move("m2", "2030-02-02T06:30:00+00:00")
    assert {r["slot_id"]: r["scheduled_at"] for r in db.scheduled_times(["IDEA"]) if r["slot_id"].startswith("m")} == {
        "m1": "2030-01-01T18:30:00+00:00", "m2": "2030-02-02T06:30:00+00:00"}
    db.set_scheduled("m2", "2031-01-01T00:00:00+00:00")
    assert db.post("m2")["scheduled_at"] == "2031-01-01T00:00:00+00:00"
    with pytest.raises(ValueError, match="cannot move"):
        db.move("w01-s1", "2030-01-01T06:30:00+00:00")
    db.delete_post("m2")
    with pytest.raises(KeyError):
        db.post("m2")


def test_snapshots_and_followers(db):
    db.add_snapshot("s", "ig_media", "24h", {"views": 10})
    db.add_snapshot("s", "ig_media", "24h", {"views": 12})
    snaps = db.snapshots("s")
    assert [x["window"] for x in snaps] == ["24h"] and snaps[0]["metrics"]["views"] == 12
    db.add_snapshot(None, "ig_account", "7d", {"reach": 1})
    db.delete_snapshots(None, "ig_account", "7d")
    assert not [x for x in db.snapshots() if x["window"] == "7d"]
    assert db.import_followers({"written": "2026-01-01T00:00:00+00:00", "sha": "a", "followers": {"ann", "bo"}, "following": None}, "a.zip")
    assert db.import_followers({"written": "2026-01-01T00:00:00+00:00", "sha": "a", "followers": {"ann"}, "following": None}, "a.zip") is None
    db.import_followers({"written": "2026-02-01T00:00:00+00:00", "sha": "b", "followers": {"ann"}, "following": {"z"}}, "b.zip")
    assert db.follower_dropped() == {"snapshots": 2, "since": "2026-01-01T00:00:00+00:00", "at": "2026-02-01T00:00:00+00:00",
                                     "followers": 1, "dropped": ["bo"]}
