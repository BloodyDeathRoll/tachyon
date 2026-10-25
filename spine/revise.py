"""Reject with notes → a new render (dashboard video page).

    python -m spine.revise run <client> <slot>     # what the dashboard spawns
    python -m spine.revise render <client> <slot>  # render only (no edit), e.g. a first cut

A slot's meta.json carries its film:
    "film": {"engine": "remotion", "reel": "Showreel", "story": "ShowreelStory",
             "source": "engines/remotion/src/Showreel.tsx",
             "music": "clients/rosa/assets/music/old-steel-449645.mp3"}

Flow: REJECTED → SCRIPTED → (claude -p edits the film source per the notes) → render reel +
story → music → cover → safe-zone check → RENDERED → QA → NEEDS_APPROVAL. The previous
version moves to posts/<slot>/versions/vN/. Progress in posts/<slot>/revise.json, which the
dashboard reads for the "Re-rendering" tag.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from . import clients as C
from .db import DB

ROOT = Path(__file__).resolve().parent.parent
REMOTION = ROOT / "engines" / "remotion"
EDIT_TIMEOUT = 25 * 60
ALLOWED = "Read Edit Write Glob Grep Bash(npx tsc:*) Bash(npx remotion still:*)"


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def status_path(client: str, slot: str) -> Path:
    return C.client_dir(client) / "posts" / slot / "revise.json"


def status(client: str, slot: str) -> dict | None:
    p = status_path(client, slot)
    return json.loads(p.read_text()) if p.exists() else None


def _write_status(client: str, slot: str, **kw) -> dict:
    cur = status(client, slot) or {}
    cur.update(kw, updated_at=now())
    status_path(client, slot).write_text(json.dumps(cur, indent=1))
    return cur


def start(client: str, slot: str, notes: str) -> None:
    """Called by the dashboard after REJECTED: record the notes and spawn the job detached."""
    prev = status(client, slot) or {}
    rounds = prev.get("rounds", [])
    rounds.append({"notes": notes, "at": now()})
    _write_status(client, slot, state="running", step="queued", notes=notes, rounds=rounds, error=None)
    log = (C.client_dir(client) / "posts" / slot / "revise.log").open("a")
    subprocess.Popen([sys.executable, "-m", "spine.revise", "run", client, slot], cwd=ROOT,
                     stdout=log, stderr=subprocess.STDOUT, start_new_session=True)


def _prompt(client: str, slot: str, film: dict, notes: str, slot_dir: Path) -> str:
    return f"""You are revising one Instagram reel for the client "{client}" (slot {slot}).
The operator rejected the current cut with these notes:

---
{notes}
---

The film is a Remotion composition. Edit only its source: {film['source']} (and
engines/remotion/src/lib.tsx only if the change truly needs it). Composition ids: reel
"{film['reel']}", story "{film['story']}" (engines/remotion/src/Root.tsx; durations come from
the constants exported by the film file).
If a note is about the post text, edit {slot_dir.relative_to(ROOT)}/caption.txt instead.

