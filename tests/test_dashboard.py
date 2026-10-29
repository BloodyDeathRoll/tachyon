"""Dashboard (spine/review/app.py): overview cards + tags, video page, approve → scheduled,
reject → re-render job, QA off the main screens."""

import http.client
import json
import re
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
    assert all(s in body for s in ("Approve and schedule", "Ask for new version", "Update and Review", "Clear and Cancel"))
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
    assert C.load_grants("demo")["slots"] == sorted(app._shift(t, False) for t in ("07:15", "19:00"))   # shown local, stored UTC
    _, body, _ = req(server, "GET", "/demo")
    assert "value='07:15'" in body and "value='19:00'" in body
    status, _, _ = req(server, "POST", "/demo/schedule", {"t1": "7pm", "t2": "07:15"})
    assert status == 400
    status, _, _ = req(server, "POST", "/demo/schedule", {"t1": "07:15", "t2": "07:15"})
    assert status == 400


def test_prepare_next_week_and_auto_toggle(server, client_dir, monkeypatch):
    from spine import week as W
    started = []
    monkeypatch.setattr(W, "start", lambda c, w, i=None: started.append((c, w, i)))
    req(server, "POST", "/demo/week", {"action": "prepare", "instructions": "particles everywhere"})
    assert started == [("demo", W.next_week(), "particles everywhere")]
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


def test_edit_takes_approval_back(server, client_dir):
    req(server, "POST", "/demo/v/w01-s1/decide", {"action": "approve", "notes": ""})
    status, body, _ = req(server, "GET", "/demo/v/w01-s1")
    assert "value=revoke" in body and "Edit</button>" in body
    status, _, loc = req(server, "POST", "/demo/v/w01-s1/decide", {"action": "revoke"})
    assert status == 303 and loc == "/demo/v/w01-s1"
    db = DB.for_client(client_dir)
    assert db.post("w01-s1")["state"] == "NEEDS_APPROVAL"
    db.close()
    status, body, _ = req(server, "GET", "/demo/v/w01-s1")
    assert "Approve and schedule" in body


def test_edit_refused_once_publishing(server, client_dir):
    req(server, "POST", "/demo/v/w01-s1/decide", {"action": "approve", "notes": ""})
    db = DB.for_client(client_dir)
    db.set_state("w01-s1", "QUEUED")
    db.set_state("w01-s1", "PUBLISHING")
    db.close()
    status, _, _ = req(server, "POST", "/demo/v/w01-s1/decide", {"action": "revoke"})
    assert status == 409
def test_instagram_track_is_not_played_twice(server, client_dir):
    import json
    sd = client_dir / "posts" / "w01-s1"
    m = json.loads((sd / "meta.json").read_text()) if (sd / "meta.json").exists() else {}
    m["audio_configuration"] = {"audio_id": "1", "audio_volume": 100, "video_volume": 1}
    m.update(track="ig:1", track_info={"preview_of": "ig:1"})
    (sd / "meta.json").write_text(json.dumps(m))
    (sd / "ig-track.m4a").write_bytes(b"\0" * 64)
    status, body, _ = req(server, "GET", "/demo/v/w01-s1")
    assert "id=igtrack" not in body   # the song is baked into video.mp4; a second player echoes it
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


def test_edit_twice_and_from_queued(server, client_dir):
    req(server, "POST", "/demo/v/w01-s1/decide", {"action": "approve", "notes": ""})
    db = DB.for_client(client_dir)
    db.set_state("w01-s1", "QUEUED")
    db.close()
    assert req(server, "POST", "/demo/v/w01-s1/decide", {"action": "revoke"})[0] == 303
    assert req(server, "POST", "/demo/v/w01-s1/decide", {"action": "revoke"})[0] == 303   # double click
    db = DB.for_client(client_dir)
    assert db.post("w01-s1")["state"] == "NEEDS_APPROVAL"
    db.close()


def _fail(client_dir, step="rendering"):
    (client_dir / "posts" / "w01-s1" / "revise.json").write_text(json.dumps(
        {"state": "failed", "step": step, "notes": "faster", "error": "delayRender() timed out",
         "changes": "made it faster", "updated_at": "2026-10-26T18:48:50+00:00"}))


def test_failed_rerender_shows_error_card_and_rerun(server, client_dir):
    db = DB.for_client(client_dir)
    db.set_state("w01-s1", "REJECTED", note="faster")   # how older failures were left: stuck
    db.close()
    _fail(client_dir)
    _, body, _ = req(server, "GET", "/demo/v/w01-s1")
    assert "Re-render failed" in body and "delayRender() timed out" in body
    assert "value=retry" in body and "value=approve" in body


def test_failed_rerender_does_not_block_approve(server, client_dir):
    db = DB.for_client(client_dir)
    db.set_state("w01-s1", "REJECTED", note="faster")
    db.close()
    _fail(client_dir)
    status, _, _ = req(server, "POST", "/demo/v/w01-s1/decide", {"action": "approve"})
    assert status == 303
    db = DB.for_client(client_dir)
    assert db.post("w01-s1")["state"] == "APPROVED"
    db.close()
    assert R.status("demo", "w01-s1")["state"] == "dismissed"
    _, body, _ = req(server, "GET", "/demo/v/w01-s1")
    assert "Re-render failed" not in body


def test_failed_rerender_accepts_new_notes(server, client_dir, monkeypatch):
    started = []
    monkeypatch.setattr(R, "start", lambda c, s, n: started.append(n))
    db = DB.for_client(client_dir)
    db.set_state("w01-s1", "REJECTED", note="faster")
    db.close()
    _fail(client_dir)
    status, _, _ = req(server, "POST", "/demo/v/w01-s1/decide", {"action": "reject", "notes": "slower"})
    assert status == 303 and started == ["slower"]


def test_rerun_renders_only_when_edit_was_done(server, client_dir, monkeypatch):
    spawned = []
    monkeypatch.setattr(R, "_spawn", lambda c, s: spawned.append(s))
    _fail(client_dir, step="rendering")
    status, _, _ = req(server, "POST", "/demo/v/w01-s1/decide", {"action": "retry"})
    assert status == 303 and spawned == ["w01-s1"]
    st = R.status("demo", "w01-s1")
    assert st["state"] == "running" and st["skip_edit"] is True and st["notes"] == "faster"
    db = DB.for_client(client_dir)
    assert db.post("w01-s1")["state"] == "REJECTED"   # run() takes it REJECTED -> SCRIPTED
    db.close()
    status, _, _ = req(server, "POST", "/demo/v/w01-s1/decide", {"action": "retry"})   # second click: no-op
    assert status == 303 and spawned == ["w01-s1"]


