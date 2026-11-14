"""spine/learn.py: the industry study a `learn` job runs (the claude run is scripted)."""

from __future__ import annotations

import json

import pytest
import yaml

from spine import clients as C
from spine import learn as L
from spine import remote as R
from spine import worker as W
from tests.fakes import FakeWorker

CFG = {"api": "http://w", "token": "t", "host": "pc-a"}
PAYLOAD = {"industry": "Specialty coffee", "summary": "Roasts in Lisbon.", "notes": "",
           "sources": [{"type": "Website", "url": "https://nomad.example/", "note": "The shop"}, {"type": "Document", "file": "Menu 2026.pdf", "n": 1}],
           "answers": {"May we show the price?": "Yes"}}
SHORT = "Nomad sells a habit.\n\n## Ecosystem\n- Subscriptions pay.\n\n## Open questions\n- Is it organic?\n"


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setattr(C, "CLIENTS", tmp_path / "clients")
    monkeypatch.setattr(L, "ROOT", tmp_path)

    def pull(name):   # what the real one leaves: the folder and the grants
        d = tmp_path / "clients" / name
        d.mkdir(parents=True, exist_ok=True)
        (d / "grants.yaml").write_text(yaml.safe_dump({"display_name": "Nomad Coffee", "ig_username": "nomad.coffee"}))
        return ["grants.yaml"]

    monkeypatch.setattr(C, "pull", pull)
    monkeypatch.setattr(C, "load_grants", lambda name, fresh=False: yaml.safe_load((tmp_path / "clients" / name / "grants.yaml").read_text()))
    return tmp_path


def writer(d, skip=()):
    """A claude that writes every stage file but `skip`."""
    def run(prompt, log, stop):
        run.prompt = prompt
        for key, name in L.FILES.items():
            if key in skip:
                continue
            (d / name).write_text(SHORT if key == "file" else f"About {key}. [1]\n\n[1] https://x.example/{key} · read 14 Nov 2026\n")
        (d / "log.txt").write_text("Read nomad.example\nRead the menu\n")
    return run


def test_run_writes_both_files_sends_them_up_and_holds_the_client(env, monkeypatch):
    f = FakeWorker((200, b"%PDF menu"), (200, {"result": True}), (200, {"result": True}))
    monkeypatch.setattr(R, "opener", f)
    d = L.work_dir("nomad")
    d.mkdir(parents=True)
    (d / "1-ecosystem.md").write_text("an older study")   # not this run's progress
    run = writer(d)
    reports = []
    out = L.run("nomad", PAYLOAD, reports.append, CFG, runner=run)
    assert out == {"files": ["industry.md", "industry-short.md"], "sources": 6, "questions": 1}
    # the uploaded file came down; the prompt names it, the link, the answers and the handle
    assert (d / "sources" / "1-Menu_2026.pdf").read_bytes() == b"%PDF menu"
    assert "- Website: https://nomad.example/ (The shop)" in run.prompt
    assert "clients/nomad/learn/sources/1-Menu_2026.pdf" in run.prompt
    assert "- May we show the price? Yes" in run.prompt and "Instagram: @nomad.coffee" in run.prompt
    assert "second pass" not in run.prompt
    long = (env / "clients" / "nomad" / "industry.md").read_text()
    assert long.startswith("# Nomad Coffee: industry file\n\n## 1  Ecosystem\n\nAbout ecosystem. [1]")
    assert "## 6  What we can make" in long and long.endswith("## 7  Open questions\n\n- Is it organic?\n")
    assert (env / "clients" / "nomad" / "industry-short.md").read_text() == SHORT
    assert (env / "clients" / "nomad" / "assets").is_dir()   # worker.host_clients() names it from now on
    sent = [(c[1], c[2].get("name")) for c in f.calls[1:]]
    assert sent == [("http://w/api/db/nomad/set_client_file", "industry.md"), ("http://w/api/db/nomad/set_client_file", "industry-short.md")]
    assert f.calls[2][2]["text"] == SHORT