Rules: keep every text and UI element inside the safe box (SAFE in lib.tsx); numbers only from
clients/{client}/product.md; never "comment for the link"; no AI-generated footage.
After editing, run `npx tsc --noEmit -p .` in engines/remotion and fix any error. You may check
a frame with `npx remotion still src/index.ts {film['reel']} /tmp/x.png --frame=N`.
Do not render the video, do not commit. End with one line per change you made."""


def _edit(client: str, slot: str, film: dict, notes: str, slot_dir: Path) -> str:
    r = subprocess.run(["claude", "-p", _prompt(client, slot, film, notes, slot_dir),
                        "--allowedTools", *ALLOWED.split(" "), "--permission-mode", "acceptEdits"],
                       cwd=ROOT, capture_output=True, text=True, timeout=EDIT_TIMEOUT)
    if r.returncode != 0:
        raise RuntimeError(f"claude edit failed: {r.stderr.strip()[-400:] or r.stdout.strip()[-400:]}")
    return r.stdout.strip()


def _run(cmd: list[str], cwd: Path = ROOT) -> None:
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"{cmd[0]} failed: {(r.stderr or r.stdout).strip()[-400:]}")


def _duration(p: Path) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                       capture_output=True, text=True)
    return float(r.stdout.strip())


def render(client: str, slot: str) -> dict:
    """Render reel + story with music into the slot. Returns the safe-zone verdicts."""
    slot_dir = C.client_dir(client) / "posts" / slot
    meta = json.loads((slot_dir / "meta.json").read_text())
    film = meta["film"]
    music = ROOT / film["music"] if film.get("music") else None
    tmp = slot_dir / ".render"
    tmp.mkdir(exist_ok=True)
    out = {}
    for variant, comp in (("reel", film["reel"]), ("story", film["story"])):
        raw = tmp / f"{variant}.mp4"
        _run(["npx", "remotion", "render", "src/index.ts", comp, str(raw), "--log=error"], cwd=REMOTION)
        dst = tmp / f"{variant}-final.mp4"
        d = _duration(raw)
        if music:
            _run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-i", str(music), "-map", "0:v", "-map", "1:a",
                  "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
                  "-af", f"afade=t=out:st={max(0.0, d - 1.5):.2f}:d=1.5", "-shortest",
                  "-map_metadata", "-1", "-movflags", "+faststart", str(dst)])
        else:
            _run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-c", "copy", "-map_metadata", "-1",
                  "-movflags", "+faststart", str(dst)])
        out[variant] = dst
        meta["duration_s"] = round(d, 2)
    # keep the previous cut
    if (slot_dir / "video.mp4").exists():
        vdir = slot_dir / "versions"
        n = len(list(vdir.glob("v*"))) + 1 if vdir.exists() else 1
        keep = vdir / f"v{n}"
        keep.mkdir(parents=True, exist_ok=True)
        for f in ("video.mp4", "video-story.mp4", "cover.jpg", "caption.txt"):
            if (slot_dir / f).exists():
                shutil.copy2(slot_dir / f, keep / f)
    shutil.move(out["reel"], slot_dir / "video.mp4")
    shutil.move(out["story"], slot_dir / "video-story.mp4")
    shutil.rmtree(tmp, ignore_errors=True)
    at = (meta.get("thumb_offset") or 1500) / 1000
    _run(["ffmpeg", "-v", "error", "-y", "-ss", f"{min(at, meta['duration_s'] - 0.1):.2f}", "-i",
          str(slot_dir / "video.mp4"), "-frames:v", "1", "-q:v", "3", str(slot_dir / "cover.jpg")])
    (slot_dir / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")
    verdicts = {}
    for variant, f in (("reel", "video.mp4"), ("story", "video-story.mp4")):
        r = subprocess.run([sys.executable, "tools/safezone.py", "check", str(slot_dir / f), "--variant", variant,
                            "--every", "1"], cwd=ROOT, capture_output=True, text=True)
        verdicts[variant] = (r.stdout.strip().splitlines() or ["VERDICT: ?"])[-1]
    return verdicts


def _qa_md(slot: str, verdicts: dict, changes: str | None, notes: str | None) -> str:
    lines = [f"# QA · {slot} · {now()}", ""]
    if notes:
        lines += ["## Operator notes", "", notes, ""]
    if changes:
        lines += ["## Changes", "", changes, ""]
    lines += ["## Safe zones", ""] + [f"- {k}: {v}" for k, v in verdicts.items()]
    ok = all("FAIL" not in v for v in verdicts.values())
    lines += ["", f"VERDICT: {'APPROVED' if ok else 'NEEDS_REVISION'}"]
    return "\n".join(lines) + "\n"


def run(client: str, slot: str) -> int:
    d = C.client_dir(client)
    slot_dir = d / "posts" / slot
    st = status(client, slot) or {}
    notes = st.get("notes") or ""
    db = DB.for_client(d)
    try:
        film = json.loads((slot_dir / "meta.json").read_text())["film"]
        if db.post(slot)["state"] == "REJECTED":
            db.set_state(slot, "SCRIPTED", note=f"revising: {notes[:200]}")
        _write_status(client, slot, step="editing")
        changes = _edit(client, slot, film, notes, slot_dir) if notes else None
        _write_status(client, slot, step="rendering", changes=changes)
        verdicts = render(client, slot)
        db.set_state(slot, "RENDERED")
        qa = _qa_md(slot, verdicts, changes, notes)
        (slot_dir / "qa.md").write_text(qa)
        db.set_state(slot, "QA", qa_verdict=qa.strip().splitlines()[-1])
        db.set_state(slot, "NEEDS_APPROVAL" if qa.rstrip().endswith("APPROVED") else "NEEDS_INPUT")
        _write_status(client, slot, state="done", step="done", verdicts=verdicts)
        return 0
    except Exception as e:  # surface it on the video page
        _write_status(client, slot, state="failed", error=str(e)[-600:])
        try:
            if db.post(slot)["state"] == "SCRIPTED":
                db.set_state(slot, "REJECTED", note=f"revision failed: {str(e)[:200]}")
        except Exception:
            pass
        print(f"revise failed: {e}", file=sys.stderr)
        return 1
    finally:
        db.close()


def main(argv: list[str]) -> int:
    if len(argv) == 3 and argv[0] == "run":
        return run(argv[1], argv[2])
    if len(argv) == 3 and argv[0] == "render":
        print(json.dumps(render(argv[1], argv[2]), indent=1))
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
