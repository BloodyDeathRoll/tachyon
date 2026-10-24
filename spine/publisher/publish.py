"""Station 4 · Publish (docs/PLAN.md §3). Idempotent on (client, slot_id).

    python -m spine.publisher.publish <client> <slot_id> [--now] [--dry-run]
    python -m spine.publisher.publish <client> --queue [--dry-run]    # cron every 10 min

Flow for one slot (state QUEUED, scheduled_at reached or --now):
  1. emergency_stop off, publishing quota < 100, spec_check passes again.
  2. QUEUED -> PUBLISHING (refused by the DB if an ig_media_id already exists).
  3. Create a REELS container with upload_type=resumable, upload posts/<slot>/video.mp4.
     No video_url, no Blob bucket needed (deviation from PLAN §3 noted there).
  4. Poll status_code once a minute, up to 5 min. FINISHED -> media_publish.
  5. PUBLISHING -> PUBLISHED with ig_media_id, permalink, published_at.
  6. If posts/<slot>/first_comment.txt exists, POST /{media}/comments with it. It must not
     contain a URL: Instagram comments are not clickable (operator 2026-10-24); refused if it does.
  7. PUBLISHED -> MEASURING. Any failure -> FAILED with the reason; a second failure
     -> MANUAL_HANDOFF with a ready-to-post package in posts/<slot>/handoff.md.

Parameters read from meta.json: trial (bool), share_to_feed (default true), thumb_offset
(ms), audio (dict with audio_id/audio_volume/video_volume when a Sound Collection track
is used), collaborators (list). `is_ai_generated` is never sent (decision 7).
"""

from __future__ import annotations

import json
import sys
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

from spine import clients as C
from spine.db import DB, now
from spine.publisher.graph import Graph, GraphError
from spine.publisher import spec_check, links

POLL_SECONDS = 60
POLL_MAX = 5
QUOTA = 100


class PublishError(RuntimeError):
    pass


def _container_params(meta: dict, caption: str) -> dict:
    p = {"media_type": "REELS", "upload_type": "resumable", "caption": caption,
         "share_to_feed": "true" if meta.get("share_to_feed", True) else "false"}
    if meta.get("thumb_offset") is not None:
        p["thumb_offset"] = str(int(meta["thumb_offset"]))
    if meta.get("trial"):
        p["trial_params"] = json.dumps({"graduation_strategy": "SS_PERFORMANCE"})
    if meta.get("audio"):
        p["audio_configuration"] = json.dumps(meta["audio"])
    if meta.get("collaborators"):
        p["collaborators"] = json.dumps(meta["collaborators"])
    if meta.get("location_id"):
        p["location_id"] = str(meta["location_id"])
    assert "is_ai_generated" not in p
    return p


