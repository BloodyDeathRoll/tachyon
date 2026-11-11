"""higgs-hook: reels built on two Higgsfield clips (docs/HIGGS-HOOK.md).

    .venv/bin/python -m spine.higgs check   <client> <batch> <nn>
    .venv/bin/python -m spine.higgs screens <client> <batch> <nn>       # record the app flow
    .venv/bin/python -m spine.higgs render  <client> <batch> <nn> vertical|horizontal|both

A script lives in clients/<c>/higgs-hook/<batch>/<nn>/: script.json (written by the higgs-hook
skill), the operator's clips s1-9x16.mp4, s1-16x9.mp4, s5-9x16.mp4, s5-16x9.mp4, and after a
render out/video.mp4 + out/video-story.mp4 (vertical) and/or out/video-16x9.mp4 (horizontal).
The operator uploads the result through the dashboard (Calendar → Add new).

Film (Remotion `HiggsFilm`, one template for every script): scene 1 clip with the joke on top
(two lines, from 2 s), the app section (the same in every film), scene 5 clip with the lockup
rising at the clip's key moment. Sound: the clips' own, no music, no voice-over.
script.json: title, joke_lines [line 1, line 2 (the punch)], lock {"9x16": s, "16x9": s} (seconds
into scene 5), optional app_line (replaces "Location is everything."). The script itself (prompts, caption) lives in Notion. `screens` re-records the app (the shared frames in public/higgs/app).
"""

from __future__ import annotations

import json
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

SCREENS_MAX = 10.0
JOKE_MAX = 16                         # characters per joke line; longer ones shrink the type too far
FORMATS = {"vertical": ("9x16",), "horizontal": ("16x9",), "both": ("9x16", "16x9")}
REQUIRED = ("title", "joke_lines", "lock")


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
    lines = s.get("joke_lines")
    if lines and not (isinstance(lines, list) and len(lines) == 2 and all(isinstance(l, str) and l.strip() for l in lines)):
        issues.append("joke_lines must be two lines")
    elif lines:
        issues += [f"joke line '{l}' is over {JOKE_MAX} characters" for l in lines if len(l) > JOKE_MAX]
    if fmt not in FORMATS:
        issues.append(f"format must be one of {sorted(FORMATS)}")
    for ratio in FORMATS.get(fmt, ()):
        lk = (s.get("lock") or {}).get(ratio) if isinstance(s.get("lock"), dict) else None
        if s.get("lock") and not (isinstance(lk, (int, float)) and not isinstance(lk, bool) and 0 < lk < 5):
            issues.append(f"lock.{ratio} must be seconds into scene 5 (0-5)")
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
# a headless browser has no system share sheet: Share slides up Rosa's own share card for the link instead
SHARE = """navigator.share=async d=>{const u=new URL(d.url,location.href),m=u.pathname.match(/^\\/spot\\/([^/]+)/);
const w=document.createElement('div'),img=document.createElement('img'),t=document.createElement('b'),l=document.createElement('div');
w.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:2147483647;padding:16px 16px 34px;background:#1c1c1e;color:#fff;'+
'border-radius:18px 18px 0 0;font:600 16px Inter,system-ui,sans-serif;transform:translateY(100%);transition:transform .35s ease';
img.src=m?'/og/spot/'+m[1]+'.jpg':'/og.jpg';img.style.cssText='display:block;width:100%;border-radius:10px;margin-bottom:12px';
t.textContent=d.title||'';l.textContent=u.host+u.pathname;l.style.cssText='opacity:.6;font-weight:400;font-size:14px;margin-top:4px';
w.append(img,t,l);document.body.append(w);requestAnimationFrame(()=>requestAnimationFrame(()=>w.style.transform='none'));
await new Promise(r=>setTimeout(r,2200));w.style.transform='translateY(100%)';setTimeout(()=>w.remove(),400);};"""
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


def geo(spec: dict) -> dict:
    """screens.at = [lat, lon]: the phone is there, so the swell map (/charts) opens over that ocean."""
    at = spec.get("at")
    return {"geolocation": {"latitude": at[0], "longitude": at[1]}, "permissions": ["geolocation"]} if at else {}


