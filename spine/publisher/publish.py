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
import re
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


# a URL or bare domain in a comment (rosa.surf, www.x.com, https://…): never clickable there
URLISH = re.compile(r"https?://|www\.|\b[a-z0-9-]+\.[a-z]{2,}\b", re.I)   # broad on purpose: a false hit only blocks a comment


class PublishError(RuntimeError):
    pass


def _container_params(meta: dict, caption: str) -> dict:
    p = {"media_type": "REELS", "upload_type": "resumable", "caption": caption,
         "share_to_feed": "true" if meta.get("share_to_feed", True) else "false"}
    if meta.get("thumb_offset") is not None:
        p["thumb_offset"] = str(int(meta["thumb_offset"]))
    if meta.get("trial"):
        p["trial_params"] = json.dumps({"graduation_strategy": "SS_PERFORMANCE"})
    audio = meta.get("audio_configuration") or meta.get("audio")   # spine/tracks.py writes audio_configuration
    if audio:
        p["audio_configuration"] = json.dumps(audio)
    if meta.get("collaborators"):
        p["collaborators"] = json.dumps(meta["collaborators"])
    if meta.get("location_id"):
        p["location_id"] = str(meta["location_id"])
    return p   # never is_ai_generated: decision on AI labels (docs/PLAN.md)


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
        if URLISH.search(first_comment):
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

        except Exception as e:  # noqa: BLE001 — nothing is live yet: a FAILED state, reason kept
            _fail(db, slot, slot_id, caption, first_comment, str(e))
            raise

        # media_publish: an error answer from Meta means nothing was posted (FAILED, retried as
        # usual). No answer (timeout, dropped connection) or no id means the reel may be live
        # anyway: never retry automatically (it could post twice); hand off, and the operator
        # links it on the video page if it is up.
        j = db.journal("meta.media_publish", slot_id, {"container": cid})
        try:
            pub = graph.write(f"{g['ig_user_id']}/media_publish", creation_id=cid)
        except GraphError as e:
            if not e.ambiguous:   # a clear 4xx-style refusal: nothing was posted
                db.journal_outcome(j, {"error": str(e)})
                _fail(db, slot, slot_id, caption, first_comment, str(e))
                raise
            pub = {"error": str(e)}
        except Exception as e:  # noqa: BLE001
            pub = {"error": str(e)}
        try:
            db.journal_outcome(j, pub)
        except Exception:  # noqa: BLE001 — the journal must not decide whether a live reel counts
            pass
        media_id = pub.get("id") if isinstance(pub, dict) else None
        if not media_id:
            reason = f"media_publish gave no id ({pub.get('error') if isinstance(pub, dict) else pub}); it may be live: check Instagram and link it on the video page"
            db.set_state(slot_id, "MANUAL_HANDOFF", note=reason)   # one step: the state is the safety; the file a convenience
            try:
                _write_handoff(slot, slot_id, caption, first_comment, reason, maybe_live=True)
            except Exception:  # noqa: BLE001
                pass
            raise PublishError(reason)
        # live on Instagram from here: never FAILED (FAILED -> QUEUED would post it twice)
        try:
            info = graph.media(media_id)
        except Exception as e:  # noqa: BLE001 — permalink is cosmetic; the id is what matters
            info = {}
            _best_effort(lambda: db.journal_outcome(db.journal("meta.media.lookup", slot_id, {"media": media_id}), {"error": str(e)}))
        try:
            db.set_state(slot_id, "PUBLISHED", ig_media_id=media_id, permalink=info.get("permalink"),
                         published_at=info.get("timestamp") or now())
        except Exception as e:  # noqa: BLE001 — live but not recorded: park it where nothing retries it
            reason = f"live as {media_id} but could not be recorded ({e}); link it on the video page"
            _best_effort(lambda: db.set_state(slot_id, "MANUAL_HANDOFF", note=reason))
            raise PublishError(reason) from e
        where = info.get("permalink") or f"media id {media_id}"

        # the bio link follows the newest reel (links.py); failure is logged, never fatal
        bio_target = meta.get("bio_link_while_live")
        if bio_target and g.get("bio_link"):
            j = db.journal("bio_link.set", slot_id, {"url": bio_target, "via": g["bio_link"]["public_url"]})
            try:
                db.journal_outcome(j, links.set_target(g, bio_target, runner=link_runner))
            except Exception as e:  # noqa: BLE001 — bio link failure is logged, never fatal
                _best_effort(lambda: db.journal_outcome(j, {"error": str(e)}))
                _best_effort(lambda: (slot / "bio_link_handoff.md").write_text(f"# Bio link not updated\n\nSet {g['bio_link']['public_url']} target by hand:\n\n```\n{bio_target}\n```\n\n{e}\n"))

        comment_id = None
        if first_comment:
            j = db.journal("meta.comment.create", slot_id, {"media": media_id, "text": first_comment})
            try:
                c = graph.write(f"{media_id}/comments", message=first_comment)
                comment_id = c.get("id")
                db.journal_outcome(j, c)
            except Exception as e:  # noqa: BLE001 — the reel is live; a missing comment is never fatal
                _best_effort(lambda: db.journal_outcome(j, {"error": str(e)}))
                _best_effort(lambda: (slot / "handoff.md").write_text(
                    f"# Post the first comment by hand\n\n{where}\n\n```\n{first_comment}\n```\n"))
        db.set_state(slot_id, "MEASURING")
        return {"slot_id": slot_id, "ig_media_id": media_id, "permalink": info.get("permalink"),
                "first_comment_id": comment_id}
    finally:
        db.close()


def _best_effort(fn) -> None:
    """For bookkeeping after the reel is live: it must never turn a live post into an error."""
    try:
        fn()
    except Exception:  # noqa: BLE001
        pass


