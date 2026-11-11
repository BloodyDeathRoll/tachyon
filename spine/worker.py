"""This PC as a host for the Worker's job queue (docs/CLOUDFLARE-PLAN.md, "Jobs and routing").

    python -m spine.worker login <api-url> [--token <session>]   # sign in, write ~/.tachyon/worker.json
    python -m spine.worker run                                   # register, then poll until stopped
    python -m spine.worker once                                  # one poll (cron, tests)

On start the host registers with the clients whose assets/ folder it holds. It polls
GET /api/jobs/next every 60 s; a claimed job runs here (`python -m <argv>` from the job's
payload, checked against ARGV below, or the upload and spec jobs) with a heartbeat every
60 s, then done or fail is reported. A lapsed or revoked session stops the loop (exit 3):
run `login` again. The crontab's `week auto` entry stays until the Worker's cron enqueues
it (phase 4).

Around a job: the client's brand text and the slot's text files come down from D1 first (the
Worker's pages edit them there), the status file the local dashboard would have written before
spawning is written from the payload (prompt, notes, instructions, engine), and the text files
the job wrote go back up, so the Worker's pages and publisher read the new cut's caption and meta.
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
from datetime import datetime
from pathlib import Path

from . import clients as C
from . import formats as F
from . import jobs as J
from . import manual as M
from . import remote as R
from . import revise as RV
from . import week as WK

ROOT = Path(__file__).resolve().parent.parent
POLL = 60
HEARTBEAT = 60
TAIL = 600               # characters of a failed job's output kept in its result
REPORT_TRIES = 3         # done/fail over a flaky network: a lost report would re-run the job
ID = re.compile(r"[^\w-]+")
# what a job of each kind may run: module, subcommand, then the job's client and slot (or the
# week for plan; nothing more for auto, the cron's daily `week auto`)
ARGV = {"plan": ("spine.week", "prepare"), "auto": ("spine.week", "auto"), "produce": ("spine.manual", "produce"),
        "revise": ("spine.revise", "run"), "formats": ("spine.formats", "make"), "caption": ("spine.caption", "write")}
NO_SLOT = {"plan", "auto"}
PULL_WAIT = 5   # seconds between pull tries: a blip, not a minute
MAKES_VIDEO = {"produce", "revise", "formats"}   # kinds after which the slot's video.mp4 is reported


def log_dir() -> Path:
    p = R.home() / "logs"
    p.mkdir(parents=True, exist_ok=True)
    return p


def say(msg: str) -> None:
    line = f"{datetime.now().isoformat(timespec='seconds')} {msg}"
    print(line, flush=True)
    with (log_dir() / "worker.log").open("a") as f:
        f.write(line + "\n")


def host_id(cfg: dict | None = None) -> str:
    return (cfg or {}).get("host") or (ID.sub("-", socket.gethostname().split(".")[0]).strip("-")[:64] or "pc")


def host_clients() -> list[str]:
    """The clients this PC can generate for: the folders under clients/ that hold assets/."""
    return [c for c in C.list_clients() if (C.client_dir(c) / "assets").is_dir()]


def caps() -> list[str]:
    return [cap for cap, tool in (("claude", "claude"), ("render", "ffmpeg")) if shutil.which(tool)]


def register(cfg: dict) -> dict:
    """POST /api/hosts; {"clients": [...], "dropped": [...]} (dropped: folders here that this user is no member of)."""
    return R.call("POST", "/api/hosts", {"id": host_id(cfg), "name": socket.gethostname(), "clients": host_clients(), "caps": caps()}, cfg=cfg)


def login(api: str, token: str | None = None) -> Path:
    """Save the Worker's address and a session for this PC. The token comes from <api>/login
    (sign in with Google there, copy it) unless given."""
    api = api.rstrip("/")
    if not token:
        print(f"Open {api}/login in a browser, sign in, and paste the token here.")
        token = input("token: ").strip()
    cfg = {"api": api, "token": token, "host": host_id()}
    me = R.call("GET", "/me", cfg=cfg)
    p = R.save_config(cfg)
    print(f"signed in as {me['profile']['email']}; clients: {', '.join(me['clients']) or 'none'}; host id {cfg['host']}; saved {p}")
    return p


# ── jobs ──────────────────────────────────────────────────────────────────────

def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def media_of(client: str, slot: str | None, cfg: dict) -> dict | None:
    """The slot's video on this PC, for the `media` table: where the file is, its sha and size."""
    if not slot:
        return None
    p = C.client_dir(client) / "posts" / slot / "video.mp4"
    if not p.is_file():
        return None
    return {"host": host_id(cfg), "path": str(p), "sha": sha256(p), "size": p.stat().st_size}


