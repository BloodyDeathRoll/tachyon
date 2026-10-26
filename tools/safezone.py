#!/usr/bin/env python3
"""Instagram safe zones for a 1080x1920 reel or story (PLAN.md decision 14).

Meta's design spec for Reels and Stories (ads guide, verified 2026-10-25): keep the top
14 %, the bottom 35 % and 6 % of each side free of text, logos and anything that matters.
On top of that, a reel shown in the feed is cropped to 4:5 (centre 1080x1350), which cuts
285 px top and bottom. The reel-safe box is the intersection; the story-safe box has no feed
crop.

    python3 tools/safezone.py overlay <video.mp4> <out.jpg> [--variant reel|story] [--every 3]
        contact sheet, one frame every N seconds, unsafe bands tinted: red = feed crop
        (reel only), orange = Meta's 14/35/6 bands. The QA vision pass reads this sheet.

    python3 tools/safezone.py check <video.mp4> [--variant reel|story] [--every 1]
        numeric guard: for each sampled frame, the share of high-contrast pixels (edges) in
        the unsafe bands relative to the safe box. Prints a line per band and a verdict:
        PASS (< 0.25), WARN (0.25-0.6), FAIL (> 0.6). Text and UI are edge-dense; gradients,
        water and dark grounds are not, so this flags cards and captions in the bands and
        ignores atmosphere. The vision pass has the final word.

    python3 tools/safezone.py box [--variant reel|story]
        prints the safe box in pixels and as CSS custom properties for the film templates.

Needs ffmpeg and ffprobe only.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

W, H = 1080, 1920
TOP = round(H * 0.14)        # 269
BOTTOM = round(H * 0.35)     # 672  -> content must end above y = 1248
SIDE = round(W * 0.06)       # 65
FEED_CUT = (H - 1350) // 2   # 285: the 4:5 feed preview removes this top and bottom


def box(variant: str) -> dict:
    top = max(TOP, FEED_CUT) if variant == "reel" else TOP
    bottom = H - BOTTOM
    return {"x0": SIDE, "x1": W - SIDE, "y0": top, "y1": bottom,
            "w": W - 2 * SIDE, "h": bottom - top, "variant": variant}


def bands(variant: str) -> list[tuple[str, int, int, int, int]]:
    b = box(variant)
    out = [("top", 0, 0, W, b["y0"]), ("bottom", 0, b["y1"], W, H - b["y1"]),
           ("left", 0, b["y0"], SIDE, b["h"]), ("right", W - SIDE, b["y0"], SIDE, b["h"])]
    return out


def overlay(video: Path, out: Path, variant: str, every: float) -> None:
    b = box(variant)
    boxes = []
    if variant == "reel":
        boxes += [f"drawbox=0:0:{W}:{FEED_CUT}:red@0.35:fill", f"drawbox=0:{H-FEED_CUT}:{W}:{FEED_CUT}:red@0.35:fill"]
    boxes += [f"drawbox=0:{FEED_CUT if variant=='reel' else 0}:{W}:{b['y0']-(FEED_CUT if variant=='reel' else 0)}:orange@0.35:fill",
              f"drawbox=0:{b['y1']}:{W}:{(H-FEED_CUT if variant=='reel' else H)-b['y1']}:orange@0.35:fill",
              f"drawbox=0:{b['y0']}:{SIDE}:{b['h']}:orange@0.35:fill", f"drawbox={W-SIDE}:{b['y0']}:{SIDE}:{b['h']}:orange@0.35:fill",
              f"drawbox={b['x0']}:{b['y0']}:{b['w']}:{b['h']}:lime@0.9:4"]
    n = max(1, int(duration(video) / every))
    cols = min(n, 10); rows = (n + cols - 1) // cols
    vf = f"fps=1/{every},scale={W}:{H}," + ",".join(boxes) + f",scale=216:-1,tile={cols}x{rows}"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(video), "-vf", vf, "-frames:v", "1", str(out)], check=True)


def duration(video: Path) -> float:
    p = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(video)],
                       capture_output=True, text=True, check=True)
    return float(json.loads(p.stdout)["format"]["duration"])


def edge_density(video: Path, x: int, y: int, w: int, h: int, every: float) -> float:
    """Mean luma of an edge map over the region, 0..1. Text and UI chrome score high."""
    vf = f"fps=1/{every},scale={W}:{H},crop={w}:{h}:{x}:{y},edgedetect=low=0.1:high=0.3,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-"
    p = subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), "-vf", vf, "-f", "null", "-"],
                       capture_output=True, text=True, check=True)
    vals = [float(l.split("=")[1]) for l in p.stdout.splitlines() if "YAVG" in l]
    return (sum(vals) / len(vals) / 255.0) if vals else 0.0


def check(video: Path, variant: str, every: float) -> int:
    b = box(variant)
    safe = edge_density(video, b["x0"], b["y0"], b["w"], b["h"], every) or 1e-6
    worst = 0.0
    print(f"{video.name} · {variant} · safe box {b['x0']},{b['y0']}–{b['x1']},{b['y1']} · edge density in safe box {safe:.3f}")
    for name, x, y, w, h in bands(variant):
        d = edge_density(video, x, y, w, h, every)
        ratio = d / safe
        worst = max(worst, ratio)
        print(f"  {name:6} band {w}x{h} at {x},{y}: {d:.3f}  ({ratio:.2f}x safe box)")
    verdict = "PASS" if worst < 0.25 else ("WARN" if worst <= 0.6 else "FAIL")
    print(f"VERDICT: {verdict} (worst band {worst:.2f}x; text or UI in a band shows as > 0.6x)")
    return 0 if verdict != "FAIL" else 1


def main(argv: list[str]) -> int:
    if not argv or argv[0] not in ("overlay", "check", "box"):
        print(__doc__); return 2
    variant = argv[argv.index("--variant") + 1] if "--variant" in argv else "reel"
    every = float(argv[argv.index("--every") + 1]) if "--every" in argv else (3.0 if argv[0] == "overlay" else 1.0)
    if argv[0] == "box":
        b = box(variant); print(json.dumps(b))
        print(f"--safe-x:{b['x0']}px; --safe-y:{b['y0']}px; --safe-w:{b['w']}px; --safe-h:{b['h']}px;")
        return 0
    if argv[0] == "overlay":
        overlay(Path(argv[1]), Path(argv[2]), variant, every); print(argv[2]); return 0
    return check(Path(argv[1]), variant, every)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
