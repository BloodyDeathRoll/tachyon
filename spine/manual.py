"""Videos added by hand on an open calendar slot (dashboard: Calendar → Add new).

    python -m spine.manual produce <client> <slot>   # what the dashboard spawns for a prompt

Upload: the file is fitted to 1080x1920 (cover + centre crop, H.264/AAC, metadata stripped) and
lands in NEEDS_APPROVAL with its own sound. It stays local: posts/ media and
engines/remotion/public/uploads/ are not in git. The first edit note turns it into a Remotion film
built on the upload (spine/revise), so it gets every edit an automatic video gets.
Prompt: claude plans one item from the prompt (same shape as a week plan item), then it is made
exactly like a week's video (spine/week.produce). Progress and errors in posts/<slot>/revise.json,
so the video page shows them like a re-render's.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import yaml

from . import caption as CAP
from . import clients as C
from . import revise as R
from . import week as W
from .db import DB

ROOT = Path(__file__).resolve().parent.parent
UPLOADS = ROOT / "engines" / "remotion" / "public" / "uploads"
VIDEO_EXT = {".mp4", ".mov", ".m4v", ".webm", ".mkv"}


def new_slot(client: str, at: str) -> str:
    """Claim <year>-w<week>-<n> (n one past the highest id used that week) by creating its
    folder, so two adds at once never get the same id."""
    dt = datetime.fromisoformat(at)
    y, w, _ = dt.isocalendar()
    prefix = f"{y}-w{w:02d}"
    d = C.client_dir(client)
    db = DB.for_client(d)
    try:
        used = {r["slot_id"] for r in db.posts()}
    finally:
        db.close()
    used |= {p.name for p in (d / "posts").glob(f"{prefix}-*")}
    nums = [int(s.rsplit("-", 1)[1]) for s in used if s.startswith(prefix + "-") and s.rsplit("-", 1)[1].isdigit()]
    n = max(nums, default=0) + 1
    while True:
        try:
            (d / "posts" / f"{prefix}-{n:02d}").mkdir(parents=True)
            return f"{prefix}-{n:02d}"
        except FileExistsError:
            n += 1


def _check_slot(client: str, at: str) -> str:
    """The slot must be a future, free publishing slot (as the calendar showed it)."""
    from . import schedule as SCH
    try:
        dt = datetime.fromisoformat(at.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        raise ValueError("not a slot time") from None
    if dt.tzinfo is None:
        raise ValueError("slot time needs a timezone")
    dt = dt.astimezone(timezone.utc)
    if dt < datetime.now(timezone.utc) + SCH.LEAD:
        raise ValueError("that slot is in the past")
    if dt.time().replace(second=0, microsecond=0) not in SCH._slots(C.load_grants(client)) or dt.second:
        raise ValueError("that is not one of the publishing slots")
    iso = dt.isoformat(timespec="seconds")
    db = DB.for_client(C.client_dir(client))
    try:
        if iso in SCH.taken_slots(db):
            raise ValueError("that slot is taken")
    finally:
        db.close()
    return iso


def _claim(client: str, at: str, title: str, engine: str) -> tuple[str, str]:
    """Check the slot and book it (folder + post row) in one step, under a lock, so two adds can
    never take the same slot or id."""
    import fcntl
    d = C.client_dir(client)
    with open(d / ".add.lock", "w") as lk:
        fcntl.flock(lk, fcntl.LOCK_EX)
        at = _check_slot(client, at)
        slot = new_slot(client, at)
        db = DB.for_client(d)
        try:
            db.create_post(slot, client, scheduled_at=at, angle=title, engine=engine)
        except Exception:
            shutil.rmtree(d / "posts" / slot, ignore_errors=True)
            raise
        finally:
            db.close()
    return slot, at


def _unclaim(client: str, slot: str) -> None:
    shutil.rmtree(C.client_dir(client) / "posts" / slot, ignore_errors=True)
    (UPLOADS / f"{slot}.mp4").unlink(missing_ok=True)
    db = DB.for_client(C.client_dir(client))
    try:
        db.delete_post(slot)
    finally:
        db.close()


def _run(cmd: list[str]) -> None:
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=20 * 60)
    if r.returncode != 0:
        raise RuntimeError(f"{cmd[0]} failed: {(r.stderr or r.stdout).strip()[-300:]}")


def add_upload(client: str, at: str, src: Path, name: str) -> str:
    """A video file → a slot waiting for approval at `at`."""
    if Path(name).suffix.lower() not in VIDEO_EXT:
        raise ValueError(f"not a video file: {name}")
    title = Path(name).stem.replace("_", " ").replace("-", " ").strip()[:40] or "Upload"
    slot, at = _claim(client, at, title, "upload")
    sd = C.client_dir(client) / "posts" / slot
    try:
        has_audio = bool(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index",
                                         "-of", "csv=p=0", str(src)], capture_output=True, text=True, timeout=120).stdout.strip())
        audio = ["-map", "0:a:0", "-c:a", "aac", "-b:a", "128k", "-ar", "48000"] if has_audio else ["-an"]
        _run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-map", "0:v:0", *audio,
              "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,scale=out_range=tv",
              "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-color_range", "tv",
              "-map_metadata", "-1", "-movflags", "+faststart", str(sd / "video.mp4")])
        shutil.copy2(sd / "video.mp4", sd / "video-story.mp4")
        dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                                    str(sd / "video.mp4")], capture_output=True, text=True, timeout=120).stdout.strip() or 0)
        _run(["ffmpeg", "-v", "error", "-y", "-ss", f"{min(1.0, dur / 2):.2f}", "-i", str(sd / "video.mp4"),
              "-frames:v", "1", "-q:v", "3", str(sd / "cover.jpg")])
        UPLOADS.mkdir(parents=True, exist_ok=True)
        shutil.copy2(sd / "video.mp4", UPLOADS / f"{slot}.mp4")   # what a later edit builds the film on
        fid = W.film_id(slot)
        meta = {"slot_id": slot, "title": title, "source": "upload", "upload": f"uploads/{slot}.mp4",
                "uploaded_name": name, "duration_s": round(dur, 2),
                "film": {"engine": "remotion", "reel": fid, "story": f"{fid}-story",
                         "source": f"engines/remotion/src/films/{fid}.tsx", "music": None},
                "track": None, "trial": False, "share_to_feed": True, "story": True,
                "landing": "https://rosa.surf/",
                "bio_link_while_live": f"https://rosa.surf/?utm_source=instagram&utm_medium=social&utm_campaign={slot}",
                "plan": "manual"}
        (sd / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")
        (sd / "caption.txt").write_text("")
        verdicts = {}
        for variant, f in (("reel", "video.mp4"), ("story", "video-story.mp4")):
            r = subprocess.run([sys.executable, "tools/safezone.py", "check", str(sd / f), "--variant", variant, "--every", "1"],
                               cwd=ROOT, capture_output=True, text=True)
            verdicts[variant] = (r.stdout.strip().splitlines() or ["VERDICT: ?"])[-1]
        verdicts |= R.spec_verdicts(sd)
        qa = R._qa_md(slot, verdicts, f"Uploaded by hand: {name}", None)
        (sd / "qa.md").write_text(qa)
        db = DB.for_client(C.client_dir(client))
        try:
            for st in ("BRIEFED", "SCRIPTED", "RENDERED"):
                db.set_state(slot, st)
            db.set_state(slot, "QA", qa_verdict=qa.strip().splitlines()[-1])
            db.set_state(slot, "NEEDS_APPROVAL" if qa.rstrip().endswith("APPROVED") else "NEEDS_INPUT")
        finally:
            db.close()
    except Exception:
        _unclaim(client, slot)   # no files, no row: the slot is free again
        raise
    write_caption(client, slot)
    return slot


def write_caption(client: str, slot: str) -> None:
    """Background: Claude watches the upload (frames + speech) and writes its caption."""
    sd = C.client_dir(client) / "posts" / slot
    (sd / "caption.writing").touch()   # the page shows "Writing…" until spine.caption removes it
    log = (sd / "revise.log").open("a")
    subprocess.Popen([sys.executable, "-m", "spine.caption", "write", client, slot], cwd=ROOT,
                     stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    log.close()


def add_prompt(client: str, at: str, prompt: str, engine: str = "html") -> str:
    """A prompt (empty: Claude picks the idea) → a slot in production at `at` (made in the background)."""
    prompt = prompt.strip()
    engine = engine if engine in W.ENGINES else "html"
    slot, at = _claim(client, at, "New video", "html" if engine == "html" else "remotion")
    sd = C.client_dir(client) / "posts" / slot
    try:
        (sd / "prompt.txt").write_text(prompt + "\n")
        (sd / "meta.json").write_text(json.dumps({"slot_id": slot, "title": "New video", "source": "prompt", "plan": "manual",
                                                  "engine_choice": engine}, indent=2) + "\n")
        db = DB.for_client(C.client_dir(client))
        try:
            db.set_state(slot, "BRIEFED")
        finally:
            db.close()
        start(client, slot)
    except Exception:
        _unclaim(client, slot)
        raise
    return slot


def regenerate(client: str, slot: str, prompt: str, engine: str = "html") -> None:
    """Generate New on a video waiting for review: a new script and film in the same slot. The old
    cut, its brief, film and notes move to versions/vN (the notes still teach spine/lessons)."""
    d = C.client_dir(client)
    sd = d / "posts" / slot
    if (R.status(client, slot) or {}).get("state") == "running":
        raise ValueError("this video is already being made")
    db = DB.for_client(d)
    try:
        state = db.post(slot)["state"]
    finally:
        db.close()
    if state not in ("NEEDS_APPROVAL", "NEEDS_INPUT"):   # only a video waiting for review: never an approved or live one
        raise ValueError(f"only a video waiting for review can be generated again (this one is {state})")
    engine = engine if engine in W.ENGINES else "html"
    meta = json.loads((sd / "meta.json").read_text())
    vdir = sd / "versions"
    keep = vdir / f"v{len(list(vdir.glob('v*'))) + 1 if vdir.exists() else 1}"
    keep.mkdir(parents=True)
    for f in ("video.mp4", "video-story.mp4", "cover.jpg", "caption.txt", "brief.md", "meta.json", "revise.json", "qa.md"):
        if (sd / f).exists():
            shutil.copy2(sd / f, keep / f)
    # moved, not copied: the new render would file the old cut as another version
    for f in ("video.mp4", "video-story.mp4", "cover.jpg", "brief.md", "revise.json", "vo.wav"):
        (sd / f).unlink(missing_ok=True)
    film = meta.get("film") or {}
    if film.get("engine") == "html" and (ROOT / film["dir"]).exists():
        shutil.move(str(ROOT / film["dir"]), str(keep / "film"))
    elif film.get("source", "").startswith("engines/remotion/src/films/") and (ROOT / film["source"]).exists():
        shutil.copy2(ROOT / film["source"], keep / Path(film["source"]).name)   # it stays registered until rewritten
        (sd / ".film_stale").touch()   # meta.json is rewritten by the new plan: a marker file survives it
    (sd / "prompt.txt").write_text(prompt.strip() + "\n")
    meta.update(engine_choice=engine, source="prompt", plan="manual")
    meta.pop("film", None)
    (sd / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")
    db = DB.for_client(d)
    try:
        if db.post(slot)["state"] in ("NEEDS_APPROVAL", "NEEDS_INPUT"):
            db.set_state(slot, "REJECTED", note="generate new")
        db.set_state(slot, "SCRIPTED", note=f"generate new ({engine}): {prompt[:150]}")
    finally:
        db.close()
    start(client, slot)


def start(client: str, slot: str) -> None:
    R._write_status(client, slot, state="running", step="planning", kind="new", error=None,
                    notes=(C.client_dir(client) / "posts" / slot / "prompt.txt").read_text().strip())
    log = (C.client_dir(client) / "posts" / slot / "revise.log").open("a")
    subprocess.Popen([sys.executable, "-m", "spine.manual", "produce", client, slot], cwd=ROOT,
                     stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    log.close()


def produce(client: str, slot: str) -> int:
    d = C.client_dir(client)
    sd = d / "posts" / slot
    try:
        prompt = (sd / "prompt.txt").read_text().strip()
        db = DB.for_client(d)
        try:
            at = db.post(slot)["scheduled_at"]
        finally:
            db.close()
        if not (sd / "brief.md").exists():   # plan once; a re-run goes straight to making it
            R._write_status(client, slot, step="planning")
            out = W.plans_dir(client) / f"manual-{slot}.yaml"
            W._claude(W.plan_prompt(client, "one video", [at], out).replace(
                "Write the file and nothing else.", W.instructions_block(prompt) + "\nWrite the file and nothing else."),
                W.ALLOWED_PLAN, W.PLAN_TIMEOUT)
            it = (yaml.safe_load(out.read_text()) or {})["items"][0]
            it["at"] = at
            for k in ("title", "brief", "hook", "caption"):
                if not str(it.get(k) or "").strip():
                    raise ValueError(f"the plan has no {k}")
            it["caption"] = CAP.ensure(client, it["caption"])
            choice = json.loads((sd / "meta.json").read_text()).get("engine_choice") if (sd / "meta.json").exists() else None
            db = DB.for_client(d)
            try:
                W.write_item(client, db, slot, it, 1, "manual", engine=choice or "templates")
            finally:
                db.close()
            out.unlink(missing_ok=True)   # the item lives in the slot now
        R._write_status(client, slot, step="making")
        W.produce(client, slot)
        R._write_status(client, slot, state="done", step="done")
        return 0
    except Exception as e:
        R._write_status(client, slot, state="failed", error=str(e)[-1500:], failed_at=R.now())
        print(f"manual produce failed: {e}", file=sys.stderr)
        return 1


def main(argv: list[str]) -> int:
    if len(argv) == 3 and argv[0] == "produce":
        return produce(argv[1], argv[2])
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
