"""Background work the dashboard starts: a detached process on this PC, or a job for the
Worker's queue when a Worker is configured (docs/CLOUDFLARE-PLAN.md, "Jobs and routing").

Each spawn site keeps writing its own status file (plans/<week>.json, revise.json,
formats.json): with a Worker, spine/worker.py runs the same command on a PC that holds
the client's assets, and that PC writes the file.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from . import remote as R

ROOT = Path(__file__).resolve().parent.parent


POST_FILES = ("caption.txt", "first_comment.txt", "meta.json")   # what the Worker's publisher reads


def enqueue(kind: str, client: str, slot: str | None, payload: dict | None = None) -> int:
    """A job for the Worker's queue. The job id."""
    return R.call("POST", "/api/jobs", {"kind": kind, "client": client, "slot_id": slot, "payload": payload})["id"]


def spawn(kind: str, client: str, slot: str | None, argv: list[str], log: Path) -> int | None:
    """Run `python -m <argv>` detached with its output appended to `log`, or enqueue it as a
    `kind` job for `client` (payload {"argv": argv}). The job id, or None when run here."""
    if R.config():
        return enqueue(kind, client, slot, {"argv": argv})
    with log.open("a") as out:
        subprocess.Popen([sys.executable, "-m", *argv], cwd=ROOT, stdout=out, stderr=subprocess.STDOUT, start_new_session=True)
    return None


def push_files(client: str, slot: str) -> dict[str, str]:
    """posts/<slot>/'s text files as the Worker's publisher will read them (post_files). What was sent."""
    from . import clients as C
    from .db import RemoteDB
    sd = C.client_dir(client) / "posts" / slot
    files = {name: (sd / name).read_text() for name in POST_FILES if (sd / name).exists()}
    if files:
        RemoteDB(client).set_files(slot, files)
    return files
