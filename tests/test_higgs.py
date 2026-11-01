"""higgs-hook: script checks, timeline, props, the audio mix, the AI label toggle."""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from spine import clients as C
from spine import higgs as H
from spine import tracks as T
from spine.db import DB

from .test_dashboard import client_dir, req, server  # noqa: F401  (fixtures)

ROOT = Path(__file__).resolve().parent.parent
EXAMPLE = ROOT / ".claude" / "skills" / "higgs-hook" / "example.script.json"


@pytest.fixture
def hh(tmp_path, monkeypatch):
    monkeypatch.setattr(C, "CLIENTS", tmp_path)
    d = tmp_path / "t" / "higgs-hook" / "b1" / "01"
    d.mkdir(parents=True)
    (tmp_path / "t" / "grants.yaml").write_text("display_name: T\n")
    shutil.copy(EXAMPLE, d / "script.json")
    return d


def edit(d: Path, **kw) -> None:
    s = json.loads((d / "script.json").read_text())
    s.update(kw)
    (d / "script.json").write_text(json.dumps(s))


def tone(path: Path, seconds: float, hz: int, video: bool = False) -> None:
    v = ["-f", "lavfi", "-i", f"color=c=black:size=320x240:rate=30:duration={seconds}"] if video else []
    out = ["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest"] if video else []
    subprocess.run(["ffmpeg", "-v", "error", "-y", *v, "-f", "lavfi", "-i", f"sine=frequency={hz}:duration={seconds}",
                    *out, str(path)], check=True)


def peak(path: Path, a: float, b: float) -> float:
    r = subprocess.run(["ffmpeg", "-v", "info", "-ss", str(a), "-t", str(b - a), "-i", str(path), "-af", "volumedetect",
                        "-f", "null", "-"], capture_output=True, text=True)
    line = next((l for l in r.stderr.splitlines() if "max_volume" in l), "max_volume: -inf dB")
    return float(line.split("max_volume:")[1].split("dB")[0])


def test_example_script_is_valid_except_clips(hh):
    issues = H.check("t", "b1", "01", "both")
    assert issues and all(i.startswith("missing clip") for i in issues)
    assert len(issues) == 4


def test_clips_needed_follow_the_format(hh):
    for n in ("s1-9x16.mp4", "s5-9x16.mp4"):
        (hh / n).write_bytes(b"x")
    assert H.check("t", "b1", "01", "vertical") == []
    assert H.check("t", "b1", "01", "horizontal") == ["missing clip s1-16x9.mp4", "missing clip s5-16x9.mp4"]
    assert H.check("t", "b1", "01", "square") == ["format must be one of ['both', 'horizontal', 'vertical']"]


def test_check_catches_bad_scripts(hh):
    edit(hh, joke="", end={"line": "Try Rosa for free", "button": "Comment WAVE"},
         screens={"steps": [{"scroll": 3}, {"fly": 1}]})
    issues = H.check("t", "b1", "01", "vertical")
    assert "script.json has no joke" in issues
    assert any("try ... free" in i for i in issues)
    assert any("'comment'" in i for i in issues)
    assert "screens.steps must start with a 'go'" in issues
    assert any(i.startswith("screens.steps[1]") for i in issues)
    assert H.check("t", "b1", "02") == [f"no script.json in {hh.parent / '02'}"]


def test_free_alone_is_fine(hh):
    edit(hh, end={"line": "Free forecast, every spot", "button": "Open the map"})
    assert not any("free" in i for i in H.check("t", "b1", "01", "vertical"))


def test_timeline_is_continuous_and_clamped():
    for screens_s, want in ((7.0, 7.0), (1.0, H.SCREENS_MIN), (40.0, H.SCREENS_MAX)):
        tl = H.timeline({}, screens_s)
        assert tl["s1"][1] == tl["hook"][0] and tl["hook"][1] == tl["screens"][0] and tl["screens"][1] == tl["s5"][0]
        assert tl["screens"][1] - tl["screens"][0] == want
        assert tl["seconds"] == tl["s5"][1]
        assert tl["s5"][0] < tl["end"][0] < tl["end"][1] <= tl["seconds"]
        assert tl["joke"][0] < tl["joke"][1] == tl["s1"][1]
    assert 15 <= H.timeline({}, 7.0)["seconds"] <= 20


