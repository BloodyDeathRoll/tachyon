"""Content-item state machine (docs/PLAN.md §2).

Code enforces the transitions; Claude only asks for them. A post is a durable
record keyed by (client, slot_id); publishing is idempotent on that key.
"""

from __future__ import annotations

MAIN = [
    "IDEA", "BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL",
    "APPROVED", "QUEUED", "PUBLISHING", "PUBLISHED", "MEASURING", "ANALYZED",
]
EXCEPTIONS = ["REJECTED", "FAILED", "NEEDS_INPUT", "MANUAL_HANDOFF"]
STATES = MAIN + EXCEPTIONS

MAX_QA_ROUNDS = 2  # after this, QA sends the slot to NEEDS_INPUT

# from -> set(to). Anything not listed is illegal.
TRANSITIONS: dict[str, set[str]] = {
    "IDEA": {"BRIEFED", "REJECTED"},
    "BRIEFED": {"SCRIPTED", "REJECTED"},
    "SCRIPTED": {"RENDERED", "REJECTED"},
    "RENDERED": {"QA"},
    "QA": {"NEEDS_APPROVAL", "SCRIPTED", "NEEDS_INPUT"},   # approved / revision / 2 rounds failed
    "NEEDS_APPROVAL": {"APPROVED", "REJECTED", "MANUAL_HANDOFF"},
    "APPROVED": {"QUEUED", "REJECTED", "MANUAL_HANDOFF"},
    "QUEUED": {"PUBLISHING", "REJECTED", "MANUAL_HANDOFF"},   # posted by hand (music only the app has)
    "PUBLISHING": {"PUBLISHED", "FAILED", "MANUAL_HANDOFF"},   # media_publish unclear: maybe live, never retried
    "PUBLISHED": {"MEASURING"},
    "MEASURING": {"ANALYZED"},
    "ANALYZED": set(),
    "REJECTED": {"SCRIPTED"},            # operator's note goes back to Script
    "FAILED": {"QUEUED", "MANUAL_HANDOFF"},
    "NEEDS_INPUT": {"SCRIPTED", "REJECTED"},
    "MANUAL_HANDOFF": {"PUBLISHED", "REJECTED"},   # operator posted by hand and entered the id
}

TERMINAL = {"ANALYZED"}
WAITING_ON_HUMAN = {"NEEDS_APPROVAL", "NEEDS_INPUT", "MANUAL_HANDOFF"}


class IllegalTransition(ValueError):
    pass


def check(frm: str, to: str) -> None:
    if frm not in TRANSITIONS:
        raise IllegalTransition(f"unknown state {frm!r}")
    if to not in STATES:
        raise IllegalTransition(f"unknown state {to!r}")
    if to not in TRANSITIONS[frm]:
        raise IllegalTransition(f"{frm} -> {to} is not allowed")


def next_after_qa(verdict: str, rounds_so_far: int) -> str:
    """Map a QA verdict line to the next state. `rounds_so_far` counts revisions already sent."""
    v = verdict.strip().upper()
    if v.endswith("APPROVED"):
        return "NEEDS_APPROVAL"
    if v.endswith("NEEDS_REVISION"):
        return "SCRIPTED" if rounds_so_far < MAX_QA_ROUNDS else "NEEDS_INPUT"
    raise ValueError(f"unrecognised verdict {verdict!r}")
