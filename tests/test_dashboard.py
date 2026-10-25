"""Dashboard (spine/review/app.py): overview cards + tags, video page, approve → scheduled,
reject → re-render job, QA off the main screens."""

import http.client
import json
import threading
from datetime import datetime, timezone
from urllib.parse import urlencode

import pytest
import yaml

from spine import clients as C
from spine import revise as R
from spine import schedule as SCH
from spine.db import DB
from spine.review import app


@pytest.fixture
def client_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(C, "CLIENTS", tmp_path)
    d = tmp_path / "demo"
    (d / "posts" / "w01-s1").mkdir(parents=True)
    (d / "grants.yaml").write_text(yaml.safe_dump({"display_name": "Demo", "ig_username": "demo_app",
                                                   "ig_user_id": "1", "auto_reply": {"comments": False}}))
    s = d / "posts" / "w01-s1"
    (s / "caption.txt").write_text("first line of the caption\n\nsecond paragraph")
    (s / "qa.md").write_text("VERDICT: APPROVED")
    (s / "meta.json").write_text(json.dumps({"title": "Showreel", "film": {"engine": "remotion", "reel": "S", "story": "SS",
                                                                          "source": "x.tsx"}}))
    db = DB.for_client(d)
    db.create_post("w01-s1", "demo", pillar="proof")
    for st in ["BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL"]:
        db.set_state("w01-s1", st)
    db.close()
    return d


@pytest.fixture
def server(client_dir):
    srv = app.serve(port=0)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield srv.server_address[1]
    srv.shutdown()


def req(port, method, path, form=None):
    c = http.client.HTTPConnection("127.0.0.1", port)
    body = urlencode(form).encode() if form else None
    c.request(method, path, body=body, headers={"Content-Type": "application/x-www-form-urlencoded"} if form else {})
    r = c.getresponse()
    return r.status, r.read().decode(), r.getheader("Location")


def test_overview_shows_project_and_tagged_card_without_qa_or_caption(server):
    status, body, _ = req(server, "GET", "/demo")
    assert status == 200
    assert "Demo" in body and "@demo_app" in body          # project under the title and in the switcher
    assert "Needs approval" in body and "Showreel" in body
    assert "/demo/v/w01-s1" in body
    assert "VERDICT" not in body and "first line of the caption" not in body


def test_video_page_has_decision_text_preview_and_qa_link(server):
    status, body, _ = req(server, "GET", "/demo/v/w01-s1")
    assert status == 200
    assert "Approve and schedule" in body and "Send back for a new version" in body
    assert "Read the full text" in body and "/demo/v/w01-s1/qa" in body
    assert "VERDICT" not in body
    status, body, _ = req(server, "GET", "/demo/v/w01-s1/qa")
    assert status == 200 and "VERDICT: APPROVED" in body


def test_approve_schedules_next_free_slot(server, client_dir):
    status, _, loc = req(server, "POST", "/demo/v/w01-s1/decide", {"action": "approve", "notes": ""})
    assert status == 303 and loc == "/demo/v/w01-s1"
    db = DB.for_client(client_dir)
    row = db.post("w01-s1")
    db.close()
    assert row["state"] == "APPROVED" and row["scheduled_at"][11:16] in SCH.DEFAULT_SLOTS
    status, body, _ = req(server, "GET", "/demo")
    assert "Scheduled" in body


def test_reject_needs_notes_and_starts_rerender(server, client_dir, monkeypatch):
    started = []
    monkeypatch.setattr(R, "start", lambda c, s, n: started.append((c, s, n)))
    status, body, _ = req(server, "POST", "/demo/v/w01-s1/decide", {"action": "reject", "notes": ""})
    assert status == 400
    status, _, _ = req(server, "POST", "/demo/v/w01-s1/decide", {"action": "reject", "notes": "faster please"})
    assert status == 303
    assert started == [("demo", "w01-s1", "faster please")]
    db = DB.for_client(client_dir)
    assert db.post("w01-s1")["state"] == "REJECTED"
    db.close()


def test_running_revision_shows_rerendering_tag(server, client_dir):
    db = DB.for_client(client_dir)
    db.set_state("w01-s1", "REJECTED", note="faster")
    db.close()
    (client_dir / "posts" / "w01-s1" / "revise.json").write_text(json.dumps({"state": "running", "step": "rendering", "notes": "faster"}))
    _, body, _ = req(server, "GET", "/demo")
    assert "Re-rendering" in body
    _, body, _ = req(server, "GET", "/demo/v/w01-s1")
    assert "Rendering the new version" in body and "http-equiv=refresh" in body


def test_next_free_skips_taken_and_respects_lead():
    at = datetime(2026, 10, 25, 6, 10, tzinfo=timezone.utc)
    assert SCH.next_free(set(), at=at) == "2026-10-25T18:30:00+00:00"   # 06:30 is inside the 30-min lead
    assert SCH.next_free({"2026-10-25T18:30:00+00:00"}, at=at) == "2026-10-26T06:30:00+00:00"


def test_media_supports_range(server, client_dir):
    (client_dir / "posts" / "w01-s1" / "video.mp4").write_bytes(b"0123456789")
    c = http.client.HTTPConnection("127.0.0.1", server)
    c.request("GET", "/demo/media/w01-s1/video.mp4", headers={"Range": "bytes=2-5"})
    r = c.getresponse()
    assert r.status == 206 and r.read() == b"2345"
