"""Dashboard v3: posts per day (add/remove), calendar drag and drop (move, swap), reel/story
overlay, new brand assets."""

import json

from spine import clients as C
from spine import week as W
from spine.db import DB
from spine.review import app

from .test_dashboard import client_dir, req, server, slot_on  # noqa: F401  (fixtures)


def test_posts_per_day_add_and_remove(server, client_dir):  # noqa: F811
    def utc(*ts):   # shown local, stored UTC
        return sorted(app._shift(t, False) for t in ts)
    status, _, _ = req(server, "POST", "/demo/schedule", {"t": "06:30", "add": "1"})
    assert status == 303
    slots = C.load_grants("demo")["slots"]
    assert slots == utc("06:30", "18:30")    # longest gap → opposite side of the day
    req(server, "POST", "/demo/schedule", {"t1": "06:30", "t2": "12:00", "t3": "18:30"})
    assert C.load_grants("demo")["slots"] == utc("06:30", "12:00", "18:30")
    assert len(W.slot_times("demo", "2026-W45")) == 21                   # plans follow the schedule
    _, body, _ = req(server, "GET", "/demo/calendar?w=2026-W45")
    assert body.count("<div class=th>") == 3                              # calendar rows follow too
    _, body, _ = req(server, "GET", "/demo")
    assert "Three times a day" in body
    req(server, "POST", "/demo/schedule", {"t1": "06:30", "t2": "12:00", "t3": "18:30", "remove": "1"})
    assert C.load_grants("demo")["slots"] == utc("06:30", "18:30")
    status, _, _ = req(server, "POST", "/demo/schedule", {"t1": "06:30", "remove": "0"})
    assert C.load_grants("demo")["slots"] == utc("06:30")                    # never below one


def _second_post(d, at):
    s = d / "posts" / "w01-s2"
    s.mkdir(parents=True)
    (s / "meta.json").write_text(json.dumps({"title": "Favorites"}))
    db = DB.for_client(d)
    db.create_post("w01-s2", "demo", scheduled_at=at)
    for st in ["BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL"]:
        db.set_state("w01-s2", st)
    db.close()


def test_calendar_drag_swaps_and_moves(server, client_dir):  # noqa: F811
    a, b, free = slot_on("2099-01-05"), slot_on("2099-01-06", 1), slot_on("2099-01-07")
    db = DB.for_client(client_dir)
    db.conn.execute("UPDATE posts SET scheduled_at=? WHERE slot_id='w01-s1'", (a,))
    db.close()
    _second_post(client_dir, b)
    _, body, _ = req(server, "GET", "/demo/calendar?w=2099-W02")
    assert "draggable=true data-slot='w01-s1'" in body and f"data-at='{free}'" in body
    status, _, _ = req(server, "POST", "/demo/move", {"slot": "w01-s1", "swap": "w01-s2"})
    assert status == 200
    db = DB.for_client(client_dir)
    assert db.post("w01-s1")["scheduled_at"] == b and db.post("w01-s2")["scheduled_at"] == a
    db.close()
    status, _, _ = req(server, "POST", "/demo/move", {"slot": "w01-s1", "at": free})
    assert status == 200
    status, _, _ = req(server, "POST", "/demo/move", {"slot": "w01-s2", "at": free})
    assert status == 400                                                   # taken
    status, _, _ = req(server, "POST", "/demo/move", {"slot": "w01-s2", "at": "2001-01-01T06:30:00+00:00"})
    assert status == 400                                                   # past


def test_live_posts_do_not_move(server, client_dir):  # noqa: F811
    db = DB.for_client(client_dir)
    for st in ["APPROVED", "QUEUED", "PUBLISHING"]:
        db.set_state("w01-s1", st)
    db.set_state("w01-s1", "PUBLISHED", ig_media_id="m1", published_at="2099-01-05T06:30:00+00:00")
    db.close()
    status, _, _ = req(server, "POST", "/demo/move", {"slot": "w01-s1", "at": "2099-01-09T06:30:00+00:00"})
    assert status == 400


def test_video_page_overlay_and_brand(server, client_dir):  # noqa: F811
    (client_dir / "posts" / "w01-s1" / "video.mp4").write_bytes(b"x")
    _, body, _ = req(server, "GET", "/demo/v/w01-s1")
    assert "Show what Instagram covers" in body and "Feed 4:5 crop" in body
    _, body, _ = req(server, "GET", "/demo")
    assert "/static/logo.svg" in body
    status, _, _ = req(server, "GET", "/static/logo.svg")
    assert status == 200


