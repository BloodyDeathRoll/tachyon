"""What the operator's revision notes teach: past notes for the prompts, and a score per motion style.

Every rejected cut leaves its notes in posts/<slot>/revise.json ("rounds"). A video that reached
APPROVED or later with no rounds passed as made. A note asking for a new script or a fresh start
counts as a rejection of the video's motion style.
"""

from __future__ import annotations

import json
import re

from . import clients as C
from .db import DB

PASSED = {"APPROVED", "QUEUED", "PAUSED", "PUBLISHING", "PUBLISHED"}
FRESH = re.compile(r"\b(redo|re-do|new script|start(ing)? fresh|from scratch)\b", re.I)
MAX_NOTES = 40     # most recent notes fed to the prompts
NOTE_CHARS = 400


def history(client: str) -> list[dict]:
    """Per post (oldest first): slot, motion, engine, state, the notes of each rejection."""
    d = C.client_dir(client)
    db = DB.for_client(d)
    try:
        states = {r["slot_id"]: r["state"] for r in db.posts()}
    finally:
        db.close()
    out = []
    for m in sorted((d / "posts").glob("*/meta.json")):
        sd = m.parent
        try:
            meta = json.loads(m.read_text())
            rv = json.loads((sd / "revise.json").read_text()) if (sd / "revise.json").exists() else {}
        except (OSError, ValueError):
            continue
        notes = [r["notes"].strip() for r in rv.get("rounds", []) if str(r.get("notes") or "").strip()]
        out.append({"slot": sd.name, "motion": meta.get("motion"), "engine": (meta.get("film") or {}).get("engine"),
                    "state": states.get(sd.name), "notes": notes})
    return out


def outcome(h: dict) -> str | None:
    """passed / fixed / rejected, or None while it is still undecided."""
    if any(FRESH.search(n) for n in h["notes"]):
        return "rejected"
    if h["notes"]:
        return "fixed"
    return "passed" if h["state"] in PASSED else None


def style_scores(client: str) -> dict[str, str]:
    """Motion style id → its worst outcome so far (rejected beats fixed beats passed)."""
    rank = {"passed": 0, "fixed": 1, "rejected": 2}
    out: dict[str, str] = {}
    for h in history(client):
        o = outcome(h)
        if h["motion"] and o and rank[o] >= rank.get(out.get(h["motion"], "passed"), 0):
            out[h["motion"]] = o
    return out


def notes_block(client: str) -> str:
    """The operator's most recent revision notes, verbatim, for the plan and film prompts."""
    notes = [(h["slot"], n) for h in history(client) for n in h["notes"]][-MAX_NOTES:]
    if not notes:
        return ""
    body = "\n".join(f"- ({s}) {' '.join(n.split())[:NOTE_CHARS]}" for s, n in notes)
    return f"""

The operator's notes on earlier videos, newest last. They are the house taste: never repeat a
mistake they name, and keep what they asked for in every video, not only the one they were about.
{body}
"""