def test_progress_is_what_the_files_say(env):
    d = L.work_dir("nomad")
    d.mkdir(parents=True)
    (d / "log.txt").write_text("")
    since = (d / "log.txt").stat().st_mtime
    assert L.progress(d, since, {}, 2) == {"done": [], "notes": {}, "now": "", "log": []}
    (d / "0-sources.md").write_text("x")
    (d / "1-ecosystem.md").write_text("a [1]\n[1] u\n[2] v\n")
    (d / "2-calendar.md").write_text("")   # empty: not written yet
    (d / "log.txt").write_text("Read a\nRead b\n")
    seen = {}
    p = L.progress(d, since, seen, 2)
    assert p["done"] == ["sources", "ecosystem"] and p["notes"] == {"sources": "2 sources", "ecosystem": "2 sources"}
    assert p["now"] == "Read b" and [l["text"] for l in p["log"]] == ["Read a", "Read b"]
    assert L.progress(d, since, seen, 2) == p   # a line keeps the time it was first seen at
    assert L.progress(d, since + 3600, seen, 2)["done"] == []   # files older than the job are not its progress


def test_an_incomplete_study_fails_and_sends_nothing(env, monkeypatch):
    f = FakeWorker((200, b"%PDF menu"))
    monkeypatch.setattr(R, "opener", f)
    d = L.work_dir("nomad")
    with pytest.raises(RuntimeError, match="incomplete: 3-rules.md, summary.md not written"):
        L.run("nomad", PAYLOAD, lambda p: None, CFG, runner=writer(d, skip=("rules", "file")))
    assert len(f.calls) == 1 and not (env / "clients" / "nomad" / "industry.md").exists()


def test_a_second_pass_keeps_the_files_and_says_what_to_change(env, monkeypatch):
    monkeypatch.setattr(R, "opener", FakeWorker((200, {"result": True}), (200, {"result": True})))
    d = L.work_dir("nomad")
    d.mkdir(parents=True)
    (d / "1-ecosystem.md").write_text("the first study")
    seen = []

    def run(prompt, log, stop):
        seen.append((d / "1-ecosystem.md").read_text())
        writer(d)(prompt, log, stop)
        run.prompt = prompt

    L.run("nomad", {**PAYLOAD, "sources": [], "changes": "Look at wine bars."}, lambda p: None, CFG, runner=run)
    assert seen == ["the first study"]
    assert "second pass" in run.prompt and "Look at wine bars." in run.prompt


def test_a_stopped_job_kills_the_run(env, monkeypatch):
    monkeypatch.setattr(R, "opener", FakeWorker())
    d = L.work_dir("nomad")

    def report(p):
        raise R.RemoteError(409, "lease")

    def run(prompt, log, stop):
        (d / "0-sources.md").write_text("x")
        assert stop.wait(5)   # the watcher sees the file, the report is refused
        raise L.Stopped("stopped")

    with pytest.raises(L.Stopped):
        L.run("nomad", {**PAYLOAD, "sources": []}, report, CFG, runner=run, watch=0.05)


def test_the_host_runs_a_learn_job_and_reports_progress_on_the_heartbeat(env, monkeypatch):
    monkeypatch.setenv("TACHYON_HOME", str(env / "home"))
    got = {}

    def run(client, payload, report, cfg):
        got.update(client=client, payload=payload)
        report({"done": ["sources"]})
        return {"files": ["industry.md"]}

    monkeypatch.setattr(L, "run", run)
    job = {"id": 9, "kind": "learn", "client": "nomad", "slot_id": None, "payload": json.dumps(PAYLOAD)}
    f = FakeWorker((200, job), (200, {"ok": True}), (200, {"ok": True}))
    monkeypatch.setattr(R, "opener", f)
    assert W.once(CFG) is True
    assert got == {"client": "nomad", "payload": PAYLOAD}
    assert f.calls[1][1:3] == ("http://w/api/jobs/9/heartbeat", {"host": "pc-a", "result": {"done": ["sources"]}})
    assert f.calls[2][1:3] == ("http://w/api/jobs/9/done", {"host": "pc-a", "result": {"files": ["industry.md"]}})


def test_a_client_id_is_never_a_path():
    with pytest.raises(ValueError):
        L.work_dir("../x")