def test_rerun_redoes_the_edit_when_it_failed_there(server, client_dir, monkeypatch):
    monkeypatch.setattr(R, "_spawn", lambda c, s: None)
    _fail(client_dir, step="editing")
    req(server, "POST", "/demo/v/w01-s1/decide", {"action": "retry"})
    assert R.status("demo", "w01-s1")["skip_edit"] is False


def test_failed_run_puts_the_previous_cut_back_to_approval(client_dir, monkeypatch):
    db = DB.for_client(client_dir)
    db.set_state("w01-s1", "REJECTED", note="faster")
    db.close()
    (client_dir / "posts" / "w01-s1" / "revise.json").write_text(json.dumps(
        {"state": "running", "step": "queued", "notes": "faster", "skip_edit": True, "changes": "x"}))
    def boom(c, s):
        raise RuntimeError("npx failed: delayRender timeout")
    monkeypatch.setattr(R, "render", boom)
    assert R.run("demo", "w01-s1") == 1
    st = R.status("demo", "w01-s1")
    assert st["state"] == "failed" and "delayRender" in st["error"] and st["step"] == "rendering"
    db = DB.for_client(client_dir)
    assert db.post("w01-s1")["state"] == "NEEDS_APPROVAL"
    db.close()


def test_failure_after_render_still_lands_in_approval(client_dir, monkeypatch):
    db = DB.for_client(client_dir)
    db.set_state("w01-s1", "REJECTED", note="faster")
    db.close()
    (client_dir / "posts" / "w01-s1" / "revise.json").write_text(json.dumps(
        {"state": "running", "step": "queued", "notes": "faster", "skip_edit": True, "changes": "x"}))
    monkeypatch.setattr(R, "render", lambda c, s: {"reel": "VERDICT: PASS"})
    monkeypatch.setattr(R, "_qa_md", lambda *a: (_ for _ in ()).throw(RuntimeError("qa broke")))
    assert R.run("demo", "w01-s1") == 1
    db = DB.for_client(client_dir)
    assert db.post("w01-s1")["state"] == "NEEDS_APPROVAL"
    db.close()


def test_rerun_that_cannot_start_shows_the_failure_again(client_dir, monkeypatch):
    def nope(c, s):
        raise OSError("no python")
    monkeypatch.setattr(R, "_spawn", nope)
    _fail(client_dir)
    db = DB.for_client(client_dir)
    with pytest.raises(OSError):
        R.retry("demo", "w01-s1", db)
    assert db.post("w01-s1")["state"] == "NEEDS_APPROVAL"
    db.close()
    st = R.status("demo", "w01-s1")
    assert st["state"] == "failed" and "could not start" in st["error"]


def test_failure_after_render_says_the_new_cut_is_in_place(server, client_dir):
    _fail(client_dir, step="finishing")
    _, body, _ = req(server, "GET", "/demo/v/w01-s1")
    assert "The new cut is in place" in body and "still the previous cut" not in body


def test_delete_video_moves_it_to_trash(server, client_dir):
    _, body, _ = req(server, "GET", "/demo/v/w01-s1")
    assert "Delete this video?" in body and "data-open" in body
    status, _, loc = req(server, "POST", "/demo/v/w01-s1/delete", {})
    assert status == 303 and loc == "/demo"
    db = DB.for_client(client_dir)
    with pytest.raises(KeyError):
        db.post("w01-s1")
    db.close()
    assert not (client_dir / "posts" / "w01-s1").exists()
    assert len(list((client_dir / "trash").glob("w01-s1-*"))) == 1
    _, body, _ = req(server, "GET", "/demo")
    assert "Showreel" not in body


def test_live_video_cannot_be_deleted(server, client_dir):
    db = DB.for_client(client_dir)
    for st in ["APPROVED", "QUEUED"]:
        db.set_state("w01-s1", st)
    db.set_state("w01-s1", "PUBLISHING")
    db.set_state("w01-s1", "PUBLISHED", ig_media_id="m1")
    db.close()
    _, body, _ = req(server, "GET", "/demo/v/w01-s1")
    assert "Delete this video?" not in body
    status, _, _ = req(server, "POST", "/demo/v/w01-s1/delete", {})
    assert status == 409
    assert (client_dir / "posts" / "w01-s1").exists()


def test_unslotted_video_shows_on_the_calendar_where_the_page_says(server, client_dir):
    _, body, _ = req(server, "GET", "/demo/v/w01-s1")
    m = re.search(r"Planned for</span><p class=big[^>]*>([^<]+)<", body)
    assert m, "planned date on the video page"
    db = DB.for_client(client_dir)
    at = SCH.preview_slots(db, ["w01-s1"])["w01-s1"]
    db.close()
    dt = datetime.fromisoformat(at)
    y, w, _ = dt.isocalendar()
    _, cal, _ = req(server, "GET", f"/demo/calendar?w={y}-W{w:02d}")
    assert "/demo/v/w01-s1" in cal


def test_two_unslotted_videos_get_different_preview_slots(client_dir):
    db = DB.for_client(client_dir)
    db.create_post("w01-s2", "demo")
    for st in ["BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL"]:
        db.set_state("w01-s2", st)
    p = SCH.preview_slots(db, ["w01-s2", "w01-s1"])
    db.close()
    assert p["w01-s1"] != p["w01-s2"] and p["w01-s1"] < p["w01-s2"]


def test_batch_instructions_reach_both_prompts(client_dir, monkeypatch):
    from spine import week as W
    monkeypatch.setattr(W.subprocess, "Popen", lambda *a, **k: None)
    W.start("demo", "2099-W02", "Use the app particles in empty dark areas")
    assert W.last_instructions("demo") == "Use the app particles in empty dark areas"
    prompt = W.plan_prompt("demo", "2099-W02", ["2099-01-12T06:30:00+00:00"], W.ROOT / "x.yaml")
    assert "Use the app particles in empty dark areas" in prompt
    s = client_dir / "posts" / "w01-s1"
    (s / "brief.md").write_text("# T\n\nHook: x\n\nbrief")
    (s / "meta.json").write_text(json.dumps({"title": "T", "plan": "2099-W02"}))
    assert "Use the app particles in empty dark areas" in W.film_prompt("demo", "w01-s1")
    W.start("demo", "2099-W03")   # the daily auto run reuses the last brief
    assert W.status("demo", "2099-W03")["instructions"] == "Use the app particles in empty dark areas"


