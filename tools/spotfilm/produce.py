"""A week of Rosa map films, from the specs in clients/<client>/spotfilm/<week>/*.yaml to videos
waiting for approval. One spec per publishing slot, in file-name order.

    python tools/spotfilm/produce.py slots <client> <week>        # posts/<slot>/: caption, brief, meta, a BRIEFED post
    python tools/spotfilm/produce.py voice <client> <week>        # the voice-overs, one after another (one GPU)
    python tools/spotfilm/produce.py film <client> <week> <n>     # build + render + QA spec number n (run several at once)
    python tools/spotfilm/produce.py refresh <client> <slot>      # a forecast film again, on today's forecast
    python tools/spotfilm/produce.py finish <client> <slot>       # QA a slot whose video is rendered, no new render

Run it from the checkout that holds the client's data (the main checkout), with --root if this
file lives in another one. Uses the week's own machinery (spine.week, spine.revise).
"""

from __future__ import annotations

import json
import sys
import threading
from contextlib import contextmanager
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = Path.cwd()
sys.path[:0] = [str(ROOT), str(HERE)]

import yaml  # noqa: E402

import build as B  # noqa: E402
from spine import clients as C  # noqa: E402
from spine import jobs as J  # noqa: E402
from spine import remote as RM  # noqa: E402
from spine import worker as SW  # noqa: E402
from spine import revise as R  # noqa: E402
from spine import week as W  # noqa: E402
from spine.db import DB  # noqa: E402


def specs(client: str, week: str) -> list[Path]:
    return sorted((HERE.parent.parent / "clients" / client / "spotfilm" / week).glob("*.yaml"))


def slot_of(week: str, n: int) -> str:
    return f"{week.lower()}-{n:02d}"


def item(spec: dict, at: str) -> dict:
    says = " ".join(b["say"] for b in spec.get("beats") or [] if b.get("say"))
    return {"at": at, "title": spec["title"], "pillar": spec.get("pillar", "Spot spotlight"), "hook": spec["hook"],
            "brief": spec["brief"], "caption": spec["caption"], "theme": "dark", "voiceover": says}


def slots(client: str, week: str) -> None:
    times = W.slot_times(client, week)
    db = DB.for_client(C.client_dir(client))
    try:
        n_vo = 0
        for n, p in enumerate(specs(client, week), 1):
            spec = yaml.safe_load(p.read_text())
            slot = slot_of(week, n)
            n_vo = W.write_item(client, db, slot, item(spec, times[n - 1]), n, week, n_vo, engine="html")
            mp = C.client_dir(client) / "posts" / slot / "meta.json"
            meta = json.loads(mp.read_text())
            meta |= {"engine": "html (tools/spotfilm)", "spotfilm": str(p.relative_to(HERE.parent.parent)), "scheduled_at": times[n - 1]}
            mp.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")
            sync(client, slot)
            print(slot, times[n - 1], spec["type"], spec["name"])
    finally:
        db.close()


def sync(client: str, slot: str) -> None:
    """The slot as the app shows it: its text files, and its video and cover once rendered (spine.worker.upload)."""
    cfg = RM.config()
    if not cfg:
        return   # no Worker: the local dashboard reads the folder
    if (C.client_dir(client) / "posts" / slot / "video.mp4").exists():
        SW.upload(client, slot, cfg)
    else:
        J.push_files(client, slot)


def voice(client: str, week: str) -> None:
    for n, _ in enumerate(specs(client, week), 1):
        sd = C.client_dir(client) / "posts" / slot_of(week, n)
        meta = json.loads((sd / "meta.json").read_text())
        W._voice(client, slot_of(week, n), sd, meta)
        print(slot_of(week, n), "vo" if (sd / "vo.wav").exists() else "-")