def pull_slot(client: str, slot: str) -> list[str]:
    """posts/<slot>/'s text files as they are online (edited in the Worker's pages) before a job
    reads them. What came down."""
    from .db import RemoteDB
    sd = C.client_dir(client) / "posts" / slot
    sd.mkdir(parents=True, exist_ok=True)
    files = {name: text for name, text in RemoteDB(client).files(slot).items() if name in J.POST_FILES}   # never a path
    for name, text in files.items():
        (sd / name).write_text(text)
    return sorted(files)


def pull(client: str, slot: str | None, sleep=time.sleep) -> None:
    """The brand text and grants, then the slot's online edits, before the job reads or sends
    them. The network or the Worker down: tried again; refused (not a member, no such client):
    the job fails before it starts, stale text makes wrong films."""
    for i in range(REPORT_TRIES):
        try:
            C.pull(client)
            if slot:
                pull_slot(client, slot)
            return
        except (OSError, R.RemoteError) as e:
            passing = isinstance(e, OSError) or e.status >= 500
            if i == REPORT_TRIES - 1 or not passing:
                raise RuntimeError(f"could not pull {client}'s files: {e}") from e
            sleep(PULL_WAIT)


def push_changed(client: str, since: float) -> dict[str, list[str]]:
    """The text files newer than the job's start (`since`), slot by slot, sent up: a plan job
    makes many slots, a produce or revise rewrites its own. A host runs one job at a time, so a
    newer file is this job's, or one pulled in the same tick of the file clock and sent back
    unchanged. {slot: names}."""
    out = {}
    for sd in sorted((C.client_dir(client) / "posts").glob("*/")):
        names = tuple(n for n in J.POST_FILES if (sd / n).exists() and (sd / n).stat().st_mtime >= since)
        if names:
            out[sd.name] = sorted(J.push_files(client, sd.name, names))
    return out


def before(kind: str, client: str, slot: str | None, argv: list[str], payload: dict) -> None:
    """The status file the local dashboard writes before it spawns, from the job's payload (the
    Worker's pages enqueue instead). The same payload again after a failure is the Worker's retry."""
    if kind == "plan":
        WK.begin(client, argv[3], payload.get("instructions"), payload.get("engine"))
    elif kind == "produce":
        prompt = str(payload.get("prompt") or "").strip()
        if not prompt:   # before stash moves the cut away for nothing
            raise ValueError("no prompt")
        st = RV.status(client, slot) or {}
        if not (st.get("state") == "failed" and st.get("kind") == "new" and st.get("notes") == prompt):
            M.stash(client, slot, prompt, str(payload.get("engine") or "html"))
        M.begin(client, slot)
    elif kind == "revise":
        notes = str(payload.get("notes") or "")
        st = RV.status(client, slot) or {}
        if st.get("state") == "failed" and st.get("notes") == notes:
            RV.begin_again(client, slot)
        else:
            RV.begin(client, slot, notes)
    elif kind == "formats" and argv[4:]:
        F.begin(client, slot, argv[4:])


