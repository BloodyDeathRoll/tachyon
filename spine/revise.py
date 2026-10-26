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
RENDER_TIMEOUT_MS = 180_000   # delayRender limit; large stock clips took > 28 s to fetch
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
    _write_status(client, slot, state="running", step="queued", notes=notes, rounds=rounds, error=None,
                  skip_edit=False, changes=None, kind=None)
    _spawn(client, slot)


def _spawn(client: str, slot: str) -> None:
    log = (C.client_dir(client) / "posts" / slot / "revise.log").open("a")
    subprocess.Popen([sys.executable, "-m", "spine.revise", "run", client, slot], cwd=ROOT,
                     stdout=log, stderr=subprocess.STDOUT, start_new_session=True)


def failed(client: str, slot: str) -> bool:
    return (status(client, slot) or {}).get("state") == "failed"


def settle(db: DB, client: str, slot: str) -> None:
    """A failed re-render leaves the previous cut in place: put the slot back to NEEDS_APPROVAL so
    the operator can approve it or send new notes (older failures left it stuck in REJECTED)."""
    if failed(client, slot) and db.post(slot)["state"] == "REJECTED":
        db.set_state(slot, "NEEDS_APPROVAL", note="re-render failed; the previous cut stands")


def dismiss(client: str, slot: str) -> None:
    if failed(client, slot):
        _write_status(client, slot, state="dismissed")


def retry(client: str, slot: str, db: DB) -> bool:
    """Re-run the last failed job with the same notes. If it got past the edit, only render again
    (the film source already has the change; editing twice would apply it twice)."""
    st = status(client, slot) or {}
    if st.get("state") != "failed":
        return False
    if db.post(slot)["state"] == "NEEDS_APPROVAL":
        db.set_state(slot, "REJECTED", note="re-run after a failed render")
    _write_status(client, slot, state="running", step="queued", error=None,
                  skip_edit=st.get("step") in ("rendering", "finishing"))
    try:
        _spawn(client, slot)
    except Exception as e:   # nothing is running: show the failure again, back to approval
        _write_status(client, slot, state="failed", step=st.get("step"), error=f"could not start: {e}", failed_at=now())
        settle(db, client, slot)
        raise
    return True


def _upload_intro(slot_dir: Path, film: dict) -> str:
    """An uploaded video has no film yet: the first edit builds one on the upload."""
    meta = json.loads((slot_dir / "meta.json").read_text())
    if not meta.get("upload") or (ROOT / film["source"]).exists():
        return ""
    return f"""
This video was uploaded by hand and has no film yet. First create {film['source']}: it exports
`export const SECONDS = {meta.get('duration_s') or 10};` and `export default` a component
`({{ variant }}: {{ variant: Variant }}) => ...` that plays staticFile("{meta['upload']}") full frame
(OffthreadVideo, objectFit cover, muted: the soundtrack is mixed in afterwards) for the whole
duration. Study engines/remotion/src/lib.tsx and one film in engines/remotion/src/films first and
use the same language for anything you add. Then apply the notes on top of it.
"""


def _prompt(client: str, slot: str, film: dict, notes: str, slot_dir: Path) -> str:
    return f"""You are revising one Instagram reel for the client "{client}" (slot {slot}).{_upload_intro(slot_dir, film)}
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


def _register_if_new(film: dict) -> None:
    """A film created by the edit (an upload's first one) must be registered before rendering."""
    from . import week as W
    if (ROOT / film["source"]).exists() and f'"./{film["reel"]}"' not in (W.FILMS / "index.ts").read_text():
        before = (W.FILMS / "index.ts").read_text()
        W.register(film["reel"])
        r = subprocess.run(["npx", "tsc", "--noEmit", "-p", "."], cwd=REMOTION, capture_output=True, text=True, timeout=300)
        if r.returncode != 0:
            (W.FILMS / "index.ts").write_text(before)
            raise RuntimeError(f"the film does not typecheck: {r.stdout[-300:]}")


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
    if not music and meta.get("upload"):   # a film built on an upload keeps the upload's own sound
        music = REMOTION / "public" / meta["upload"]
    tmp = slot_dir / ".render"
    tmp.mkdir(exist_ok=True)
    out = {}
    for variant, comp in (("reel", film["reel"]), ("story", film["story"])):
        raw = tmp / f"{variant}.mp4"
        _run(["npx", "remotion", "render", "src/index.ts", comp, str(raw), "--log=error", f"--timeout={RENDER_TIMEOUT_MS}"], cwd=REMOTION)
        dst = tmp / f"{variant}-final.mp4"
        d = _duration(raw)
        if music:
            _run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-i", str(music), "-map", "0:v", "-map", "1:a?",
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
    (slot_dir / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")
    from . import tracks as T   # level the music, add the voice-over, honour the picked track
    if T.current_track(client, slot) or meta.get("voiceover"):
        T.apply(client, slot)
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
        if st.get("skip_edit"):
            changes = st.get("changes")
        else:
            _write_status(client, slot, step="editing")
            changes = _edit(client, slot, film, notes, slot_dir) if notes else None
            _register_if_new(film)
        _write_status(client, slot, step="rendering", changes=changes)
        verdicts = render(client, slot)
        _write_status(client, slot, step="finishing")   # the new cut is in place from here on
        db.set_state(slot, "RENDERED")
        qa = _qa_md(slot, verdicts, changes, notes)
        (slot_dir / "qa.md").write_text(qa)
        db.set_state(slot, "QA", qa_verdict=qa.strip().splitlines()[-1])
        db.set_state(slot, "NEEDS_APPROVAL" if qa.rstrip().endswith("APPROVED") else "NEEDS_INPUT")
        _write_status(client, slot, state="done", step="done", verdicts=verdicts)
        return 0
    except Exception as e:  # surface it on the video page
        _write_status(client, slot, state="failed", error=str(e)[-1500:], failed_at=now())
        try:   # the previous cut is untouched (files move only on success): back to approval
            cur = db.post(slot)["state"]
            if cur == "SCRIPTED":
                db.set_state(slot, "REJECTED", note=f"revision failed: {str(e)[:200]}")
            elif cur == "RENDERED":   # failed after the new cut was in place: it still needs a look
                db.set_state(slot, "QA", note=f"after-render step failed: {str(e)[:200]}")
            if db.post(slot)["state"] == "QA":
                db.set_state(slot, "NEEDS_APPROVAL")
            settle(db, client, slot)
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
