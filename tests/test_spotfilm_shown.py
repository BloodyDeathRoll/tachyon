"""tools/spotfilm/produce.py shown(): a PC's own render is a "pc" job the app shows, done or failed at the end."""
import importlib.util
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent.parent / "tools" / "spotfilm"


@pytest.fixture
def produce(monkeypatch):
    monkeypatch.syspath_prepend(str(HERE))
    spec = importlib.util.spec_from_file_location("spotfilm_produce", HERE / "produce.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    calls = []

    def call(method, path, body=None, **kw):
        calls.append((method, path, body))
        return {"id": 9} if path == "/api/jobs" else {"ok": True}
    monkeypatch.setattr(mod.RM, "config", lambda: {"api": "http://w", "host": "pc-a"})
    monkeypatch.setattr(mod.RM, "call", call)
    monkeypatch.setattr(mod.SW, "media_of", lambda c, s, cfg: {"path": "v.mp4"})
    monkeypatch.setattr(mod.SW, "_beat", lambda *a: None)
    mod.calls = calls
    return mod


def test_done_after_the_work(produce):
    with produce.shown("rosa", "w1", "rebuilding"):
        pass
    assert [c[:2] for c in produce.calls] == [("POST", "/api/jobs"), ("POST", "/api/jobs/9/done")]
    assert produce.calls[0][2] == {"kind": "pc", "client": "rosa", "slot_id": "w1", "host": "pc-a", "payload": {"notes": "rebuilding"}}
    assert produce.calls[1][2]["result"] == {"media": {"path": "v.mp4"}}


def test_failed_with_the_reason_and_the_error_still_raised(produce):
    with pytest.raises(RuntimeError, match="render crashed"):
        with produce.shown("rosa", "w1", "rebuilding"):
            raise RuntimeError("render crashed")
    assert produce.calls[-1][:2] == ("POST", "/api/jobs/9/fail")
    assert produce.calls[-1][2]["result"] == "render crashed"
