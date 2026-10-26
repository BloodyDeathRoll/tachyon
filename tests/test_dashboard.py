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


def test_schedule_times_are_editable(server, client_dir):
    status, _, _ = req(server, "POST", "/demo/schedule", {"t1": "19:00", "t2": "07:15"})
    assert status == 303
    assert C.load_grants("demo")["slots"] == ["07:15", "19:00"]
    _, body, _ = req(server, "GET", "/demo")
    assert "value='07:15'" in body and "value='19:00'" in body
    status, _, _ = req(server, "POST", "/demo/schedule", {"t1": "7pm", "t2": "07:15"})
    assert status == 400
    status, _, _ = req(server, "POST", "/demo/schedule", {"t1": "07:15", "t2": "07:15"})
    assert status == 400


def test_prepare_next_week_and_auto_toggle(server, client_dir, monkeypatch):
    from spine import week as W
    started = []
    monkeypatch.setattr(W, "start", lambda c, w: started.append((c, w)))
    req(server, "POST", "/demo/week", {"action": "prepare"})
    assert started == [("demo", W.next_week())]
    req(server, "POST", "/demo/week", {"action": "auto", "value": "1"})
    assert C.load_grants("demo")["week_prep"]["auto"] is True
    _, body, _ = req(server, "GET", "/demo")
    assert "Next week" in body and "Prepare automatically every Thursday" in body


def test_planned_slot_is_kept_on_approval(server, client_dir):
    db = DB.for_client(client_dir)
    db.conn.execute("UPDATE posts SET scheduled_at='2099-01-05T18:30:00+00:00' WHERE slot_id='w01-s1'")
    db.close()
    req(server, "POST", "/demo/v/w01-s1/decide", {"action": "approve", "notes": ""})
    db = DB.for_client(client_dir)
    assert db.post("w01-s1")["scheduled_at"] == "2099-01-05T18:30:00+00:00"
    db.close()


def test_calendar_places_video_in_its_slot(server, client_dir):
    db = DB.for_client(client_dir)
    db.conn.execute("UPDATE posts SET scheduled_at='2026-11-03T18:30:00+00:00' WHERE slot_id='w01-s1'")
    db.close()
    status, body, _ = req(server, "GET", "/demo/calendar?w=2026-W45")
    assert status == 200
    assert "/demo/v/w01-s1" in body and "18:30" in body and "06:30" in body and "Open slot" in body


def test_week_plan_slots_and_registry(client_dir, tmp_path, monkeypatch):
    from spine import week as W
    monkeypatch.setattr(W, "FILMS", tmp_path / "films")
    (tmp_path / "films").mkdir()
    (tmp_path / "films" / "index.ts").write_text("// @imports\nexport const FILMS = [\n  // @films\n];\n")
    times = W.slot_times("demo", "2026-W45")
    assert len(times) == 14 and times[0] == "2026-11-02T06:30:00+00:00"
    items = [{"at": t, "title": f"T{i}", "brief": "b", "hook": "h", "caption": "c"} for i, t in enumerate(times[:2])]
    slots = W.make_slots("demo", "2026-W45", items)
    assert slots == ["2026-w45-01", "2026-w45-02"]
    db = DB.for_client(client_dir)
    row = db.post("2026-w45-02")
    db.close()
    assert row["state"] == "BRIEFED" and row["scheduled_at"] == times[1]
    meta = json.loads((client_dir / "posts" / "2026-w45-01" / "meta.json").read_text())
    assert meta["film"]["reel"] == "film-2026-w45-01" and meta["film"]["story"] == "film-2026-w45-01-story"
    W.register("film-2026-w45-01"); W.register("film-2026-w45-01")
    idx = (tmp_path / "films" / "index.ts").read_text()
    assert idx.count('from "./film-2026-w45-01"') == 1 and 'id: "film-2026-w45-01"' in idx