HAND_FROM = {"NEEDS_APPROVAL", "APPROVED", "QUEUED", "FAILED", "MANUAL_HANDOFF"}


def hand_candidates(client: str, *, graph: Graph | None = None, limit: int = 25) -> list[dict]:
    """Recent posts on the account that no slot is linked to yet, newest first."""
    g = C.load_grants(client)
    graph = graph or Graph(C.token(client))
    rows = graph.get(f"{g['ig_user_id']}/media", limit=limit,
                     fields="id,caption,timestamp,permalink,media_product_type,thumbnail_url,media_url").get("data", [])
    db = DB.for_client(C.client_dir(client))
    try:
        linked = {p["ig_media_id"] for p in db.posts() if p["ig_media_id"]}
    finally:
        db.close()
    return [r for r in rows if r["id"] not in linked]


def link_by_hand(client: str, slot_id: str, media_id: str, *, graph: Graph | None = None,
                 link_runner=None) -> dict:
    """The operator posted this slot from the Instagram app; attach that post so it is measured."""
    g = C.load_grants(client)
    graph = graph or Graph(C.token(client))
    link_runner = link_runner or subprocess.run
    d = C.client_dir(client)
    db = DB.for_client(d)
    try:
        if db.post(slot_id)["ig_media_id"] == media_id:   # already linked (double click): nothing to do
            return {"slot_id": slot_id, "ig_media_id": media_id, "permalink": db.post(slot_id)["permalink"]}
    finally:
        db.close()
    if not any(r["id"] == media_id for r in hand_candidates(client, graph=graph)):
        raise PublishError(f"{media_id} is not a recent, unlinked post on @{g.get('ig_username')}")
    info = graph.media(media_id)
    d = C.client_dir(client)
    db = DB.for_client(d)
    try:
        row = db.post(slot_id)
        if row["state"] not in HAND_FROM:
            raise PublishError(f"{slot_id} is {row['state']}; only unpublished slots can be linked")
        j = db.journal("meta.link_by_hand", slot_id, {"media": media_id})
        if row["state"] != "MANUAL_HANDOFF":
            db.set_state(slot_id, "MANUAL_HANDOFF", note="posted by hand in the Instagram app")
        db.set_state(slot_id, "PUBLISHED", ig_media_id=media_id, permalink=info.get("permalink"),
                     published_at=info.get("timestamp") or now())
        db.journal_outcome(j, info)
        meta = json.loads((d / "posts" / slot_id / "meta.json").read_text()) \
            if (d / "posts" / slot_id / "meta.json").exists() else {}
        bio_target = meta.get("bio_link_while_live")
        if bio_target and g.get("bio_link"):
            j = db.journal("bio_link.set", slot_id, {"url": bio_target, "via": g["bio_link"]["public_url"]})
            try:
                db.journal_outcome(j, links.set_target(g, bio_target, runner=link_runner))
            except Exception as e:  # noqa: BLE001 — bio link failure is logged, never fatal
                db.journal_outcome(j, {"error": str(e)})
        db.set_state(slot_id, "MEASURING")
        return {"slot_id": slot_id, "ig_media_id": media_id, "permalink": info.get("permalink")}
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
        _write_handoff(slot, slot_id, caption, first_comment, reason)
        db.set_state(slot_id, "MANUAL_HANDOFF", note=reason)


def _write_handoff(slot: Path, slot_id: str, caption: str, first_comment: str, reason: str,
                   maybe_live: bool = False) -> None:
    first = ("0. It may already be live: check the account on Instagram first. If it is there, use "
             "\"Link the Instagram post\" on the video page and skip the rest.\n") if maybe_live else ""
    (slot / "handoff.md").write_text(
        f"# Manual handoff · {slot_id}\n\nReason: {reason}\n\n{first}1. Upload `video.mp4` as a Reel.\n"
        f"2. Caption:\n\n```\n{caption}\n```\n\n3. First comment:\n\n```\n{first_comment}\n```\n\n"
        f"4. Link the post with \"Link the Instagram post\" on the video page.\n")


def run_queue(client: str, *, dry_run: bool = False) -> list[dict]:
    d = C.client_dir(client)
    db = DB.for_client(d)
    out = []
    try:
        # approved in the dashboard with a slot → into the queue (spine/schedule.py)
        for p in db.posts("APPROVED"):
            if p["scheduled_at"]:
                try:
                    db.set_state(p["slot_id"], "QUEUED")
                except Exception as e:  # noqa: BLE001 — one bad row must not stop the others
                    out.append({"slot_id": p["slot_id"], "error": str(e)})
        due = [p["slot_id"] for p in db.posts("QUEUED")
               if p["scheduled_at"] and p["scheduled_at"] <= datetime.now(timezone.utc).isoformat()]
    finally:
        db.close()
    for s in due:
        try:
            out.append(publish_slot(client, s, dry_run=dry_run))
        except Exception as e:  # noqa: BLE001 — one failure must not stop the queue
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
            db = DB.for_client(C.client_dir(client))
            try:
                db.post(slot_id)   # KeyError on an unknown slot
                ts = now()
                db.conn.execute("BEGIN IMMEDIATE")
                db.journal("post.scheduled_now", slot_id, {"scheduled_at": ts})
                db.conn.execute("UPDATE posts SET scheduled_at=? WHERE slot_id=?", (ts, slot_id))
                db.conn.execute("COMMIT")
            except KeyError:
                print(f"no such slot: {slot_id}"); return 1
            finally:
                if db.conn.in_transaction:
                    db.conn.execute("ROLLBACK")
                db.close()
        try:
            res = publish_slot(client, slot_id, dry_run=dry)
        except (PublishError, GraphError) as e:
            print(f"not published: {e}")
            return 1
    print(json.dumps(res, indent=1, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
