"""higgs-hook: reels built on two Higgsfield clips (docs/HIGGS-HOOK.md).

    .venv/bin/python -m spine.higgs check   <client> <batch> <nn>
    .venv/bin/python -m spine.higgs screens <client> <batch> <nn>       # record the app flow
    .venv/bin/python -m spine.higgs render  <client> <batch> <nn> vertical|horizontal|both

A script lives in clients/<c>/higgs-hook/<batch>/<nn>/: script.json (written by the higgs-hook
skill), the operator's clips s1-9x16.mp4, s1-16x9.mp4, s5-9x16.mp4, s5-16x9.mp4, and after a
render out/video.mp4 + out/video-story.mp4 (vertical) and/or out/video-16x9.mp4 (horizontal).
The operator uploads the result through the dashboard (Calendar → Add new).

Timeline: scene 1 clip (its own sound) with the joke on top, the hook card, the app screens
(a real recording of the live app, `screens`), scene 5 clip with the end card. Music and the
voice-over come in after scene 1; the clips keep their native audio.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

from . import clients as C

ROOT = Path(__file__).resolve().parent.parent
REMOTION = ROOT / "engines" / "remotion"
PUBLIC = REMOTION / "public" / "higgs"
RENDER_TIMEOUT_MS = 180_000

S1, HOOK, S5 = 5.0, 2.0, 5.0          # seconds
SCREENS_MIN, SCREENS_MAX = 4.0, 10.0
JOKE_AT = 2.0                         # the joke lands this far into scene 1
CLIP_GAIN = {"s1": 1.0, "s5": 0.35}   # scene 5's sound sits under the music and the voice
FORMATS = {"vertical": ("9x16",), "horizontal": ("16x9",), "both": ("9x16", "16x9")}
REQUIRED = ("title", "joke", "hook", "screens", "end", "vo")
STEP_KEYS = {"go", "wait", "scroll", "zoom", "swipe", "tap"}


def script_dir(client: str, batch: str, nn: str) -> Path:
    return C.client_dir(client) / "higgs-hook" / batch / nn


def load(client: str, batch: str, nn: str) -> dict:
    return json.loads((script_dir(client, batch, nn) / "script.json").read_text())


def check(client: str, batch: str, nn: str, fmt: str = "both") -> list[str]:
    """Everything that stops a render, as plain lines. Empty = ready."""
    d = script_dir(client, batch, nn)
    if not (d / "script.json").exists():
        return [f"no script.json in {d}"]
    s = load(client, batch, nn)
    issues = [f"script.json has no {k}" for k in REQUIRED if not s.get(k)]
    end = s.get("end") or {}
    issues += [f"end card has no {k}" for k in ("line", "button") if not end.get(k)]
    if re.search(r"\btry\b.*\bfree\b", f"{end.get('line', '')} {end.get('button', '')}", re.I):
        issues.append("end card says 'try ... free' (implies paying later)")
    if "comment" in f"{end.get('line', '')} {end.get('button', '')} {s.get('vo', '')}".lower():
        issues.append("'comment' in the call to action (decision 13)")
    steps = (s.get("screens") or {}).get("steps") or []
    if not steps or "go" not in steps[0]:
        issues.append("screens.steps must start with a 'go'")
    for i, st in enumerate(steps):
        if len(st) != 1 or next(iter(st)) not in STEP_KEYS:
            issues.append(f"screens.steps[{i}] must be one of {sorted(STEP_KEYS)}")
    if fmt not in FORMATS:
        issues.append(f"format must be one of {sorted(FORMATS)}")
    for ratio in FORMATS.get(fmt, ()):
        for sc in ("s1", "s5"):
            if not (d / f"{sc}-{ratio}.mp4").exists():
                issues.append(f"missing clip {sc}-{ratio}.mp4")
    return issues


def _duration(p: Path) -> float:
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                                capture_output=True, text=True, check=True).stdout.strip())


def _run(cmd: list[str], cwd: Path = ROOT) -> None:
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"{cmd[0]} failed: {(r.stderr or r.stdout).strip()[-500:]}")


# the "Spot look wrong?" nudge: marked as shown so it never covers the recording
NUDGE = "try{localStorage.setItem('rosa.nudge.report',JSON.stringify({started:Date.now(),shown:99,last:Date.now()}))}catch(e){}"
NAVIGATE = "p => { history.pushState(null, '', p); dispatchEvent(new Event('rosa:navigate')); }"   # the app's own router
W, H = 390, 844


def _settle(page, warm: bool, ms: int) -> None:
    """Warm pass: wait for the network (map tiles, forecasts) so the recorded pass has them cached."""
    if warm:
        try:
            page.wait_for_load_state("networkidle", timeout=8000)
        except Exception:  # noqa: BLE001 — spot pages hold a cam stream open; networkidle may never come
            pass
    page.wait_for_timeout(ms)


def drive(page, steps: list[dict], base: str, theme: str, warm: bool = False) -> float:
    """Play the steps on `page`. Only the first `go` loads a page; later ones navigate inside the
    app, so the splash screen never shows mid-film. Returns seconds from the call to the end of
    the first load (where the film starts)."""
    t_open, t0 = time.monotonic(), None
    for st in steps:
        (k, v), = st.items()
        if k == "go":
            if t0 is None:
                page.goto(f"{base}{v}{'&' if '?' in v else '?'}theme={theme}", wait_until="load", timeout=60000)
                _settle(page, warm, 2500)
                t0 = time.monotonic() - t_open
            else:
                page.evaluate(NAVIGATE, v)
                _settle(page, warm, 1200)
        elif k == "wait":
            page.wait_for_timeout(int(float(v) * 1000))
        elif k == "zoom":   # map zoom steps, positive = out (the wheel does nothing in phone mode; the keys do)
            page.focus(".maplibregl-canvas")
            for _ in range(abs(int(v))):
                page.keyboard.press("Minus" if int(v) > 0 else "Equal")
                page.wait_for_timeout(350)
            _settle(page, warm, 900)
        elif k == "scroll":   # page px
            page.mouse.move(W / 2, H / 2)
            n = 20
            for _ in range(n):
                page.mouse.wheel(0, float(v) / n)
                page.wait_for_timeout(30)
            _settle(page, warm, 600)
        elif k == "swipe":
            y = H * 0.45
            x0, x1 = (W * 0.85, W * 0.15) if v == "left" else (W * 0.15, W * 0.85)
            page.mouse.move(x0, y)
            page.mouse.down()
            page.mouse.move(x1, y, steps=15)
            page.mouse.up()
            page.wait_for_timeout(700)
        elif k == "tap":
            page.click(v, timeout=10000)
            _settle(page, warm, 1500)
        else:
            raise ValueError(f"unknown screens step {k!r}")
    return t0 or 0.0


def speedup(seconds: float) -> float:
    """A recording longer than the screens slot plays faster (up to 1.5x) instead of being cut."""
    return min(max(seconds / SCREENS_MAX, 1.0), 1.5)


def screens(client: str, batch: str, nn: str) -> Path:
    """Drive the live app through screens.steps at phone size and record it → screens.mp4.
    Two passes in one browser profile: the first warms the cache, the second is recorded."""
    import tempfile
    from playwright.sync_api import sync_playwright
    from . import capture as CAP
    d = script_dir(client, batch, nn)
    spec = load(client, batch, nn)["screens"]
    theme = spec.get("theme", "dark")
    tmp = d / ".rec"
    shutil.rmtree(tmp, ignore_errors=True)
    opts = dict(viewport={"width": W, "height": H}, device_scale_factor=3, is_mobile=True, has_touch=True,
                color_scheme="dark" if theme == "dark" else "light", locale="en-GB", timezone_id="UTC", user_agent=CAP.UA)
    init = CAP.INIT.replace("THEME", theme) + NUDGE
    with tempfile.TemporaryDirectory() as profile, sync_playwright() as p:
        for warm in (True, False):
            rec = {} if warm else {"record_video_dir": str(tmp), "record_video_size": {"width": W * 2, "height": H * 2}}
            ctx = p.chromium.launch_persistent_context(profile, **opts, **rec)
            ctx.add_init_script(init)
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            t0 = drive(page, spec["steps"], CAP.BASE[client], theme, warm)
            video = None if warm else page.video.path()
            ctx.close()
    out = d / "screens.mp4"
    speed = speedup(_duration(Path(video)) - t0)
    _run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t0:.2f}", "-i", str(video), "-an", "-vf", f"setpts=PTS/{speed:.3f}", "-r", "30",
          "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)])
    shutil.rmtree(tmp, ignore_errors=True)
    return out


def timeline(s: dict, screens_s: float) -> dict:
    """Seconds for every beat; the Remotion composition only places them."""
    sc = min(max(screens_s, SCREENS_MIN), SCREENS_MAX)
    a = S1 + HOOK
    return {"seconds": round(a + sc + S5, 2),
            "s1": [0.0, S1], "joke": [JOKE_AT, S1], "hook": [S1, a], "screens": [a, a + sc], "s5": [a + sc, a + sc + S5],
            "end": [a + sc + 1.2, a + sc + S5]}


def props(s: dict, key: str, ratio: str, variant: str, tl: dict) -> dict:
    return {"variant": variant, "wide": ratio == "16x9", "timeline": tl,
            "s1": f"higgs/{key}/s1-{ratio}.mp4", "s5": f"higgs/{key}/s5-{ratio}.mp4", "screens": f"higgs/{key}/screens.mp4",
            "s1Gain": CLIP_GAIN["s1"], "s5Gain": CLIP_GAIN["s5"],
            "joke": s["joke"], "hook": s["hook"], "endLine": s["end"]["line"], "button": s["end"]["button"],
            "url": "rosa.surf", "handle": "@rosa_surf_forecast"}


def _track(client: str, tid: str | None) -> dict | None:
    from . import tracks as T
    lib = [t for t in T._library(client) if t.get("source", "file") == "file"]
    return next((t for t in lib if t["id"] == tid), lib[0] if lib else None)


def render(client: str, batch: str, nn: str, fmt: str) -> list[Path]:
    from . import tracks as T
    from . import voice as V
    from .publisher import spec_check as SC
    issues = check(client, batch, nn, fmt)
    if issues:
        raise ValueError("; ".join(issues))
    d = script_dir(client, batch, nn)
    s = load(client, batch, nn)
    if not (d / "screens.mp4").exists():
        screens(client, batch, nn)
    key = f"{batch}-{nn}"
    pub = PUBLIC / key
    pub.mkdir(parents=True, exist_ok=True)
    for ratio in FORMATS[fmt]:
        for sc in ("s1", "s5"):
            shutil.copy2(d / f"{sc}-{ratio}.mp4", pub / f"{sc}-{ratio}.mp4")
    shutil.copy2(d / "screens.mp4", pub / "screens.mp4")
    tl = timeline(s, _duration(d / "screens.mp4"))
    vo = d / "vo.wav"
    if not vo.exists():   # one take for the whole VO (memory: never splice takes)
        V.vo_file(client, V.clean(s["vo"]), s.get("voice") or V.DEFAULT_VOICE, vo)
    track = _track(client, s.get("track"))
    music_dir = C.client_dir(client) / "assets" / "music"
    out = d / "out"
    out.mkdir(exist_ok=True)
    jobs = []
    if "9x16" in FORMATS[fmt]:
        jobs += [("HiggsHook", "9x16", "reel", out / "video.mp4"), ("HiggsHook-story", "9x16", "story", out / "video-story.mp4")]
    if "16x9" in FORMATS[fmt]:
        jobs += [("HiggsHook-16x9", "16x9", "reel", out / "video-16x9.mp4")]
    made = []
    for comp, ratio, variant, dst in jobs:
        pf = d / f".props-{comp}.json"
        pf.write_text(json.dumps(props(s, key, ratio, variant, tl)))
        raw = d / f".raw-{comp}.mp4"
        _run(["npx", "remotion", "render", "src/index.ts", comp, str(raw), f"--props={pf}", "--log=error",
              f"--timeout={RENDER_TIMEOUT_MS}"], cwd=REMOTION)
        _run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-c", "copy", "-map_metadata", "-1", "-movflags", "+faststart", str(dst)])
        T._mux(dst, track, vo, tl["hook"][0], music_dir, film_audio=1.0, music_at=tl["hook"][0])
        raw.unlink(missing_ok=True)
        pf.unlink(missing_ok=True)
        made.append(dst)
    report = []
    for f in made:
        if f.name != "video-16x9.mp4":
            report += [f"{f.name}: {i}" for i in SC.check_file(f)]
    (out / "check.txt").write_text("\n".join(report or ["spec_check: PASS"]) + "\n")
    return made


def main(argv: list[str]) -> int:
    if len(argv) >= 4 and argv[0] == "check":
        issues = check(*argv[1:4], argv[4] if len(argv) > 4 else "both")
        print("\n".join(issues) or "ready")
        return 1 if issues else 0
    if len(argv) == 4 and argv[0] == "screens":
        print(screens(*argv[1:4]))
        return 0
    if len(argv) == 5 and argv[0] == "render":
        for f in render(*argv[1:5]):
            print(f)
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
