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


def taken_slots(db) -> set[str]:
    rows = db.conn.execute(
        "SELECT scheduled_at FROM posts WHERE state IN ('APPROVED','QUEUED','PUBLISHING') AND scheduled_at IS NOT NULL"
    ).fetchall()
    return {r["scheduled_at"] for r in rows}
