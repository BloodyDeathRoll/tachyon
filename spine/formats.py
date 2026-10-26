"""Other aspect ratios of a finished reel, for posting by hand on other platforms.

    python -m spine.formats make <client> <slot> 1x1 4x5 2x3 16x9   # what the dashboard spawns

Made from the 9:16 reel (video.mp4) with ffmpeg, no re-render:
- 1:1, 4:5, 2:3 crop the full-width frame around the centre of Meta's safe box (top 14 %,
  bottom 35 %), where every text and UI element of our films sits, so nothing is cut.
- 16:9 shows the safe box, frame-high and centred, over a blurred copy of the reel.
Audio is copied as is: a video whose music is an Instagram track is silent here (that track only
plays on Instagram). Files: posts/<slot>/video-<ratio>.mp4; progress in formats.json.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from . import clients as C

ROOT = Path(__file__).resolve().parent.parent
W, H = 1080, 1920
SAFE_MID = round(H * (0.14 + (1 - 0.35)) / 2)   # centre of the safe box, y ≈ 758
RATIOS = {"1x1": (1080, 1080), "4x5": (1080, 1350), "2x3": (1080, 1620), "16x9": (1920, 1080)}
LABEL = {"1x1": "1:1", "4x5": "4:5", "2x3": "2:3", "16x9": "16:9"}


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def path(client: str, slot: str, ratio: str) -> Path:
    return C.client_dir(client) / "posts" / slot / f"video-{ratio}.mp4"


def ready(client: str, slot: str) -> list[str]:
    """Formats made from the current reel (a re-render makes the old ones stale)."""
    src = C.client_dir(client) / "posts" / slot / "video.mp4"
    if not src.exists():
        return []
    return [r for r in RATIOS if path(client, slot, r).exists() and path(client, slot, r).stat().st_mtime >= src.stat().st_mtime]


def status_path(client: str, slot: str) -> Path:
    return C.client_dir(client) / "posts" / slot / "formats.json"


def _alive(pid) -> bool:
    try:
        os.kill(int(pid), 0)
        return True
    except (TypeError, ValueError, ProcessLookupError):
        return False
    except PermissionError:
        return True


def status(client: str, slot: str) -> dict:
    """formats.json; a job whose process is gone (restart, crash) reads as failed, not running."""
    p = status_path(client, slot)
    st = json.loads(p.read_text()) if p.exists() else {}
    if st.get("state") == "running" and st.get("pid") and not _alive(st["pid"]):
        st.update(state="failed", error=st.get("error") or "stopped before it finished (restart or crash)")
    return st


def _status(client: str, slot: str, **kw) -> None:
    cur = status(client, slot)
    cur.update(kw, updated_at=now())
    status_path(client, slot).write_text(json.dumps(cur, indent=1))


def filter_for(ratio: str) -> str:
    w, h = RATIOS[ratio]
    if ratio == "16x9":   # the safe box (all our text and UI), as tall as the frame, over a blurred copy
        top, bot = round(H * 0.14), round(H * (1 - 0.35))
        fw = round(W * h / (bot - top) / 2) * 2
        return (f"[0:v]split[a][b];[a]scale={w}:-2,crop={w}:{h},boxblur=40:4,eq=brightness=-0.08[bg];"
                f"[b]crop={W}:{bot - top}:0:{top},scale={fw}:{h}[fg];[bg][fg]overlay=(W-w)/2:0,setsar=1[v]")
    y = max(0, min(H - h, SAFE_MID - h // 2))
    return f"[0:v]crop={w}:{h}:0:{y},setsar=1[v]"


def make_one(client: str, slot: str, ratio: str) -> Path:
    src = C.client_dir(client) / "posts" / slot / "video.mp4"
    src_mtime = src.stat().st_mtime
    out = path(client, slot, ratio)
    tmp = out.with_suffix(".part.mp4")
    r = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-filter_complex", filter_for(ratio),
                        "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-preset", "medium", "-crf", "19",
                        "-pix_fmt", "yuv420p", "-c:a", "copy", "-map_metadata", "-1", "-movflags", "+faststart", str(tmp)],
                       capture_output=True, text=True)
    if r.returncode != 0:
        tmp.unlink(missing_ok=True)
        raise RuntimeError(f"ffmpeg failed for {ratio}: {r.stderr.strip()[-300:]}")
    tmp.replace(out)
    if src.stat().st_mtime != src_mtime:   # the reel changed while cutting: this cut is of the old one
        out.unlink(missing_ok=True)
        raise RuntimeError("the reel was re-rendered meanwhile: generate again")
    return out


def make(client: str, slot: str, ratios: list[str]) -> int:
    try:
        for r in ratios:
            _status(client, slot, state="running", current=r)
            make_one(client, slot, r)
        _status(client, slot, state="done", current=None, error=None)
        return 0
    except Exception as e:
        _status(client, slot, state="failed", current=None, error=str(e)[-600:])
        print(f"formats failed: {e}", file=sys.stderr)
        return 1


def start(client: str, slot: str, ratios: list[str]) -> None:
    ratios = [r for r in ratios if r in RATIOS]
    if not ratios:
        return
    lock = C.client_dir(client) / "posts" / slot / "formats.lock"
    try:   # one start at a time, even for two fast clicks
        fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        return
    try:
        if status(client, slot).get("state") == "running":
            return
        _status(client, slot, state="running", current=ratios[0], wanted=ratios, error=None, pid=None)
        with (C.client_dir(client) / "posts" / slot / "formats.log").open("a") as log:
            proc = subprocess.Popen([sys.executable, "-m", "spine.formats", "make", client, slot, *ratios], cwd=ROOT,
                                    stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        _status(client, slot, pid=proc.pid)
    finally:
        os.close(fd)
        lock.unlink(missing_ok=True)


def main(argv: list[str]) -> int:
    if len(argv) >= 4 and argv[0] == "make":
        return make(argv[1], argv[2], argv[3:])
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
