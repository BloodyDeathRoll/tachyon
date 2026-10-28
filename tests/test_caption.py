"""spine/caption.py: one structure for every post text, credits never in it."""

import json
import subprocess

import pytest
import yaml

from spine import caption as K
from spine import clients as C

GOOD = """Why Good and not Epic? Open the spot and the bars tell you. rosa.surf, link in bio.

Every rating comes with its reasons: size, period and wind.

3,056 spots worldwide, 16 days out. Free.
.
.
.
#surfforecast #pipeline #northshore
"""
CREDITS = "Waves: NOAA GFS-Wave + ECMWF open data (CC-BY 4.0) · Weather by Open-Meteo.com (CC-BY 4.0)"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(C, "CLIENTS", tmp_path)
    d = tmp_path / "demo"
    for i, tags in enumerate(["#a #b #c", "#a #b #d", "#a #c #e"]):
        (d / "posts" / f"s{i}").mkdir(parents=True)
        (d / "posts" / f"s{i}" / "caption.txt").write_text(f"x rosa.surf\n.\n.\n.\n{tags}\n")
    (d / "grants.yaml").write_text(yaml.safe_dump({"ig_user_id": "1"}))
    return "demo"


def test_live_structure_passes():
    assert K.lint(GOOD) == []


def test_credits_are_flagged_and_stripped():
    bad = GOOD.replace("3,056 spots", CREDITS + "\n\n3,056 spots")
    assert any("credits" in i for i in K.lint(bad))
    fixed = K.normalize(bad)
    assert "NOAA" not in fixed and K.lint(fixed) == []


def test_missing_spacer_and_tags_are_filled_from_the_clients_usual(client):
    t = K.ensure(client, "Free forecast. rosa.surf, link in bio.\n\n#x #y #z")
    assert t.endswith(".\n.\n.\n#x #y #z\n") and K.lint(t) == []
    t = K.ensure(client, "Free forecast. rosa.surf, link in bio.")
    assert t.split("\n")[-2].split()[0] == "#a" and set(t.split("\n")[-2].split()) == {"#a", "#b", "#c"}
    assert K.lint(t) == []


def test_ensure_asks_claude_only_when_it_cannot_repair(client):
    asked = []

    def ask(p):
        asked.append(p)
        return f"<caption>{GOOD}</caption>"
    assert K.ensure(client, GOOD, ask=ask) == GOOD and asked == []
    assert K.ensure(client, "No call to action here.", ask=ask) == GOOD and "no CTA" in asked[0]


def test_comment_for_link_and_em_dash_are_flagged():
    assert any("comment" in i for i in K.lint(GOOD.replace("Free.", "Comment SURF for the link.")))
    assert any("em dash" in i for i in K.lint(GOOD.replace("Free.", "Free — always.")))


def test_upload_caption_written_from_the_video(client, tmp_path, monkeypatch):
    sd = C.client_dir(client) / "posts" / "up"
    sd.mkdir()
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:size=108x192:rate=30:duration=3",
                    "-c:v", "libx264", str(sd / "video.mp4")], check=True)
    monkeypatch.setattr(K, "transcript", lambda v: "okay so the swell is pumping")
    seen = []

    def ask(p):
        seen.append(p)
        return "<caption>Swell's pumping. rosa.surf, link in bio.\n\n" + CREDITS + "\n\nFree.</caption>"
    text = K.write_for_upload(client, "up", ask=ask)
    assert "frame-1.jpg" in seen[0] and "swell is pumping" in seen[0]
    assert "NOAA" not in text and K.lint(text) == [] and (sd / "caption.txt").read_text() == text


def test_upload_caption_never_overwrites_the_operators(client, monkeypatch):
    sd = C.client_dir(client) / "posts" / "up"
    sd.mkdir()
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:size=108x192:rate=30:duration=3",
                    "-c:v", "libx264", str(sd / "video.mp4")], check=True)
    (sd / "caption.txt").write_text("mine\n")
    monkeypatch.setattr(K, "transcript", lambda v: "")
    assert K.write_for_upload(client, "up", ask=lambda p: f"<caption>{GOOD}</caption>") == "mine\n"
