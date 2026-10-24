import http.client
import threading
from urllib.parse import urlencode

import pytest
import yaml

from spine import clients as C
from spine.db import DB
from spine.review import app


@pytest.fixture
def client_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(C, "CLIENTS", tmp_path)
    d = tmp_path / "demo"
    (d / "posts" / "w01-s1").mkdir(parents=True)
    (d / "grants.yaml").write_text(yaml.safe_dump({"ig_user_id": "1", "auto_reply": {"comments": False}}))
    (d / "posts" / "w01-s1" / "caption.txt").write_text("first caption")
    (d / "posts" / "w01-s1" / "qa.md").write_text("VERDICT: APPROVED")
    db = DB.for_client(d)
    db.create_post("w01-s1", "demo", pillar="proof", hook_formula="#5", scheduled_at="2026-11-02T17:00")
    for s in ["BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL"]:
        db.set_state("w01-s1", s)
    db.close()
    return d


@pytest.fixture
def server(client_dir):
    srv = app.serve(port=0)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    yield srv.server_address[1]
    srv.shutdown()


def req(port, method, path, form=None):
    c = http.client.HTTPConnection("127.0.0.1", port)
    body = urlencode(form).encode() if form else None
    headers = {"Content-Type": "application/x-www-form-urlencoded"} if form else {}
    c.request(method, path, body=body, headers=headers)
    r = c.getresponse()
    return r.status, r.read().decode(), r.getheader("Location")


def test_index_lists_clients(server):
    status, body, _ = req(server, "GET", "/")
    assert status == 200 and "demo" in body


def test_client_page_shows_waiting_post(server):
    status, body, _ = req(server, "GET", "/demo")
    assert status == 200
    assert "w01-s1" in body and "first caption" in body and "VERDICT: APPROVED" in body
    assert "1 waiting for approval" in body


def test_approve_saves_edited_caption_and_moves_state(server, client_dir):
    status, _, loc = req(server, "POST", "/demo/decide", {"slot": "w01-s1", "action": "approve", "caption": "edited caption"})
    assert status == 303 and loc == "/demo"
    assert (client_dir / "posts" / "w01-s1" / "caption.txt").read_text() == "edited caption"
    db = DB.for_client(client_dir)
    assert db.post("w01-s1")["state"] == "APPROVED"
    db.close()


def test_reject_requires_note(server, client_dir):
    status, body, _ = req(server, "POST", "/demo/decide", {"slot": "w01-s1", "action": "reject", "note": ""})
    assert status == 400 and "note" in body
    status, _, _ = req(server, "POST", "/demo/decide", {"slot": "w01-s1", "action": "reject", "note": "wrong number on screen"})
    assert status == 303
    db = DB.for_client(client_dir)
    row = db.post("w01-s1")
    assert row["state"] == "REJECTED" and row["note"] == "wrong number on screen"
    db.close()


def test_switchboard_flips_flags_and_emergency_stop(server):
    req(server, "POST", "/demo/flag", {"flag": "auto_reply.comments", "value": "1"})
    assert C.load_grants("demo")["auto_reply"]["comments"] is True
    req(server, "POST", "/demo/flag", {"flag": "emergency_stop", "value": "1"})
    assert C.stopped("demo") is True
    status, body, _ = req(server, "GET", "/demo")
    assert "EMERGENCY STOP" in body
    status, body, _ = req(server, "POST", "/demo/flag", {"flag": "page_id", "value": "1"})
    assert status == 400


def test_media_route_is_restricted(server):
    status, _, _ = req(server, "GET", "/demo/media/w01-s1/qa.md")
    assert status == 404
    status, _, _ = req(server, "GET", "/demo/media/w01-s1/video.mp4")
    assert status == 404  # no file yet
