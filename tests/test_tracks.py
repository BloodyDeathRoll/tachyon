"""spine/tracks.py: Instagram Audio API parsing, 6 h cache, fail-soft, audio_configuration."""

import json

import pytest
import yaml

from spine import clients as C
from spine import tracks as T

ROW = {"audio_id": "987", "title": "Sunny Days", "display_artist": "Sound Collection", "duration_in_ms": 61500,
       "cover_artwork_thumbnail_uri": "https://cdn/x.jpg", "download_url": "https://cdn/x.mp3",
       "on_platform_audio_preview_link": "https://instagram.com/reels/audio/987"}


class FakeGraph:
    def __init__(self, rows=None, fail=None):
        self.rows, self.fail, self.calls = rows or [], fail, []

    def get(self, path, **params):
        self.calls.append((path, params))
        if self.fail:
            raise RuntimeError(self.fail)
        return {"data": self.rows, "paging": {}}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(C, "CLIENTS", tmp_path)
    d = tmp_path / "demo"
    (d / "assets" / "music").mkdir(parents=True)
    (d / "posts" / "s1").mkdir(parents=True)
    (d / "grants.yaml").write_text(yaml.safe_dump({"ig_user_id": "1784"}))
    (d / "posts" / "s1" / "meta.json").write_text(json.dumps({"title": "x"}))
    return d


def test_parses_trending_and_search(client):
    g = FakeGraph([ROW])
    t = T.list_tracks("demo", source="instagram", graph=g)
    assert t == [{"id": "ig:987", "audio_id": "987", "title": "Sunny Days", "artist": "Sound Collection", "mood": None,
                  "source": "instagram", "path": None, "cover": "https://cdn/x.jpg", "duration": 61.5,
                  "preview": "https://cdn/x.mp3", "link": "https://instagram.com/reels/audio/987"}]
    assert g.calls == [("ig_audio", {"audio_type": "music", "user_id": "1784"})]          # trending: no query
    T.list_tracks("demo", source="instagram", query="surf rock", graph=g)
    assert g.calls[-1][1]["search_query"] == "surf rock"


def test_cache_six_hours(client):
    g = FakeGraph([ROW])
    T.ig_tracks("demo", graph=g, now=1000)
    T.ig_tracks("demo", graph=g, now=1000 + 3600)
    assert len(g.calls) == 1
    T.ig_tracks("demo", graph=g, now=1000 + T.IG_TTL + 1)
    assert len(g.calls) == 2


def test_fails_soft_with_reason(client):
    g = FakeGraph(fail="Cannot call API for app")
    assert T.list_tracks("demo", source="instagram", graph=g) == []
    assert "Cannot call API" in T.last_error("demo")
    T.ig_tracks("demo", graph=FakeGraph([ROW]), now=10 ** 10)
    assert T.last_error("demo") is None


def test_set_instagram_track_stores_audio_configuration(client, monkeypatch):
    T.ig_tracks("demo", graph=FakeGraph([ROW]))
    monkeypatch.setattr(T, "apply", lambda c, s: None)
    T.set_track("demo", "s1", "ig:987")
    m = json.loads((client / "posts" / "s1" / "meta.json").read_text())
    assert m["track"] == "ig:987"
    assert m["audio_configuration"] == {"audio_id": "987", "audio_volume": 100, "video_volume": 1}
    assert T.current_track("demo", "s1") == "ig:987"
    assert any(t["id"] == "ig:987" for t in T.list_tracks("demo"))                       # both sources, cache only