def test_props_pick_the_clips_for_the_ratio(hh):
    s = H.load("t", "b1", "01")
    tl = H.timeline(s, 7)
    p = H.props(s, "b1-01", "16x9", "reel", tl)
    assert p["wide"] is True and p["s1"] == "higgs/b1-01/s1-16x9.mp4" and p["s5"] == "higgs/b1-01/s5-16x9.mp4"
    v = H.props(s, "b1-01", "9x16", "story", tl)
    assert v["wide"] is False and v["variant"] == "story" and v["s1"].endswith("s1-9x16.mp4")
    assert v["url"] == "rosa.surf" and v["handle"] == "@rosa_surf_forecast"
    assert v["endLine"] == s["end"]["line"] and v["button"] == s["end"]["button"]


def test_remotion_registers_every_composition_render_uses():
    root = (ROOT / "engines" / "remotion" / "src" / "Root.tsx").read_text()
    for comp in ("HiggsHook", "HiggsHook-story", "HiggsHook-16x9"):
        assert f'id="{comp}"' in root
    src = (ROOT / "spine" / "higgs.py").read_text()
    assert '("HiggsHook", "9x16"' in src and '("HiggsHook-story", "9x16"' in src and '("HiggsHook-16x9", "16x9"' in src


def test_mix_keeps_clip_sound_and_delays_music(tmp_path):
    video = tmp_path / "v.mp4"
    tone(video, 6, 300, video=True)
    music = tmp_path / "m.wav"
    tone(music, 10, 900)
    T._mux(video, {"file": "m.wav", "start": 0, "lufs": -14}, None, 0, tmp_path, film_audio=1.0, music_at=3.0)
    assert peak(video, 0.2, 2.5) > -30          # the clip's own sound is there before the music
    assert peak(video, 3.5, 4.5) > -30
    T._mux(video, {"file": "m.wav", "start": 0, "lufs": -14}, None, 0, tmp_path, film_audio=0.0, music_at=3.0)
    assert peak(video, 0.2, 2.5) < -50          # film audio dropped, music still waiting
    assert peak(video, 3.5, 4.5) > -30


def test_mix_with_voice_and_clip_sound_finishes(tmp_path):
    video = tmp_path / "v.mp4"
    tone(video, 8, 300, video=True)
    vo = tmp_path / "vo.wav"
    tone(vo, 2, 600)   # ends well before the video: once hung ffmpeg forever
    T._mux(video, None, vo, 3.0, tmp_path, film_audio=1.0)
    assert abs(T._duration(video) - 8) < 0.2
    assert peak(video, 6.0, 7.5) > -30          # clip sound runs to the end


def test_mix_default_is_unchanged(tmp_path):
    video = tmp_path / "v.mp4"
    tone(video, 4, 300, video=True)
    music = tmp_path / "m.wav"
    tone(music, 6, 900)
    T._mux(video, {"file": "m.wav", "start": 0, "lufs": -14}, None, 0, tmp_path)
    assert peak(video, 0.2, 1.0) > -30          # music from 0, as before


def test_ai_label_toggle(server, client_dir):  # noqa: F811
    _, body, _ = req(server, "GET", "/demo/v/w01-s1")
    assert "id=ailabel" in body and "aria-label='AI label'" in body
    status, _, _ = req(server, "POST", "/demo/v/w01-s1/ailabel", {"value": "1"})
    assert status == 303
    meta = json.loads((client_dir / "posts" / "w01-s1" / "meta.json").read_text())
    assert meta["is_ai_generated"] is True and meta["title"] == "Showreel"   # other keys kept
    req(server, "POST", "/demo/v/w01-s1/ailabel", {"value": "0"})
    assert json.loads((client_dir / "posts" / "w01-s1" / "meta.json").read_text())["is_ai_generated"] is False
    assert req(server, "POST", "/demo/v/nope/ailabel", {"value": "1"})[0] == 404


def test_ai_label_locked_once_out(server, client_dir):  # noqa: F811
    db = DB.for_client(client_dir)
    for st in ("APPROVED", "QUEUED", "PUBLISHING"):
        db.set_state("w01-s1", st)
    db.close()
    assert req(server, "POST", "/demo/v/w01-s1/ailabel", {"value": "1"})[0] == 409
    assert "is_ai_generated" not in json.loads((client_dir / "posts" / "w01-s1" / "meta.json").read_text())
    _, body, _ = req(server, "GET", "/demo/v/w01-s1")
    assert "Fixed: the post is out or going out" in body


class FakePage:
    """Records what drive() asks the browser to do."""
    def __init__(self):
        self.calls = []
        self.mouse = self
        self.keyboard = self

    def goto(self, url, **kw): self.calls.append(("goto", url))
    def evaluate(self, js, arg=None): self.calls.append(("nav", arg))
    def wait_for_timeout(self, ms): pass
    def wait_for_load_state(self, *a, **kw): self.calls.append(("idle",))
    def focus(self, sel): self.calls.append(("focus", sel))
    def press(self, key): self.calls.append(("key", key))
    def click(self, sel, **kw): self.calls.append(("tap", sel))
    def move(self, *a, **kw): pass
    def wheel(self, *a): self.calls.append(("wheel",))
    def down(self): pass
    def up(self): pass


