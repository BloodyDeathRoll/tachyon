"""Slot picking for approved posts (strategy.md: two rotating UTC slots).

Approve in the dashboard → APPROVED with scheduled_at = the next free slot.
The publisher's queue run promotes APPROVED → QUEUED and publishes when due.
"""

from __future__ import annotations

from datetime import datetime, time, timedelta, timezone

DEFAULT_SLOTS = ["06:30", "18:30"]   # UTC, clients/<name>/strategy.md
LEAD = timedelta(minutes=30)          # never schedule closer than this to now


def _slots(grants: dict | None) -> list[time]:
    raw = (grants or {}).get("slots") or DEFAULT_SLOTS
    return sorted(time.fromisoformat(s) for s in raw)


def next_free(taken: set[str], grants: dict | None = None, at: datetime | None = None) -> str:
    """First slot ≥ at + LEAD whose ISO timestamp is not in `taken`."""
    at = (at or datetime.now(timezone.utc)) + LEAD
    day = at.date()
    for _ in range(366):
        for t in _slots(grants):
            dt = datetime.combine(day, t, tzinfo=timezone.utc)
            iso = dt.isoformat(timespec="seconds")
            if dt >= at and iso not in taken:
                return iso
        day += timedelta(days=1)
    raise RuntimeError("no free slot within a year")


ACTIVE = ("IDEA", "BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL", "NEEDS_INPUT",
          "APPROVED", "QUEUED", "PAUSED", "PUBLISHING")


def taken_slots(db, exclude: str | None = None) -> set[str]:
    """Slots held by anything not yet published (planned videos hold theirs)."""
    q = f"SELECT slot_id, scheduled_at FROM posts WHERE state IN ({','.join('?' * len(ACTIVE))}) AND scheduled_at IS NOT NULL"
    return {r["scheduled_at"] for r in db.conn.execute(q, ACTIVE).fetchall() if r["slot_id"] != exclude}


def slot_for_approval(db, row, grants: dict | None = None, at: datetime | None = None) -> str:
    """Keep a planned slot if it is still ahead and free; otherwise the next free one."""
    at = at or datetime.now(timezone.utc)
    taken = taken_slots(db, exclude=row["slot_id"])
    planned = row["scheduled_at"]
    if planned:
        dt = datetime.fromisoformat(planned.replace("Z", "+00:00"))
        dt = dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        if dt >= at + LEAD and planned not in taken:
            return planned
    return next_free(taken, grants, at)


def preview_slots(db, slots: list[str], grants: dict | None = None, at: datetime | None = None) -> dict[str, str]:
    """Where videos waiting for approval with no slot of their own would go if approved now:
    the next free slots, handed out in slot order so two of them never share one. The video page
    and the calendar both show this, so they agree."""
    at = at or datetime.now(timezone.utc)
    taken = taken_slots(db)
    out = {}
    for s in sorted(slots):
        out[s] = next_free(taken, grants, at)
        taken.add(out[s])
    return out
