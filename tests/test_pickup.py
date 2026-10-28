"""spine/pickup.py: reels posted straight to Instagram join the dashboard."""

import io
import json
import subprocess

import pytest
import yaml

from spine import clients as C
from spine import pickup as PK
from spine.db import DB


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(C, "CLIENTS", tmp_path)
    d = tmp_path / "t"
    (d / "posts").mkdir(parents=True)
    (d / "grants.yaml").write_text(yaml.safe_dump({**C.DEFAULT_GRANTS, "ig_user_id": "178", "token_env": "T_TOKEN"}))
    monkeypatch.setenv("T_TOKEN", "tok")
    clip = tmp_path / "clip.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:size=108x192:rate=30:duration=2",
                    "-c:v", "libx264", str(clip)], check=True)
    return "t", clip.read_bytes()


class Resp(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): return False


class FakeGraph:
    def __init__(self, rows):
        self.rows = rows

    def get(self, path, **p):
        return {"data": self.rows}

    def media(self, mid, fields=None):
        r = next(x for x in self.rows if x["id"] == mid)
        return {"id": mid, "permalink": r["permalink"], "timestamp": r["timestamp"]}


def reel(i, caption):
    return {"id": f"M{i}", "caption": caption, "timestamp": f"2099-01-0{i}T10:00:00+0000", "permalink": f"https://ig/r{i}",
            "media_product_type": "REELS", "media_url": "https://cdn/v.mp4", "thumbnail_url": "https://cdn/c.jpg"}


def test_unlinked_reel_becomes_a_live_slot_with_its_video_and_caption(client):
    name, video = client
    rows = [reel(2, "Fresh swell.\n.\n.\n.\n#a #b #c"), {**reel(1, "a photo"), "media_product_type": "FEED"}]
    opener = lambda url, timeout: Resp(video if url.endswith(".mp4") else b"jpg")  # noqa: E731
    out = PK.pickup(name, graph=FakeGraph(rows), opener=opener)
    assert len(out) == 1 and not out[0]["linked"]
    slot = out[0]["slot_id"]
    sd = C.client_dir(name) / "posts" / slot
    assert (sd / "video.mp4").read_bytes() == video and (sd / "cover.jpg").exists()
    assert (sd / "caption.txt").read_text().startswith("Fresh swell.")
    meta = json.loads((sd / "meta.json").read_text())
    assert meta["source"] == "instagram" and meta["duration_s"] > 1
    db = DB.for_client(C.client_dir(name))
    row = db.post(slot)
    db.close()
    assert row["state"] == "MEASURING" and row["ig_media_id"] == "M2" and row["permalink"] == "https://ig/r2"
    assert PK.pickup(name, graph=FakeGraph(rows), opener=opener) == []        # once only


def test_reel_matching_a_waiting_slot_links_it_instead(client, monkeypatch):
    name, video = client
    d = C.client_dir(name)
    db = DB.for_client(d)
    db.create_post("2099-w01-01", name, scheduled_at="2099-01-03T06:30:00+00:00")
    for s in ("BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL"):
        db.set_state("2099-w01-01", s)
    db.close()
    (d / "posts" / "2099-w01-01").mkdir()
    (d / "posts" / "2099-w01-01" / "caption.txt").write_text("Same  text here.\n#a #b #c\n")
    out = PK.pickup(name, graph=FakeGraph([reel(3, "Same text here.\n#a #b #c")]), link_runner=lambda *a, **k: None)
    assert out == [{"media": "M3", "slot_id": "2099-w01-01", "linked": True}]
    db = DB.for_client(d)
    assert db.post("2099-w01-01")["ig_media_id"] == "M3" and len(db.posts()) == 1
    db.close()


def test_failed_download_leaves_nothing_behind(client):
    name, _ = client

    def boom(url, timeout):
        raise OSError("expired")
    out = PK.pickup(name, graph=FakeGraph([reel(4, "x")]), opener=boom)
    assert "error" in out[0]
    db = DB.for_client(C.client_dir(name))
    assert db.posts() == []
    db.close()
    assert list((C.client_dir(name) / "posts").iterdir()) == []


def test_reels_older_than_the_oldest_linked_one_are_left_alone(client):
    name, video = client
    old = {**reel(1, "made before Tachyon"), "timestamp": "2020-01-01T10:00:00+0000"}
    assert PK.pickup(name, graph=FakeGraph([old]), opener=lambda u, timeout: Resp(video)) == []


def test_at_most_five_imports_per_run(client):
    name, video = client
    rows = [{**reel(1, f"r{i}"), "id": f"M{i}", "timestamp": f"2099-01-01T10:{i:02d}:00+0000"} for i in range(6, -1, -1)]   # newest first, as the API
    opener = lambda url, timeout: Resp(video)  # noqa: E731
    assert len(PK.pickup(name, graph=FakeGraph(rows), opener=opener)) == 5
    assert len(PK.pickup(name, graph=FakeGraph(rows), opener=opener)) == 2


def test_same_hook_different_caption_does_not_link(client):
    name, video = client
    d = C.client_dir(name)
    db = DB.for_client(d)
    db.create_post("2099-w01-01", name, scheduled_at="2099-01-03T06:30:00+00:00")
    db.close()
    (d / "posts" / "2099-w01-01").mkdir()
    (d / "posts" / "2099-w01-01" / "caption.txt").write_text("Same hook.\n\nPart one.\n")
    out = PK.pickup(name, graph=FakeGraph([reel(5, "Same hook.\n\nPart two.")]), opener=lambda u, timeout: Resp(video))
    assert out[0]["linked"] is False and out[0]["slot_id"] != "2099-w01-01"


def test_reel_without_a_file_is_still_picked_up(client):
    # Instagram leaves media_url out for a reel with a licensed song
    name, _ = client
    r = {k: v for k, v in reel(6, "With a song. rosa.surf").items() if k != "media_url"}
    out = PK.pickup(name, graph=FakeGraph([r]), opener=lambda u, timeout: Resp(b"jpg"))
    sd = C.client_dir(name) / "posts" / out[0]["slot_id"]
    assert not (sd / "video.mp4").exists() and (sd / "cover.jpg").exists()
    assert json.loads((sd / "meta.json").read_text())["duration_s"] is None