def test_prepare_popup_prefills_last_instructions(server, client_dir, monkeypatch):
    from spine import week as W
    monkeypatch.setattr(W.subprocess, "Popen", lambda *a, **k: None)
    W.start("demo", "2099-W02", "light and airy")
    W.plans_dir("demo").joinpath("2099-W02.json").write_text(json.dumps({"state": "done", "instructions": "light and airy", "started_at": "2099"}))
    _, body, _ = req(server, "GET", "/demo")
    assert "Instructions for this batch" in body and "light and airy</textarea>" in body

def test_failure_before_start_has_a_readable_step(server, client_dir):
    _fail(client_dir, step="queued")
    _, body, _ = req(server, "GET", "/demo/v/w01-s1")
    assert "Failed before it started" in body and "still the previous cut" in body


def test_delete_unknown_video_is_404(server):
    status, _, _ = req(server, "POST", "/demo/v/nope/delete", {})
    assert status == 404


def test_delete_refused_while_rerendering(server, client_dir):
    (client_dir / "posts" / "w01-s1" / "revise.json").write_text(json.dumps({"state": "running", "step": "rendering"}))
    _, body, _ = req(server, "GET", "/demo/v/w01-s1")
    assert "Delete this video?" not in body
    status, _, _ = req(server, "POST", "/demo/v/w01-s1/delete", {})
    assert status == 409 and (client_dir / "posts" / "w01-s1").exists()


def test_delete_keeps_files_if_the_row_cannot_go(server, client_dir, monkeypatch):
    def boom(self, slot):
        raise RuntimeError("db locked")
    monkeypatch.setattr(DB, "delete_post", boom)
    try:
        req(server, "POST", "/demo/v/w01-s1/delete", {})
    except http.client.HTTPException:
        pass   # the error itself reaches the server log
    assert (client_dir / "posts" / "w01-s1" / "caption.txt").exists()


def test_approving_an_unslotted_video_takes_the_slot_the_calendar_showed(server, client_dir):
    db = DB.for_client(client_dir)
    db.create_post("w01-s0", "demo")
    for st in ["BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL"]:
        db.set_state("w01-s0", st)
    shown = SCH.preview_slots(db, ["w01-s0", "w01-s1"])["w01-s1"]   # s0 is earlier in order
    db.close()
    req(server, "POST", "/demo/v/w01-s1/decide", {"action": "approve"})
    db = DB.for_client(client_dir)
    assert db.post("w01-s1")["scheduled_at"] == shown
    db.close()


def test_calendar_nav_shows_the_shown_weeks_start(server):
    _, body, _ = req(server, "GET", "/demo/calendar?w=2099-W02")
    assert "title='Back to today'>Mon 5 Jan</a>" in body
    _, body, _ = req(server, "GET", "/demo/calendar?view=month&m=2099-03")
    assert "title='Back to today'>Mar 2099</a>" in body


needs_ffmpeg = pytest.mark.skipif(not __import__("shutil").which("ffmpeg"), reason="needs ffmpeg")


def _real_reel(client_dir, seconds=1):
    import subprocess
    out = client_dir / "posts" / "w01-s1" / "video.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"testsrc=size=1080x1920:rate=30:duration={seconds}",
                    "-f", "lavfi", "-i", f"sine=duration={seconds}", "-shortest", "-pix_fmt", "yuv420p", str(out)], check=True)
    return out


@pytest.fixture
def fake_remotion(client_dir, tmp_path, monkeypatch):
    """formats.make_one without claude or Remotion: the 'render' writes a real clip of the right size."""
    import subprocess
    from spine import formats as F
    films = tmp_path / "films"
    films.mkdir()
    (films / "formats.ts").write_text("// @imports\nexport const FORMATS = [\n  // @formats\n];\n")
    monkeypatch.setattr(F, "FILMS", films)
    monkeypatch.setattr(F, "REMOTION", tmp_path)
    (films / "S.tsx").write_text("film")
    meta = client_dir / "posts" / "w01-s1" / "meta.json"
    meta.write_text(json.dumps({"title": "Showreel", "film": {"engine": "remotion", "reel": "S", "story": "SS"}}))
    calls = []
    real_run = subprocess.run

    def run(cmd, *a, **k):
        calls.append(cmd[:3])
        if cmd[0] == "claude":
            r = next(x for x in F.RATIOS if f"-{x}.tsx" in cmd[2])
            (films / f"S-{r}.tsx").write_text("layout")
        elif cmd[:2] == ["npx", "remotion"]:
            w, h = F.RATIOS[cmd[4].split("-", 1)[1]]
            real_run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"color=size={w}x{h}:duration=1", str(cmd[5])], check=True)
        elif cmd[:2] == ["npx", "tsc"]:
            return subprocess.CompletedProcess(cmd, 0, "", "")
        else:
            return real_run(cmd, *a, **k)
        return subprocess.CompletedProcess(cmd, 0, "", "")
    monkeypatch.setattr(F.subprocess, "run", run)
    return calls


@needs_ffmpeg
def test_formats_are_new_layouts_rendered_at_size_with_the_reels_sound(client_dir, fake_remotion):
    import subprocess
    from spine import formats as F
    _real_reel(client_dir)
    assert F.make("demo", "w01-s1", ["16x9", "1x1"]) == 0, F.status("demo", "w01-s1")
    for r in ("16x9", "1x1"):
        w, h = F.RATIOS[r]
        got = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height", "-of", "csv=p=0",
                              str(F.path("demo", "w01-s1", r))], capture_output=True, text=True).stdout
        assert f"video,{w},{h}" in got and "audio" in got, r
    assert [c[0] for c in fake_remotion].count("claude") == 2
    assert 'id: "S-16x9"' in (F.FILMS / "formats.ts").read_text()
    F.make("demo", "w01-s1", ["16x9"])   # layout already written: render again, no new claude run
    assert [c[0] for c in fake_remotion].count("claude") == 2


@needs_ffmpeg
def test_formats_relayout_when_the_film_changed(client_dir, fake_remotion):
    import os
    from spine import formats as F
    _real_reel(client_dir)
    F.make("demo", "w01-s1", ["4x5"])
    later = (F.FILMS / "S-4x5.tsx").stat().st_mtime + 10
    os.utime(F.FILMS / "S.tsx", (later, later))
    F.make("demo", "w01-s1", ["4x5"])
    assert [c[0] for c in fake_remotion].count("claude") == 2