def test_instagram_track_plays_with_the_video(server, client_dir):
    import json
    sd = client_dir / "posts" / "w01-s1"
    m = json.loads((sd / "meta.json").read_text()) if (sd / "meta.json").exists() else {}
    m["audio_configuration"] = {"audio_id": "1", "audio_volume": 100, "video_volume": 1}
    m.update(track="ig:1", track_info={"preview_of": "ig:1"})
    (sd / "meta.json").write_text(json.dumps(m))
    (sd / "ig-track.m4a").write_bytes(b"\0" * 64)
    status, body, _ = req(server, "GET", "/demo/v/w01-s1")
    assert "id=igtrack" in body and "ig-track.m4a" in body
    status, _, _ = req(server, "GET", "/demo/media/w01-s1/ig-track.m4a")
    assert status == 200


def test_no_track_element_without_instagram_track(server):
    status, body, _ = req(server, "GET", "/demo/v/w01-s1")
    assert "id=igtrack" not in body


def test_ig_preview_fetch_cache_and_failure(client_dir, monkeypatch):
    import io, json
    from spine import tracks as T
    sd = client_dir / "posts" / "w01-s1"

    class Resp(io.BytesIO):
        def __enter__(self): return self
        def __exit__(self, *a): return False
    assert T.fetch_ig_preview("demo", "w01-s1", "https://x/a.m4a", opener=lambda u, timeout: Resp(b"abc")).read_bytes() == b"abc"
    m = json.loads((sd / "meta.json").read_text()) if (sd / "meta.json").exists() else {}
    m.update(track="ig:1", track_info={"preview_of": "ig:1"})
    (sd / "meta.json").write_text(json.dumps(m))
    assert T.ig_preview("demo", "w01-s1") is not None
    m["track"] = "ig:2"                                 # pick changed elsewhere: stale copy not played
    (sd / "meta.json").write_text(json.dumps(m))
    assert T.ig_preview("demo", "w01-s1") is None

    def boom(u, timeout):
        raise OSError("expired")
    assert T.fetch_ig_preview("demo", "w01-s1", "https://x/b.m4a", opener=boom) is None
    assert not (sd / T.IG_PREVIEW).exists()             # old copy removed, nothing half-written


def test_ig_preview_respects_size_cap(client_dir):
    import io
    from spine import tracks as T

    class Resp(io.BytesIO):
        def __enter__(self): return self
        def __exit__(self, *a): return False
    big = lambda u, timeout: Resp(b"\0" * (T.IG_PREVIEW_MAX + 1))  # noqa: E731
    assert T.fetch_ig_preview("demo", "w01-s1", "https://x/big.m4a", opener=big) is None
    assert not (client_dir / "posts" / "w01-s1" / T.IG_PREVIEW).exists()


def test_set_track_marks_and_clears_preview(client_dir, monkeypatch):
    import json
    from spine import tracks as T
    sd = client_dir / "posts" / "w01-s1"
    if not (sd / "meta.json").exists():
        (sd / "meta.json").write_text("{}")
    ig = {"id": "ig:7", "audio_id": "7", "title": "T", "artist": "A", "source": "instagram", "preview": "https://x/t.m4a"}
    lib = [{"id": "f:1", "title": "F", "artist": "B", "source": "file", "file": "f.mp3"}]
    monkeypatch.setattr(T, "_ig_known", lambda c: {"ig:7": ig})
    monkeypatch.setattr(T, "_library", lambda c: lib)
    monkeypatch.setattr(T, "apply", lambda c, s: None)
    monkeypatch.setattr(T, "_rel", str)   # tmp client dir is outside the repo

    def ok(c, s, url):
        f = sd / T.IG_PREVIEW
        f.write_bytes(b"abc")
        return f
    monkeypatch.setattr(T, "fetch_ig_preview", ok)
    T.set_track("demo", "w01-s1", "ig:7")
    assert json.loads((sd / "meta.json").read_text())["track_info"]["preview_of"] == "ig:7"
    assert T.ig_preview("demo", "w01-s1") is not None

    monkeypatch.setattr(T, "fetch_ig_preview", lambda c, s, url: None)
    T.set_track("demo", "w01-s1", "ig:7")
    assert "preview_of" not in json.loads((sd / "meta.json").read_text())["track_info"]

    (sd / T.IG_PREVIEW).write_bytes(b"abc")
    T.set_track("demo", "w01-s1", "f:1")
    assert not (sd / T.IG_PREVIEW).exists()
