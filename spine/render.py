"""Engine A render: deterministic frame capture of an HTML film (PLAN.md §3 station 2).

    .venv/bin/python -m spine.render <film_dir> <out.mp4> [--variant reel|story] [--fps 60] [--preview]
    .venv/bin/python -m spine.render <film_dir> --still <t> <out.png> [--variant reel|story]
    ... [--page index-16x9.html --size 1920x1080]   # another format's page, at its own size

The film is `<film_dir>/index.html` plus `film.json`:
    {"duration": 15.0, "width": 1080, "height": 1920,
     "audio": "audio.wav"}                       # optional, mixed in by ffmpeg
The page must expose `window.__film.seek(t)` that puts every element where it is at time
`t` seconds (no real clocks, no rAF-driven state) and may return a promise (it resolves once
any <video> footage has seeked to its frame), and may read `?variant=` from the URL.
We open it at the film's size, call seek() per frame, screenshot, and pipe PNGs to ffmpeg,
which encodes straight into the spec_check profile (H.264 yuv420p, AAC 128k, faststart,
all metadata stripped). `--preview` renders every 4th frame at 15 fps for a quick look.

No LLM, no network: the page is loaded from file:// and is expected to be self-contained
(fonts and captures by relative path).
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright


def _size(spec: dict, size: str | None) -> tuple[int, int]:
    if size:
        w, h = size.lower().split("x")
        return int(w), int(h)
    return int(spec.get("width", 1080)), int(spec.get("height", 1920))


def render(film_dir: Path, out: Path, variant: str = "reel", fps: int = 60, preview: bool = False,
           page_name: str = "index.html", size: str | None = None) -> dict:
    spec = json.loads((film_dir / "film.json").read_text())
    (w, h), dur = _size(spec, size), float(spec["duration"])
    step = 4 if preview else 1
    out_fps = fps // step
    n = int(round(dur * fps))
    audio = film_dir / spec["audio"] if spec.get("audio") else None
    url = f"file://{(film_dir / page_name).resolve()}?variant={variant}&render=1"

    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "image2pipe", "-framerate", str(out_fps), "-i", "-"]
    if audio and audio.exists():
        cmd += ["-i", str(audio)]
    cmd += ["-map_metadata", "-1", "-map_chapters", "-1",
            "-fflags", "+bitexact", "-flags:v", "+bitexact", "-flags:a", "+bitexact",
            "-vf", "format=yuv420p", "-r", str(out_fps), "-g", str(out_fps * 2), "-keyint_min", str(out_fps * 2), "-sc_threshold", "0",
            "-c:v", "libx264", "-preset", "fast" if preview else "slow", "-crf", "23" if preview else "18", "-profile:v", "high",
            "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709"]
    if audio and audio.exists():
        cmd += ["-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2", "-shortest"]
    cmd += ["-movflags", "+faststart", str(out)]

    t0 = time.time()
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--disable-gpu-vsync", "--force-color-profile=srgb"])
        page = b.new_page(viewport={"width": w, "height": h}, device_scale_factor=1)
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(url, wait_until="load")
        page.wait_for_function("() => window.__film && typeof window.__film.seek === 'function'", timeout=30000)
        page.evaluate("document.fonts && document.fonts.ready")
        page.wait_for_timeout(300)
        ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        frames = 0
        for i in range(0, n, step):
            t = i / fps
            page.evaluate("async t => { await window.__film.seek(t); }", t)   # seek may return a promise (footage frames)
            ff.stdin.write(settled_shot(page))
            frames += 1
            if frames % (out_fps * 2) == 0:
                print(f"  {t:5.2f}s / {dur:.1f}s  {time.time() - t0:5.1f}s", flush=True)
        ff.stdin.close()
        rc = ff.wait()
        b.close()
    if rc != 0:
        raise SystemExit(f"ffmpeg exited {rc}")
    if errors:
        print("page errors:", *errors, sep="\n  ")
    secs = time.time() - t0
    print(f"rendered {frames} frames at {out_fps} fps → {out} in {secs:.0f}s")
    return {"frames": frames, "fps": out_fps, "seconds": round(secs, 1), "errors": errors, "variant": variant}


def settled_shot(page, tries: int = 3) -> bytes:
    """A PNG of the page once Chromium has finished drawing it.

    A screenshot can land while Chromium is still re-rastering a layer at a new zoom (a spot film's
    satellite map showed a square at the wrong scale for one frame). The PNG is kept only when a cheap
    JPEG probe taken just before it matches one taken just after it."""
    for _ in range(tries):
        before = page.screenshot(type="jpeg", quality=20, animations="disabled", caret="hide")
        png = page.screenshot(type="png", animations="disabled", caret="hide")
        if page.screenshot(type="jpeg", quality=20, animations="disabled", caret="hide") == before:
            return png
    return png   # shortcut: a page that never holds still keeps its last shot after `tries`, raise tries if a film still shows a frame mid-draw


def still(film_dir: Path, t: float, out: Path, variant: str = "reel", page_name: str = "index.html", size: str | None = None) -> list[str]:
    """One frame at t seconds as a PNG (to look at while building a film). Returns page errors."""
    w, h = _size(json.loads((film_dir / "film.json").read_text()), size)
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--force-color-profile=srgb"])
        page = b.new_page(viewport={"width": w, "height": h})
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"file://{(film_dir / page_name).resolve()}?variant={variant}&render=1", wait_until="load")
        page.wait_for_function("() => window.__film && typeof window.__film.seek === 'function'", timeout=30000)
        page.evaluate("document.fonts && document.fonts.ready")
        page.evaluate("async t => { await window.__film.seek(t); }", t)
        page.screenshot(path=str(out), type="png", animations="disabled", caret="hide")
        b.close()
    return errors


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__); return 2
    variant = argv[argv.index("--variant") + 1] if "--variant" in argv else "reel"
    page_name = argv[argv.index("--page") + 1] if "--page" in argv else "index.html"
    size = argv[argv.index("--size") + 1] if "--size" in argv else None
    if "--still" in argv:
        i = argv.index("--still")
        errors = still(Path(argv[0]), float(argv[i + 1]), Path(argv[i + 2]), variant, page_name, size)
        print("page errors:", *errors, sep="\n  ") if errors else print(f"wrote {argv[i + 2]}")
        return 1 if errors else 0
    fps = int(argv[argv.index("--fps") + 1]) if "--fps" in argv else 60
    render(Path(argv[0]), Path(argv[1]), variant, fps, "--preview" in argv, page_name, size)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
