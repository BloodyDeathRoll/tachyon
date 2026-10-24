import pytest

from spine import state as S
from spine.db import DB


def walk(db, slot, *states):
    for s in states:
        db.set_state(slot, s)


@pytest.fixture
def db(tmp_path):
    d = DB.for_client(tmp_path)
    yield d
    d.close()


def test_every_main_state_reachable_in_order(db):
    db.create_post("w01-s1", "rosa", pillar="proof")
    walk(db, "w01-s1", "BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL", "APPROVED", "QUEUED", "PUBLISHING")
    db.set_state("w01-s1", "PUBLISHED", ig_media_id="1789", permalink="https://instagram.com/reel/x")
    walk(db, "w01-s1", "MEASURING", "ANALYZED")
    assert db.post("w01-s1")["state"] == "ANALYZED"


def test_illegal_transition_is_refused_and_rolled_back(db):
    db.create_post("s", "rosa")
    with pytest.raises(S.IllegalTransition):
        db.set_state("s", "PUBLISHED")
    assert db.post("s")["state"] == "IDEA"


def test_published_needs_media_id(db):
    db.create_post("s", "rosa")
    walk(db, "s", "BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL", "APPROVED", "QUEUED", "PUBLISHING")
    with pytest.raises(S.IllegalTransition):
        db.set_state("s", "PUBLISHED")


def test_publish_is_idempotent_on_slot(db):
    db.create_post("s", "rosa")
    walk(db, "s", "BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL", "APPROVED", "QUEUED", "PUBLISHING")
    db.set_state("s", "FAILED")                       # transient failure after Meta actually created it
    db.conn.execute("UPDATE posts SET ig_media_id='1789' WHERE slot_id='s'")
    db.set_state("s", "QUEUED")
    with pytest.raises(S.IllegalTransition, match="already published"):
        db.set_state("s", "PUBLISHING")


def test_qa_rounds_then_needs_input(db):
    db.create_post("s", "rosa")
    walk(db, "s", "BRIEFED", "SCRIPTED", "RENDERED", "QA")
    assert S.next_after_qa("VERDICT: NEEDS_REVISION", 0) == "SCRIPTED"
    db.set_state("s", "SCRIPTED")
    assert db.post("s")["qa_rounds"] == 1
    walk(db, "s", "RENDERED", "QA", "SCRIPTED", "RENDERED", "QA")
    assert db.post("s")["qa_rounds"] == 2
    assert S.next_after_qa("VERDICT: NEEDS_REVISION", 2) == "NEEDS_INPUT"
    db.set_state("s", "NEEDS_INPUT")
    assert S.next_after_qa("VERDICT: APPROVED", 2) == "NEEDS_APPROVAL"


def test_rejected_goes_back_to_script_with_note(db):
    db.create_post("s", "rosa")
    walk(db, "s", "BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL")
    db.set_state("s", "REJECTED", note="hook is a question, not a claim")
    assert db.post("s")["note"].startswith("hook")
    db.set_state("s", "SCRIPTED")


def test_journal_records_every_transition(db):
    db.create_post("s", "rosa")
    walk(db, "s", "BRIEFED", "SCRIPTED")
    rows = db.conn.execute("SELECT action, target FROM journal ORDER BY id").fetchall()
    assert [tuple(r) for r in rows] == [("post.create", "s"), ("post.state", "s"), ("post.state", "s")]


def test_snapshots_upsert_per_window(db):
    db.create_post("s", "rosa")
    db.add_snapshot("s", "ig_media", "24h", {"views": 10})
    db.add_snapshot("s", "ig_media", "24h", {"views": 12})
    db.add_snapshot("s", "ig_media", "72h", {"views": 40})
    snaps = db.snapshots("s")
    assert [s["window"] for s in snaps] == ["24h", "72h"]
    assert snaps[0]["metrics"]["views"] == 12


def test_unknown_fields_refused(db):
    with pytest.raises(ValueError):
        db.create_post("s", "rosa", colour="blue")
