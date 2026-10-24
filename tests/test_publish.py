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
        "-f", "lavfi", "-i", f"testsrc2=size={size}:rate={fps}:duration={seconds}",
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
    (d / "posts" / SLOT / "meta.json").write_text(json.dumps({"source_asset": "src.mp4", "duration_s": 16, "thumb_offset": 2000}))
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