@contextmanager
def shown(client: str, slot: str, notes: str):
    """The work runs as a "pc" job in the app: the video page shows it rendering, with no buttons,
    until it is done or fails (a heartbeat keeps it alive; a PC that dies stops counting as busy)."""
    cfg = RM.config()
    if not cfg:
        yield
        return
    host = SW.host_id(cfg)
    try:
        jid = RM.call("POST", "/api/jobs", {"kind": "pc", "client": client, "slot_id": slot, "host": host, "payload": {"notes": notes}}, cfg=cfg)["id"]
    except RM.RemoteError as e:   # a Worker without the kind yet: the work still runs, unannounced
        print(f"{slot}: not shown as rendering in the app ({e})", file=sys.stderr)
        yield
        return
    stop = threading.Event()
    threading.Thread(target=SW._beat, args=(jid, cfg, stop), daemon=True).start()
    try:
        yield
    except BaseException as e:
        stop.set()
        try:
            RM.call("POST", f"/api/jobs/{jid}/fail", {"host": host, "result": str(e)[-1500:] or type(e).__name__}, cfg=cfg)
        except Exception as f:   # the render's own error is the one to see
            print(f"{slot}: not marked failed in the app ({f})", file=sys.stderr)
        raise
    stop.set()
    RM.call("POST", f"/api/jobs/{jid}/done", {"host": host, "result": {"media": SW.media_of(client, slot, cfg)}}, cfg=cfg)


def film(client: str, slot: str, finish: bool = True) -> None:
    with shown(client, slot, "Rebuilding the film from its spec and rendering it on this PC."):
        _film(client, slot, finish)


def _film(client: str, slot: str, finish: bool = True) -> None:
    sd = C.client_dir(client) / "posts" / slot
    meta = json.loads((sd / "meta.json").read_text())
    vo = sd / "vo.wav"
    out = B.build(HERE.parent.parent / meta["spotfilm"], ROOT / meta["film"]["dir"], start=meta["scheduled_at"][:10],
                  vo=vo if vo.exists() else None)
    meta = json.loads((sd / "meta.json").read_text())
    meta |= {"forecast_generated_at": out["generated_at"], "imagery_notice": out["notice"]}
    (sd / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")
    verdicts = R.render(client, slot) | R.spec_verdicts(sd)
    if finish:
        db = DB.for_client(C.client_dir(client))
        try:
            st = db.post(slot)["state"]
            if st == "NEEDS_APPROVAL":   # a new film for a video waiting on approval: the old cut is set aside
                db.set_state(slot, "REJECTED", note="replaced by a new film from its spec")
            if st in ("BRIEFED", "NEEDS_INPUT", "NEEDS_APPROVAL"):   # the spec is the script; a failed QA renders again
                db.set_state(slot, "SCRIPTED")
            W._finish(slot, sd, db, verdicts)
        finally:
            db.close()
    sync(client, slot)
    print(slot, out["duration"], verdicts)


def finish(client: str, slot: str) -> None:
    """QA and state for a slot whose video.mp4 is already rendered (spine.revise.render's checks, no render)."""
    with shown(client, slot, "Checking the new cut on this PC."):
        _finish(client, slot)


def _finish(client: str, slot: str) -> None:
    import subprocess
    sd = C.client_dir(client) / "posts" / slot
    verdicts = {}
    for variant, f in (("reel", "video.mp4"), ("story", "video-story.mp4")):
        r = subprocess.run([sys.executable, "tools/safezone.py", "check", str(sd / f), "--variant", variant, "--every", "1"],
                           cwd=ROOT, capture_output=True, text=True)
        verdicts[variant] = (r.stdout.strip().splitlines() or ["VERDICT: ?"])[-1]
    verdicts |= R.spec_verdicts(sd)
    db = DB.for_client(C.client_dir(client))
    try:
        if db.post(slot)["state"] in ("BRIEFED", "NEEDS_INPUT"):
            db.set_state(slot, "SCRIPTED")
        W._finish(slot, sd, db, verdicts)
    finally:
        db.close()
    sync(client, slot)
    print(slot, verdicts)


if __name__ == "__main__":
    cmd, client, arg = sys.argv[1], sys.argv[2], sys.argv[3]
    if cmd == "slots":
        slots(client, arg)
    elif cmd == "voice":
        voice(client, arg)
    elif cmd == "film":
        film(client, slot_of(arg, int(sys.argv[4])))
    elif cmd == "finish":
        finish(client, arg)
    elif cmd == "refresh":
        film(client, arg, finish=False)
    else:
        sys.exit(__doc__)
