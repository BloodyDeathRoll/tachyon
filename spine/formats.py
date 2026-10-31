"""Other formats of a finished reel (1:1, 4:5, 2:3, 16:9), for posting by hand elsewhere.

    python -m spine.formats make <client> <slot> 1x1 4x5 2x3 16x9   # what the dashboard spawns

A real re-layout, not a crop: for each format, claude -p writes a version of the reel's film
(engines/remotion/src/films/<film>-<ratio>.tsx) with the same beats, words, timing and assets,
placed for that frame size. It is registered in films/formats.ts, rendered by Remotion, and gets
the reel's own soundtrack (music, voice-over and fade as mixed). A film edited after its format
version was written gets a fresh version. Files: posts/<slot>/video-<ratio>.mp4; progress in
formats.json.
"""

from __future__ import annotations

import fcntl
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from . import clients as C

ROOT = Path(__file__).resolve().parent.parent
REMOTION = ROOT / "engines" / "remotion"
FILMS = REMOTION / "src" / "films"
WRITE_TIMEOUT = 25 * 60
RENDER_TIMEOUT_MS = 180_000
ALLOWED = "Read Edit Write Glob Grep Bash(npx tsc:*) Bash(npx remotion still:*)"
RATIOS = {"1x1": (1080, 1080), "4x5": (1080, 1350), "2x3": (1080, 1620), "16x9": (1920, 1080)}
STALL = 45 * 60   # seconds without a status write before a running job counts as dead (writing + rendering one format)
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
    try:
        st = json.loads(p.read_text()) if p.exists() else {}
        if not isinstance(st, dict):
            st = {}
        since = (datetime.now(timezone.utc) - datetime.fromisoformat(st.get("updated_at") or now())).total_seconds()
    except ValueError:
        st, since = {}, 0
    if st.get("state") == "running":
        no_pid_for = since
        if ((st.get("pid") and not _alive(st["pid"])) or (not st.get("pid") and no_pid_for > 60)
                or no_pid_for > STALL):   # no progress for STALL: killed (a zombie still answers kill 0)
            st.update(state="failed", error=st.get("error") or "stopped before it finished (restart or crash)")
    return st


def _status(client: str, slot: str, **kw) -> None:
    cur = status(client, slot)
    cur.update(kw, updated_at=now())
    tmp = status_path(client, slot).with_suffix(f".{os.getpid()}.tmp")
    tmp.write_text(json.dumps(cur, indent=1))
    tmp.replace(status_path(client, slot))   # atomic: the page reads it while the job writes


def _run(cmd: list[str], cwd: Path, timeout: int | None = None) -> str:
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        raise RuntimeError(f"{cmd[0]} failed: {(r.stderr or r.stdout).strip()[-400:]}")
    return r.stdout


def prompt(fid: str, ratio: str) -> str:
    w, h = RATIOS[ratio]
    shape = ("landscape: use the width, e.g. the phone to one side and the words beside it, footage filling the frame"
             if w > h else "square: a tighter layout, e.g. a smaller phone with the words above or beside it"
             if w == h else "a shorter portrait frame: rebalance the stack so it fits without crowding")
    return f"""Make a {LABEL[ratio]} ({w}x{h}) version of the Instagram reel film src/films/{fid}.tsx.

This is a real re-layout, not a crop or a letterbox. Keep everything the film says and does: the
same beats in the same order and timing, the same words, the same app screens, footage, colours
and animations. Re-place them for a {w}x{h} frame so the space is used well ({shape}).

Read src/lib.tsx and src/films/{fid}.tsx first. Write src/films/{fid}-{ratio}.tsx:
- `export {{ SECONDS }} from "./{fid}";` and `export default` a component with no props.
- Keep every text and UI element inside FORMAT_SAFE({w}, {h}) from ../lib (there is no Instagram
  UI on this format; ignore SAFE[variant]). No text under MIN_TYPE px.
- Footage fills the whole frame. <Phone> takes cx and cy (its centre in the frame) and pose.s for scale.
  The phone is 420x880 at s=1: in every beat the whole phone, including any pose.y move, stays
  inside FORMAT_SAFE; scale it down rather than let it run off an edge.
- Check it: `npx remotion still src/index.ts {fid}-{ratio} /tmp/{fid}-{ratio}-N.png --frame=N` at the
  start, middle and end of each beat; fix anything cut off or crowded. (It is registered for you only
  after you finish, so to check frames add the entry to src/films/formats.ts yourself:
  `import x, {{ SECONDS as x_s }} from "./{fid}-{ratio}";` and `{{ id: "{fid}-{ratio}", seconds: x_s,
  width: {w}, height: {h}, component: x }},` between the markers.)
Edit no other file (apart from that formats.ts entry). Run `npx tsc --noEmit -p .` until it passes. Do not render, do not commit.
End with one line per layout decision."""