def reset(page) -> None:
    """The app keeps its settings in the browser's storage; clear it between the two passes."""
    page.evaluate("""async () => {
        localStorage.clear(); sessionStorage.clear();
        for (const d of (await indexedDB.databases?.()) ?? [])
            await new Promise(r => { const q = indexedDB.deleteDatabase(d.name); q.onsuccess = q.onerror = q.onblocked = r; });
        for (const r of (await navigator.serviceWorker?.getRegistrations?.()) ?? []) await r.unregister();
    }""")
    page.context.clear_cookies()


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
                color_scheme="dark" if theme == "dark" else "light", locale="en-GB", timezone_id="UTC", user_agent=CAP.UA,
                **geo(spec))
    init = CAP.INIT.replace("THEME", theme) + NUDGE + SHARE
    with tempfile.TemporaryDirectory() as profile, sync_playwright() as p:
        for warm in (True, False):
            # Playwright only scales the page down to record_video_size, never up: a bigger size left the
            # page in the top-left quarter of a grey frame. Record at viewport size.
            rec = {} if warm else {"record_video_dir": str(tmp), "record_video_size": {"width": W, "height": H}}
            ctx = p.chromium.launch_persistent_context(profile, **opts, **rec)
            ctx.add_init_script(init)
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            t0 = drive(page, spec["steps"], CAP.BASE[client], theme, warm)
            if warm:   # keep the HTTP cache, drop what the steps changed (Swim, ft…), so the recording shows the switch
                reset(page)
            video = None if warm else page.video.path()
            ctx.close()
    out = d / "screens.mp4"
    speed = speedup(_duration(Path(video)) - t0)
    _run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t0:.2f}", "-i", str(video), "-an", "-vf", f"setpts=PTS/{speed:.3f}", "-r", "30",
          "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)])
    shutil.rmtree(tmp, ignore_errors=True)
    return out


COMPS = {"9x16": [("HiggsFilm", "reel", "video.mp4"), ("HiggsFilm-story", "story", "video-story.mp4")],
         "16x9": [("HiggsFilm-16x9", "reel", "video-16x9.mp4")]}


def props(s: dict, key: str, ratio: str, variant: str, s1: float, s5: float) -> dict:
    return {"variant": variant, "clips": f"higgs/{key}", "s1": round(s1, 3), "s5": round(s5, 3),
            "joke": [l.split() for l in s["joke_lines"]], "lock": s["lock"][ratio],
            **({"app": s["app_line"]} if s.get("app_line") else {})}


def render(client: str, batch: str, nn: str, fmt: str) -> list[Path]:
    from .publisher import spec_check as SC
    issues = check(client, batch, nn, fmt)
    if issues:
        raise ValueError("; ".join(issues))
    d = script_dir(client, batch, nn)
    s = load(client, batch, nn)
    key = f"{batch}-{nn}"
    pub = PUBLIC / key
    pub.mkdir(parents=True, exist_ok=True)
    out = d / "out"
    out.mkdir(exist_ok=True)
    made = []
    for ratio in FORMATS[fmt]:
        for sc in ("s1", "s5"):
            shutil.copy2(d / f"{sc}-{ratio}.mp4", pub / f"{sc}-{ratio}.mp4")
        s1, s5 = _duration(d / f"s1-{ratio}.mp4"), _duration(d / f"s5-{ratio}.mp4")
        for comp, variant, name in COMPS[ratio]:
            pf, raw, dst = d / f".props-{comp}.json", d / f".raw-{comp}.mp4", out / name
            pf.write_text(json.dumps(props(s, key, ratio, variant, s1, s5)))
            _run(["npx", "remotion", "render", "src/index.ts", comp, str(raw), f"--props={pf}", "--log=error",
                  f"--timeout={RENDER_TIMEOUT_MS}"], cwd=REMOTION)
            # the clips' own sound only (no music, no voice-over)
            _run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
                  "-map_metadata", "-1", "-movflags", "+faststart", str(dst)])
            raw.unlink(missing_ok=True)
            pf.unlink(missing_ok=True)
            made.append(dst)
    report = [f"{f.name}: {i}" for f in made if f.name != "video-16x9.mp4" for i in SC.check_file(f)]
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