def test_month_view_numbers_preview_and_day_drop(server, client_dir):  # noqa: F811
    s = client_dir / "posts" / "w01-s1"
    (s / "video.mp4").write_bytes(b"x")
    db = DB.for_client(client_dir)
    db.conn.execute("UPDATE posts SET scheduled_at=? WHERE slot_id='w01-s1'", (slot_on("2099-01-05"),))
    db.close()
    status, body, _ = req(server, "GET", "/demo/calendar?view=month&m=2099-01")
    assert status == 200 and "January 2099" in body and "cell mini" in body and "data-pv=" in body
    assert "data-day='2099-01-06'" in body
    status, _, _ = req(server, "POST", "/demo/move", {"slot": "w01-s1", "day": "2099-01-06"})
    assert status == 200
    db = DB.for_client(client_dir)
    assert db.post("w01-s1")["scheduled_at"] == slot_on("2099-01-06")   # first free slot that day
    db.close()
    _, body, _ = req(server, "GET", "/demo/calendar?w=2099-W02&hl=w01-s1")
    assert "class='cell hl'" in body and "class=grip" in body and "data-pv=" in body
    _, body, _ = req(server, "GET", "/demo")
    assert "class=no" in body and "id=pvm" in body


def test_video_page_when_card_links_to_calendar(server, client_dir):  # noqa: F811
    db = DB.for_client(client_dir)
    db.conn.execute("UPDATE posts SET scheduled_at=? WHERE slot_id='w01-s1'", (slot_on("2099-01-05"),))
    db.close()
    _, body, _ = req(server, "GET", "/demo/v/w01-s1")
    assert "Planned for" in body and "/demo/calendar?w=2099-W02&amp;hl=w01-s1" in body.replace("&hl", "&amp;hl")


def test_week_plan_skips_taken_slots(client_dir):  # noqa: F811
    db = DB.for_client(client_dir)
    db.conn.execute("UPDATE posts SET scheduled_at='2026-11-02T06:30:00+00:00' WHERE slot_id='w01-s1'")
    db.close()
    free = W.free_slot_times("demo", "2026-W45")
    assert len(free) == 13 and "2026-11-02T06:30:00+00:00" not in free


def test_download_button_and_attachment(server, client_dir):  # noqa: F811
    (client_dir / "posts" / "w01-s1" / "video.mp4").write_bytes(b"abc")
    _, body, _ = req(server, "GET", "/demo")
    assert "data-dl=" in body
    import http.client
    c = http.client.HTTPConnection("127.0.0.1", server)
    c.request("GET", "/demo/media/w01-s1/video.mp4?v=1&dl=1")
    r = c.getresponse()
    assert r.status == 200 and 'filename="demo-w01-s1.mp4"' in (r.getheader("Content-Disposition") or "")


def test_video_replies_override_settings(server, client_dir):  # noqa: F811
    assert C.reply_allowed("demo", "comments", "w01-s1") is False            # settings: off
    status, _, _ = req(server, "POST", "/demo/v/w01-s1/replies", {"comments": "1"})
    assert status == 400                                                       # custom must be on first
    req(server, "POST", "/demo/v/w01-s1/replies", {"custom": "1"})
    req(server, "POST", "/demo/v/w01-s1/replies", {"comments": "1"})
    assert C.reply_allowed("demo", "comments", "w01-s1") is True             # video wins
    assert C.reply_allowed("demo", "comments") is False                      # project unchanged
    req(server, "POST", "/demo/v/w01-s1/replies", {"custom": "0"})
    assert C.reply_allowed("demo", "comments", "w01-s1") is False            # back to settings
    C.set_flag("demo", "emergency_stop", True)
    req(server, "POST", "/demo/v/w01-s1/replies", {"custom": "1"})
    req(server, "POST", "/demo/v/w01-s1/replies", {"comments": "1"})
    assert C.reply_allowed("demo", "comments", "w01-s1") is False            # stop always wins