def _register(fid: str, ratio: str) -> None:
    idx = FILMS / "formats.ts"
    s = idx.read_text()
    cid = f"{fid}-{ratio}"
    if f'"./{cid}"' in s:
        return
    var = re.sub(r"\W", "_", cid)
    w, h = RATIOS[ratio]
    s = s.replace("// @imports", f'import {var}, {{ SECONDS as {var}_s }} from "./{cid}";\n// @imports')
    s = s.replace("  // @formats", f'  {{ id: "{cid}", seconds: {var}_s, width: {w}, height: {h}, component: {var} }},\n  // @formats')
    idx.write_text(s)


def _drop(fid: str, ratio: str) -> None:
    _unregister(fid, ratio)
    (FILMS / f"{fid}-{ratio}.tsx").unlink(missing_ok=True)


def _unregister(fid: str, ratio: str) -> None:
    idx = FILMS / "formats.ts"
    cid = f"{fid}-{ratio}"
    keep = [ln for ln in idx.read_text().splitlines(keepends=True) if f'"./{cid}"' not in ln and f'id: "{cid}"' not in ln]
    idx.write_text("".join(keep))


def make_one(client: str, slot: str, ratio: str) -> Path:
    """One format at a time across all slots: the layouts and formats.ts are shared sources."""
    with open(FILMS / ".formats.lock", "w") as lk:
        while True:
            try:
                fcntl.flock(lk, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:   # another format is being made: wait, and say so (heartbeat)
                _status(client, slot, step="queued")
                time.sleep(15)
        return _make_one(client, slot, ratio)


def html_prompt(fdir: str, ratio: str) -> str:
    w, h = RATIOS[ratio]
    m = round(min(w, h) * 0.06)
    return f"""Make a {LABEL[ratio]} ({w}x{h}) version of the Instagram reel film {fdir}/index.html.

This is a real re-layout, not a crop or a letterbox. Keep everything the film says and does: the
same beats in the same order and timing, the same words, the same app screens, footage, colours
and animations. Re-place them for a {w}x{h} frame so the space is used well.

Write {fdir}/index-{ratio}.html (start from a copy of index.html; it shares the assets in {fdir}/).
Same contract: window.__film.seek(t) puts everything where it is at t seconds, from t alone. There
is no Instagram UI on this format: keep every text and UI element inside a {m} px margin all round.
Footage fills the whole frame. No text under 38 px.
Check it: `.venv/bin/python -m spine.render {fdir} --page index-{ratio}.html --size {w}x{h} --still <seconds> /tmp/{ratio}.png`
at the start, middle and end of each beat; fix anything cut off or crowded.
Edit no other file. Do not render, do not commit. End with one line per layout decision."""


def _make_html(client: str, slot: str, ratio: str, film: dict, src: Path) -> Path:
    """Engine html: Claude re-lays the page out as index-<ratio>.html; spine/render.py captures it at its size."""
    from . import revise as R
    fdir = ROOT / film["dir"]
    page = fdir / f"index-{ratio}.html"
    _status(client, slot, step="checking")
    if not page.exists() or (fdir / "index.html").stat().st_mtime > page.stat().st_mtime:
        page.unlink(missing_ok=True)
        _status(client, slot, step="writing")
        _run(["claude", "-p", html_prompt(film["dir"], ratio), "--allowedTools", *R.ALLOWED_HTML.split(" "),
              "--permission-mode", "acceptEdits"], cwd=ROOT, timeout=WRITE_TIMEOUT)
        if not page.exists():
            raise RuntimeError(f"no {LABEL[ratio]} layout was written")
    _status(client, slot, step="rendering")
    w, h = RATIOS[ratio]
    return _mux(client, slot, ratio, src, [R.VENV_PY, "-m", "spine.render", str(fdir), "{raw}", "--page", page.name, "--size", f"{w}x{h}"], ROOT)


def _mux(client: str, slot: str, ratio: str, src: Path, render_cmd: list[str], cwd: Path) -> Path:
    """Render the format video ({raw} in the command) and give it the reel's own soundtrack."""
    src_mtime = src.stat().st_mtime
    out = path(client, slot, ratio)
    raw = out.with_suffix(".raw.mp4")
    tmp = out.with_suffix(".part.mp4")
    try:
        _run([str(raw) if a == "{raw}" else a for a in render_cmd], cwd=cwd, timeout=30 * 60)
        _run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-i", str(src), "-map", "0:v", "-map", "1:a?",
              "-c:v", "copy", "-c:a", "copy", "-shortest", "-map_metadata", "-1", "-movflags", "+faststart", str(tmp)], cwd=ROOT)
        tmp.replace(out)
    finally:
        raw.unlink(missing_ok=True)
        tmp.unlink(missing_ok=True)
    if src.stat().st_mtime != src_mtime:   # the reel changed meanwhile: this version is of the old one
        out.unlink(missing_ok=True)
        raise RuntimeError("the reel was re-rendered meanwhile: generate again")
    return out