def test_formats_layout_that_does_not_typecheck_is_unregistered(client_dir, fake_remotion, monkeypatch):
    import subprocess
    from spine import formats as F
    _real_reel(client_dir)
    run = F.subprocess.run
    monkeypatch.setattr(F.subprocess, "run", lambda cmd, *a, **k: subprocess.CompletedProcess(cmd, 1, "src/films/S-2x3.tsx: TS2304", "")
                        if cmd[:2] == ["npx", "tsc"] else run(cmd, *a, **k))
    assert F.make("demo", "w01-s1", ["2x3"]) == 1
    assert "S-2x3" not in (F.FILMS / "formats.ts").read_text()
    assert not (F.FILMS / "S-2x3.tsx").exists()   # the next run writes it afresh
    assert "does not typecheck" in F.status("demo", "w01-s1")["error"]


@needs_ffmpeg
def test_formats_go_stale_after_a_rerender(client_dir):
    import os
    from spine import formats as F
    reel = _real_reel(client_dir)
    F.path("demo", "w01-s1", "1x1").write_bytes(b"x")
    later = F.path("demo", "w01-s1", "1x1").stat().st_mtime + 10
    os.utime(reel, (later, later))
    assert F.ready("demo", "w01-s1") == []


@needs_ffmpeg
def test_video_page_switches_formats_and_downloads(server, client_dir):
    from spine import formats as F
    _real_reel(client_dir)
    F.path("demo", "w01-s1", "4x5").write_bytes(b"fake")
    _, body, _ = req(server, "GET", "/demo/v/w01-s1")
    assert "Generate new version" in body and "?as=4x5'" in body
    _, body, _ = req(server, "GET", "/demo/v/w01-s1?as=4x5")
    assert "video-4x5.mp4" in body and "aspect-ratio:4/5" in body and "Download 4:5" in body
    c = http.client.HTTPConnection("127.0.0.1", server)
    c.request("GET", "/demo/media/w01-s1/video-4x5.mp4?dl=1")
    r = c.getresponse()
    assert r.status == 200 and "demo-w01-s1-4x5.mp4" in (r.getheader("Content-Disposition") or "")


def test_generating_shows_a_yellow_pill(server, client_dir):
    import os
    from spine import formats as F
    F.status_path("demo", "w01-s1").write_text(json.dumps({"state": "running", "current": "16x9", "step": "rendering",
                                                           "pid": os.getpid(), "updated_at": F.now()}))
    _, body, _ = req(server, "GET", "/demo/v/w01-s1")
    assert "<span class='tag gen'>Rendering 16:9…</span>" in body


def test_generate_formats_post_starts_the_job(server, client_dir, monkeypatch):
    from spine import formats as F
    got = []
    monkeypatch.setattr(F, "start", lambda c, s, r: got.append(r))
    status, _, _ = req(server, "POST", "/demo/v/w01-s1/formats", {"r": "16x9"})
    assert status == 303 and got == [["16x9"]]



def test_formats_job_that_died_reads_as_failed(server, client_dir):
    from spine import formats as F
    F.status_path("demo", "w01-s1").write_text(json.dumps({"state": "running", "current": "1x1", "pid": 999999999}))
    assert F.status("demo", "w01-s1")["state"] == "failed"
    _, body, _ = req(server, "GET", "/demo/v/w01-s1")
    assert "Generate new version" in body and "stopped before it finished" in body


def test_formats_start_runs_once(client_dir, monkeypatch):
    from spine import formats as F
    calls = []
    monkeypatch.setattr(F.subprocess, "Popen", lambda *a, **k: calls.append(a))
    F.start("demo", "w01-s1", ["1x1"])
    F.start("demo", "w01-s1", ["1x1"])   # second click while running
    assert len(calls) == 1 and F.status("demo", "w01-s1")["state"] == "running"


def test_formats_start_that_cannot_spawn_reads_failed(client_dir, monkeypatch):
    from spine import formats as F
    def nope(*a, **k):
        raise OSError("no python")
    monkeypatch.setattr(F.subprocess, "Popen", nope)
    F.start("demo", "w01-s1", ["1x1"])
    st = F.status("demo", "w01-s1")
    assert st["state"] == "failed" and "could not start" in st["error"]


def test_formats_job_that_never_registered_reads_failed_after_a_minute(client_dir):
    from spine import formats as F
    F.status_path("demo", "w01-s1").write_text(json.dumps({"state": "running", "pid": None, "updated_at": "2020-01-01T00:00:00+00:00"}))
    assert F.status("demo", "w01-s1")["state"] == "failed"


def test_formats_leftover_lock_file_does_not_block(client_dir, monkeypatch):
    from spine import formats as F
    calls = []
    monkeypatch.setattr(F.subprocess, "Popen", lambda *a, **k: calls.append(a))
    (client_dir / "posts" / "w01-s1" / "formats.lock").write_text("")   # left by a killed request
    F.start("demo", "w01-s1", ["1x1"])
    assert len(calls) == 1


def test_formats_job_without_progress_for_10_min_reads_failed(client_dir, monkeypatch):
    import os
    from spine import formats as F
    F.status_path("demo", "w01-s1").write_text(json.dumps({"state": "running", "pid": os.getpid(), "updated_at": "2020-01-01T00:00:00+00:00"}))
    assert F.status("demo", "w01-s1")["state"] == "failed"
    F.status_path("demo", "w01-s1").write_text("{broken")
    assert F.status("demo", "w01-s1") == {}



def test_formats_failed_layout_write_leaves_nothing_registered(client_dir, fake_remotion, monkeypatch):
    import subprocess
    from spine import formats as F
    _real_reel(client_dir)
    run = F.subprocess.run

    def claude_dies(cmd, *a, **k):
        if cmd[0] == "claude":   # registers itself, then fails
            (F.FILMS / "formats.ts").write_text((F.FILMS / "formats.ts").read_text().replace(
                "// @imports", 'import x from "./S-1x1";\n// @imports'))
            return subprocess.CompletedProcess(cmd, 1, "", "timeout")
        return run(cmd, *a, **k)
    monkeypatch.setattr(F.subprocess, "run", claude_dies)
    assert F.make("demo", "w01-s1", ["1x1"]) == 1
    assert "S-1x1" not in (F.FILMS / "formats.ts").read_text()



def test_formats_unrelated_type_error_keeps_the_layout(client_dir, fake_remotion, monkeypatch):
    import subprocess
    from spine import formats as F
    _real_reel(client_dir)
    run = F.subprocess.run
    monkeypatch.setattr(F.subprocess, "run", lambda cmd, *a, **k: subprocess.CompletedProcess(cmd, 1, "src/Other.tsx: TS2304", "")
                        if cmd[:2] == ["npx", "tsc"] else run(cmd, *a, **k))
    assert F.make("demo", "w01-s1", ["2x3"]) == 1
    assert (F.FILMS / "S-2x3.tsx").exists() and "S-2x3" not in (F.FILMS / "formats.ts").read_text()