def test_drive_loads_once_then_navigates_inside_the_app():
    pg = FakePage()
    H.drive(pg, [{"go": "/spot/a"}, {"tap": "button.accent-link"}, {"zoom": 2}, {"go": "/spot/b"}, {"zoom": -1}],
            "https://rosa.surf", "dark")
    assert [c for c in pg.calls if c[0] in ("goto", "nav")] == [("goto", "https://rosa.surf/spot/a?theme=dark"), ("nav", "/spot/b")]
    assert [c[1] for c in pg.calls if c[0] == "key"] == ["Minus", "Minus", "Equal"]   # out twice, in once
    assert ("idle",) not in pg.calls                                                    # recorded pass: fixed waits


def test_drive_warm_pass_waits_for_the_network():
    pg = FakePage()
    H.drive(pg, [{"go": "/spot/a"}, {"tap": "x"}], "https://rosa.surf", "dark", warm=True)
    assert pg.calls.count(("idle",)) == 2


def test_drive_refuses_unknown_steps():
    with pytest.raises(ValueError):
        H.drive(FakePage(), [{"go": "/spot/a"}, {"wheel": 900}], "https://rosa.surf", "dark")


def test_check_refuses_the_old_wheel_step(hh):
    edit(hh, screens={"steps": [{"go": "/spot/a"}, {"wheel": 900}]})
    assert any(i.startswith("screens.steps[1]") for i in H.check("t", "b1", "01", "vertical"))


def test_nudge_is_marked_seen_for_recordings():
    assert "rosa.nudge.report" in H.NUDGE and "shown:99" in H.NUDGE


def test_long_recordings_play_faster_not_cut():
    assert H.speedup(6) == 1.0
    assert H.speedup(12) == pytest.approx(1.2)
    assert H.speedup(30) == 1.5


def test_reset_between_passes_drops_app_settings():
    """Swim / ft set in the warm pass must not carry into the recording, or the switch never shows."""
    pw = pytest.importorskip("playwright.sync_api")
    with pw.sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_page()
        page.route("https://rosa.test/", lambda r: r.fulfill(body="<p>x</p>", content_type="text/html"))
        page.goto("https://rosa.test/")
        page.evaluate("localStorage.setItem('rosa.mode','swim')")
        page.evaluate("new Promise(r => { const q = indexedDB.open('settings'); q.onsuccess = () => { q.result.close(); r(); }; })")
        assert page.evaluate("indexedDB.databases().then(d => d.length)") == 1
        H.reset(page)
        assert page.evaluate("localStorage.length") == 0
        assert page.evaluate("indexedDB.databases().then(d => d.length)") == 0
        b.close()


def test_screens_at_sets_the_phone_location():
    assert H.geo({}) == {}
    assert H.geo({"at": [-7.7, -79.4]}) == {"geolocation": {"latitude": -7.7, "longitude": -79.4}, "permissions": ["geolocation"]}


def test_share_shows_the_spots_own_share_card():
    pw = pytest.importorskip("playwright.sync_api")
    with pw.sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_page()
        page.add_init_script(H.SHARE)
        page.route("https://rosa.test/**", lambda r: r.fulfill(body="<body></body>", content_type="text/html"))
        page.goto("https://rosa.test/")
        page.evaluate("navigator.share({title: 'Muizenberg', url: 'https://rosa.surf/spot/muizenberg'})")
        page.wait_for_timeout(300)
        assert page.evaluate("document.querySelector('img').getAttribute('src')") == "/og/spot/muizenberg.jpg"
        assert "rosa.surf/spot/muizenberg" in page.inner_text("body")
        b.close()


def test_check_refuses_a_bad_location(hh):
    edit(hh, screens={"steps": [{"go": "/charts"}], "at": [200, 0]})
    assert "screens.at must be [lat, lon]" in H.check("t", "b1", "01", "vertical")
    for bad in (["a", "b"], [True, False], [1]):
        edit(hh, screens={"steps": [{"go": "/charts"}], "at": bad})
        assert "screens.at must be [lat, lon]" in H.check("t", "b1", "01", "vertical")
    edit(hh, screens={"steps": [{"go": "/charts"}], "at": [-7.7, -79.4]})
    assert not any(i.startswith("screens.at") for i in H.check("t", "b1", "01", "vertical"))
