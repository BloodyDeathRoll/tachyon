"""Numbers behind the Insights tab: what works, what does not, what changed.

Every video is compared on its 24 h snapshot, the one window all published videos have, so a
young video is never judged against an old one. No LLM, no writes.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from itertools import combinations
import random
from statistics import mean, median

MIN_N = 3   # PLAN §7: fewer samples than this on a side is a hint, not a result


def _ts(s: str | None) -> datetime | None:
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")) if s else None
    except ValueError:
        return None


def videos(db, tz, title) -> list[dict]:
    """One dict per published video that has a 24 h snapshot, oldest first."""
    snaps: dict[str, dict[str, dict]] = {}
    for s in db.snapshots(None):
        if s["source"] == "ig_media" and s["window"] in ("24h", "72h", "7d"):
            snaps.setdefault(s["post_id"], {})[s["window"]] = s["metrics"]
    out = []
    for r in db.posts():
        at = _ts(r["published_at"])
        m = snaps.get(r["slot_id"], {}).get("24h")
        if not at or not m:
            continue
        local = at.astimezone(tz)
        views, reach = m.get("views") or 0, m.get("reach") or 0
        out.append({
            "slot": r["slot_id"], "title": title(r), "at": local,
            "pillar": r["pillar"] or "No pillar", "engine": r["engine"] or "Unknown",
            "part": "Morning" if local.hour < 12 else "Afternoon" if local.hour < 17 else "Evening",
            "views": views, "reach": reach,
            "skip": m.get("reels_skip_rate"),
            "watch": (m.get("ig_reels_avg_watch_time") or 0) / 1000,
            "inter": m.get("total_interactions") or 0,
            "shares": m.get("shares") or 0,
            "later": snaps[r["slot_id"]].get("7d") or snaps[r["slot_id"]].get("72h"),
        })
    return sorted(out, key=lambda v: v["at"])


def certainty(vs: list[dict], key: str, name: str, groups_tested: int, lower: bool = False) -> int | None:
    """How sure we are that a group really gets more (or, with lower=True, fewer) views than the other videos, 0-99 %.

    Exact permutation test on ranks: if the group had no effect, how often would a random group of the
    same size rank this high? Times the number of groups compared, because the more we look the more luck we find.
    """
    views = [v["views"] for v in vs]
    inn = [i for i, v in enumerate(vs) if v[key] == name]
    k, n = len(inn), len(vs)
    if not 0 < k < n:
        return None
    order = sorted(views)
    rank = [(2 * order.index(x) + order.count(x) + 1) / 2 for x in views]   # average rank for ties
    obs = sum(rank[i] for i in inn)
    combos = combinations(range(n), k)
    p = sum((sum(rank[i] for i in c) <= obs) if lower else (sum(rank[i] for i in c) >= obs) for c in combos) / _choose(n, k)
    return min(99, round((1 - min(1.0, p * groups_tested)) * 100))


def _choose(n: int, k: int) -> int:
    from math import comb
    return comb(n, k)


def skip_certainty(vs: list[dict]) -> int | None:
    """Same idea for "better videos lose fewer viewers": shuffle the skip rates 20 000 times (fixed seed)."""
    xs = sorted((v for v in vs if v["skip"] is not None), key=lambda v: -v["views"])
    if len(xs) < 2 * MIN_N:
        return None
    sk = [v["skip"] for v in xs]
    diff = lambda a: mean(a[-MIN_N:]) - mean(a[:MIN_N])   # noqa: E731  weakest minus best
    obs, rng, hit = diff(sk), random.Random(0), 0
    for _ in range(20000):
        rng.shuffle(sk)
        hit += diff(sk) >= obs
    return min(99, round((1 - hit / 20000) * 100))


def groups(vs: list[dict], key: str, typical: float) -> list[dict]:
    by: dict[str, list[dict]] = {}
    for v in vs:
        by.setdefault(v[key], []).append(v)
    rows = [{"name": k, "n": len(g), "views": median(x["views"] for x in g),
             "skip": median(x["skip"] for x in g if x["skip"] is not None) if any(x["skip"] is not None for x in g) else None,
             "vs": (median(x["views"] for x in g) / typical) if typical else None}
            for k, g in by.items()]
    return sorted(rows, key=lambda r: -r["views"])


def weeks(vs: list[dict]) -> list[dict]:
    by: dict[str, list[dict]] = {}
    for v in vs:
        y, w, _ = v["at"].isocalendar()
        by.setdefault(f"{y}-W{w:02d}", []).append(v)
    return [{"week": k, "n": len(g), "views": mean(x["views"] for x in g),
             "total": sum(x["views"] for x in g)} for k, g in sorted(by.items())]


def _subject(label: str, name: str) -> str:
    if label == "How it was made":
        return "Videos posted by hand in Instagram" if name == "instagram" else f"Videos made with {name}"
    return f"{name} posts" if label == "Time of day" else f"{name} videos"


KEY = {"Topic": "pillar", "How it was made": "engine", "Time of day": "part"}


def findings(vs: list[dict], typical: float, tables: dict[str, list[dict]]) -> list[dict]:
    """Plain sentences for gaps of 1.5x or more, each with how certain we are (percent)."""
    out = []
    for label, rows in tables.items():
        for r in rows:
            if r["vs"] is None or r["n"] < 2 or r["name"] in ("No pillar", "Unknown") or not (r["vs"] >= 1.5 or r["vs"] <= 0.67):
                continue
            pct = certainty(vs, KEY[label], r["name"], len(rows), lower=r["vs"] < 1)
            out.append((abs(r["vs"] - 1) * r["n"],
                        {"text": f"{_subject(label, r['name'])}: {r['vs']:.1f}x the views of a typical video, over {r['n']} videos.", "pct": pct}))
    skips = [v for v in vs if v["skip"] is not None]
    if len(skips) >= 2 * MIN_N:
        lo, hi = sorted(skips, key=lambda v: v["views"])[:MIN_N], sorted(skips, key=lambda v: -v["views"])[:MIN_N]
        out.append((1, {"text": f"The {MIN_N} best videos lost {mean(v['skip'] for v in hi):.0f}% of viewers straight away; "
                               f"the {MIN_N} weakest lost {mean(v['skip'] for v in lo):.0f}%.", "pct": skip_certainty(vs)}))
    return [t for _, t in sorted(out, key=lambda x: -x[0])][:5]


def account_week(days: list[dict], key: str, now: datetime) -> tuple[float | None, float | None]:
    """Sum of `key` over the last 7 days and over the 7 days before."""
    def span(a: int, b: int) -> float | None:
        lo, hi = (now - timedelta(days=b)).date().isoformat(), (now - timedelta(days=a)).date().isoformat()
        xs = [d.get(key) or 0 for d in days if lo < d["date"] <= hi]
        return sum(xs) if xs else None
    return span(0, 7), span(7, 14)


# ── recommendations ───────────────────────────────────────────────────────────
PICKS = (("Publish in the morning", 2, "Morning"), ("Publish manually", 1, "instagram"), ("Show swell map", 0, "Swell map"))


def recommendations(vs: list[dict], tables: dict[str, list[dict]]) -> list[dict]:
    """The three moves we recommend, each with how the matching videos did against the typical video (middle video of the group)."""
    rows = list(tables.values())
    out = []
    for title, t, name in PICKS:
        r = next((x for x in rows[t] if x["name"] == name), None)
        if r and r["vs"] and r["vs"] > 1:   # only moves that beat the typical video
            out.append({"title": title, "vs": r["vs"], "n": r["n"],
                        "pct": certainty(vs, ("pillar", "engine", "part")[t], name, len(rows[t]))})
    return out
