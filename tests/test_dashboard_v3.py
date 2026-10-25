"""Dashboard v3: posts per day (add/remove), calendar drag and drop (move, swap), reel/story
overlay, new brand assets."""

import json

from spine import clients as C
from spine import week as W
from spine.db import DB

from .test_dashboard import client_dir, req, server  # noqa: F401  (fixtures)


def test_posts_per_day_add_and_remove(server, client_dir):  # noqa: F811
    status, _, _ = req(server, "POST", "/demo/schedule", {"t": "06:30", "add": "1"})
    assert status == 303
    slots = C.load_grants("demo")["slots"]
    assert len(slots) == 2 and "06:30" in slots and "18:30" in slots     # longest gap → opposite side of the day
    req(server, "POST", "/demo/schedule", {"t1": "06:30", "t2": "12:00", "t3": "18:30"})
    assert C.load_grants("demo")["slots"] == ["06:30", "12:00", "18:30"]
    assert len(W.slot_times("demo", "2026-W45")) == 21                   # plans follow the schedule
    _, body, _ = req(server, "GET", "/demo/calendar?w=2026-W45")
    assert body.count("<div class=th>") == 3                              # calendar rows follow too
    _, body, _ = req(server, "GET", "/demo")
    assert "Three times a day" in body
    req(server, "POST", "/demo/schedule", {"t1": "06:30", "t2": "12:00", "t3": "18:30", "remove": "1"})
    assert C.load_grants("demo")["slots"] == ["06:30", "18:30"]
    status, _, _ = req(server, "POST", "/demo/schedule", {"t1": "06:30", "remove": "0"})
    assert C.load_grants("demo")["slots"] == ["06:30"]                    # never below one


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
    a, b, free = "2099-01-05T06:30:00+00:00", "2099-01-06T18:30:00+00:00", "2099-01-07T06:30:00+00:00"
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
    db.conn.execute("UPDATE posts SET scheduled_at='2099-01-05T06:30:00+00:00' WHERE slot_id='w01-s1'")
    db.close()
    status, body, _ = req(server, "GET", "/demo/calendar?view=month&m=2099-01")
    assert status == 200 and "January 2099" in body and "cell mini" in body and "data-pv=" in body
    assert "data-day='2099-01-06'" in body
    status, _, _ = req(server, "POST", "/demo/move", {"slot": "w01-s1", "day": "2099-01-06"})
    assert status == 200
    db = DB.for_client(client_dir)
    assert db.post("w01-s1")["scheduled_at"] == "2099-01-06T06:30:00+00:00"   # first free slot that day
    db.close()
    _, body, _ = req(server, "GET", "/demo/calendar?w=2099-W02&hl=w01-s1")
    assert "class='cell hl'" in body and "class=grip" in body and "data-pv=" in body
    _, body, _ = req(server, "GET", "/demo")
    assert "class=no" in body and "id=pvm" in body


def test_video_page_when_card_links_to_calendar(server, client_dir):  # noqa: F811
    db = DB.for_client(client_dir)
    db.conn.execute("UPDATE posts SET scheduled_at='2099-01-05T06:30:00+00:00' WHERE slot_id='w01-s1'")
    db.close()
    _, body, _ = req(server, "GET", "/demo/v/w01-s1")
    assert "Planned for" in body and "/demo/calendar?w=2099-W02&amp;hl=w01-s1" in body.replace("&hl", "&amp;hl")


def test_week_plan_skips_taken_slots(client_dir):  # noqa: F811
    db = DB.for_client(client_dir)
    db.conn.execute("UPDATE posts SET scheduled_at='2026-11-02T06:30:00+00:00' WHERE slot_id='w01-s1'")
    db.close()
    free = W.free_slot_times("demo", "2026-W45")
    assert len(free) == 13 and "2026-11-02T06:30:00+00:00" not in free
