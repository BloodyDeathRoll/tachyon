"""dashboard/data.py — one data.json for the operator dashboard, from real files only.

    python -m dashboard.data            # writes dashboard/data.json, prints a summary
    python -m dashboard.data --stdout

Sources (per client under clients/<name>/): tachyon.db (posts, metric_snapshots, experiments,
conversions, engage_log, journal), grants.yaml, posts/<slot>/{caption.txt,first_comment.txt,
meta.json,qa.md,video.mp4,cover.jpg}, calendar.yaml, engage/<date>.md, reports/*.md,
lessons.yaml, CHANGELOG.md, strategy.md (KPI table). Nothing is invented: a field with no
source is null and the page designs the empty state. Field list: dashboard/DATA.md.
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import yaml

from spine import clients as C
from spine import state as S
from spine.db import DB

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "dashboard" / "data.json"


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.isoformat(timespec="seconds")


def read(p: Path) -> str | None:
    return p.read_text() if p.exists() else None


def qa_verdict(text: str | None) -> dict:
    if not text:
        return {"spec": None, "verdict": None, "lines": []}
    spec = "PASS" if re.search(r"^PASS", text, re.M) else ("FAIL" if "FAIL" in text else None)
    m = re.search(r"VERDICT:\s*(APPROVED|NEEDS_REVISION)([^\n]*)", text)
    lines = [l[2:].strip() for l in text.splitlines() if l.startswith("- ")]
    return {"spec": spec, "verdict": m.group(1) if m else None, "verdict_note": (m.group(2).strip() if m else None),
            "lines": lines, "warns": [l for l in lines if "WARN" in l or "STALE" in l]}


def post_record(d: Path, p, snaps: list[dict]) -> dict:
    slot = d / "posts" / p["slot_id"]
    meta = json.loads(read(slot / "meta.json") or "{}")
    by_window = {s["window"]: s["metrics"] for s in snaps if s["source"] == "ig_media"}
    latest = next((by_window[w] for w in ("7d", "72h", "24h") if w in by_window), None)
    published = p["published_at"]
    age_h = None
    if published:
        age_h = (now() - datetime.fromisoformat(published.replace("Z", "+00:00"))).total_seconds() / 3600
    return {
        "slot_id": p["slot_id"], "state": p["state"], "state_group": group_of(p["state"]),
        "scheduled_at": p["scheduled_at"], "published_at": published, "age_hours": round(age_h, 1) if age_h is not None else None,
        "pillar": p["pillar"], "angle": p["angle"], "hook_formula": p["hook_formula"], "cta": p["cta"],
        "length_s": meta.get("duration_s"), "engine": p["engine"], "trial": bool(p["trial"]),
        "experiment_id": p["experiment_id"], "qa_rounds": p["qa_rounds"], "qa": qa_verdict(read(slot / "qa.md")),
        "ig_media_id": p["ig_media_id"], "permalink": p["permalink"], "note": p["note"],
        "caption": read(slot / "caption.txt"), "first_comment": read(slot / "first_comment.txt"),
        "source_asset": meta.get("source_asset"), "operator_overrides": meta.get("operator_overrides", []),
        "files": {"video": (slot / "video.mp4").exists(), "cover": (slot / "cover.jpg").exists()},
        "media_url": f"/media/{d.name}/{p['slot_id']}/video.mp4" if (slot / "video.mp4").exists() else None,
        "cover_url": f"/media/{d.name}/{p['slot_id']}/cover.jpg" if (slot / "cover.jpg").exists() else None,
        "metrics": {"by_window": by_window, "latest": latest, "windows_done": sorted(by_window, key=["24h", "72h", "7d"].index),
                    "next_window_at": next_window(published, by_window)},
        "updated_at": p["updated_at"],
    }


def next_window(published: str | None, by_window: dict) -> str | None:
    if not published:
        return None
    from spine.measure.insights import WINDOWS
    pub = datetime.fromisoformat(published.replace("Z", "+00:00"))
    for w, delta in WINDOWS.items():
        if w not in by_window:
            return iso(pub + delta)
    return None


def group_of(state: str) -> str:
    if state in S.WAITING_ON_HUMAN:
        return "needs_you"
    if state in ("IDEA", "BRIEFED", "SCRIPTED", "RENDERED", "QA"):
        return "in_production"
    if state in ("APPROVED", "QUEUED", "PUBLISHING"):
        return "scheduled"
    if state in ("PUBLISHED", "MEASURING"):
        return "live"
    if state == "ANALYZED":
        return "done"
    if state in ("FAILED",):
        return "needs_you"
    return "rejected"


def kpis_from_strategy(text: str | None) -> list[dict]:
    """The KPI table in strategy.md: | KPI | Source | Target by week 8 |"""
    out = []
    if not text:
        return out
    sec = text.split("## KPIs", 1)
    if len(sec) < 2:
        return out
    for line in sec[1].splitlines()[1:]:
        if line.startswith("## "):
            break
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) >= 3 and cells[0] not in ("KPI", "---") and not set(cells[0]) <= {"-"}:
            out.append({"kpi": cells[0], "source": cells[1], "target": cells[2]})
    return out


def engage_today(d: Path, db: DB, day: str) -> dict:
    md = read(d / "engage" / f"{day}.md")
    rows = [dict(r) for r in db.conn.execute("SELECT * FROM engage_log WHERE date=? ORDER BY planned_at, id", (day,))]
    return {"date": day, "file": md is not None, "items": rows, "done": sum(1 for r in rows if r["posted"]), "total": len(rows)}


def client_data(name: str) -> dict:
    d = C.client_dir(name)
    g = C.load_grants(name)
    db = DB.for_client(d)
    try:
        posts = [post_record(d, p, db.snapshots(p["slot_id"])) for p in db.posts()]
        account = [s for s in db.snapshots(None) if s["source"] == "ig_account"]
        account_daily = sorted(({"date": s["metrics"].get("date"), **{k: v for k, v in s["metrics"].items() if k != "date"}}
                                for s in account), key=lambda r: r["date"] or "")
        experiments = [dict(r) for r in db.conn.execute("SELECT * FROM experiments ORDER BY created_at")]
        conversions = [dict(r) for r in db.conn.execute("SELECT * FROM conversions ORDER BY occurred_at DESC LIMIT 50")]
        journal = [dict(r) for r in db.conn.execute("SELECT id, ts, action, target FROM journal ORDER BY id DESC LIMIT 30")]
        costs = [dict(r) for r in db.conn.execute("SELECT kind, SUM(amount) amount, unit FROM costs GROUP BY kind, unit")]
        today = now().date().isoformat()
        engage = engage_today(d, db, today)
        cal = yaml.safe_load(read(d / "calendar.yaml") or "") or None
        reports = sorted((p.name for p in (d / "reports").glob("*.md")), reverse=True) if (d / "reports").exists() else []
        lessons = yaml.safe_load(read(d / "lessons.yaml") or "") or None
        changelog = read(d / "CHANGELOG.md")
        strategy = read(d / "strategy.md")
        profile_handle = None
        groups = {}
        for p in posts:
            groups[p["state_group"]] = groups.get(p["state_group"], 0) + 1
        needs_you = [p for p in posts if p["state_group"] == "needs_you"]
        live = [p for p in posts if p["ig_media_id"]]
        return {
            "name": name,
            "display": name.capitalize(),
            "grants": {k: g.get(k) for k in ("page_id", "ig_user_id", "auto_approve_pillars", "auto_reply", "emergency_stop")},
            "handle": "rosasurfapp" if name == "rosa" else None,   # from grants once stored; the API knows it
            "posts": posts,
            "groups": groups,
            "needs_you": needs_you,
            "live": live,
            "account_daily": account_daily,
            "account_latest": account_daily[-1] if account_daily else None,
            "experiments": experiments,
            "conversions": conversions,
            "costs": costs,
            "engage": engage,
            "calendar": cal,
            "reports": reports,
            "lessons": lessons,
            "changelog_head": (changelog or "").strip().splitlines()[:12],
            "kpis": kpis_from_strategy(strategy),
            "journal_recent": journal,
            "listen": {"comments_waiting": None, "dms_waiting": None, "note": "listen/ webhook not deployed yet; counts appear once it is"},
            "ga4": {"sessions_by_campaign": None, "note": "ga4.py not built; sessions per UTM appear once it runs"},
        }
    finally:
        db.close()


def build() -> dict:
    clients = [client_data(n) for n in C.list_clients()]
    return {
        "generated_at": iso(now()),
        "states": {"main": S.MAIN, "exceptions": S.EXCEPTIONS, "waiting_on_human": sorted(S.WAITING_ON_HUMAN)},
        "clients": clients,
        "totals": {
            "needs_you": sum(len(c["needs_you"]) for c in clients),
            "live": sum(len(c["live"]) for c in clients),
            "scheduled": sum(c["groups"].get("scheduled", 0) for c in clients),
            "in_production": sum(c["groups"].get("in_production", 0) for c in clients),
            "emergency_stop": any(c["grants"]["emergency_stop"] for c in clients),
        },
    }


def main(argv: list[str]) -> int:
    data = build()
    text = json.dumps(data, indent=1, ensure_ascii=False, default=str)
    if "--stdout" in argv:
        print(text)
    else:
        OUT.write_text(text)
        t = data["totals"]
        print(f"wrote {OUT} · {len(data['clients'])} client(s) · needs you {t['needs_you']} · live {t['live']} · scheduled {t['scheduled']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