def upload(client: str, slot: str, cfg: dict) -> dict:
    """PUT the slot's video.mp4 and cover.jpg to the Worker (R2), then its text files (the
    publisher reads caption, first comment and meta from D1). The keys and the file names."""
    sd = C.client_dir(client) / "posts" / slot
    out = {}
    for name, fname, ctype in (("video", "video.mp4", "video/mp4"), ("cover", "cover.jpg", "image/jpeg")):
        p = sd / fname
        if not p.is_file():
            if name == "video":
                raise FileNotFoundError(f"{p} is not here")
            continue
        out[name] = R.call("PUT", f"/api/media/{client}/{slot}/{name}", raw=p.read_bytes(), cfg=cfg,
                           headers={"Content-Type": ctype}, timeout=600)["key"]
    out["files"] = sorted(J.push_files(client, slot))
    return out


def spec(client: str, slot: str, cfg: dict) -> dict:
    """Download the slot's video from the Worker and run spec_check on it (a browser upload no PC has seen)."""
    from .publisher import spec_check
    with tempfile.TemporaryDirectory() as tmp:
        p = Path(tmp) / "video.mp4"
        p.write_bytes(R.call("GET", f"/api/media/{client}/{slot}/video", cfg=cfg, timeout=600, parse=False))
        return {"issues": spec_check.check_file(p)}


def _refused(job: dict, argv: list[str], why: str):
    """A job that never runs writes no status of its own: mark the one the dashboard set to
    "running" as failed, as a failed start does, then raise for the queue."""
    from . import formats, revise, week
    client, slot, kind = job["client"], job.get("slot_id"), job["kind"]
    if slot is not None and not re.fullmatch(r"[\w-]{1,64}", slot):   # it names a folder: never a path
        slot = None
    if not re.fullmatch(r"[\w-]{1,64}", str(client)):   # the Worker checks it too; nothing to mark then
        raise ValueError(why)
    try:
        if kind == "plan" and len(argv) > 3 and re.fullmatch(r"\d{4}-W\d{2}", argv[3]):
            week._status(client, argv[3], state="failed", error=why)
        elif kind in ("produce", "revise") and slot:
            revise._write_status(client, slot, state="failed", error=why, failed_at=revise.now())
        elif kind == "formats" and slot:
            formats._status(client, slot, state="failed", error=why)
        elif kind == "caption" and slot:   # the page shows "Writing…" while this marker exists
            (C.client_dir(client) / "posts" / slot / "caption.writing").unlink(missing_ok=True)
    except Exception as e:  # noqa: BLE001 — the queue still hears the refusal
        say(f"job {job['id']}: could not mark the refusal: {e}")
    raise ValueError(why)


def run_job(job: dict, cfg: dict, *, runner=subprocess.run, sleep=time.sleep) -> dict:
    """Run one claimed job; the result for `done`. Raises with the reason for `fail`."""
    payload = json.loads(job.get("payload") or "{}") if isinstance(job.get("payload"), str) else (job.get("payload") or {})
    client, slot = job["client"], job.get("slot_id")
    if job["kind"] == "spec":
        return spec(client, slot, cfg)   # reads only the file in R2: no text files needed
    if job["kind"] == "upload":
        pull(client, slot, sleep)   # the operator's online edits, so the files sent up are the newest
        return {"keys": upload(client, slot, cfg)}
    argv = payload.get("argv")
    if not isinstance(argv, list) or not all(isinstance(a, str) for a in argv):
        raise ValueError("the job has no argv")
    # a job runs the one command its kind allows, for its own client and slot: a member of one
    # client must not run work for another, nor the publisher
    want = ARGV.get(job["kind"])
    need = 3 if job["kind"] == "auto" else 4
    if not want or tuple(argv[:2]) != want or len(argv) < need or argv[2] != client:
        _refused(job, argv, f"refused: a {job['kind']} job for {client} cannot run {' '.join(argv)}")
    if job["kind"] not in NO_SLOT and argv[3] != slot:
        _refused(job, argv, f"refused: the job is for slot {slot}, the command for {argv[3]}")
    pull(client, slot, sleep)
    log = log_dir() / f"job-{job['id']}.log"
    log.touch()   # the job's start on the file clock (coarser than time.time()): what push_changed compares against
    since = log.stat().st_mtime   # before `before`: what it writes (the stashed meta) goes up too
    before(job["kind"], client, slot, argv, payload)
    with log.open("a") as out:
        r = runner([sys.executable, "-m", *argv], cwd=ROOT, stdout=out, stderr=subprocess.STDOUT)
    if r.returncode != 0:
        tail = log.read_text()[-TAIL:] if log.exists() else ""
        raise RuntimeError(f"exit {r.returncode}: {tail}")
    return {"returncode": 0, "media": media_of(client, slot, cfg) if job["kind"] in MAKES_VIDEO else None,
            "files": push_changed(client, since)}


