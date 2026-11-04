"""spine/clients.py with a Worker configured: the grants are the clients row, pull() writes
the brand markdown and grants.yaml to the folder, a job pulls before it runs."""

from __future__ import annotations

import subprocess

import pytest
import yaml

from spine import clients as C
from spine import remote as R
from spine import worker as W
from tests.fakes import FakeWorker

ROW = {"id": "rosa", "name": "Rosa", "ig_user_id": "178", "page_id": "p1", "ig_username": "rosasurfapp", "connected": True,
       "token_expires": None, "grants": {"slots": ["06:30"], "auto_reply": {"comments": True}, "bio_link": {"key": "k"}},
       "emergency_stop": 0, "publisher": "worker"}


@pytest.fixture
def remote(tmp_path, monkeypatch):
    monkeypatch.setenv("TACHYON_API", "http://w")
    monkeypatch.setenv("TACHYON_TOKEN", "t")
    monkeypatch.setattr(C, "CLIENTS", tmp_path / "clients")
    (tmp_path / "clients" / "rosa" / "assets").mkdir(parents=True)
    (tmp_path / "clients" / "rosa" / "grants.yaml").write_text("page_id: old\n")
    return tmp_path


def fake(monkeypatch, *answers) -> FakeWorker:
    f = FakeWorker(*answers)
    monkeypatch.setattr(R, "opener", f)
    return f


def test_grants_come_from_the_row_and_go_back_to_it(remote, monkeypatch):
    f = fake(monkeypatch, (200, {"result": ROW}), (200, {"result": ROW}), (200, {"result": True}))
    g = C.load_grants("rosa")
    assert g["page_id"] == "p1" and g["ig_user_id"] == "178" and g["slots"] == ["06:30"] and g["display_name"] == "Rosa"
    assert g["auto_reply"] == {"comments": True, "dm": False} and g["emergency_stop"] is False and g["token_env"] is None
    assert f.calls[0][:2] == ("POST", "http://w/api/db/rosa/client")
    C.set_flag("rosa", "emergency_stop", True)
    assert f.calls[2][:2] == ("POST", "http://w/api/db/rosa/set_grants")
    body = f.calls[2][2]
    assert body["emergency_stop"] is True and "page_id" not in body["grants"] and body["grants"]["slots"] == ["06:30"]
    assert (remote / "clients" / "rosa" / "grants.yaml").read_text() == "page_id: old\n"   # the file is not the store any more


def test_pull_writes_the_markdown_and_grants(remote, monkeypatch):
    fake(monkeypatch, (200, {"result": [{"name": "brand.md", "text": "# Rosa\n", "version": 2, "updated_by": 1, "updated_at": 5},
                                        {"name": "../x.md", "text": "no", "version": 1, "updated_by": 1, "updated_at": 5},
                                        {"name": "notes.txt", "text": "no", "version": 1, "updated_by": 1, "updated_at": 5}]}),
         (200, {"result": ROW}))
    assert C.pull("rosa") == ["brand.md", "grants.yaml"]
    d = remote / "clients" / "rosa"
    assert (d / "brand.md").read_text() == "# Rosa\n"
    assert not (remote / "clients" / "x.md").exists() and not (d / "notes.txt").exists()
    assert yaml.safe_load((d / "grants.yaml").read_text())["ig_user_id"] == "178"
    monkeypatch.setenv("TACHYON_API", "")
    assert C.pull("rosa") == []


def test_a_job_pulls_first(remote, monkeypatch):
    monkeypatch.setenv("TACHYON_HOME", str(remote / "home"))
    monkeypatch.setenv("TACHYON_HOST", "pc-a")
    pulled = []
    monkeypatch.setattr(C, "pull", lambda name: pulled.append(name) or [])
    ran = []
    job = {"id": 1, "kind": "revise", "client": "rosa", "slot_id": "s", "payload": {"argv": ["spine.revise", "run", "rosa", "s"]}}
    W.run_job(job, R.config(), runner=lambda cmd, **kw: ran.append(cmd) or subprocess.CompletedProcess(cmd, 0))
    assert pulled == ["rosa"] and len(ran) == 1