FUTURE = "2099-01-05T06:30:00+00:00"


@needs_ffmpeg
def test_add_new_upload_lands_in_approval_with_its_own_sound(server, client_dir, tmp_path, monkeypatch):
    import subprocess
    from spine import manual as M
    monkeypatch.setattr(M, "UPLOADS", tmp_path / "uploads")
    src = tmp_path / "clip.mov"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=1920x1080:rate=25:duration=2",
                    "-f", "lavfi", "-i", "sine=duration=2", "-shortest", "-pix_fmt", "yuv420p", str(src)], check=True)
    c = http.client.HTTPConnection("127.0.0.1", server)
    c.request("POST", f"/demo/new/upload?at={FUTURE.replace('+', '%2B')}&name=clip.mov", body=src.read_bytes())
    r = c.getresponse()
    assert r.status == 303, r.read()
    slot = r.getheader("Location").rsplit("/", 1)[1]
    assert slot == "2099-w02-01"
    sd = client_dir / "posts" / slot
    got = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height", "-of", "csv=p=0",
                          str(sd / "video.mp4")], capture_output=True, text=True).stdout
    assert "video,1080,1920" in got and "audio" in got
    assert (sd / "cover.jpg").exists() and (tmp_path / "uploads" / f"{slot}.mp4").exists()
    db = DB.for_client(client_dir)
    row = db.post(slot)
    db.close()
    assert row["state"] in ("NEEDS_APPROVAL", "NEEDS_INPUT") and row["scheduled_at"] == FUTURE
    _, body, _ = req(server, "GET", f"/demo/v/{slot}")
    assert "Approve and schedule" in body or "Needs" in body
    assert "Generate new version" not in body   # an upload has no film until its first edit


def test_add_new_upload_refuses_taken_or_past_slots_and_non_video(client_dir, tmp_path):
    from spine import manual as M
    f = tmp_path / "x.mp4"
    f.write_bytes(b"x")
    with pytest.raises(ValueError, match="past"):
        M.add_upload("demo", "2000-01-03T06:30:00+00:00", f, "x.mp4")
    with pytest.raises(ValueError, match="not a video"):
        M.add_upload("demo", FUTURE, f, "notes.txt")
    db = DB.for_client(client_dir)
    db.conn.execute("UPDATE posts SET scheduled_at=? WHERE slot_id='w01-s1'", (FUTURE,))
    db.close()
    with pytest.raises(ValueError, match="taken"):
        M.add_upload("demo", FUTURE, f, "x.mp4")


def test_add_new_prompt_plans_then_makes_it(server, client_dir, monkeypatch):
    from spine import manual as M
    from spine import week as W
    spawned = []
    monkeypatch.setattr(M.subprocess, "Popen", lambda *a, **k: spawned.append(a[0]))
    status, _, loc = req(server, "POST", "/demo/new", {"at": FUTURE, "prompt": "particles over the swell chart"})
    assert status == 303 and spawned and spawned[0][-1] == "2099-w02-01"
    slot = loc.rsplit("/", 1)[1]
    _, body, _ = req(server, "GET", f"/demo/v/{slot}")
    assert "In production" in body
    seen = {}

    def fake_claude(prompt, allowed, timeout):
        seen["prompt"] = prompt
        out = W.plans_dir("demo") / f"manual-{slot}.yaml"
        out.write_text(yaml.safe_dump({"items": [{"at": "x", "title": "Particles", "pillar": "proof", "brief": "b",
                                                  "hook": "Look", "caption": "Free forecast, link in bio."}]}))
        return ""
    monkeypatch.setattr(W, "_claude", fake_claude)
    monkeypatch.setattr(W, "produce", lambda c, s: seen.setdefault("made", s))
    assert M.produce("demo", slot) == 0
    assert "particles over the swell chart" in seen["prompt"] and seen["made"] == slot
    meta = json.loads((client_dir / "posts" / slot / "meta.json").read_text())
    assert meta["title"] == "Particles" and meta["plan"] == "manual" and meta["film"]["reel"] == f"film-{slot}"


def test_add_new_prompt_failure_shows_error_and_rerun(server, client_dir, monkeypatch):
    from spine import manual as M
    from spine import week as W
    monkeypatch.setattr(M.subprocess, "Popen", lambda *a, **k: None)
    _, _, loc = req(server, "POST", "/demo/new", {"at": FUTURE, "prompt": "x"})
    slot = loc.rsplit("/", 1)[1]
    monkeypatch.setattr(W, "_claude", lambda *a: (_ for _ in ()).throw(RuntimeError("claude failed: timeout")))
    assert M.produce("demo", slot) == 1
    _, body, _ = req(server, "GET", f"/demo/v/{slot}")
    assert "Making it failed" in body and "Nothing was made yet" in body and "value=retry" in body
    assert "value=approve" not in body
    restarted = []
    monkeypatch.setattr(M, "start", lambda c, s: restarted.append(s))
    req(server, "POST", f"/demo/v/{slot}/decide", {"action": "retry"})
    assert restarted == [slot]


def test_week_prep_skips_ids_added_by_hand(client_dir):
    from spine import week as W
    sd = client_dir / "posts" / "2099-w02-01"
    sd.mkdir(parents=True)
    (sd / "meta.json").write_text(json.dumps({"plan": "manual"}))
    items = [{"at": FUTURE, "title": "T", "brief": "b", "hook": "h", "caption": "c"}]
    assert W.make_slots("demo", "2099-W02", items) == ["2099-w02-02"]
    assert W.make_slots("demo", "2099-W02", items) == ["2099-w02-02"]   # a resumed run reuses its own


def slot_on(day, i=0):
    """The i-th publishing slot on a local day, as stored (UTC ISO): tests hold in any time zone."""
    from datetime import date
    return list(app.day_slots(C.load_grants("demo"), date.fromisoformat(day)).values())[i]


def test_calendar_open_slots_offer_add_new(server):
    _, body, _ = req(server, "GET", "/demo/calendar?w=2099-W02")
    assert f"data-add='{slot_on('2099-01-05')}'" in body and "id=addnew" in body and "+ Add new" in body

