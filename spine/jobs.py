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


def spawn(kind: str, client: str, slot: str | None, argv: list[str], log: Path) -> int | None:
    """Run `python -m <argv>` detached with its output appended to `log`, or enqueue it as a
    `kind` job for `client` (payload {"argv": argv}). The job id, or None when run here."""
    if R.config():
        return R.call("POST", "/api/jobs", {"kind": kind, "client": client, "slot_id": slot, "payload": {"argv": argv}})["id"]
    with log.open("a") as out:
        subprocess.Popen([sys.executable, "-m", *argv], cwd=ROOT, stdout=out, stderr=subprocess.STDOUT, start_new_session=True)
    return None
