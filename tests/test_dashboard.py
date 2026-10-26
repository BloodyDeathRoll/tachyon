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


@needs_ffmpeg
def test_formats_crop_to_the_right_sizes(client_dir):
    import subprocess
    from spine import formats as F
    _real_reel(client_dir)
    assert F.make("demo", "w01-s1", list(F.RATIOS)) == 0
    for r, (w, h) in F.RATIOS.items():
        got = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v", "-show_entries", "stream=width,height",
                              "-of", "csv=p=0", str(F.path("demo", "w01-s1", r))], capture_output=True, text=True).stdout.strip()
        assert got == f"{w},{h}", r
    assert sorted(F.ready("demo", "w01-s1")) == sorted(F.RATIOS)


@needs_ffmpeg
def test_formats_go_stale_after_a_rerender(client_dir):
    import os
    from spine import formats as F
    reel = _real_reel(client_dir)
    F.make("demo", "w01-s1", ["1x1"])
    later = F.path("demo", "w01-s1", "1x1").stat().st_mtime + 10
    os.utime(reel, (later, later))
    assert F.ready("demo", "w01-s1") == []


@needs_ffmpeg
def test_video_page_switches_formats_and_downloads(server, client_dir):
    from spine import formats as F
    _real_reel(client_dir)
    F.make("demo", "w01-s1", ["4x5"])
    _, body, _ = req(server, "GET", "/demo/v/w01-s1")
    assert "Generate new version" in body and "?as=4x5'" in body
    _, body, _ = req(server, "GET", "/demo/v/w01-s1?as=4x5")
    assert "video-4x5.mp4" in body and "aspect-ratio:4/5" in body and "Download 4:5" in body
    c = http.client.HTTPConnection("127.0.0.1", server)
    c.request("GET", "/demo/media/w01-s1/video-4x5.mp4?dl=1")
    r = c.getresponse()
    assert r.status == 200 and "demo-w01-s1-4x5.mp4" in (r.getheader("Content-Disposition") or "")


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


def test_formats_stale_lock_is_taken_over(client_dir, monkeypatch):
    import os
    from spine import formats as F
    calls = []
    monkeypatch.setattr(F.subprocess, "Popen", lambda *a, **k: calls.append(a))
    lock = client_dir / "posts" / "w01-s1" / "formats.lock"
    lock.write_text("")
    os.utime(lock, (1, 1))
    F.start("demo", "w01-s1", ["1x1"])
    assert len(calls) == 1 and not lock.exists()
