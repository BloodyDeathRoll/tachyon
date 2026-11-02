"""Numbers behind the Insights tab: what works, what does not, what changed.

Every video is compared on its 24 h snapshot, the one window all published videos have, so a
young video is never judged against an old one. No LLM, no writes.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
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


def groups(vs: list[dict], key: str, typical: float) -> list[dict]:
    by: dict[str, list[dict]] = {}
    for v in vs:
        by.setdefault(v[key], []).append(v)
    rows = [{"name": k, "n": len(g), "views": mean(x["views"] for x in g),
             "skip": mean(x["skip"] for x in g if x["skip"] is not None) if any(x["skip"] is not None for x in g) else None,
             "vs": (mean(x["views"] for x in g) / typical) if typical else None}
            for k, g in by.items()]
    return sorted(rows, key=lambda r: -r["views"])


def weeks(vs: list[dict]) -> list[dict]:
    by: dict[str, list[dict]] = {}
    for v in vs:
        y, w, _ = v["at"].isocalendar()
        by.setdefault(f"{y}-W{w:02d}", []).append(v)
    return [{"week": k, "n": len(g), "views": mean(x["views"] for x in g),
             "total": sum(x["views"] for x in g)} for k, g in sorted(by.items())]


def findings(vs: list[dict], typical: float, tables: dict[str, list[dict]]) -> list[str]:
    """Plain sentences for gaps of 1.5x or more. Small samples are said so."""
    out = []
    for label, rows in tables.items():
        for r in rows:
            if r["vs"] is None or r["n"] < 2 or r["name"] in ("No pillar", "Unknown") or not (r["vs"] >= 1.5 or r["vs"] <= 0.67):
                continue
            sure = "" if r["n"] >= MIN_N else f" Only {r['n']} videos, so treat it as a hint."
            word = "more" if r["vs"] >= 1 else "fewer"
            ratio = r["vs"] if r["vs"] >= 1 else 1 / r["vs"]
            out.append((abs(r["vs"] - 1) * r["n"],
                        f"{label}: {r['name']} gets {ratio:.1f}x {word} views than a typical video "
                        f"({r['views']:.0f} vs {typical:.0f} in the first day).{sure}"))
    skips = [v for v in vs if v["skip"] is not None]
    if len(skips) >= 2 * MIN_N:
        lo, hi = sorted(skips, key=lambda v: v["views"])[:MIN_N], sorted(skips, key=lambda v: -v["views"])[:MIN_N]
        out.append((1, f"The {MIN_N} biggest videos lose {mean(v['skip'] for v in hi):.0f}% of viewers straight away; "
                       f"the {MIN_N} smallest lose {mean(v['skip'] for v in lo):.0f}%."))
    return [t for _, t in sorted(out, key=lambda x: -x[0])][:5]


def account_week(days: list[dict], key: str, now: datetime) -> tuple[float | None, float | None]:
    """Sum of `key` over the last 7 days and over the 7 days before."""
    def span(a: int, b: int) -> float | None:
        lo, hi = (now - timedelta(days=b)).date().isoformat(), (now - timedelta(days=a)).date().isoformat()
        xs = [d.get(key) or 0 for d in days if lo < d["date"] <= hi]
        return sum(xs) if xs else None
    return span(0, 7), span(7, 14)


# ── theses: "more of X lifts first-day views" ─────────────────────────────────
KEYS = {"pillar": "Pillar", "engine": "How it was made", "part": "Time of day"}
LIFT, DROP = 1.25, 0.8   # verdict bounds vs the typical video before the thesis


def recommendations(tables: dict[str, list[dict]], theses: list[dict]) -> list[dict]:
    """Up to 3 "do more of X" ideas from groups beating typical by 1.3x, minus ones already being tested."""
    taken = {t["variable"] for t in theses if t["status"] != "decided"}
    out = []
    for (label, rows), key in zip(tables.items(), KEYS):
        for r in rows:
            if r["vs"] and r["vs"] >= 1.3 and r["n"] >= 2 and r["name"] not in ("No pillar", "Unknown") \
                    and f"{key}={r['name']}" not in taken:
                out.append({"variable": f"{key}={r['name']}", "label": label, "name": r["name"], "vs": r["vs"], "n": r["n"],
                            "text": f"Make the next video: {r['name']}"})
    return sorted(out, key=lambda x: -x["vs"] * x["n"])[:3]


def thesis_result(exp: dict, vs: list[dict], typical: float) -> dict:
    """Videos published since the thesis started that match its rule, against the typical video before it."""
    key, _, val = exp["variable"].partition("=")
    start = _ts(exp["created_at"])
    if start and start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    before = [v["views"] for v in vs if start and v["at"] < start]
    base = median(before) if before else typical
    got = [v["views"] for v in vs if start and v["at"] >= start and v.get(key) == val][:exp["min_samples"]]   # the first N decide it
    avg = mean(got) if got else None
    ratio = avg / base if avg is not None and base else None
    n, need = len(got), exp["min_samples"]
    if n < need:
        verdict = None
    elif ratio is None:
        verdict = "no clear change"   # nothing to compare against (typical was 0)
    else:
        verdict = "worked" if ratio >= LIFT else "worse" if ratio <= DROP else "no clear change"
    return {"key": key, "value": val, "n": n, "need": need, "avg": avg, "base": base, "ratio": ratio, "verdict": verdict}