def test_formats_typecheck_timeout_unregisters(client_dir, fake_remotion, monkeypatch):
    import subprocess
    from spine import formats as F
    _real_reel(client_dir)
    run = F.subprocess.run

    def slow(cmd, *a, **k):
        if cmd[:2] == ["npx", "tsc"]:
            raise subprocess.TimeoutExpired(cmd, 300)
        return run(cmd, *a, **k)
    monkeypatch.setattr(F.subprocess, "run", slow)
    assert F.make("demo", "w01-s1", ["1x1"]) == 1
    assert "S-1x1" not in (F.FILMS / "formats.ts").read_text()


def test_add_new_slot_checks(client_dir, tmp_path):
    from spine import manual as M
    f = tmp_path / "x.mp4"
    f.write_bytes(b"x")
    with pytest.raises(ValueError, match="not one of the publishing slots"):
        M.add_upload("demo", "2099-01-05T07:00:00+00:00", f, "x.mp4")
    db = DB.for_client(client_dir)
    db.conn.execute("UPDATE posts SET scheduled_at=? WHERE slot_id='w01-s1'", (FUTURE,))
    db.close()
    with pytest.raises(ValueError, match="taken"):
        M.add_upload("demo", "2099-01-05T06:30:00Z", f, "x.mp4")   # same slot, other spelling


def test_new_slot_ids_never_collide(client_dir):
    from spine import manual as M
    assert [M.new_slot("demo", FUTURE) for _ in range(3)] == ["2099-w02-01", "2099-w02-02", "2099-w02-03"]


def test_failed_upload_leaves_no_row_or_files(client_dir, tmp_path, monkeypatch):
    from spine import manual as M
    monkeypatch.setattr(M, "UPLOADS", tmp_path / "uploads")
    f = tmp_path / "x.mp4"
    f.write_bytes(b"not really a video")
    with pytest.raises(Exception):
        M.add_upload("demo", FUTURE, f, "x.mp4")
    assert not (client_dir / "posts" / "2099-w02-01").exists()
    db = DB.for_client(client_dir)
    with pytest.raises(KeyError):
        db.post("2099-w02-01")
    db.close()


def test_a_claimed_slot_is_taken_for_the_next_add(client_dir, tmp_path, monkeypatch):
    from spine import manual as M
    slot, at = M._claim("demo", FUTURE, "x", "upload")
    f = tmp_path / "x.mp4"
    f.write_bytes(b"x")
    with pytest.raises(ValueError, match="taken"):
        M.add_upload("demo", FUTURE, f, "x.mp4")
    M._unclaim("demo", slot)
    assert M._check_slot("demo", FUTURE) == FUTURE


def test_upload_to_unknown_client_is_404(server):
    c = http.client.HTTPConnection("127.0.0.1", server)
    c.request("POST", f"/nobody/new/upload?at={FUTURE.replace('+', '%2B')}&name=a.mp4", body=b"x")
    assert c.getresponse().status == 404


def test_live_view_samples_once_a_minute(server, client_dir, monkeypatch):
    from spine.publisher import graph as G
    db = DB.for_client(client_dir)
    db.conn.execute("UPDATE posts SET ig_media_id='m1' WHERE slot_id='w01-s1'")
    db.close()
    calls = []
    views = iter([10, 13])
    monkeypatch.setattr(C, "token", lambda c: "t")
    monkeypatch.setattr(G.Graph, "get", lambda self, path, **p: calls.append(path) or {"data": [{"values": [{"value": next(views)}]}]})
    app._LIVE.clear()
    _, body, _ = req(server, "GET", "/demo/live.json")
    d = json.loads(body)
    assert d["total"] == 10 and d["points"] == [] and calls == ["m1/insights"]
    req(server, "GET", "/demo/live.json")   # within the minute: no new call
    assert len(calls) == 1
    k = ("demo", "")
    app._LIVE[k] = [(t - 61, v) for t, v in app._LIVE[k]]
    app._LIVE[k][0][1]["new-video"] = 0   # a video that left the set adds nothing
    d = json.loads(req(server, "GET", "/demo/live.json")[1])
    assert d["total"] == 13 and [p["v"] for p in d["points"]] == [3]
    _, page, _ = req(server, "GET", "/demo?g=live")
    assert "last 30 min" in page and "/demo/live.json" in page and ">Live</a>" in page



def test_live_view_no_spike_when_a_video_goes_live(client_dir):
    import time
    app._LIVE[("demo", "")] = [(1.0, {"a": 10}), (2.0, {"a": 12, "b": 500}), (time.time(), {"a": 12, "b": 503})]
    d = app.live_views("demo", None)   # last sample is fresh: no Instagram call
    assert [p["v"] for p in d["points"]] == [2, 3] and d["total"] == 515


def test_post_text_is_editable_until_it_goes_out(server, client_dir):
    assert "Save text" in req(server, "GET", "/demo/v/w01-s1")[1]
    status, _, _ = req(server, "POST", "/demo/v/w01-s1/decide", {"action": "caption", "caption": "new text\r\n\r\nline two "})
    assert status == 303
    assert (client_dir / "posts" / "w01-s1" / "caption.txt").read_text() == "new text\n\nline two\n"
    db = DB.for_client(client_dir)
    db.conn.execute("UPDATE posts SET published_at='2026-01-01T00:00:00+00:00' WHERE slot_id='w01-s1'")
    db.conn.commit()
    db.close()
    assert "Save text" not in req(server, "GET", "/demo/v/w01-s1")[1]
    assert req(server, "POST", "/demo/v/w01-s1/decide", {"action": "caption", "caption": "x"})[0] == 409


def test_times_show_in_local_zone(monkeypatch):
    from zoneinfo import ZoneInfo
    monkeypatch.setattr(app, "LOCAL", ZoneInfo("Asia/Jerusalem"))
    assert app.when("2026-11-01T18:30:00+00:00") == "Sun 1 Nov, 20:30"
    assert app.day_slots({"slots": ["06:30", "23:00"]}, datetime(2026, 11, 2).date()) == \
        {"01:00": "2026-11-01T23:00:00+00:00", "08:30": "2026-11-02T06:30:00+00:00"}
    assert app.utc_iso(datetime(2026, 11, 2).date(), "08:30") == "2026-11-02T06:30:00+00:00"