def _make_one(client: str, slot: str, ratio: str) -> Path:
    sd = C.client_dir(client) / "posts" / slot
    src = sd / "video.mp4"
    src_mtime = src.stat().st_mtime
    film = json.loads((sd / "meta.json").read_text()).get("film") or {}
    if film.get("engine") == "html":
        return _make_html(client, slot, ratio, film, src)
    if film.get("engine") != "remotion" or not film.get("reel"):
        raise RuntimeError("this video has no Remotion film to re-lay out")
    fid = film["reel"]
    base = REMOTION / film["source"].removeprefix("engines/remotion/") if film.get("source") else FILMS / f"{fid}.tsx"
    ffile = FILMS / f"{fid}-{ratio}.tsx"
    _status(client, slot, step="checking")
    if not ffile.exists() or (base.exists() and base.stat().st_mtime > ffile.stat().st_mtime):
        ffile.unlink(missing_ok=True)
        _status(client, slot, step="writing")
        try:
            _run(["claude", "-p", prompt(fid, ratio), "--allowedTools", *ALLOWED.split(" "), "--permission-mode", "acceptEdits"],
                 cwd=REMOTION, timeout=WRITE_TIMEOUT)
        except Exception:
            _drop(fid, ratio)   # claude may have registered a half-written layout
            raise
        if not ffile.exists():
            _drop(fid, ratio)
            raise RuntimeError(f"no {LABEL[ratio]} layout was written")
    _register(fid, ratio)
    try:
        r = subprocess.run(["npx", "tsc", "--noEmit", "-p", "."], cwd=REMOTION, capture_output=True, text=True, timeout=300)
    except subprocess.TimeoutExpired:
        _unregister(fid, ratio)   # unchecked: keep it out of every render
        raise RuntimeError("the type check timed out")
    if r.returncode != 0:
        if f"src/films/{fid}-{ratio}.tsx" in r.stdout:
            _drop(fid, ratio)   # its own error: never leave it registered; the next run writes it afresh
        else:
            _unregister(fid, ratio)   # someone else's error: keep the layout, just don't register it now
        raise RuntimeError(f"the {LABEL[ratio]} layout does not typecheck: {r.stdout[-300:]}")
    _status(client, slot, step="rendering")
    out = path(client, slot, ratio)
    raw = out.with_suffix(".raw.mp4")
    tmp = out.with_suffix(".part.mp4")
    try:
        _run(["npx", "remotion", "render", "src/index.ts", f"{fid}-{ratio}", str(raw), "--log=error",
              f"--timeout={RENDER_TIMEOUT_MS}"], cwd=REMOTION, timeout=30 * 60)
        _run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-i", str(src), "-map", "0:v", "-map", "1:a?",
              "-c:v", "copy", "-c:a", "copy", "-shortest", "-map_metadata", "-1", "-movflags", "+faststart", str(tmp)], cwd=ROOT)
        tmp.replace(out)
    finally:
        raw.unlink(missing_ok=True)
        tmp.unlink(missing_ok=True)
    if src.stat().st_mtime != src_mtime:   # the reel changed meanwhile: this version is of the old one
        out.unlink(missing_ok=True)
        raise RuntimeError("the reel was re-rendered meanwhile: generate again")
    return out


def make(client: str, slot: str, ratios: list[str]) -> int:
    _status(client, slot, pid=os.getpid())   # the job registers itself; status() checks it is alive
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
    fd = os.open(lock, os.O_CREAT | os.O_WRONLY)
    try:   # one start at a time, even for two fast clicks; the kernel drops the lock if we die
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(fd)
        return
    try:
        if status(client, slot).get("state") == "running":
            return
        _status(client, slot, state="running", current=ratios[0], wanted=ratios, error=None, pid=None)
        try:
            with (C.client_dir(client) / "posts" / slot / "formats.log").open("a") as log:
                subprocess.Popen([sys.executable, "-m", "spine.formats", "make", client, slot, *ratios], cwd=ROOT,
                                 stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        except OSError as e:
            _status(client, slot, state="failed", error=f"could not start: {e}")
    finally:
        os.close(fd)   # releases the lock


def main(argv: list[str]) -> int:
    if len(argv) >= 4 and argv[0] == "make":
        return make(argv[1], argv[2], argv[3:])
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
