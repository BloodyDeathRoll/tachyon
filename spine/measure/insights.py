"""Station 6 · Measure, Instagram part (docs/PLAN.md §3). No LLM.

    python -m spine.measure.insights <client>                 # cron hourly: every snapshot that is due
    python -m spine.measure.insights <client> <slot_id> 24h   # force one window now

Per media at 24 h / 72 h / 7 d after published_at, one row each in metric_snapshots
(UNIQUE on post, source, window, so re-runs are no-ops). Raw metrics from Meta plus
derived ratios. Account snapshot once a day (window=daily, post_id=NULL, keyed by date
in the metrics json).

Media metrics for REELS (Meta reference, verified 2026-10-24): views, reach, likes,
comments, shares, saved, reposts, total_interactions, ig_reels_avg_watch_time,
ig_reels_video_view_total_time, reels_skip_rate (in development; dropped if Meta
refuses it), profile_visits, follows.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone

from spine import clients as C
from spine.db import DB
from spine.publisher.graph import Graph, GraphError

WINDOWS = {"24h": timedelta(hours=24), "72h": timedelta(hours=72), "7d": timedelta(days=7)}
MEDIA_METRICS = ["views", "reach", "likes", "comments", "shares", "saved", "reposts",
                 "total_interactions", "ig_reels_avg_watch_time", "ig_reels_video_view_total_time"]
# Asked one by one; a refusal is recorded as None. Meta refuses profile_visits and follows for
# REELS ("not supported for this media product type", verified 2026-10-25).
OPTIONAL_METRICS = ["reels_skip_rate", "profile_visits", "follows"]
ACCOUNT_METRICS = ["views", "reach", "accounts_engaged", "total_interactions",
                   "follows_and_unfollows", "profile_links_taps"]


def derived(m: dict, duration_s: float | None) -> dict:
    reach = m.get("reach") or 0
    r = lambda k: (m.get(k) or 0) / reach if reach else None  # noqa: E731
    out = {"sends_per_reach": r("shares"), "likes_per_reach": r("likes"), "saves_per_reach": r("saved"),
           "follows_per_reach": r("follows"), "comments_per_reach": r("comments")}
    avg = m.get("ig_reels_avg_watch_time")
    if avg is not None and duration_s:
        out["hold"] = (avg / 1000.0) / duration_s   # Meta returns milliseconds
    return out


def fetch_media(graph: Graph, media_id: str) -> dict:
    metrics = dict(graph.media_insights(media_id, MEDIA_METRICS))
    for opt in OPTIONAL_METRICS:
        try:
            metrics.update(graph.media_insights(media_id, [opt]))
        except GraphError:
            metrics[opt] = None
    return metrics


def snapshot_media(client: str, slot_id: str, window: str, *, graph: Graph | None = None) -> dict | None:
    d = C.client_dir(client)
    db = DB.for_client(d)
    try:
        post = db.post(slot_id)
        if not post["ig_media_id"]:
            return None
        if any(s["window"] == window and s["source"] == "ig_media" for s in db.snapshots(slot_id)):
            return None
        graph = graph or Graph(C.token(client))
        metrics = fetch_media(graph, post["ig_media_id"])
        meta_path = d / "posts" / slot_id / "meta.json"
        duration = None
        if meta_path.exists():
            duration = json.loads(meta_path.read_text()).get("duration_s")
        metrics["_derived"] = derived(metrics, duration)
        db.add_snapshot(slot_id, "ig_media", window, metrics)
        if window == "7d" and post["state"] == "MEASURING":
            db.set_state(slot_id, "ANALYZED")
        return metrics
    finally:
        db.close()


def snapshot_account(client: str, *, graph: Graph | None = None, day: str | None = None) -> dict | None:
    d = C.client_dir(client)
    g = C.load_grants(client)
    db = DB.for_client(d)
    try:
        day = day or datetime.now(timezone.utc).date().isoformat()
        for s in db.snapshots(None):
            if s["source"] == "ig_account" and s["window"] == "daily" and s["metrics"].get("date") == day:
                return None
        graph = graph or Graph(C.token(client))
        metrics = graph.account_insights(g["ig_user_id"], ACCOUNT_METRICS)
        prof = graph.get(g["ig_user_id"], fields="followers_count,media_count")
        metrics.update({"date": day, "followers_count": prof.get("followers_count"),
                        "media_count": prof.get("media_count")})
        # UNIQUE(post_id, source, window) treats NULL post_id rows as distinct, so one row per day
        db.add_snapshot(None, "ig_account", "daily", metrics)
        return metrics
    finally:
        db.close()


def due(client: str, at: datetime | None = None) -> list[tuple[str, str]]:
    at = at or datetime.now(timezone.utc)
    d = C.client_dir(client)
    db = DB.for_client(d)
    try:
        out = []
        for p in db.posts():
            if not p["ig_media_id"] or not p["published_at"]:
                continue
            pub = datetime.fromisoformat(p["published_at"].replace("Z", "+00:00"))
            have = {s["window"] for s in db.snapshots(p["slot_id"]) if s["source"] == "ig_media"}
            for w, delta in WINDOWS.items():
                if w not in have and at >= pub + delta:
                    out.append((p["slot_id"], w))
        return out
    finally:
        db.close()


def run(client: str) -> dict:
    graph = Graph(C.token(client))
    done = {"media": [], "account": None}
    for slot_id, w in due(client):
        snapshot_media(client, slot_id, w, graph=graph)
        done["media"].append((slot_id, w))
    done["account"] = snapshot_account(client, graph=graph) is not None
    return done


def main(argv: list[str]) -> int:
    if len(argv) == 1:
        print(json.dumps(run(argv[0]), indent=1)); return 0
    if len(argv) == 3:
        print(json.dumps(snapshot_media(argv[0], argv[1], argv[2]), indent=1)); return 0
    print(__doc__); return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
