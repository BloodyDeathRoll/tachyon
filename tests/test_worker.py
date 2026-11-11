"""spine/worker.py and spine/jobs.py against a scripted Worker (tests/fakes.py), and once
against the real one in Miniflare (the `worker` fixture, conftest.py)."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys

import pytest
import yaml

from spine import clients as C
from spine import jobs as J
from spine import remote as R
from spine import week
from spine import worker as W
from tests.fakes import FakeWorker

CFG = {"api": "http://w", "token": "t", "host": "pc-a"}
REAL_PULL = C.pull   # a job pulls the client's files first (tests/test_clients_remote.py); the scripted tests skip it
# the sync and the status file around a job have their own tests below; the loop's tests skip them
PULL_SLOT, PUSH_CHANGED, BEFORE = W.pull_slot, W.push_changed, W.before


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("TACHYON_HOME", str(tmp_path / "home"))
    monkeypatch.setenv("TACHYON_API", "http://w")
    monkeypatch.setenv("TACHYON_TOKEN", "t")
    monkeypatch.setenv("TACHYON_HOST", "pc-a")
    monkeypatch.setattr(C, "CLIENTS", tmp_path / "clients")
    monkeypatch.setattr(C, "pull", lambda name: [])
    monkeypatch.setattr(W, "pull_slot", lambda client, slot: [])
    monkeypatch.setattr(W, "push_changed", lambda client, since: {})
    monkeypatch.setattr(W, "before", lambda *a: None)
    for name, assets in (("rosa", True), ("acme", False)):
        d = tmp_path / "clients" / name
        (d / "posts").mkdir(parents=True)
        (d / "grants.yaml").write_text(yaml.safe_dump(C.DEFAULT_GRANTS))
        if assets:
            (d / "assets").mkdir()
    return tmp_path


def fake(monkeypatch, *answers) -> FakeWorker:
    f = FakeWorker(*answers)
    monkeypatch.setattr(R, "opener", f)
    return f


def test_register_names_the_clients_with_assets(env, monkeypatch):
    f = fake(monkeypatch, (200, {"clients": ["rosa"], "dropped": []}))
    assert W.host_clients() == ["rosa"]
    assert W.register(CFG) == {"clients": ["rosa"], "dropped": []}
    method, url, body, headers = f.calls[0]
    assert (method, url) == ("POST", "http://w/api/hosts")
    assert body["id"] == "pc-a" and body["clients"] == ["rosa"] and isinstance(body["caps"], list)
    assert headers["Authorization"] == "Bearer t"


def test_once_runs_the_argv_and_reports_the_file(env, monkeypatch):
    sd = env / "clients" / "rosa" / "posts" / "w01-s1"
    sd.mkdir()
    (sd / "video.mp4").write_bytes(b"vid")
    job = {"id": 7, "kind": "produce", "client": "rosa", "slot_id": "w01-s1", "payload": '{"argv": ["spine.manual", "produce", "rosa", "w01-s1"]}'}
    f = fake(monkeypatch, (200, job), (200, {"ok": True}))
    ran = []

    def runner(cmd, **kw):
        ran.append(cmd)
        kw["stdout"].write("made it\n")
        return subprocess.CompletedProcess(cmd, 0)

    assert W.once(CFG, runner=runner) is True
    assert ran == [[sys.executable, "-m", "spine.manual", "produce", "rosa", "w01-s1"]]
    method, url, body, _ = f.calls[1]
    assert (method, url) == ("POST", "http://w/api/jobs/7/done")
    assert body["host"] == "pc-a"
    assert body["result"]["media"] == {"host": "pc-a", "path": str(sd / "video.mp4"), "sha": hashlib.sha256(b"vid").hexdigest(), "size": 3}
    assert (env / "home" / "logs" / "job-7.log").read_text() == "made it\n"


def test_no_job_is_a_quiet_poll(env, monkeypatch):
    f = fake(monkeypatch, (204, None))
    assert W.once(CFG) is False
    assert f.calls[0][:2] == ("GET", "http://w/api/jobs/next?host=pc-a")


def test_a_failed_job_reports_its_tail(env, monkeypatch):
    job = {"id": 8, "kind": "revise", "client": "rosa", "slot_id": "s", "payload": {"argv": ["spine.revise", "run", "rosa", "s"]}}
    f = fake(monkeypatch, (200, job), (200, {"ok": True}))

    def runner(cmd, **kw):
        kw["stdout"].write("boom\n")
        return subprocess.CompletedProcess(cmd, 1)

    W.once(CFG, runner=runner)
    assert f.calls[1][1].endswith("/api/jobs/8/fail") and f.calls[1][2]["result"] == "exit 1: boom\n"


@pytest.mark.parametrize("kind, slot, argv", [
    ("revise", "s", ["os"]),
    ("revise", "s", ["spine.publisher.publish", "rosa", "s"]),               # not the kind's command
    ("revise", "s", ["spine.revise", "run", "acme", "s"]),                    # another client
    ("revise", "s", ["spine.revise", "run", "rosa", "other"]),                # another slot
    ("plan", None, ["spine.week", "prepare", "acme", "2026-W10"]),            # another client's week
    ("auto", None, ["spine.week", "auto", "acme"]),                           # another client's auto
    ("produce", "s", ["spine.manual", "produce", "rosa"]),                    # too short
    ("upload", "s", None),                                                    # kinds without argv are the worker's own
])
def test_a_job_runs_only_its_kind_s_command_for_its_own_client(env, monkeypatch, kind, slot, argv):
    ran = []
    job = {"id": 9, "kind": kind if argv else "voice", "client": "rosa", "slot_id": slot, "payload": {"argv": argv} if argv else None}
    with pytest.raises(ValueError):
        W.run_job(job, CFG, runner=lambda cmd, **kw: ran.append(cmd))
    assert ran == []


def test_only_video_making_jobs_report_a_file(env, monkeypatch):
    sd = env / "clients" / "rosa" / "posts" / "s"
    sd.mkdir()
    (sd / "video.mp4").write_bytes(b"vid")
    ok = lambda cmd, **kw: subprocess.CompletedProcess(cmd, 0)  # noqa: E731
    assert W.run_job({"id": 1, "kind": "caption", "client": "rosa", "slot_id": "s", "payload": {"argv": ["spine.caption", "write", "rosa", "s"]}}, CFG, runner=ok)["media"] is None
    assert W.run_job({"id": 3, "kind": "auto", "client": "rosa", "slot_id": None, "payload": {"argv": ["spine.week", "auto", "rosa"]}}, CFG, runner=ok)["media"] is None
    assert W.run_job({"id": 2, "kind": "revise", "client": "rosa", "slot_id": "s", "payload": {"argv": ["spine.revise", "run", "rosa", "s"]}}, CFG, runner=ok)["media"]["size"] == 3


def test_a_lost_lease_drops_the_result_and_a_flaky_report_is_tried_again(env, monkeypatch):
    import urllib.error
    job = {"id": 10, "kind": "plan", "client": "rosa", "slot_id": None, "payload": {"argv": ["spine.week", "prepare", "rosa", "2026-W10"]}}
    ok = lambda cmd, **kw: subprocess.CompletedProcess(cmd, 0)  # noqa: E731
    fake(monkeypatch, (200, job), (409, {"error": "lease"}))
    assert W.once(CFG, runner=ok) is True
    f = fake(monkeypatch, (200, job), (200, {"ok": True}))
    first = f.answers.copy()
    calls = {"n": 0}

    def flaky(req, timeout=0):
        if req.full_url.endswith("/done") and calls["n"] < 2:
            calls["n"] += 1
            raise urllib.error.URLError("down")
        return f(req, timeout)

    monkeypatch.setattr(R, "opener", flaky)
    slept = []
    assert W.once(CFG, runner=ok, sleep=slept.append) is True
    assert calls["n"] == 2 and slept == [W.POLL, W.POLL] and f.answers == [] and first[1] == (200, {"ok": True})


def test_a_5xx_report_is_tried_again_and_a_revoked_beat_stops(env, monkeypatch):
    job = {"id": 11, "kind": "plan", "client": "rosa", "slot_id": None, "payload": {"argv": ["spine.week", "prepare", "rosa", "2026-W10"]}}
    ok = lambda cmd, **kw: subprocess.CompletedProcess(cmd, 0)  # noqa: E731
    f = fake(monkeypatch, (200, job), (502, {"error": "upstream"}), (200, {"ok": True}))
    slept = []
    assert W.once(CFG, runner=ok, sleep=slept.append) is True
    assert slept == [W.POLL] and f.answers == []
    beats = fake(monkeypatch, (401, {"error": "auth"}), (200, {"ok": True}))
    import threading
    stop = threading.Event()
    monkeypatch.setattr(W, "HEARTBEAT", 0)
    W._beat(11, CFG, stop)   # returns on the 401 instead of beating forever
    assert beats.answers == [(200, {"ok": True})]


def test_a_refused_job_marks_its_status_failed(env, monkeypatch):
    from spine import revise, week as WK
    WK._status("rosa", "2026-W10", state="running")
    with pytest.raises(ValueError, match="refused"):
        W.run_job({"id": 1, "kind": "plan", "client": "rosa", "slot_id": None, "payload": {"argv": ["spine.publisher", "publish", "rosa", "2026-W10"]}}, CFG)
    assert WK.status("rosa", "2026-W10")["state"] == "failed"
    (env / "clients" / "rosa" / "posts" / "w01-s1").mkdir()
    revise._write_status("rosa", "w01-s1", state="running")
    with pytest.raises(ValueError, match="refused"):
        W.run_job({"id": 2, "kind": "revise", "client": "rosa", "slot_id": "w01-s1", "payload": {"argv": ["spine.revise", "run", "rosa", "w09-s9"]}}, CFG)
    assert revise.status("rosa", "w01-s1")["state"] == "failed"
    (env / "clients" / "rosa" / "posts" / "w01-s1" / "caption.writing").touch()
    with pytest.raises(ValueError, match="refused"):
        W.run_job({"id": 3, "kind": "caption", "client": "rosa", "slot_id": "w01-s1", "payload": {"argv": ["spine.caption", "write", "rosa", "w09-s9"]}}, CFG)
    assert not (env / "clients" / "rosa" / "posts" / "w01-s1" / "caption.writing").exists()
    evil = env / "clients" / "rosa" / "evil" / "caption.writing"   # where posts/../evil would land
    evil.parent.mkdir()
    evil.touch()   # a slot that is a path marks nothing
    with pytest.raises(ValueError, match="refused"):
        W.run_job({"id": 4, "kind": "caption", "client": "rosa", "slot_id": "../evil", "payload": {"argv": ["spine.caption", "write", "rosa", "w09-s9"]}}, CFG)
    assert evil.exists()


def test_upload_puts_the_video_the_cover_and_the_text_files(env, monkeypatch):
    sd = env / "clients" / "rosa" / "posts" / "w01-s1"
    sd.mkdir()
    (sd / "video.mp4").write_bytes(b"vid")
    (sd / "cover.jpg").write_bytes(b"jpg")
    (sd / "caption.txt").write_text("Hi\n")
    (sd / "meta.json").write_text('{"is_ai_generated": true}\n')
    f = fake(monkeypatch, (200, {"key": "rosa/w01-s1/aa.mp4"}), (200, {"key": "rosa/w01-s1/bb.jpg"}), (200, {"result": True}))
    assert W.run_job({"id": 1, "kind": "upload", "client": "rosa", "slot_id": "w01-s1"}, CFG) == {
        "keys": {"video": "rosa/w01-s1/aa.mp4", "cover": "rosa/w01-s1/bb.jpg", "files": ["caption.txt", "meta.json"]}}
    method, url, body, headers = f.calls[0]
    assert (method, url, body) == ("PUT", "http://w/api/media/rosa/w01-s1/video", b"vid")
    assert headers["Content-type"] == "video/mp4" and headers["Content-length"] == "3"
    assert f.calls[1][1].endswith("/cover") and f.calls[1][3]["Content-type"] == "image/jpeg"
    assert f.calls[2][:3] == ("POST", "http://w/api/db/rosa/set_files", {"slot_id": "w01-s1", "files": {"caption.txt": "Hi\n", "meta.json": '{"is_ai_generated": true}\n'}})
    (sd / "video.mp4").unlink()
    with pytest.raises(FileNotFoundError):
        W.upload("rosa", "w01-s1", CFG)


def test_enqueue_and_push_files(env, monkeypatch):
    f = fake(monkeypatch, (200, {"id": 5}), (200, {"result": True}))
    assert J.enqueue("upload", "rosa", "w01-s1") == 5
    assert f.calls[0][2] == {"kind": "upload", "client": "rosa", "slot_id": "w01-s1", "payload": None}
    sd = env / "clients" / "rosa" / "posts" / "w01-s1"
    sd.mkdir()
    assert J.push_files("rosa", "w01-s1") == {} and len(f.calls) == 1   # nothing to send, no request
    (sd / "first_comment.txt").write_text("Which spot?\n")
    assert J.push_files("rosa", "w01-s1") == {"first_comment.txt": "Which spot?\n"}
    assert f.calls[1][2] == {"slot_id": "w01-s1", "files": {"first_comment.txt": "Which spot?\n"}}


def test_pull_slot_writes_the_online_files(env, monkeypatch):
    f = fake(monkeypatch, (200, {"result": {"caption.txt": "Online\n", "meta.json": "{}\n", "../../evil.txt": "x"}}))
    assert PULL_SLOT("rosa", "new-1") == ["caption.txt", "meta.json"]   # only the post's files, never a path
    sd = env / "clients" / "rosa" / "posts" / "new-1"   # made on the way: a slot planned elsewhere
    assert (sd / "caption.txt").read_text() == "Online\n" and (sd / "meta.json").read_text() == "{}\n"
    assert not (env / "clients" / "evil.txt").exists()
    assert f.calls[0][:3] == ("POST", "http://w/api/db/rosa/files", {"slot_id": "new-1"})
    # a job's pull: the client's files, then the slot's; the network is tried again, a refusal is not
    import urllib.error
    pulled = []
    monkeypatch.setattr(C, "pull", lambda name: pulled.append(name) or [])

    def flaky(client, slot):
        pulled.append(slot)
        if len(pulled) < 3:
            raise urllib.error.URLError("down")
        return []

    monkeypatch.setattr(W, "pull_slot", flaky)
    slept = []
    W.pull("rosa", "s", sleep=slept.append)
    assert pulled == ["rosa", "s", "rosa", "s"] and slept == [W.PULL_WAIT]
    monkeypatch.setattr(W, "pull_slot", lambda c, s: (_ for _ in ()).throw(R.RemoteError(403, "x")))
    with pytest.raises(RuntimeError, match="could not pull"):
        W.pull("rosa", "s", sleep=slept.append)
    assert slept == [W.PULL_WAIT]


def test_push_changed_sends_only_what_the_job_wrote(env, monkeypatch):
    import os
    import time
    posts = env / "clients" / "rosa" / "posts"
    for s in ("a", "b"):
        (posts / s).mkdir()
        (posts / s / "caption.txt").write_text(f"{s}\n")
        (posts / s / "meta.json").write_text("{}\n")
        for p in (posts / s).iterdir():
            os.utime(p, (time.time() - 60, time.time() - 60))
    since = time.time() - 30
    (posts / "b" / "caption.txt").write_text("new b\n")
    f = fake(monkeypatch, (200, {"result": True}))
    assert PUSH_CHANGED("rosa", since) == {"b": ["caption.txt"]}
    assert f.calls[0][:3] == ("POST", "http://w/api/db/rosa/set_files", {"slot_id": "b", "files": {"caption.txt": "new b\n"}})


def test_before_writes_the_status_the_dashboard_would_have(env, monkeypatch):
    from spine import formats, manual, revise
    sd = env / "clients" / "rosa" / "posts" / "s"
    sd.mkdir()
    (sd / "meta.json").write_text('{"film": {"engine": "html", "dir": "nowhere"}, "title": "T"}\n')
    (sd / "brief.md").write_text("old\n")
    produce = ["spine.manual", "produce", "rosa", "s"]
    with pytest.raises(ValueError, match="no prompt"):   # nothing moves for an empty prompt
        BEFORE("produce", "rosa", "s", produce, {"prompt": " "})
    assert (sd / "brief.md").exists() and not (sd / "versions").exists()
    BEFORE("produce", "rosa", "s", produce, {"prompt": " A wave ", "engine": "html"})
    st = revise.status("rosa", "s")
    assert st["state"] == "running" and st["kind"] == "new" and st["notes"] == "A wave"
    assert (sd / "prompt.txt").read_text() == "A wave\n" and not (sd / "brief.md").exists()
    assert (sd / "versions" / "v1" / "brief.md").read_text() == "old\n"
    meta = json.loads((sd / "meta.json").read_text())
    assert "film" not in meta and meta["engine_choice"] == "html" and meta["title"] == "T"
    # the same prompt again after a failure is the Worker's retry: the half-made plan stays, nothing moves
    revise._write_status("rosa", "s", state="failed")
    (sd / "brief.md").write_text("planned\n")
    BEFORE("produce", "rosa", "s", produce, {"prompt": "A wave"})
    assert (sd / "brief.md").exists() and not (sd / "versions" / "v2").exists() and revise.status("rosa", "s")["state"] == "running"
    # revise: notes open a round; the same notes again after a failure past the edit only render again
    rev = ["spine.revise", "run", "rosa", "s"]
    BEFORE("revise", "rosa", "s", rev, {"notes": "louder"})
    st = revise.status("rosa", "s")
    assert st["notes"] == "louder" and [r["notes"] for r in st["rounds"]] == ["louder"] and not st["skip_edit"]
    revise._write_status("rosa", "s", state="failed", step="rendering")
    BEFORE("revise", "rosa", "s", rev, {"notes": "louder"})
    st = revise.status("rosa", "s")
    assert st["state"] == "running" and st["skip_edit"] is True and len(st["rounds"]) == 1
    BEFORE("formats", "rosa", "s", ["spine.formats", "make", "rosa", "s", "16x9", "1x1"], {})
    assert formats.status("rosa", "s")["wanted"] == ["16x9", "1x1"] and formats.status("rosa", "s")["current"] == "16x9"
    monkeypatch.setattr(week, "free_slot_times", lambda c, w, own=False: ["t1", "t2"])
    BEFORE("plan", "rosa", None, ["spine.week", "prepare", "rosa", "2026-W10"], {"instructions": "surf ", "engine": "remotion"})
    st = week.status("rosa", "2026-W10")
    assert st["state"] == "running" and st["total"] == 2 and st["instructions"] == "surf" and st["engine"] == "remotion"


def test_spec_downloads_the_file_and_checks_it(env, monkeypatch):
    from spine.publisher import spec_check
    seen = []
    monkeypatch.setattr(spec_check, "check_file", lambda p: seen.append(p.read_bytes()) or ["too long"])
    f = fake(monkeypatch, (200, b"bytes-of-video"))
    assert W.run_job({"id": 2, "kind": "spec", "client": "rosa", "slot_id": "w01-s1"}, CFG) == {"issues": ["too long"]}
    assert f.calls[0][:2] == ("GET", "http://w/api/media/rosa/w01-s1/video") and seen == [b"bytes-of-video"]


def test_spawn_enqueues_with_a_worker_and_forks_without(env, monkeypatch, tmp_path):
    f = fake(monkeypatch, (200, {"id": 3}))
    log = tmp_path / "x.log"
    assert J.spawn("revise", "rosa", "s", ["spine.revise", "run", "rosa", "s"], log) == 3
    assert f.calls[0][2] == {"kind": "revise", "client": "rosa", "slot_id": "s", "payload": {"argv": ["spine.revise", "run", "rosa", "s"]}}
    assert not log.exists()
    monkeypatch.setenv("TACHYON_API", "")
    forked = []
    monkeypatch.setattr(subprocess, "Popen", lambda cmd, **kw: forked.append((cmd, kw)))
    assert J.spawn("revise", "rosa", "s", ["spine.revise", "run", "rosa", "s"], log) is None
    assert forked[0][0] == [sys.executable, "-m", "spine.revise", "run", "rosa", "s"] and forked[0][1]["start_new_session"]
    assert log.exists()


def test_login_checks_the_session_and_saves_it(env, monkeypatch):
    monkeypatch.delenv("TACHYON_API")
    monkeypatch.delenv("TACHYON_HOST")
    f = fake(monkeypatch, (200, {"profile": {"email": "alice@example.com"}, "clients": ["rosa"], "admin": False}))
    p = W.login("http://w/", "tok")
    assert f.calls[0][:2] == ("GET", "http://w/me") and f.calls[0][3]["Authorization"] == "Bearer tok"
    cfg = json.loads(p.read_text())
    assert cfg["api"] == "http://w" and cfg["token"] == "tok" and cfg["host"] == W.host_id()
    assert R.config() == cfg
    assert oct(p.stat().st_mode)[-3:] == "600"


def test_run_stops_when_the_session_is_dead(env, monkeypatch):
    fake(monkeypatch, (200, {"clients": ["rosa"], "dropped": []}), (204, None), (401, {"error": "auth"}))
    slept = []
    assert W.run(CFG, sleep=slept.append) == 3
    assert slept == [W.POLL]


def test_a_spawn_that_cannot_reach_the_worker_leaves_no_running_status(env, monkeypatch, tmp_path):
    import urllib.error
    from spine import manual, revise
    monkeypatch.setattr(R, "opener", lambda req, timeout=0: (_ for _ in ()).throw(urllib.error.URLError("down")))
    sd = env / "clients" / "rosa" / "posts" / "s"
    sd.mkdir()
    (sd / "prompt.txt").write_text("x\n")
    with pytest.raises(OSError):
        manual.start("rosa", "s")
    assert revise.status("rosa", "s")["state"] == "failed" and "could not start" in revise.status("rosa", "s")["error"]
    with pytest.raises(OSError):
        manual.write_caption("rosa", "s")
    assert not (sd / "caption.writing").exists()
    with pytest.raises(OSError):
        revise.start("rosa", "s", "notes")
    assert revise.status("rosa", "s")["state"] == "failed"
    monkeypatch.setattr(week, "free_slot_times", lambda c, w: [])
    with pytest.raises(OSError):
        week.start("rosa", "2026-W10", "")
    assert week.status("rosa", "2026-W10")["state"] == "failed"


# ── against the Worker in Miniflare ──────────────────────────────────────────

def test_end_to_end_a_job_round_trip(worker, env, monkeypatch):
    monkeypatch.setenv("TACHYON_API", worker["url"])
    monkeypatch.setenv("TACHYON_TOKEN", worker["token"])
    monkeypatch.setenv("TACHYON_HOST", "pc-e2e")
    monkeypatch.setattr(C, "pull", REAL_PULL)   # the real pull against the real Worker: grants.yaml from the row
    for name, real in (("pull_slot", PULL_SLOT), ("push_changed", PUSH_CHANGED), ("before", BEFORE)):
        monkeypatch.setattr(W, name, real)
    from spine.db import RemoteDB
    cfg = R.config()
    sd = env / "clients" / "rosa" / "posts" / "e2e-1"
    sd.mkdir()
    (sd / "video.mp4").write_bytes(b"old")
    (sd / "meta.json").write_text("{}\n")
    RemoteDB("rosa").create_post("e2e-1", "rosa")
    RemoteDB("rosa").set_files("e2e-1", {"caption.txt": "Edited online\n"})
    assert W.register(cfg)["clients"] == ["rosa"]
    job_id = J.enqueue("produce", "rosa", "e2e-1", {"argv": ["spine.manual", "produce", "rosa", "e2e-1"], "prompt": "A wave"})
    assert isinstance(job_id, int)
    jobs = R.call("GET", "/api/jobs?client=rosa&slot=e2e-1", cfg=cfg)["jobs"]
    assert [j["state"] for j in jobs] == ["queued"]
    ran = []

    def runner(cmd, **kw):
        ran.append(cmd)
        assert (sd / "caption.txt").read_text() == "Edited online\n"   # the online edit is on disk before the job
        assert not (sd / "video.mp4").exists() and (sd / "versions" / "v1" / "video.mp4").read_bytes() == b"old"   # Generate New stashed the old cut
        (sd / "video.mp4").write_bytes(b"vid")
        (sd / "first_comment.txt").write_text("From the job\n")
        return subprocess.CompletedProcess(cmd, 0)

    assert W.once(cfg, runner=runner) is True
    assert ran == [[sys.executable, "-m", "spine.manual", "produce", "rosa", "e2e-1"]]
    job = R.call("GET", "/api/jobs?client=rosa&slot=e2e-1", cfg=cfg)["jobs"][0]
    assert job["state"] == "done" and job["holder"] == "pc-e2e"
    result = json.loads(job["result"])
    assert result["media"]["sha"] == hashlib.sha256(b"vid").hexdigest()
    assert {"first_comment.txt", "meta.json"} <= set(result["files"]["e2e-1"])   # what the job and the stash wrote went up
    online = RemoteDB("rosa").files("e2e-1")
    assert online["caption.txt"] == "Edited online\n" and online["first_comment.txt"] == "From the job\n"
    assert json.loads(online["meta.json"])["engine_choice"] == "html"
    assert "ig_user_id" in (env / "clients" / "rosa" / "grants.yaml").read_text()   # pulled from the row before the job
    assert W.once(cfg) is False