def _beat(job_id: int, cfg: dict, stop: threading.Event) -> None:
    while not stop.wait(HEARTBEAT):
        try:
            R.call("POST", f"/api/jobs/{job_id}/heartbeat", {"host": host_id(cfg)}, cfg=cfg)
        except R.RemoteError as e:
            if e.status == 401:   # revoked: beating again cannot help; the report says so when the job ends
                say(f"job {job_id}: session revoked, heartbeats stopped")
                return
            say(f"job {job_id}: heartbeat failed: {e}")
        except Exception as e:  # noqa: BLE001 — a missed beat is not a reason to stop the job
            say(f"job {job_id}: heartbeat failed: {e}")


def once(cfg: dict, *, runner=subprocess.run, sleep=time.sleep) -> bool:
    """One poll. Runs the job it gets, reports it. True when a job ran."""
    job = R.call("GET", f"/api/jobs/next?host={host_id(cfg)}", cfg=cfg)
    if not job:
        return False
    say(f"job {job['id']}: {job['kind']} {job['client']} {job.get('slot_id') or ''}")
    stop = threading.Event()
    t = threading.Thread(target=_beat, args=(job["id"], cfg, stop), daemon=True)
    t.start()
    try:
        result = run_job(job, cfg, runner=runner, sleep=sleep)
        action, body = "done", result
    except Exception as e:  # noqa: BLE001 — the job failed; the queue hears why
        action, body = "fail", str(e)[-TAIL - 100:]
    finally:
        stop.set()
        t.join(timeout=5)
    for i in range(REPORT_TRIES):
        try:
            R.call("POST", f"/api/jobs/{job['id']}/{action}", {"host": host_id(cfg), "result": body}, cfg=cfg)
            break
        except R.RemoteError as e:
            if e.status >= 500 and i < REPORT_TRIES - 1:   # the Worker's own trouble: worth another try
                say(f"job {job['id']}: report failed ({e}), trying again")
                sleep(POLL)
                continue
            if e.status != 409:
                raise
            say(f"job {job['id']}: lease lost, result dropped")   # another host has it now
            break
        except OSError as e:   # the network: a lost report would re-run the job after the lease
            if i == REPORT_TRIES - 1:
                raise
            say(f"job {job['id']}: report failed ({e}), trying again")
            sleep(POLL)
    say(f"job {job['id']}: {action}")
    return True


def run(cfg: dict, *, sleep=time.sleep) -> int:
    reg = register(cfg)
    say(f"host {host_id(cfg)} registered: clients {reg['clients']}" + (f", not a member of {reg['dropped']}" if reg.get("dropped") else ""))
    while True:
        try:
            if not once(cfg, sleep=sleep):
                sleep(POLL)
        except R.RemoteError as e:
            if e.status == 401:
                say("session expired or revoked: run `python -m spine.worker login <api>` again")
                return 3
            say(f"worker error: {e}")
            sleep(POLL)
        except OSError as e:   # the network: try again next minute
            say(f"network: {e}")
            sleep(POLL)


def main(argv: list[str]) -> int:
    if argv[:1] == ["login"] and len(argv) in (2, 4):
        login(argv[1], argv[3] if len(argv) == 4 and argv[2] == "--token" else None)
        return 0
    cfg = R.config()
    if not cfg:
        print("no Worker configured: python -m spine.worker login <api-url>"); return 2
    if argv == ["run"]:
        return run(cfg)
    if argv == ["once"]:
        register(cfg)
        once(cfg)
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