def publish_slot(client: str, slot_id: str, *, graph: Graph | None = None, dry_run: bool = False,
                 sleep=time.sleep, link_runner=None) -> dict:
    link_runner = link_runner or subprocess.run
    d = C.client_dir(client)
    g = C.load_grants(client)
    slot = d / "posts" / slot_id
    db = DB.for_client(d)
    try:
        post = db.post(slot_id)
        if post["state"] != "QUEUED":
            raise PublishError(f"{slot_id} is {post['state']}, not QUEUED")
        if g["emergency_stop"]:
            raise PublishError("emergency_stop is on")
        caption = (slot / "caption.txt").read_text().strip()
        meta = json.loads((slot / "meta.json").read_text()) if (slot / "meta.json").exists() else {}
        first_comment = (slot / "first_comment.txt").read_text().strip() if (slot / "first_comment.txt").exists() else ""
        if "http://" in first_comment or "https://" in first_comment or "rosa.surf/?" in first_comment:
            raise PublishError("first_comment.txt contains a URL; comments are not clickable (decision 13)")
        video = slot / "video.mp4"
        issues = spec_check.check_file(video) + spec_check.check_provenance(client, meta.get("source_asset"))
        if issues:
            raise PublishError("spec_check failed at publish time: " + "; ".join(issues))
        params = _container_params(meta, caption)
        if dry_run:
            return {"dry_run": True, "slot_id": slot_id, "container_params": {k: v for k, v in params.items()},
                    "video_bytes": video.stat().st_size, "first_comment": first_comment}

        graph = graph or Graph(C.token(client))
        used = graph.publishing_quota(g["ig_user_id"])
        if used >= QUOTA:
            raise PublishError(f"publishing quota used {used}/{QUOTA}")

        db.set_state(slot_id, "PUBLISHING")
        try:
            j = db.journal("meta.container.create", slot_id, params | {"caption": caption[:80] + "…"})
            container = graph.write(f"{g['ig_user_id']}/media", **params)
            db.journal_outcome(j, container)
            cid = container["id"]

            j = db.journal("meta.container.upload", slot_id, {"container": cid, "bytes": video.stat().st_size})
            up = graph.upload(cid, video.read_bytes())
            db.journal_outcome(j, up)

            status = None
            for _ in range(POLL_MAX):
                st = graph.container_status(cid)
                status = st.get("status_code")
                if status == "FINISHED":
                    break
                if status in ("ERROR", "EXPIRED"):
                    raise PublishError(f"container {cid} {status}: {st.get('status')}")
                sleep(POLL_SECONDS)
            if status != "FINISHED":
                raise PublishError(f"container {cid} still {status} after {POLL_MAX} min")

            j = db.journal("meta.media_publish", slot_id, {"container": cid})
            pub = graph.write(f"{g['ig_user_id']}/media_publish", creation_id=cid)
            db.journal_outcome(j, pub)
            media_id = pub["id"]
            info = graph.media(media_id)
            db.set_state(slot_id, "PUBLISHED", ig_media_id=media_id, permalink=info.get("permalink"),
                         published_at=info.get("timestamp") or now())
        except Exception as e:  # noqa: BLE001 — any failure is a FAILED state, reason kept
            _fail(db, slot, slot_id, caption, first_comment, str(e))
            raise

        # the bio link follows the newest reel (links.py); failure is logged, never fatal
        bio_target = meta.get("bio_link_while_live")
        if bio_target and g.get("bio_link"):
            j = db.journal("bio_link.set", slot_id, {"url": bio_target, "via": g["bio_link"]["public_url"]})
            try:
                db.journal_outcome(j, links.set_target(g, bio_target, runner=link_runner))
            except links.LinkError as e:
                db.journal_outcome(j, {"error": str(e)})
                (slot / "handoff.md").write_text(f"# Bio link not updated\n\nSet {g['bio_link']['public_url']} target by hand:\n\n```\n{bio_target}\n```\n\n{e}\n")

        comment_id = None
        if first_comment:
            j = db.journal("meta.comment.create", slot_id, {"media": media_id, "text": first_comment})
            try:
                c = graph.write(f"{media_id}/comments", message=first_comment)
                comment_id = c.get("id")
                db.journal_outcome(j, c)
            except GraphError as e:
                db.journal_outcome(j, {"error": str(e)})
                (slot / "handoff.md").write_text(f"# Post the first comment by hand\n\n{info.get('permalink')}\n\n```\n{first_comment}\n```\n")
        db.set_state(slot_id, "MEASURING")
        return {"slot_id": slot_id, "ig_media_id": media_id, "permalink": info.get("permalink"),
                "first_comment_id": comment_id}
    finally:
        db.close()


def _fail(db: DB, slot: Path, slot_id: str, caption: str, first_comment: str, reason: str) -> None:
    post = db.post(slot_id)
    if post["state"] != "PUBLISHING":
        return
    db.set_state(slot_id, "FAILED", note=reason)
    prior = sum(1 for r in db.conn.execute(
        "SELECT 1 FROM journal WHERE target=? AND action='post.state' AND intent LIKE '%\"to\": \"FAILED\"%'", (slot_id,)))
    if prior >= 2:
        (slot / "handoff.md").write_text(
            f"# Manual handoff · {slot_id}\n\nReason: {reason}\n\n1. Upload `video.mp4` as a Reel.\n"
            f"2. Caption:\n\n```\n{caption}\n```\n\n3. First comment:\n\n```\n{first_comment}\n```\n\n"
            f"4. Enter the media id in the review page.\n")
        db.set_state(slot_id, "MANUAL_HANDOFF", note=reason)


def run_queue(client: str, *, dry_run: bool = False) -> list[dict]:
    d = C.client_dir(client)
    db = DB.for_client(d)
    due = [p["slot_id"] for p in db.posts("QUEUED")
           if p["scheduled_at"] and p["scheduled_at"] <= datetime.now(timezone.utc).isoformat()]
    db.close()
    out = []
    for s in due:
        try:
            out.append(publish_slot(client, s, dry_run=dry_run))
        except (PublishError, GraphError) as e:
            out.append({"slot_id": s, "error": str(e)})
    return out


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__); return 2
    client = argv[0]
    dry = "--dry-run" in argv
    if "--queue" in argv:
        res = run_queue(client, dry_run=dry)
    else:
        slot_id = argv[1]
        if "--now" in argv:
            d = C.client_dir(client); db = DB.for_client(d)
            db.conn.execute("UPDATE posts SET scheduled_at=? WHERE slot_id=?", (now(), slot_id)); db.conn.commit(); db.close()
        try:
            res = publish_slot(client, slot_id, dry_run=dry)
        except (PublishError, GraphError) as e:
            print(f"not published: {e}")
            return 1
    print(json.dumps(res, indent=1, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
