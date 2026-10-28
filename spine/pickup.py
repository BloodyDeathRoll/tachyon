"""Reels posted straight to Instagram (not made or published here) join the dashboard.

    python -m spine.pickup <client>      # also runs hourly with the insights cron, and from the
                                         # dashboard's "Look for manual posts"

For each recent Reel on the account that no slot is linked to:
  - its caption matches a slot that is not live yet (posted by hand from a video made here):
    that slot is linked to it (the "Posted it by hand?" flow, done for the operator);
  - otherwise a new slot is made for it: the video, cover and caption are downloaded, and it is
    live and measured like any other (meta.json source "instagram", plan "pickup").
Runs under the publish lock, so a reel the publisher is posting right now is never taken.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import urllib.request
from datetime import datetime

from . import clients as C
from .db import DB
from .publisher import publish as P
from .publisher.graph import Graph

FIELDS = "id,caption,timestamp,permalink,media_product_type,media_url,thumbnail_url"
MAX_BYTES = 300 * 1024 * 1024


def _key(text: str | None) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())[:80]


def _get(url: str, opener=None) -> bytes:
    with (opener or urllib.request.urlopen)(url, timeout=120) as r:
        data = r.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError("file too large")
    return data


def _title(caption: str) -> str:
    first = (caption or "").strip().split("\n")[0]
    words = re.sub(r"[^\w\s',?!.-]", "", first).split()
    return " ".join(words[:5])[:40] or "Posted on Instagram"


def _new_slot(client: str, r: dict, graph: Graph, opener=None) -> str:
    from . import manual as M
    d = C.client_dir(client)
    at = datetime.strptime(r["timestamp"], "%Y-%m-%dT%H:%M:%S%z").isoformat(timespec="seconds")
    slot = M.new_slot(client, at)
    sd = d / "posts" / slot
    db = DB.for_client(d)
    try:
        db.create_post(slot, client, scheduled_at=at, angle=_title(r.get("caption")), engine="instagram")
        try:
            (sd / "video.mp4").write_bytes(_get(r["media_url"], opener))
            if r.get("thumbnail_url"):
                (sd / "cover.jpg").write_bytes(_get(r["thumbnail_url"], opener))
            caption = (r.get("caption") or "").strip()
            (sd / "caption.txt").write_text(caption + "\n" if caption else "")
            dur = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                                  str(sd / "video.mp4")], capture_output=True, text=True).stdout.strip()
            meta = {"slot_id": slot, "title": _title(caption), "source": "instagram", "plan": "pickup",
                    "story": False, "permalink": r.get("permalink"),
                    "duration_s": round(float(dur), 2) if dur else None}
            (sd / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")
            for st in ("BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL"):
                db.set_state(slot, st)
            db.set_state(slot, "MANUAL_HANDOFF", note="posted straight to Instagram, picked up")
            db.set_state(slot, "PUBLISHED", ig_media_id=r["id"], permalink=r.get("permalink"), published_at=r["timestamp"])
            db.set_state(slot, "MEASURING")
        except Exception:
            if db.post(slot)["state"] not in ("PUBLISHED", "MEASURING"):   # nothing half-made stays behind
                db.delete_post(slot)
                shutil.rmtree(sd, ignore_errors=True)
            raise
    finally:
        db.close()
    return slot


def pickup(client: str, *, graph: Graph | None = None, opener=None, link_runner=None) -> list[dict]:
    """Link or import every unlinked recent Reel. Returns what was done, one entry per reel."""
    g = C.load_grants(client)
    graph = graph or Graph(C.token(client))
    out = []
    with P.publish_lock(client):
        rows = graph.get(f"{g['ig_user_id']}/media", limit=25, fields=FIELDS).get("data", [])
        db = DB.for_client(C.client_dir(client))
        try:
            posts = db.posts()
        finally:
            db.close()
        linked = {p["ig_media_id"] for p in posts if p["ig_media_id"]}
        waiting = {}
        d = C.client_dir(client)
        for p in posts:
            if p["state"] in P.HAND_FROM and (d / "posts" / p["slot_id"] / "caption.txt").exists():
                k = _key((d / "posts" / p["slot_id"] / "caption.txt").read_text())
                if k:
                    waiting.setdefault(k, p["slot_id"])
        for r in reversed(rows):   # oldest first: slot numbers follow posting order
            if r["id"] in linked or r.get("media_product_type") != "REELS":
                continue
            try:
                slot = waiting.pop(_key(r.get("caption")), None)
                if slot:
                    P.link_by_hand(client, slot, r["id"], graph=graph, link_runner=link_runner)
                    out.append({"media": r["id"], "slot_id": slot, "linked": True})
                else:
                    out.append({"media": r["id"], "slot_id": _new_slot(client, r, graph, opener), "linked": False})
            except Exception as e:  # noqa: BLE001 — one bad reel must not stop the others
                out.append({"media": r["id"], "error": str(e)[:300]})
    return out


def main(argv: list[str]) -> int:
    if len(argv) == 1:
        print(json.dumps(pickup(argv[0]), indent=1))
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