def test_custom_schedule_and_publish_now(server, client_dir, monkeypatch):
    body = req(server, "GET", "/demo/v/w01-s1")[1]
    assert "Custom time" in body and "Publish now" not in body     # not approved yet
    status, _, _ = req(server, "POST", "/demo/v/w01-s1/decide", {"action": "custom", "at": "2030-05-04T09:17"})
    assert status == 303
    db = DB.for_client(client_dir)
    want = datetime(2030, 5, 4, 9, 17, tzinfo=app.LOCAL).astimezone(timezone.utc).isoformat(timespec="seconds")
    assert db.post("w01-s1")["scheduled_at"] == want
    assert req(server, "POST", "/demo/v/w01-s1/decide", {"action": "custom", "at": "2001-01-01T00:00"})[0] == 400
    assert req(server, "POST", "/demo/v/w01-s1/decide", {"action": "publish_now"})[0] == 409
    req(server, "POST", "/demo/v/w01-s1/decide", {"action": "approve", "notes": ""})
    assert db.post("w01-s1")["scheduled_at"] == want                   # approval keeps the custom time
    assert "Publish now" in req(server, "GET", "/demo/v/w01-s1")[1]
    runs = []
    monkeypatch.setattr(app.subprocess, "Popen", lambda cmd, **kw: runs.append(cmd))
    assert req(server, "POST", "/demo/v/w01-s1/decide", {"action": "publish_now"})[0] == 303
    assert app.parse(db.post("w01-s1")["scheduled_at"]) <= datetime.now(timezone.utc)
    assert runs and runs[0][-2:] == ["demo", "w01-s1"] and db.post("w01-s1")["state"] == "QUEUED"
    db.close()


def test_publish_now_turns_into_publishing(server, client_dir):
    db = DB.for_client(client_dir)
    req(server, "POST", "/demo/v/w01-s1/decide", {"action": "approve", "notes": ""})
    db.set_state("w01-s1", "QUEUED")
    db.conn.execute("UPDATE posts SET scheduled_at='2020-01-01T00:00:00+00:00' WHERE slot_id='w01-s1'")   # due: the publisher's next run takes it
    body = req(server, "GET", "/demo/v/w01-s1")[1]
    assert "Publishing…" in body and "value=publish_now" not in body and "Custom time" not in body
    db.set_state("w01-s1", "PUBLISHING")
    body = req(server, "GET", "/demo/v/w01-s1")[1]
    assert "Publishing…" in body and "value=publish_now" not in body
    db.close()


def test_followers_who_dropped_from_two_uploaded_exports(server, client_dir, tmp_path):
    from tests.test_audience import export

    def up(path):
        c = http.client.HTTPConnection("127.0.0.1", server)
        c.request("POST", "/demo/audience/upload?name=x.zip", body=path.read_bytes())
        r = c.getresponse()
        return r.status, r.read().decode()

    assert "Upload your Instagram export" in req(server, "GET", "/demo")[1]
    status, reply = up(export(tmp_path / "1.zip", ["ann", "bob"]))
    assert status == 200 and "Export read: 2 followers." in json.loads(reply)["html"]   # the card comes back with the result
    assert "First export saved: <b>2</b> followers" in req(server, "GET", "/demo")[1]
    assert "already in" in json.loads(up(tmp_path / "1.zip")[1])["html"]
    status, reply = up(export(tmp_path / "2.zip", ["ann"]))
    assert status == 200 and "1 dropped" in json.loads(reply)["html"]
    body = req(server, "GET", "/demo")[1]
    assert "<b class=dnum>1</b> follower dropped since" in body and "See the list" in body
    assert "<dialog class=dlg id=droplist>" in body and "@bob" in body and "@ann" not in body
    bad = tmp_path / "bad.json"
    bad.write_text("{}")
    status, reply = up(bad)
    assert status == 400 and json.loads(reply)["error"]   # shown in the card
    lone = tmp_path / "followers_1.json"   # the followers file on its own, not the zip
    lone.write_text('[{"title": "", "string_list_data": [{"value": "ann"}]}]')
    c = http.client.HTTPConnection("127.0.0.1", server)
    c.request("POST", "/demo/audience/upload?name=followers_1.json", body=lone.read_bytes())
    assert c.getresponse().status == 200


def test_cut_off_export_upload_is_not_imported(server, client_dir):
    import socket
    s = socket.create_connection(("127.0.0.1", server))
    body = b'[{"string_list_data": [{"value": "ann"}]}]'
    s.sendall(b"POST /demo/audience/upload?name=followers_1.json HTTP/1.1\r\nHost: x\r\n"
              + f"Content-Length: {len(body) + 500}\r\n\r\n".encode() + body)
    s.shutdown(socket.SHUT_WR)   # the client goes away mid-upload
    reply = b""
    while chunk := s.recv(4096):   # headers and body may arrive apart
        reply += chunk
    reply = reply.decode()
    s.close()
    assert " 400 " in reply.split("\r\n")[0] and "cut off" in reply
    assert "Upload your Instagram export" in req(server, "GET", "/demo")[1]


def test_overview_views_header_and_scheduled_stopwatch(server, client_dir):
    req(server, "POST", "/demo/v/w01-s1/decide", {"action": "approve", "notes": ""})
    body = req(server, "GET", "/demo?g=hour")[1]
    assert "last 48 hr" in body and "aria-label='Custom range'" in body and ">Custom</a>" not in body
    assert "class=stw title='Scheduled'" in body and "<span class='tag sched'>" not in body   # thumbs: stopwatch, not the tag
    assert "custom" in req(server, "GET", "/demo?g=custom&from=2026-01-01&to=2026-01-31")[1]
    assert "last 12 mon" in req(server, "GET", "/demo?g=month")[1]
    db = DB.for_client(client_dir)
    at = db.post("w01-s1")["scheduled_at"]
    db.close()
    y, w, _ = app.parse(at).astimezone(app.LOCAL).isocalendar()
    cal = req(server, "GET", f"/demo/calendar?w={y}-W{w:02d}")[1]
    assert "class=stw title='Scheduled'" in cal and "<span class='tag sched'>" not in cal   # calendar cells too


def test_look_for_manual_posts_runs_pickup_now(server, monkeypatch):
    from spine import pickup as PK
    _, body, _ = req(server, "GET", "/demo")
    assert "Look for manual posts" in body and "formaction='/demo/pickup'" in body
    monkeypatch.setattr(PK, "pickup", lambda c: [{"media": "M1", "slot_id": "s", "linked": False}, {"media": "M2", "error": "x"}])
    status, _, loc = req(server, "POST", "/demo/pickup", {})
    assert status == 303 and loc == "/demo?picked=1-1"
    _, body, _ = req(server, "GET", "/demo?picked=1-1")
    assert "1 post found · 1 could not be added" in body
    _, body, _ = req(server, "GET", "/demo?picked=0-0")
    assert "No posts found" in body
    monkeypatch.setattr(PK, "pickup", lambda c: (_ for _ in ()).throw(RuntimeError("no token")))
    assert req(server, "POST", "/demo/pickup", {})[2] == "/demo?picked=err"
    _, body, _ = req(server, "GET", "/demo?picked=err")
    assert "Could not reach Instagram" in body


