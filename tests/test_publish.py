"""publish.py, spec_check.py and insights.py against a fake Graph and a synthetic clip."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest
import yaml

from spine import clients as C
from spine.db import DB
from spine.measure import insights
from spine.publisher import publish, spec_check
from spine.publisher.graph import GraphError

SLOT = "2099-w01-01"


def make_clip(path: Path, seconds: float = 16, size: str = "1080x1920", fps: int = 30) -> None:
    subprocess.run([
        "ffmpeg", "-v", "error", "-y",
        # a dark ground with a moving white card inside the safe box (decision 14), so the
        # safe-zone guard passes; testsrc2 would put edges in every band
        "-f", "lavfi", "-i", f"color=c=0x0b1220:size={size}:rate={fps}:duration={seconds},"
                             f"drawbox=x=iw*0.15:y=ih*0.2+20*sin(t):w=iw*0.7:h=ih*0.35:c=white:t=fill",
        "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}",
        "-metadata", "title=should be stripped",
        "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
        "-shortest", str(path)], check=True)


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(C, "CLIENTS", tmp_path)
    d = tmp_path / "t"
    (d / "posts" / SLOT).mkdir(parents=True)
    (d / "assets").mkdir()
    (d / "grants.yaml").write_text(yaml.safe_dump({**C.DEFAULT_GRANTS, "page_id": "1", "ig_user_id": "178",
                                                   "token_env": "T_TOKEN"}))
    (d / "assets" / "provenance.yaml").write_text(yaml.safe_dump({"assets": [
        {"file": "src.mp4", "source": "test", "licence": "ours", "allowed_use": "tests", "generative": False}]}))
    raw = tmp_path / "raw.mp4"
    make_clip(raw)
    spec_check.fix(raw, d / "posts" / SLOT / "video.mp4")
    (d / "posts" / SLOT / "caption.txt").write_text("Caption here. Link in bio.")
    (d / "posts" / SLOT / "first_comment.txt").write_text("Which spot should we feature next?")
    (d / "posts" / SLOT / "meta.json").write_text(json.dumps({"source_asset": "src.mp4", "duration_s": 16, "thumb_offset": 2000, "story": False, "story_reason": "test"}))
    db = DB.for_client(d)
    db.create_post(SLOT, "t", pillar="p")
    for s in ("BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL", "APPROVED", "QUEUED"):
        db.set_state(SLOT, s)
    db.close()
    monkeypatch.setenv("T_TOKEN", "tok")
    return "t"


class FakeGraph:
    def __init__(self, fail_publish: bool = False, statuses=("IN_PROGRESS", "FINISHED")):
        self.calls: list[tuple] = []
        self.fail_publish = fail_publish
        self.statuses = list(statuses)

    def publishing_quota(self, ig):
        return 3

    def write(self, path, **p):
        self.calls.append(("write", path, p))
        if path.endswith("/media"):
            assert p["media_type"] == "REELS" and p["upload_type"] == "resumable"
            assert "is_ai_generated" not in p
            return {"id": "C1", "uri": "https://rupload.test/C1"}
        if path.endswith("/media_publish"):
            if self.fail_publish:
                raise GraphError(9007, 2207027, "media not ready")
            return {"id": "M1"}
        if path.endswith("/comments"):
            return {"id": "K1"}
        raise AssertionError(path)

    def upload(self, cid, video):
        self.calls.append(("upload", cid, len(video)))
        return {"success": True}

    def container_status(self, cid):
        return {"status_code": self.statuses.pop(0) if len(self.statuses) > 1 else self.statuses[0]}

    def media(self, mid, fields=None):
        return {"id": mid, "permalink": "https://www.instagram.com/reel/x/", "timestamp": "2099-01-01T00:00:00+0000"}

    def get(self, path, **p):
        return {"followers_count": 10, "media_count": 1}

    def media_insights(self, mid, metrics):
        if metrics == ["reels_skip_rate"]:
            raise GraphError(100, None, "unsupported")
        return {m: {"views": 1000, "reach": 800, "shares": 16, "likes": 40, "saved": 8, "follows": 4,
                    "comments": 2, "ig_reels_avg_watch_time": 9000}.get(m, 0) for m in metrics}

    def account_insights(self, ig, metrics, period="day", metric_type="total_value"):
        return {m: 5 for m in metrics}


def test_spec_check_passes_after_fix_and_fails_raw(client, tmp_path):
    d = C.client_dir(client)
    assert spec_check.check_file(d / "posts" / SLOT / "video.mp4") == []
    raw = tmp_path / "raw.mp4"
    issues = spec_check.check_file(raw)
    assert any("metadata tags" in i for i in issues)          # title tag survives on the raw file
    short = tmp_path / "short.mp4"
    make_clip(short, seconds=5, size="720x1280")
    issues = spec_check.check_file(short)
    assert any("size" in i for i in issues) and any("duration" in i for i in issues)


def test_spec_check_provenance_rules(client):
    assert spec_check.check_provenance(client, None) == ["meta.json has no source_asset"]
    assert spec_check.check_provenance(client, "nope.mp4") == ["no provenance entry for nope.mp4"]
    assert spec_check.check_provenance(client, "src.mp4") == []
    ok, text = spec_check.report(client, SLOT)
    assert ok and text.startswith("## spec_check") and "PASS" in text
    assert (C.client_dir(client) / "posts" / SLOT / "qa.md").exists()


def test_publish_dry_run_builds_container_params(client):
    out = publish.publish_slot(client, SLOT, dry_run=True)
    assert out["dry_run"] and out["container_params"]["thumb_offset"] == "2000"
    assert "trial_params" not in out["container_params"]


def test_publish_happy_path_is_idempotent(client):
    g = FakeGraph()
    out = publish.publish_slot(client, SLOT, graph=g, sleep=lambda s: None)
    assert out["ig_media_id"] == "M1" and out["first_comment_id"] == "K1"
    db = DB.for_client(C.client_dir(client))
    row = db.post(SLOT)
    assert row["state"] == "MEASURING" and row["ig_media_id"] == "M1" and row["permalink"]
    actions = [json.loads(r["intent"] or "{}") | {"a": r["action"]} for r in db.conn.execute("SELECT * FROM journal")]
    assert [a["a"] for a in actions if a["a"].startswith("meta.")] == [
        "meta.container.create", "meta.container.upload", "meta.media_publish", "meta.comment.create"]
    db.close()
    with pytest.raises(publish.PublishError, match="MEASURING, not QUEUED"):
        publish.publish_slot(client, SLOT, graph=g, sleep=lambda s: None)


def test_publish_failure_goes_to_failed_then_handoff(client):
    g = FakeGraph(fail_publish=True)
    with pytest.raises(GraphError):
        publish.publish_slot(client, SLOT, graph=g, sleep=lambda s: None)
    d = C.client_dir(client)
    db = DB.for_client(d)
    assert db.post(SLOT)["state"] == "FAILED"
    db.set_state(SLOT, "QUEUED")
    db.close()
    with pytest.raises(GraphError):
        publish.publish_slot(client, SLOT, graph=g, sleep=lambda s: None)
    db = DB.for_client(d)
    assert db.post(SLOT)["state"] == "MANUAL_HANDOFF"
    assert (d / "posts" / SLOT / "handoff.md").exists()
    db.close()


def test_publish_respects_emergency_stop(client):
    C.set_flag(client, "emergency_stop", True)
    with pytest.raises(publish.PublishError, match="emergency_stop"):
        publish.publish_slot(client, SLOT, graph=FakeGraph(), sleep=lambda s: None)


def test_insights_snapshots_and_due(client):
    g = FakeGraph()
    publish.publish_slot(client, SLOT, graph=g, sleep=lambda s: None)
    from datetime import datetime, timedelta, timezone
    assert insights.due(client, at=datetime(2099, 1, 1, tzinfo=timezone.utc)) == []
    assert insights.due(client, at=datetime(2099, 1, 2, 1, tzinfo=timezone.utc)) == [(SLOT, "24h")]
    m = insights.snapshot_media(client, SLOT, "24h", graph=g)
    assert m["reels_skip_rate"] is None and m["_derived"]["sends_per_reach"] == 16 / 800
    assert abs(m["_derived"]["hold"] - 9 / 16) < 1e-9
    assert insights.snapshot_media(client, SLOT, "24h", graph=g) is None      # UNIQUE: no-op
    insights.snapshot_media(client, SLOT, "7d", graph=g)
    db = DB.for_client(C.client_dir(client))
    assert db.post(SLOT)["state"] == "ANALYZED"
    db.close()
    assert insights.snapshot_account(client, graph=g, day="2099-01-02")["followers_count"] == 10
    assert insights.snapshot_account(client, graph=g, day="2099-01-02") is None


def test_publish_refuses_url_in_first_comment(client):
    (C.client_dir(client) / "posts" / SLOT / "first_comment.txt").write_text("link: https://example.test/")
    with pytest.raises(publish.PublishError, match="not clickable"):
        publish.publish_slot(client, SLOT, graph=FakeGraph(), sleep=lambda s: None)


class FakeRun:
    """Stands in for subprocess.run: records the vercel api call, returns a JSON reply."""
    def __init__(self, rc=0, out='{"status":"ok"}', err=""):
        self.rc, self.out, self.err, self.calls = rc, out, err, []

    def __call__(self, cmd, **kw):
        import json as _j, pathlib as _p
        body = None
        if "--input" in cmd:
            body = _j.loads(_p.Path(cmd[cmd.index("--input") + 1]).read_text())
        self.calls.append((cmd[2], cmd[4], body))
        class R: pass
        r = R(); r.returncode, r.stdout, r.stderr = self.rc, self.out, self.err
        return r


def test_links_set_target_upserts_and_refuses_foreign_host():
    from spine.publisher import links
    grants = {"bio_link": {"public_url": "https://rosa.surf/ig", "edge_config_id": "ecfg_x", "team_id": "team_y", "key": "rosa_ig"}}
    run = FakeRun()
    links.set_target(grants, "https://rosa.surf/?utm_campaign=s1", runner=run)
    path, method, body = run.calls[0]
    assert path == "/v1/edge-config/ecfg_x/items?teamId=team_y" and method == "PATCH"
    assert body == {"items": [{"operation": "upsert", "key": "rosa_ig", "value": "https://rosa.surf/?utm_campaign=s1"}]}
    with pytest.raises(links.LinkError, match="foreign host"):
        links.set_target(grants, "https://evil.example/", runner=run)
    with pytest.raises(links.LinkError, match="vercel api"):
        links.set_target(grants, "https://rosa.surf/x", runner=FakeRun(rc=1, err="not logged in"))


def test_publish_moves_bio_link_after_publish(client):
    d = C.client_dir(client)
    g = C.load_grants(client)
    g["bio_link"] = {"public_url": "https://rosa.surf/ig", "edge_config_id": "ecfg_x", "team_id": "team_y", "key": "rosa_ig"}
    C.save_grants(client, g)
    meta = json.loads((d / "posts" / SLOT / "meta.json").read_text())
    meta["bio_link_while_live"] = "https://rosa.surf/?utm_campaign=" + SLOT
    (d / "posts" / SLOT / "meta.json").write_text(json.dumps(meta))
    run = FakeRun()
    publish.publish_slot(client, SLOT, graph=FakeGraph(), sleep=lambda s: None, link_runner=run)
    assert run.calls and run.calls[0][2]["items"][0]["value"].endswith(SLOT)
    db = DB.for_client(d)
    acts = [r["action"] for r in db.conn.execute("SELECT action FROM journal WHERE target=?", (SLOT,))]
    assert "bio_link.set" in acts
    db.close()


class HandGraph:
    """Two recent posts on the account; M9 is the one posted by hand."""
    def get(self, path, **p):
        assert path == "178/media"
        return {"data": [{"id": "M9", "caption": "Caption here. Link in bio.", "timestamp": "2099-01-05T18:31:00+0000",
                          "permalink": "https://instagram.test/p/M9"},
                         {"id": "M8", "caption": "older", "timestamp": "2099-01-04T18:30:00+0000"}]}

    def media(self, media_id):
        return {"id": media_id, "permalink": f"https://instagram.test/p/{media_id}", "timestamp": "2099-01-05T18:31:00+0000"}


def test_link_by_hand_attaches_post_and_measures(client):
    out = publish.link_by_hand(client, SLOT, "M9", graph=HandGraph())
    assert out["ig_media_id"] == "M9"
    db = DB.for_client(C.client_dir(client))
    row = db.post(SLOT)
    assert row["state"] == "MEASURING" and row["ig_media_id"] == "M9"
    assert row["published_at"].startswith("2099-01-05")
    db.close()
    # once linked, it is no longer offered for another slot
    assert [c["id"] for c in publish.hand_candidates(client, graph=HandGraph())] == ["M8"]


def test_link_by_hand_refuses_unknown_media(client):
    with pytest.raises(publish.PublishError):
        publish.link_by_hand(client, SLOT, "NOT_OURS", graph=HandGraph())
    db = DB.for_client(C.client_dir(client))
    assert db.post(SLOT)["state"] == "QUEUED"
    db.close()


def test_queue_skips_slot_linked_by_hand(client):
    publish.link_by_hand(client, SLOT, "M9", graph=HandGraph())
    g = FakeGraph()
    with pytest.raises(publish.PublishError):
        publish.publish_slot(client, SLOT, graph=g, sleep=lambda s: None)
    assert not g.calls


def test_link_by_hand_moves_bio_link_and_is_idempotent(client, monkeypatch):
    d = C.client_dir(client)
    meta = json.loads((d / "posts" / SLOT / "meta.json").read_text())
    (d / "posts" / SLOT / "meta.json").write_text(json.dumps({**meta, "bio_link_while_live": "https://rosa.test/?c=1"}))
    g = yaml.safe_load((d / "grants.yaml").read_text())
    g["bio_link"] = {"edge_config_id": "e", "team_id": "t", "key": "k", "public_url": "https://rosa.test/ig"}
    (d / "grants.yaml").write_text(yaml.safe_dump(g))
    ran = []

    class R:
        returncode, stdout, stderr = 0, "{}", ""
    monkeypatch.setattr(publish.subprocess, "run", lambda cmd, **kw: ran.append(cmd) or R())
    publish.link_by_hand(client, SLOT, "M9", graph=HandGraph())   # no runner passed: default is used
    assert ran and ran[0][0] == "vercel"
    db = DB.for_client(d)
    assert db.post(SLOT)["state"] == "MEASURING"
    db.close()
    assert publish.link_by_hand(client, SLOT, "M9", graph=HandGraph())["ig_media_id"] == "M9"   # second click


def test_lookup_failure_after_publish_never_reposts(client):
    """media_publish succeeded but the follow-up lookup failed: the slot is PUBLISHED with the id,
    never FAILED (FAILED -> QUEUED would post the reel twice)."""
    class LookupFails(FakeGraph):
        def media(self, mid, fields=None):
            raise GraphError(2, None, "transient")
    g = LookupFails()
    out = publish.publish_slot(client, SLOT, graph=g, sleep=lambda s: None)
    assert out["ig_media_id"] == "M1"
    db = DB.for_client(C.client_dir(client))
    row = db.post(SLOT)
    assert row["ig_media_id"] == "M1" and row["state"] == "MEASURING"
    db.close()


def test_queue_survives_one_bad_slot(client, monkeypatch):
    def boom(c, s, **kw):
        raise RuntimeError("unexpected")
    monkeypatch.setattr(publish, "publish_slot", boom)
    db = DB.for_client(C.client_dir(client))
    db.conn.execute("UPDATE posts SET scheduled_at='2000-01-01T00:00:00+00:00' WHERE slot_id=?", (SLOT,))
    db.close()
    assert publish.run_queue(client) == [{"slot_id": SLOT, "error": "unexpected"}]


@pytest.mark.parametrize("text,bad", [("Which spot next?", False), ("Get it at rosa.surf", True),
                                      ("www.example.org", True), ("https://x.y/z", True)])
def test_first_comment_url_guard(text, bad):
    assert bool(publish.URLISH.search(text)) is bad


def test_now_on_unknown_slot_says_so(client, capsys):
    assert publish.main([client, "nope", "--now", "--dry-run"]) == 1
    assert "no such slot" in capsys.readouterr().out


def test_media_publish_without_answer_hands_off_never_retries(client):
    """A timeout on media_publish may still have posted the reel: hand off, never back to the queue."""
    class NoAnswer(FakeGraph):
        def write(self, path, **p):
            if path.endswith("/media_publish"):
                raise TimeoutError("read timed out")
            return super().write(path, **p)
    with pytest.raises(publish.PublishError, match="may be live"):
        publish.publish_slot(client, SLOT, graph=NoAnswer(), sleep=lambda s: None)
    db = DB.for_client(C.client_dir(client))
    assert db.post(SLOT)["state"] == "MANUAL_HANDOFF"
    db.close()
    assert publish.run_queue(client) == []   # nothing to retry


def test_first_comment_with_bare_domain_is_refused(client):
    (C.client_dir(client) / "posts" / SLOT / "first_comment.txt").write_text("Free at rosa.surf")
    with pytest.raises(publish.PublishError, match="URL"):
        publish.publish_slot(client, SLOT, graph=FakeGraph(), sleep=lambda s: None)


def test_queue_survives_illegal_transition(client, monkeypatch):
    from spine import state as S
    db = DB.for_client(C.client_dir(client))
    db.create_post("2099-w01-02", "t", pillar="p")
    for st in ("BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL", "APPROVED"):
        db.set_state("2099-w01-02", st)
    db.conn.execute("UPDATE posts SET scheduled_at='2099-01-01T00:00:00+00:00' WHERE slot_id='2099-w01-02'")
    db.close()
    real = DB.set_state

    def refuse(self, slot_id, to, *a, **kw):
        if slot_id == "2099-w01-02" and to == "QUEUED":
            raise S.IllegalTransition("refused")
        return real(self, slot_id, to, *a, **kw)
    monkeypatch.setattr(DB, "set_state", refuse)
    out = publish.run_queue(client, dry_run=True)
    assert {"slot_id": "2099-w01-02", "error": "refused"} in out


def test_permalink_backfilled_on_measure(client):
    from spine.measure import insights
    db = DB.for_client(C.client_dir(client))
    db.set_state(SLOT, "MANUAL_HANDOFF")
    db.set_state(SLOT, "PUBLISHED", ig_media_id="M1", published_at="2099-01-01T00:00:00+00:00")
    db.close()
    assert insights.backfill_permalinks(client, graph=FakeGraph()) == [SLOT]
    db = DB.for_client(C.client_dir(client))
    assert db.post(SLOT)["permalink"] == "https://www.instagram.com/reel/x/"
    db.close()


class PublishRaises(FakeGraph):
    def __init__(self, exc):
        super().__init__()
        self.exc = exc

    def write(self, path, **p):
        if path.endswith("/media_publish"):
            if isinstance(self.exc, Exception):
                raise self.exc
            return self.exc
        return super().write(path, **p)


@pytest.mark.parametrize("answer", [
    GraphError(None, None, "Bad Gateway", http_status=502),          # gateway: no idea if it posted
    GraphError(2, None, "unexpected, retry", http_status=500),       # Meta transient
    {"success": True},                                               # 200 without an id
])
def test_ambiguous_media_publish_hands_off_with_file(client, answer):
    with pytest.raises(publish.PublishError, match="may be live"):
        publish.publish_slot(client, SLOT, graph=PublishRaises(answer), sleep=lambda s: None)
    d = C.client_dir(client)
    db = DB.for_client(d)
    assert db.post(SLOT)["state"] == "MANUAL_HANDOFF"
    db.close()
    assert "may already be live" in (d / "posts" / SLOT / "handoff.md").read_text()


def test_clear_refusal_on_media_publish_goes_failed(client):
    with pytest.raises(GraphError):
        publish.publish_slot(client, SLOT, graph=PublishRaises(GraphError(9007, 2207027, "not ready", http_status=400)),
                             sleep=lambda s: None)
    db = DB.for_client(C.client_dir(client))
    assert db.post(SLOT)["state"] == "FAILED"
    db.close()


@pytest.mark.parametrize("err,amb", [
    (GraphError(1, None, "unknown", http_status=None), True),
    (GraphError(10, None, "x", raw={"is_transient": True}, http_status=400), True),
    (GraphError(100, None, "invalid", http_status=400), False),
])
def test_graph_error_ambiguity(err, amb):
    assert err.ambiguous is amb


def test_handoff_state_holds_even_if_file_write_fails(client, monkeypatch):
    def nope(*a, **kw):
        raise OSError("disk full")
    monkeypatch.setattr(publish, "_write_handoff", nope)
    with pytest.raises(publish.PublishError, match="may be live"):
        publish.publish_slot(client, SLOT, graph=PublishRaises(TimeoutError("t")), sleep=lambda s: None)
    db = DB.for_client(C.client_dir(client))
    db.conn.execute("UPDATE posts SET scheduled_at='2000-01-01T00:00:00+00:00' WHERE slot_id=?", (SLOT,))
    assert db.post(SLOT)["state"] == "MANUAL_HANDOFF"
    db.close()
    assert publish.run_queue(client) == []   # never picked up again


def test_first_comment_timeout_still_measures(client):
    class CommentTimesOut(FakeGraph):
        def write(self, path, **p):
            if path.endswith("/comments"):
                raise TimeoutError("t")
            return super().write(path, **p)
    out = publish.publish_slot(client, SLOT, graph=CommentTimesOut(), sleep=lambda s: None)
    assert out["first_comment_id"] is None
    db = DB.for_client(C.client_dir(client))
    assert db.post(SLOT)["state"] == "MEASURING"
    db.close()


def test_comment_graph_error_writes_handoff_even_if_journal_fails(client, monkeypatch):
    class CommentRefused(FakeGraph):
        def write(self, path, **p):
            if path.endswith("/comments"):
                raise GraphError(10, None, "comments off")
            return super().write(path, **p)
    real = DB.journal_outcome

    def flaky(self, j, outcome):
        if isinstance(outcome, dict) and outcome.get("error") and "comments off" in outcome["error"]:
            raise RuntimeError("db locked")
        return real(self, j, outcome)
    monkeypatch.setattr(DB, "journal_outcome", flaky)
    publish.publish_slot(client, SLOT, graph=CommentRefused(), sleep=lambda s: None)
    d = C.client_dir(client)
    assert "instagram.com/reel" in (d / "posts" / SLOT / "handoff.md").read_text()
    db = DB.for_client(d)
    assert db.post(SLOT)["state"] == "MEASURING"
    db.close()


def test_unclear_publish_never_passes_through_failed(client):
    with pytest.raises(publish.PublishError):
        publish.publish_slot(client, SLOT, graph=PublishRaises(TimeoutError("t")), sleep=lambda s: None)
    db = DB.for_client(C.client_dir(client))
    tos = [json.loads(r["intent"])["to"] for r in db.conn.execute(
        "SELECT intent FROM journal WHERE target=? AND action='post.state'", (SLOT,))]
    db.close()
    assert tos[-2:] == ["PUBLISHING", "MANUAL_HANDOFF"] and "FAILED" not in tos


def test_vercel_found_under_nvm_when_cron_path_lacks_it(tmp_path, monkeypatch):
    from spine.publisher import links
    for v in ("v9.1.0", "v24.14.0", "v18.2.0"):
        b = tmp_path / ".nvm" / "versions" / "node" / v / "bin"
        b.mkdir(parents=True)
        (b / "vercel").write_text("")
    monkeypatch.setattr(links.Path, "home", lambda: tmp_path)
    monkeypatch.setattr(links.shutil, "which", lambda n: None)
    monkeypatch.setenv("PATH", "/usr/bin:/bin")
    exe, env = links._vercel()
    assert exe.endswith("v24.14.0/bin/vercel") and env["PATH"].startswith(str(tmp_path / ".nvm/versions/node/v24.14.0/bin"))


def test_vercel_missing_everywhere_is_a_link_error(tmp_path, monkeypatch):
    from spine.publisher import links
    monkeypatch.setattr(links.Path, "home", lambda: tmp_path)
    monkeypatch.setattr(links.shutil, "which", lambda n: None)
    with pytest.raises(links.LinkError, match="not found"):
        links._vercel()


def test_spec_check_refuses_silent_audio(tmp_path):
    # w44-10 went out silent: the Instagram track sent with audio_configuration never played
    raw, silent = tmp_path / "raw.mp4", tmp_path / "silent.mp4"
    make_clip(raw)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-af", "volume=0", "-c:v", "copy", str(silent)], check=True)
    assert any("audio is silent" in i for i in spec_check.check_file(silent))


def test_publish_refuses_silent_video_and_sends_it_back_for_approval(client, tmp_path):
    d = C.client_dir(client)
    v = d / "posts" / SLOT / "video.mp4"
    tmp = tmp_path / "s.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(v), "-af", "volume=0", "-c:v", "copy", str(tmp)], check=True)
    shutil.move(tmp, v)
    g = FakeGraph()
    with pytest.raises(publish.PublishError, match="silent"):
        publish.publish_slot(client, SLOT, graph=g, sleep=lambda s: None, link_runner=lambda *a, **k: None)
    assert g.calls == []
    db = DB.for_client(d)
    assert db.post(SLOT)["state"] == "NEEDS_APPROVAL"   # not left QUEUED past its time (w44-16, 2026-10-29)
    assert "silent" in db.post(SLOT)["note"]
    db.close()


class DeleteGraph(FakeGraph):
    def __init__(self, delete_error=None, gone=False):
        super().__init__()
        self.delete_error, self.gone = delete_error, gone

    def delete(self, path):
        self.calls.append(("delete", path))
        if self.delete_error:
            raise self.delete_error
        return {"success": True}

    def media(self, mid, fields=None):
        if self.gone:
            raise GraphError(100, 33, "does not exist")
        return super().media(mid, fields)


def _live(client):
    publish.publish_slot(client, SLOT, graph=FakeGraph(), sleep=lambda s: None, link_runner=lambda *a, **k: None)


def test_remove_live_deletes_on_instagram_and_stops_measuring(client):
    _live(client)
    g = DeleteGraph()
    out = publish.remove_live(client, SLOT, graph=g)
    assert ("delete", "M1") in g.calls and out["success"]
    db = DB.for_client(C.client_dir(client))
    assert db.post(SLOT)["state"] == "REMOVED"
    db.close()
    assert insights.due(client) == []


def test_remove_live_already_removed_by_hand_counts(client):
    _live(client)
    publish.remove_live(client, SLOT, graph=DeleteGraph(delete_error=GraphError(100, 33, "does not exist"), gone=True))
    db = DB.for_client(C.client_dir(client))
    assert db.post(SLOT)["state"] == "REMOVED"
    db.close()


def test_remove_live_refusal_keeps_it_live(client):
    _live(client)
    with pytest.raises(publish.PublishError, match="refused"):
        publish.remove_live(client, SLOT, graph=DeleteGraph(delete_error=GraphError(10, None, "no permission")))
    db = DB.for_client(C.client_dir(client))
    assert db.post(SLOT)["state"] == "MEASURING"
    db.close()


def test_remove_live_refuses_unpublished(client):
    with pytest.raises(publish.PublishError, match="not live"):
        publish.remove_live(client, SLOT, graph=DeleteGraph())


def test_publish_never_sends_audio_configuration(client):
    p = publish._container_params({"audio_configuration": {"audio_id": "1"}}, "c")
    assert "audio_configuration" not in p
