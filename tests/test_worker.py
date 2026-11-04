"""spine/worker.py and spine/jobs.py against a scripted Worker (tests/fakes.py), and once
against the real one in Miniflare (the `worker` fixture, conftest.py)."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from datetime import datetime

import pytest
import yaml

from spine import clients as C
from spine import jobs as J
from spine import remote as R
from spine import week
from spine import worker as W
from tests.fakes import FakeWorker

CFG = {"api": "http://w", "token": "t", "host": "pc-a"}


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("TACHYON_HOME", str(tmp_path / "home"))
    monkeypatch.setenv("TACHYON_API", "http://w")
    monkeypatch.setenv("TACHYON_TOKEN", "t")
    monkeypatch.setenv("TACHYON_HOST", "pc-a")
    monkeypatch.setattr(C, "CLIENTS", tmp_path / "clients")
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


def test_a_failed_job_reports_its_tail_and_a_strange_argv_is_refused(env, monkeypatch):
    job = {"id": 8, "kind": "revise", "client": "rosa", "slot_id": None, "payload": {"argv": ["spine.revise", "run", "rosa", "s"]}}
    f = fake(monkeypatch, (200, job), (200, {"ok": True}), (200, {**job, "id": 9, "payload": {"argv": ["os"]}}), (200, {"ok": True}))

    def runner(cmd, **kw):
        kw["stdout"].write("boom\n")
        return subprocess.CompletedProcess(cmd, 1)

    W.once(CFG, runner=runner)
    assert f.calls[1][1].endswith("/api/jobs/8/fail") and f.calls[1][2]["result"] == "exit 1: boom\n"
    W.once(CFG, runner=runner)
    assert f.calls[3][1].endswith("/api/jobs/9/fail") and "not a spine module" in f.calls[3][2]["result"]


def test_a_lost_lease_drops_the_result(env, monkeypatch):
    job = {"id": 10, "kind": "plan", "client": "rosa", "slot_id": None, "payload": {"argv": ["spine.week", "prepare", "rosa", "2026-W10"]}}
    fake(monkeypatch, (200, job), (409, {"error": "lease"}))
    assert W.once(CFG, runner=lambda cmd, **kw: subprocess.CompletedProcess(cmd, 0)) is True


def test_upload_puts_the_video_and_the_cover(env, monkeypatch):
    sd = env / "clients" / "rosa" / "posts" / "w01-s1"
    sd.mkdir()
    (sd / "video.mp4").write_bytes(b"vid")
    (sd / "cover.jpg").write_bytes(b"jpg")
    f = fake(monkeypatch, (200, {"key": "rosa/w01-s1/aa.mp4"}), (200, {"key": "rosa/w01-s1/bb.jpg"}))
    assert W.run_job({"id": 1, "kind": "upload", "client": "rosa", "slot_id": "w01-s1"}, CFG) == {"keys": {"video": "rosa/w01-s1/aa.mp4", "cover": "rosa/w01-s1/bb.jpg"}}
    method, url, body, headers = f.calls[0]
    assert (method, url, body) == ("PUT", "http://w/api/media/rosa/w01-s1/video", b"vid")
    assert headers["Content-type"] == "video/mp4" and headers["Content-length"] == "3"
    assert f.calls[1][1].endswith("/cover") and f.calls[1][3]["Content-type"] == "image/jpeg"
    (sd / "video.mp4").unlink()
    with pytest.raises(FileNotFoundError):
        W.upload("rosa", "w01-s1", CFG)


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


def test_week_auto_runs_once_a_day_from_seven(env, monkeypatch):
    ran = []
    monkeypatch.setattr(week, "auto", lambda c: ran.append(c) or 0)
    done = {}
    assert W.auto_week(CFG, done, datetime(2026, 1, 1, 6, 59)) == []
    assert W.auto_week(CFG, done, datetime(2026, 1, 1, 7, 0)) == ["rosa"]
    assert W.auto_week(CFG, done, datetime(2026, 1, 1, 12, 0)) == []
    assert W.auto_week(CFG, done, datetime(2026, 1, 2, 9, 0)) == ["rosa"]
    assert ran == ["rosa", "rosa"]


def test_run_stops_when_the_session_is_dead(env, monkeypatch):
    monkeypatch.setattr(week, "auto", lambda c: 0)
    fake(monkeypatch, (200, {"clients": ["rosa"], "dropped": []}), (204, None), (401, {"error": "auth"}))
    slept = []
    assert W.run(CFG, sleep=slept.append) == 3
    assert slept == [W.POLL]


# ── against the Worker in Miniflare ──────────────────────────────────────────

def test_end_to_end_a_job_round_trip(worker, env, monkeypatch):
    monkeypatch.setenv("TACHYON_API", worker["url"])
    monkeypatch.setenv("TACHYON_TOKEN", worker["token"])
    monkeypatch.setenv("TACHYON_HOST", "pc-e2e")
    cfg = R.config()
    sd = env / "clients" / "rosa" / "posts" / "e2e-1"
    sd.mkdir()
    (sd / "video.mp4").write_bytes(b"vid")
    assert W.register(cfg)["clients"] == ["rosa"]
    job_id = J.spawn("produce", "rosa", "e2e-1", ["spine.state"], sd / "x.log")   # `python -m spine.state` runs and exits 0
    assert isinstance(job_id, int)
    jobs = R.call("GET", "/api/jobs?client=rosa&slot=e2e-1", cfg=cfg)["jobs"]
    assert [j["state"] for j in jobs] == ["queued"]
    assert W.once(cfg) is True
    job = R.call("GET", "/api/jobs?client=rosa&slot=e2e-1", cfg=cfg)["jobs"][0]
    assert job["state"] == "done" and job["holder"] == "pc-e2e"
    assert json.loads(job["result"])["media"]["sha"] == hashlib.sha256(b"vid").hexdigest()
    assert W.once(cfg) is False