def test_pause_and_play(server, client_dir, monkeypatch):
    db = DB.for_client(client_dir)
    req(server, "POST", "/demo/v/w01-s1/decide", {"action": "approve", "notes": ""})
    db.conn.execute("UPDATE posts SET scheduled_at='2030-05-04T09:00:00+00:00' WHERE slot_id='w01-s1'")
    assert "value=pause" in req(server, "GET", "/demo/v/w01-s1")[1]
    assert req(server, "POST", "/demo/v/w01-s1/decide", {"action": "pause"})[0] == 303
    assert db.post("w01-s1")["state"] == "PAUSED"
    body = req(server, "GET", "/demo/v/w01-s1")[1]
    assert f"Paused {app.when('2030-05-04T09:00:00+00:00').split(',')[0]}" in body   # its local day and "value=resume" in body and "value=pause" not in body
    assert "Paused" in req(server, "GET", "/demo")[1]                       # the overview card says so too
    runs = []
    monkeypatch.setattr(app.subprocess, "Popen", lambda cmd, **kw: runs.append(cmd))
    assert req(server, "POST", "/demo/v/w01-s1/decide", {"action": "resume"})[0] == 303   # time still ahead
    row = db.post("w01-s1")
    assert row["state"] == "QUEUED" and row["scheduled_at"] == "2030-05-04T09:00:00+00:00" and not runs
    req(server, "POST", "/demo/v/w01-s1/decide", {"action": "pause"})
    db.conn.execute("UPDATE posts SET scheduled_at='2020-01-01T00:00:00+00:00' WHERE slot_id='w01-s1'")
    assert "Paused, overdue" in req(server, "GET", "/demo/v/w01-s1")[1]
    assert req(server, "POST", "/demo/v/w01-s1/decide", {"action": "resume"})[0] == 303   # time passed: publish now
    assert db.post("w01-s1")["state"] == "QUEUED" and runs and runs[0][-2:] == ["demo", "w01-s1"]
    assert app.parse(db.post("w01-s1")["scheduled_at"]) > datetime(2026, 1, 1, tzinfo=timezone.utc)
    db.close()


def _revise_run(client_dir, notes):
    db = DB.for_client(client_dir)
    db.set_state("w01-s1", "REJECTED", note=notes)
    db.close()
    (client_dir / "posts" / "w01-s1" / "revise.json").write_text(json.dumps(
        {"state": "running", "step": "queued", "notes": notes, "skip_edit": False}))


def test_edit_that_changes_nothing_is_not_a_new_version(server, client_dir, monkeypatch):
    _revise_run(client_dir, "the voice says the wrong thing")
    monkeypatch.setattr(R, "_edit", lambda *a: "I made no changes: the problem is in the voice-over.")
    rendered = []
    monkeypatch.setattr(R, "render", lambda c, s: rendered.append(s))
    assert R.run("demo", "w01-s1") == 1 and not rendered
    st = R.status("demo", "w01-s1")
    assert st["state"] == "failed" and st["no_change"] and "voice-over" in st["error"]
    body = req(server, "GET", "/demo/v/w01-s1")[1]
    assert "No new version" in body and "I made no changes" in body


def test_rewritten_voiceover_is_recorded_again(client_dir, monkeypatch):
    s = client_dir / "posts" / "w01-s1"
    meta = json.loads((s / "meta.json").read_text()) | {"voiceover": {"script": "old line", "voice": "dia:seed8", "start": 0.5}}
    (s / "meta.json").write_text(json.dumps(meta))
    _revise_run(client_dir, "new idea")
    def edit(*a):
        m = json.loads((s / "meta.json").read_text())
        m["voiceover"]["script"] = "new line"
        (s / "meta.json").write_text(json.dumps(m))
        return "rewrote the voice-over"
    monkeypatch.setattr(R, "_edit", edit)
    import spine.voice as V
    voiced = []
    monkeypatch.setattr(V, "make_vo", lambda c, sl, script, voice=None, start=None: voiced.append((script, voice, start)))
    monkeypatch.setattr(R, "render", lambda c, sl: {"reel": "VERDICT: PASS"})
    assert R.run("demo", "w01-s1") == 0
    assert voiced == [("new line", "dia:seed8", 0.5)]


def test_edit_that_breaks_the_types_is_not_rendered(client_dir, monkeypatch):
    _revise_run(client_dir, "faster")
    s = client_dir / "posts" / "w01-s1"
    monkeypatch.setattr(R, "_edit", lambda *a: (s / "caption.txt").write_text("new") and "changed the caption")
    monkeypatch.setattr(R, "_typecheck", lambda: (False, "film.tsx(3,1): error TS2304"))
    rendered = []
    monkeypatch.setattr(R, "render", lambda c, sl: rendered.append(sl))
    assert R.run("demo", "w01-s1") == 1 and not rendered
    st = R.status("demo", "w01-s1")
    assert st["step"] == "editing" and "TS2304" in st["error"]


def test_edit_runs_in_remotion_with_the_repo_added(client_dir, monkeypatch):
    calls = []
    monkeypatch.setattr(R, "_prompt", lambda *a: "prompt")   # the fixture slot is outside the repo
    monkeypatch.setattr(R.subprocess, "run", lambda cmd, **kw: calls.append((cmd, kw)) or
                        type("r", (), {"returncode": 0, "stdout": "done", "stderr": ""})())
    R._edit("demo", "w01-s1", {"source": "x.tsx", "reel": "S", "story": "SS"}, "faster", client_dir / "posts" / "w01-s1")
    cmd, kw = calls[0]
    assert kw["cwd"] == R.REMOTION and cmd[cmd.index("--add-dir") + 1] == str(R.ROOT)


def test_empty_post_text_offers_generate_then_shows_writing(server, client_dir, monkeypatch):
    s = client_dir / "posts" / "w01-s1"
    (s / "caption.txt").write_text("")
    (s / "video.mp4").write_bytes(b"x")
    assert "value=gencaption>Generate</button>" in req(server, "GET", "/demo/v/w01-s1")[1]
    from spine import manual as M
    monkeypatch.setattr(M.subprocess, "Popen", lambda *a, **k: None)   # no real Claude run
    assert req(server, "POST", "/demo/v/w01-s1/decide", {"action": "gencaption"})[0] == 303
    body = req(server, "GET", "/demo/v/w01-s1")[1]
    assert "Writing the post text…" in body and "gencaption>Generate" not in body
