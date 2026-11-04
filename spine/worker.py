"""This PC as a host for the Worker's job queue (docs/CLOUDFLARE-PLAN.md, "Jobs and routing").

    python -m spine.worker login <api-url> [--token <session>]   # sign in, write ~/.tachyon/worker.json
    python -m spine.worker run                                   # register, then poll until stopped
    python -m spine.worker once                                  # one poll (cron, tests)

On start the host registers with the clients whose assets/ folder it holds. It polls
GET /api/jobs/next every 60 s; a claimed job runs here (`python -m <argv>` from the job's
payload, or the upload and spec jobs below) with a heartbeat every 60 s, then done or fail
is reported. A lapsed or revoked session stops the loop: run `login` again. The daily
`week auto` runs from here too (it replaces the crontab entry `0 7 * * * spine.week auto`).
"""

from __future__ import annotations

import hashlib
import json
import os
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
from . import remote as R

ROOT = Path(__file__).resolve().parent.parent
POLL = 60
HEARTBEAT = 60
AUTO_HOUR = 7            # local time; the crontab ran `week auto` at 07:00
TAIL = 600               # characters of a failed job's output kept in its result
ID = re.compile(r"[^\w-]+")


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


def upload(client: str, slot: str, cfg: dict) -> dict:
    """PUT the slot's video.mp4 and cover.jpg to the Worker (R2). The keys."""
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
    return out


def spec(client: str, slot: str, cfg: dict) -> dict:
    """Download the slot's video from the Worker and run spec_check on it (a browser upload no PC has seen)."""
    from .publisher import spec_check
    with tempfile.TemporaryDirectory() as tmp:
        p = Path(tmp) / "video.mp4"
        p.write_bytes(R.call("GET", f"/api/media/{client}/{slot}/video", cfg=cfg, timeout=600, parse=False))
        return {"issues": spec_check.check_file(p)}


def run_job(job: dict, cfg: dict, *, runner=subprocess.run) -> dict:
    """Run one claimed job; the result for `done`. Raises with the reason for `fail`."""
    payload = json.loads(job.get("payload") or "{}") if isinstance(job.get("payload"), str) else (job.get("payload") or {})
    client, slot = job["client"], job.get("slot_id")
    if job["kind"] == "upload":
        return {"keys": upload(client, slot, cfg)}
    if job["kind"] == "spec":
        return spec(client, slot, cfg)
    argv = payload.get("argv")
    if not isinstance(argv, list) or not argv or not all(isinstance(a, str) for a in argv):
        raise ValueError("the job has no argv")
    if argv[0].split(".")[0] != "spine":   # a job runs this repo's modules, nothing else
        raise ValueError(f"refused: {argv[0]} is not a spine module")
    log = log_dir() / f"job-{job['id']}.log"
    with log.open("a") as out:
        r = runner([sys.executable, "-m", *argv], cwd=ROOT, stdout=out, stderr=subprocess.STDOUT)
    if r.returncode != 0:
        tail = log.read_text()[-TAIL:] if log.exists() else ""
        raise RuntimeError(f"exit {r.returncode}: {tail}")
    return {"returncode": 0, "media": media_of(client, slot, cfg)}


def _beat(job_id: int, cfg: dict, stop: threading.Event) -> None:
    while not stop.wait(HEARTBEAT):
        try:
            R.call("POST", f"/api/jobs/{job_id}/heartbeat", {"host": host_id(cfg)}, cfg=cfg)
        except Exception as e:  # noqa: BLE001 — a missed beat is not a reason to stop the job
            say(f"job {job_id}: heartbeat failed: {e}")


def once(cfg: dict, *, runner=subprocess.run) -> bool:
    """One poll. Runs the job it gets, reports it. True when a job ran."""
    job = R.call("GET", f"/api/jobs/next?host={host_id(cfg)}", cfg=cfg)
    if not job:
        return False
    say(f"job {job['id']}: {job['kind']} {job['client']} {job.get('slot_id') or ''}")
    stop = threading.Event()
    t = threading.Thread(target=_beat, args=(job["id"], cfg, stop), daemon=True)
    t.start()
    try:
        result = run_job(job, cfg, runner=runner)
        action, body = "done", result
    except Exception as e:  # noqa: BLE001 — the job failed; the queue hears why
        action, body = "fail", str(e)[-TAIL - 100:]
    finally:
        stop.set()
        t.join(timeout=5)
    try:
        R.call("POST", f"/api/jobs/{job['id']}/{action}", {"host": host_id(cfg), "result": body}, cfg=cfg)
    except R.RemoteError as e:
        if e.status == 409:   # the lease was lost (another host has it): our result is dropped
            say(f"job {job['id']}: lease lost, result dropped")
        else:
            raise
    say(f"job {job['id']}: {action}")
    return True


def auto_week(cfg: dict, done: dict, now: datetime | None = None) -> list[str]:
    """`week auto` once a day per client from AUTO_HOUR local (the crontab's 07:00 entry). `done`
    remembers the day it ran per client."""
    from . import week as W
    now = now or datetime.now()
    out = []
    if now.hour < AUTO_HOUR:
        return out
    for c in host_clients():
        if done.get(c) == now.date().isoformat():
            continue
        try:
            W.auto(c)
            out.append(c)
        except Exception as e:  # noqa: BLE001 — tomorrow again; one client must not stop the others
            say(f"week auto {c}: {e}")
        done[c] = now.date().isoformat()
    return out


def run(cfg: dict, *, sleep=time.sleep) -> int:
    reg = register(cfg)
    say(f"host {host_id(cfg)} registered: clients {reg['clients']}" + (f", not a member of {reg['dropped']}" if reg.get("dropped") else ""))
    auto_done: dict = {}
    while True:
        try:
            auto_week(cfg, auto_done)
            if not once(cfg):
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