def test_views_series_and_chart(server, client_dir):  # noqa: F811
    from datetime import datetime, timedelta, timezone
    from spine.review import app as A
    now = datetime.now(timezone.utc).replace(minute=30, second=0, microsecond=0)
    db = DB.for_client(client_dir)
    for st in ["APPROVED", "QUEUED", "PUBLISHING"]:
        db.set_state("w01-s1", st)
    db.set_state("w01-s1", "PUBLISHED", ig_media_id="m1", published_at=(now - timedelta(hours=3)).isoformat())
    for h, v in ((2, 10), (1, 25)):            # two hourly snapshots, as insights.snapshot_hourly writes them
        db.add_snapshot("w01-s1", "ig_media", f"h{h}", {"views": v})
        db.conn.execute("UPDATE metric_snapshots SET collected_at=? WHERE window=?", ((now - timedelta(hours=h)).isoformat(), f"h{h}"))
    db.conn.commit()
    g, a, b = A.view_window("hour", None, None)
    s = A.views_series(db, "w01-s1", g, a, b)
    assert sum(v for _, v in s) == 25 and sorted(v for _, v in s if v) == [10, 15]
    g, a, b = A.view_window("custom", "2026-01-01", "2026-01-02")
    assert g == "hour"
    g, a, b = A.view_window("custom", "2026-01-01", "2026-03-01")
    assert g == "day"
    db.close()
    for path in ("/demo?g=hour", "/demo?g=month", "/demo?g=custom&from=2026-01-01&to=2026-12-31", "/demo/v/w01-s1?g=day"):
        status, body, _ = req(server, "GET", path)
        assert status == 200 and "id=views" in body


def test_hourly_snapshot_once_per_hour(client_dir, monkeypatch):  # noqa: F811
    from datetime import datetime, timezone
    from spine.measure import insights as I
    db = DB.for_client(client_dir)
    for st in ["APPROVED", "QUEUED", "PUBLISHING"]:
        db.set_state("w01-s1", st)
    db.set_state("w01-s1", "PUBLISHED", ig_media_id="m1", published_at=datetime.now(timezone.utc).isoformat())
    db.close()
    calls = []
    monkeypatch.setattr(I, "fetch_media", lambda g, mid: calls.append(mid) or {"views": 7})
    assert I.snapshot_hourly("demo", graph=object()) == ["w01-s1"]
    assert I.snapshot_hourly("demo", graph=object()) == []                  # same hour: no second pull
    assert calls == ["m1"]


def test_day_drop_uses_the_weeks_custom_times(server, client_dir):  # noqa: F811
    from datetime import date
    custom = app.utc_iso(date(2099, 1, 8), "12:59")   # a custom time elsewhere that week
    db = DB.for_client(client_dir)
    for sid, at in (("x1", slot_on("2099-01-06", 0)), ("x2", slot_on("2099-01-06", 1)), ("x3", custom)):
        db.create_post(sid, "demo", scheduled_at=at)   # both daily slots on 2099-01-06 are taken
        for st in ["BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL"]:
            db.set_state(sid, st)
    db.close()
    _, body, _ = req(server, "GET", "/demo/calendar?w=2099-W02")
    assert "class='dh' data-day='2099-01-06'" in body   # week view: a day header takes a drop
    status, _, _ = req(server, "POST", "/demo/move", {"slot": "w01-s1", "day": "2099-01-06"})
    assert status == 200
    db = DB.for_client(client_dir)
    assert db.post("w01-s1")["scheduled_at"] == app.utc_iso(date(2099, 1, 6), "12:59")
    db.close()


def test_a_rerun_reuses_the_plan_a_failed_run_left(client_dir, monkeypatch):  # noqa: F811
    times = W.free_slot_times("demo", "2026-W45")
    items = "".join(f"  - at: {t}\n    title: T{i}\n    brief: |\n      b: {i}\n    hook: H{i}\n    caption: |\n      c{i}\n"
                    for i, t in enumerate(times))   # an unquoted `at` parses as a datetime
    (W.plans_dir("demo") / "2026-W45.yaml").write_text(f"week: 2026-W45\nitems:\n{items}")
    monkeypatch.setattr(W, "_claude", lambda *a: (_ for _ in ()).throw(AssertionError("must not re-plan")))
    got = W.plan("demo", "2026-W45")
    assert [it["at"] for it in got] == times and all(isinstance(it["at"], str) for it in got)
    json.dumps(got)   # the failure was "Object of type datetime is not JSON serializable"
    assert W.plan("demo", "2026-W45") == got   # finished: reused as is


def test_week_card_shows_progress(server, client_dir):  # noqa: F811
    from datetime import datetime, timedelta, timezone
    t = lambda m: (datetime.now(timezone.utc) - timedelta(minutes=m)).isoformat(timespec="seconds")  # noqa: E731
    W._status("demo", W.next_week(), state="running", step="producing", total=14, done=2,
              failed=[{"slot": "x", "error": "e"}], started_at=t(40), producing_at=t(20))
    _, body, _ = req(server, "GET", "/demo")
    assert "1 of 14 videos made" in body and "12 to go · 1 failed" in body
    assert "About 2 h 00 min left, done around" in body and "running 40 min" in body
    assert "http-equiv=refresh" in body
