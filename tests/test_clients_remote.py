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


@pytest.fixture(autouse=True)
def no_cached_grants():
    C._GRANTS.clear()
    yield
    C._GRANTS.clear()


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
    assert body["emergency_stop"] is True and body["grants"]["slots"] == ["06:30"]
    assert not {"page_id", "ig_user_id", "ig_username", "emergency_stop", "display_name"} & set(body["grants"])   # columns, not grants
    f.answers.append((200, {"result": True}))
    C.save_grants("rosa", {"slots": ["18:30"]})   # no emergency_stop key: the stop is left as it is
    assert f.calls[3][2] == {"grants": {"slots": ["18:30"]}, "emergency_stop": None}
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



def test_pull_refuses_a_path_and_leaves_no_temp_file(remote, monkeypatch):
    import pytest
    with pytest.raises(ValueError, match="client id"):
        C.pull("../rosa")
    fake(monkeypatch, (200, {"result": [{"name": "brand.md", "text": "# Rosa\n", "version": 1, "updated_by": 1, "updated_at": 5}]}),
         (200, {"result": ROW}))
    C.pull("rosa")
    assert not list((remote / "clients" / "rosa").glob("*.tmp"))


def test_a_job_pulls_first_and_tries_again_over_the_network(remote, monkeypatch):
    import urllib.error
    monkeypatch.setenv("TACHYON_HOME", str(remote / "home"))
    monkeypatch.setenv("TACHYON_HOST", "pc-a")
    pulled = []
    monkeypatch.setattr(C, "pull", lambda name: pulled.append(name) or [])
    for name, stub in (("pull_slot", lambda c, s: []), ("push_changed", lambda c, t: {}), ("before", lambda *a: None)):
        monkeypatch.setattr(W, name, stub)   # the slot's own sync: tests/test_worker.py
    ran = []
    ok = lambda cmd, **kw: ran.append(cmd) or subprocess.CompletedProcess(cmd, 0)  # noqa: E731
    job = {"id": 1, "kind": "revise", "client": "rosa", "slot_id": "s", "payload": {"argv": ["spine.revise", "run", "rosa", "s"]}}
    W.run_job(job, R.config(), runner=ok)
    assert pulled == ["rosa"] and len(ran) == 1
    tries = []
    def flaky(name):
        tries.append(name)
        if len(tries) < 3:
            raise urllib.error.URLError("down")
        return []
    monkeypatch.setattr(C, "pull", flaky)
    slept = []
    W.run_job(job, R.config(), runner=ok, sleep=slept.append)
    assert len(tries) == 3 and slept == [W.PULL_WAIT, W.PULL_WAIT] and len(ran) == 2
    for status in (403, 404):   # not a member any more, or no such client: no retry, the job fails
        monkeypatch.setattr(C, "pull", lambda name, s=status: (_ for _ in ()).throw(R.RemoteError(s, "x")))
        with pytest.raises(RuntimeError, match="could not pull"):
            W.run_job(job, R.config(), runner=ok, sleep=slept.append)
    assert len(ran) == 2 and len(slept) == 2
    monkeypatch.setattr(C, "pull", lambda name: (_ for _ in ()).throw(R.RemoteError(503, "down")))
    with pytest.raises(RuntimeError, match="could not pull"):   # the Worker down: tried three times first
        W.run_job(job, R.config(), runner=ok, sleep=slept.append)
    assert len(slept) == 4


def test_grants_are_read_once_per_few_seconds_and_a_save_clears_them(remote, monkeypatch):
    f = fake(monkeypatch, (200, {"result": ROW}))
    for _ in range(5):
        assert C.load_grants("rosa")["page_id"] == "p1"
    assert len(f.calls) == 1   # a page asks once per video: one request
    g = C.load_grants("rosa")
    g["bio_link"]["key"] = "edited"
    assert C.load_grants("rosa")["bio_link"]["key"] == "k"   # an edit before save is not in the cache
    f.answers += [(200, {"result": True}), (200, {"result": ROW})]
    C.save_grants("rosa", {"slots": ["18:30"]})
    C.load_grants("rosa")
    assert [c[1].rsplit("/", 1)[1] for c in f.calls] == ["client", "set_grants", "client"]


def test_a_switch_reads_the_row_fresh_before_it_writes(remote, monkeypatch):
    f = fake(monkeypatch, (200, {"result": ROW}), (200, {"result": {**ROW, "grants": {"slots": ["07:00"]}}}), (200, {"result": True}))
    C.load_grants("rosa")   # cached
    C.set_flag("rosa", "emergency_stop", True)
    assert [c[1].rsplit("/", 1)[1] for c in f.calls] == ["client", "client", "set_grants"]
    assert f.calls[2][2]["grants"]["slots"] == ["07:00"]   # the fresh row, not the cached one
