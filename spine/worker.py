"""This PC as a host for the Worker's job queue (docs/CLOUDFLARE-PLAN.md, "Jobs and routing").

    python -m spine.worker login <api-url> [--token <session>]   # sign in, write ~/.tachyon/worker.json
    python -m spine.worker run                                   # register, then poll until stopped
    python -m spine.worker once                                  # one poll (cron, tests)

On start the host registers with the clients whose assets/ folder it holds. It polls
GET /api/jobs/next every 60 s; a claimed job runs here (`python -m <argv>` from the job's
payload, checked against ARGV below, or the upload and spec jobs) with a heartbeat every
60 s, then done or fail is reported. A lapsed or revoked session stops the loop (exit 3):
run `login` again. The crontab's `week auto` entry stays until the Worker's cron enqueues
it (phase 4).

Around a job: the client's brand text and the slot's text files come down from D1 first (the
Worker's pages edit them there), the status file the local dashboard would have written before
spawning is written from the payload (prompt, notes, instructions, engine), and the text files
the job wrote go back up, so the Worker's pages and publisher read the new cut's caption and meta.
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
from datetime import datetime
from pathlib import Path

from . import clients as C
from . import formats as F
from . import jobs as J
from . import manual as M
from . import remote as R
from . import revise as RV
from . import week as WK

ROOT = Path(__file__).resolve().parent.parent
POLL = 60
HEARTBEAT = 60
TAIL = 600               # characters of a failed job's output kept in its result
REPORT_TRIES = 3         # done/fail over a flaky network: a lost report would re-run the job
ID = re.compile(r"[^\w-]+")
# what a job of each kind may run: module, subcommand, then the job's client and slot (or the
# week for plan; nothing more for auto, the cron's daily `week auto`)
ARGV = {"plan": ("spine.week", "prepare"), "auto": ("spine.week", "auto"), "produce": ("spine.manual", "produce"),
        "revise": ("spine.revise", "run"), "formats": ("spine.formats", "make"), "caption": ("spine.caption", "write")}
NO_SLOT = {"plan", "auto"}
PULL_WAIT = 5   # seconds between pull tries: a blip, not a minute
MAKES_VIDEO = {"produce", "revise", "formats"}   # kinds after which the slot's video.mp4 is reported


def log_dir() -> Path:
    p = R.home() / "logs"
    p.mkdir(parents=True, exist_ok=True)
    return p


def say(msg: str) -> None:
    line = f"{datetime.now().isoformat(timespec='seconds')} {msg}"
    print(line, flush=True)
    with (log_dir() / "worker.log").open("a") as f:
        f.write(line + "\n")


def host_id(cfg: dict | None = None) -> str:
    return (cfg or {}).get("host") or (ID.sub("-", socket.gethostname().split(".")[0]).strip("-")[:64] or "pc")


def host_clients() -> list[str]:
    """The clients this PC can generate for: the folders under clients/ that hold assets/."""
    return [c for c in C.list_clients() if (C.client_dir(c) / "assets").is_dir()]


def caps() -> list[str]:
    return [cap for cap, tool in (("claude", "claude"), ("render", "ffmpeg")) if shutil.which(tool)]


def register(cfg: dict) -> dict:
    """POST /api/hosts; {"clients": [...], "dropped": [...]} (dropped: folders here that this user is no member of)."""
    return R.call("POST", "/api/hosts", {"id": host_id(cfg), "name": socket.gethostname(), "clients": host_clients(), "caps": caps()}, cfg=cfg)


def login(api: str, token: str | None = None) -> Path:
    """Save the Worker's address and a session for this PC. The token comes from <api>/login
    (sign in with Google there, copy it) unless given."""
    api = api.rstrip("/")
    if not token:
        print(f"Open {api}/login in a browser, sign in, and paste the token here.")
        token = input("token: ").strip()
    cfg = {"api": api, "token": token, "host": host_id()}
    me = R.call("GET", "/me", cfg=cfg)
    p = R.save_config(cfg)
    print(f"signed in as {me['profile']['email']}; clients: {', '.join(me['clients']) or 'none'}; host id {cfg['host']}; saved {p}")
    return p


# ── jobs ──────────────────────────────────────────────────────────────────────

def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def media_of(client: str, slot: str | None, cfg: dict) -> dict | None:
    """The slot's video on this PC, for the `media` table: where the file is, its sha and size."""
    if not slot:
        return None
    p = C.client_dir(client) / "posts" / slot / "video.mp4"
    if not p.is_file():
        return None
    return {"host": host_id(cfg), "path": str(p), "sha": sha256(p), "size": p.stat().st_size}


def pull_slot(client: str, slot: str) -> list[str]:
    """posts/<slot>/'s text files as they are online (edited in the Worker's pages) before a job
    reads them. What came down."""
    from .db import RemoteDB
    sd = C.client_dir(client) / "posts" / slot
    sd.mkdir(parents=True, exist_ok=True)
    files = {name: text for name, text in RemoteDB(client).files(slot).items() if name in J.POST_FILES}   # never a path
    for name, text in files.items():
        (sd / name).write_text(text)
    return sorted(files)


def pull(client: str, slot: str | None, sleep=time.sleep) -> None:
    """The brand text and grants, then the slot's online edits, before the job reads or sends
    them. The network or the Worker down: tried again; refused (not a member, no such client):
    the job fails before it starts, stale text makes wrong films."""
    for i in range(REPORT_TRIES):
        try:
            C.pull(client)
            if slot:
                pull_slot(client, slot)
            return
        except (OSError, R.RemoteError) as e:
            passing = isinstance(e, OSError) or e.status >= 500
            if i == REPORT_TRIES - 1 or not passing:
                raise RuntimeError(f"could not pull {client}'s files: {e}") from e
            sleep(PULL_WAIT)


def push_changed(client: str, since: float) -> dict[str, list[str]]:
    """The text files newer than the job's start (`since`), slot by slot, sent up: a plan job
    makes many slots, a produce or revise rewrites its own. A host runs one job at a time, so a
    newer file is this job's, or one pulled in the same tick of the file clock and sent back
    unchanged. {slot: names}."""
    out = {}
    for sd in sorted((C.client_dir(client) / "posts").glob("*/")):
        names = tuple(n for n in J.POST_FILES if (sd / n).exists() and (sd / n).stat().st_mtime >= since)
        if names:
            out[sd.name] = sorted(J.push_files(client, sd.name, names))
    return out


def before(kind: str, client: str, slot: str | None, argv: list[str], payload: dict) -> None:
    """The status file the local dashboard writes before it spawns, from the job's payload (the
    Worker's pages enqueue instead). The same payload again after a failure is the Worker's retry."""
    if kind == "plan":
        WK.begin(client, argv[3], payload.get("instructions"), payload.get("engine"))
    elif kind == "produce":
        prompt = str(payload.get("prompt") or "").strip()
        if not prompt:   # before stash moves the cut away for nothing
            raise ValueError("no prompt")
        st = RV.status(client, slot) or {}
        if not (st.get("state") == "failed" and st.get("kind") == "new" and st.get("notes") == prompt):
            M.stash(client, slot, prompt, str(payload.get("engine") or "html"))
        M.begin(client, slot)
    elif kind == "revise":
        notes = str(payload.get("notes") or "")
        st = RV.status(client, slot) or {}
        if st.get("state") == "failed" and st.get("notes") == notes:
            RV.begin_again(client, slot)
        else:
            RV.begin(client, slot, notes)
    elif kind == "formats" and argv[4:]:
        F.begin(client, slot, argv[4:])


def upload(client: str, slot: str, cfg: dict) -> dict:
    """PUT the slot's video.mp4 and cover.jpg to the Worker (R2), then its text files (the
    publisher reads caption, first comment and meta from D1). The keys and the file names."""
    sd = C.client_dir(client) / "posts" / slot
    out = {}
    for name, fname, ctype in (("video", "video.mp4", "video/mp4"), ("cover", "cover.jpg", "image/jpeg")):
        p = sd / fname
        if not p.is_file():
            if name == "video":
                raise FileNotFoundError(f"{p} is not here")
            continue
        headers = {"Content-Type": ctype, **({"X-Sha256": _sha(p)} if name == "video" else {})}
        out[name] = R.call("PUT", f"/api/media/{client}/{slot}/{name}", raw=p.read_bytes(), cfg=cfg,
                           headers=headers, timeout=600)["key"]
    out["files"] = sorted(J.push_files(client, slot))
    return out


OUT = ("PUBLISHING", "PUBLISHED", "MEASURING", "ANALYZED", "REMOVED", "MANUAL_HANDOFF")   # on Instagram, or going
MUSIC_MAX = 25 * 1024 * 1024   # the Worker's limit for one track (deploy/worker/src/index.ts)
SETTLE = 120   # seconds a video file must sit unchanged before it is sent (a render writes it in steps)
_shas: dict[str, tuple[float, int, str]] = {}   # path -> (mtime, size, sha): a cut is hashed once


def _sha(p: Path) -> str:
    st = p.stat()
    hit = _shas.get(str(p))
    if hit and hit[:2] == (st.st_mtime, st.st_size):
        return hit[2]
    _shas[str(p)] = (st.st_mtime, st.st_size, sha256(p))
    return _shas[str(p)][2]


_warned: set[tuple[str, str, str, int]] = set()   # a refusal is logged once, then retried quietly


def _put(client: str, slot: str, name: str, p: Path, cfg: dict, headers: dict) -> bool:
    try:
        R.call("PUT", f"/api/media/{client}/{slot}/{name}", raw=p.read_bytes(), cfg=cfg, headers=headers, timeout=600)
        _warned.difference_update({w for w in _warned if w[:3] == (client, slot, name)})
        return True
    except R.RemoteError as e:   # 409: publishing now, or changed under us; 507: R2 full; next round
        if e.status == 401 or (e.status >= 500 and e.status != 507):
            raise
        if (client, slot, name, e.status) not in _warned:
            _warned.add((client, slot, name, e.status))
            say(f"{client}/{slot}: {name} not sent ({e})")
        return False


def sync_videos(clients: list[str], cfg: dict, only: str | None = None) -> list[str]:
    """Every post, one read per client. An unpublished video whose cut on this PC is not the one
    in R2 (none there yet, or re-rendered since) is sent up with its cover. The Worker deletes the file it replaces, and the
    published one after it publishes: R2 holds one file per waiting video. A cover is kept for
    every post (the calendar's thumbnail): one this PC has and R2 does not goes up too.
    `only`: that post alone, sent at once (a job just wrote its cut, nothing is mid-render).
    "client/slot" sent."""
    from .db import RemoteDB
    sent, settle = [], 0 if only else SETTLE
    for client in clients:
        for row in RemoteDB(client).posts():
            if only and row["slot_id"] != only:
                continue
            slot = row["slot_id"]
            sd = C.client_dir(client) / "posts" / slot
            p, cover = sd / "video.mp4", sd / "cover.jpg"
            # every unpublished cut, so the online page plays it; a file touched in the last
            # SETTLE seconds may still be rendering: next round
            video = (row["state"] not in OUT and not row.get("ig_media_id") and p.is_file()
                     and time.time() - p.stat().st_mtime >= settle)
            if video and row.get("r2_key") and not row.get("r2_sha") and not only:
                video = False   # sent from a browser (no sha): that file is the cut, not this PC's (unless a job just re-cut it)
            if video:
                sha = _sha(p)
                video = not (row.get("r2_key") and row.get("r2_sha") == sha)
            if video:
                if not _put(client, slot, "video", p, cfg, {"Content-Type": "video/mp4", "X-Sha256": sha}):
                    continue
                sent.append(f"{client}/{slot}")
            st = sd / "video-story.mp4"   # the story cut: the page's Reel/Story switch, deleted at publish too
            if (row["state"] not in OUT and not row.get("ig_media_id") and st.is_file()
                    and time.time() - st.stat().st_mtime >= settle):
                ssha = _sha(st)
                if row.get("story_sha") != ssha and _put(client, slot, "story", st, cfg, {"Content-Type": "video/mp4", "X-Sha256": ssha}):
                    sent.append(f"{client}/{slot} story")
            # a new cut goes with its cover; otherwise only a missing one is sent: a cover changed on
            # its own (no new cut) stays as it is online
            if cover.is_file() and (video or not row.get("cover_key")):
                if _put(client, slot, "cover", cover, cfg, {"Content-Type": "image/jpeg"}) and not video:
                    sent.append(f"{client}/{slot} cover")
    return sent


def _music_sent() -> Path:
    return R.home() / "music-sent.json"


def sync_music(clients: list[str], cfg: dict) -> list[str]:
    """The music library as the Worker's music card lists it: tracks.json (the rows and the
    client's Instagram searches) and each track's mp3 for the preview, and the client's icon
    (the sidebar), sent when new or changed (~/.tachyon/music-sent.json remembers what went
    up). Names sent."""
    from urllib.parse import quote

    from . import tracks as T
    try:
        state = json.loads(_music_sent().read_text())
    except (OSError, ValueError):
        state = {}
    sent = state.setdefault(cfg["api"], {})   # per Worker: another Worker (or a wiped bucket) gets it all again
    out = []
    for client in clients:
        d = C.client_dir(client) / "assets" / "music"

        def sendable(t: dict) -> str | None:   # what the Worker takes (MUSIC_NAME, MUSIC_MAX): else no preview
            f = Path(t["path"]).name if t.get("path") and str(t["path"]).endswith(".mp3") else ""
            ok = re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.mp3", f) and (d / f).is_file() and (d / f).stat().st_size <= MUSIC_MAX
            return f if ok else None
        rows = [{k: t.get(k) for k in ("id", "title", "artist", "mood", "duration")} | {"file": sendable(t)}
                for t in T.list_tracks(client, source="file")]
        body = json.dumps({"tracks": rows, "ig_queries": T.ig_queries(client)}, ensure_ascii=False, sort_keys=True).encode()
        items = [(f"/api/music/{client}/tracks.json", "tracks.json", body, "application/json")]
        items += [(f"/api/music/{quote(client)}/{quote(r['file'])}", r["file"], d / r["file"], "audio/mpeg") for r in rows if r["file"]]
        icon = C.client_dir(client) / "assets" / "icon.png"   # the sidebar's avatar
        if icon.is_file():
            items.append((f"/api/avatar/{quote(client)}", "icon.png", icon, "image/png"))
        for url, name, src, ctype in items:
            data = src if isinstance(src, bytes) else None
            key = f"{client}/{name}"
            sha = hashlib.sha256(data).hexdigest() if data is not None else _sha(src)
            if sent.get(key) in (sha, f"refused:{sha}"):
                continue
            try:
                R.call("PUT", url, raw=data if data is not None else src.read_bytes(), cfg=cfg, headers={"Content-Type": ctype}, timeout=600)
            except R.RemoteError as e:
                if e.status == 401 or (e.status >= 500 and e.status != 507):
                    raise
                say(f"{key}: not sent ({e})")
                if e.status in (400, 413, 415):   # refused for what it is: not again until it changes; the rest next round
                    sent[key] = f"refused:{sha}"
                    out.append(f"{key} refused")
                continue
            sent[key] = sha
            out.append(key)
    if out:
        _music_sent().parent.mkdir(parents=True, exist_ok=True)
        _music_sent().write_text(json.dumps(state, indent=1))
    return out


def spec(client: str, slot: str, cfg: dict) -> dict:
    """Download the slot's video from the Worker and run spec_check on it (a browser upload no PC has seen)."""
    from .publisher import spec_check
    with tempfile.TemporaryDirectory() as tmp:
        p = Path(tmp) / "video.mp4"
        p.write_bytes(R.call("GET", f"/api/media/{client}/{slot}/video", cfg=cfg, timeout=600, parse=False))
        return {"issues": spec_check.check_file(p)}


def _refused(job: dict, argv: list[str], why: str):
    """A job that never runs writes no status of its own: mark the one the dashboard set to
    "running" as failed, as a failed start does, then raise for the queue."""
    from . import formats, revise, week
    client, slot, kind = job["client"], job.get("slot_id"), job["kind"]
    if slot is not None and not re.fullmatch(r"[\w-]{1,64}", slot):   # it names a folder: never a path
        slot = None
    if not re.fullmatch(r"[\w-]{1,64}", str(client)):   # the Worker checks it too; nothing to mark then
        raise ValueError(why)
    try:
        if kind == "plan" and len(argv) > 3 and re.fullmatch(r"\d{4}-W\d{2}", argv[3]):
            week._status(client, argv[3], state="failed", error=why)
        elif kind in ("produce", "revise") and slot:
            revise._write_status(client, slot, state="failed", error=why, failed_at=revise.now())
        elif kind == "formats" and slot:
            formats._status(client, slot, state="failed", error=why)
        elif kind == "caption" and slot:   # the page shows "Writing…" while this marker exists
            (C.client_dir(client) / "posts" / slot / "caption.writing").unlink(missing_ok=True)
    except Exception as e:  # noqa: BLE001 — the queue still hears the refusal
        say(f"job {job['id']}: could not mark the refusal: {e}")
    raise ValueError(why)


def run_job(job: dict, cfg: dict, *, runner=subprocess.run, sleep=time.sleep) -> dict:
    """Run one claimed job; the result for `done`. Raises with the reason for `fail`."""
    payload = json.loads(job.get("payload") or "{}") if isinstance(job.get("payload"), str) else (job.get("payload") or {})
    client, slot = job["client"], job.get("slot_id")
    if job["kind"] == "spec":
        return spec(client, slot, cfg)   # reads only the file in R2: no text files needed
    if job["kind"] == "upload":
        pull(client, slot, sleep)   # the operator's online edits, so the files sent up are the newest
        return {"keys": upload(client, slot, cfg)}
    if job["kind"] == "track":   # a song picked online (Instagram's, or this PC's library): mix it in
        from . import tracks as T
        given = payload.get("track") or {}
        # a job queued before the library tab carries only audio_id: an Instagram song
        tid = str(given.get("id") or (T.IG_PREFIX + str(given["audio_id"]) if given.get("audio_id") else ""))
        song = T.ig_track(given) if tid.startswith(T.IG_PREFIX) else None
        if not song and not any(t["id"] == tid for t in T.list_tracks(client, source="file")):
            raise ValueError(f"no track {tid!r} in the library")
        pull(client, slot, sleep)
        if not (C.client_dir(client) / "posts" / slot / "video.mp4").is_file():
            raise FileNotFoundError(f"{slot}'s video is not on this PC")
        T.set_track(client, slot, tid, song)
        song = song or {"id": tid}
        files = sorted(J.push_files(client, slot, ("meta.json",)))
        # the new cut goes up now, so the page that waits on this job plays it when the job is done;
        # if it cannot, the loop's sync sends it later: the mix itself is done
        try:
            sync_videos([client], cfg, slot)
        except Exception as e:  # noqa: BLE001
            say(f"{client}/{slot}: the new cut not sent yet ({e})")
        return {"track": song["id"], "media": media_of(client, slot, cfg), "files": files}
    argv = payload.get("argv")
    if not isinstance(argv, list) or not all(isinstance(a, str) for a in argv):
        raise ValueError("the job has no argv")
    # a job runs the one command its kind allows, for its own client and slot: a member of one
    # client must not run work for another, nor the publisher
    want = ARGV.get(job["kind"])
    need = 3 if job["kind"] == "auto" else 4
    if not want or tuple(argv[:2]) != want or len(argv) < need or argv[2] != client:
        _refused(job, argv, f"refused: a {job['kind']} job for {client} cannot run {' '.join(argv)}")
    if job["kind"] not in NO_SLOT and argv[3] != slot:
        _refused(job, argv, f"refused: the job is for slot {slot}, the command for {argv[3]}")
    pull(client, slot, sleep)
    log = log_dir() / f"job-{job['id']}.log"
    log.touch()   # the job's start on the file clock (coarser than time.time()): what push_changed compares against
    since = log.stat().st_mtime   # before `before`: what it writes (the stashed meta) goes up too
    before(job["kind"], client, slot, argv, payload)
    with log.open("a") as out:
        r = runner([sys.executable, "-m", *argv], cwd=ROOT, stdout=out, stderr=subprocess.STDOUT)
    if r.returncode != 0:
        tail = log.read_text()[-TAIL:] if log.exists() else ""
        raise RuntimeError(f"exit {r.returncode}: {tail}")
    return {"returncode": 0, "media": media_of(client, slot, cfg) if job["kind"] in MAKES_VIDEO else None,
            "files": push_changed(client, since)}


def _beat(job_id: int, cfg: dict, stop: threading.Event) -> None:
    while not stop.wait(HEARTBEAT):
        try:
            R.call("POST", f"/api/jobs/{job_id}/heartbeat", {"host": host_id(cfg)}, cfg=cfg)
        except R.RemoteError as e:
            if e.status == 401:   # revoked: beating again cannot help; the report says so when the job ends
                say(f"job {job_id}: session revoked, heartbeats stopped")
                return
            say(f"job {job_id}: heartbeat failed: {e}")
        except Exception as e:  # noqa: BLE001 — a missed beat is not a reason to stop the job
            say(f"job {job_id}: heartbeat failed: {e}")


def once(cfg: dict, *, runner=subprocess.run, sleep=time.sleep) -> bool:
    """One poll. Runs the job it gets, reports it. True when a job ran."""
    job = R.call("GET", f"/api/jobs/next?host={host_id(cfg)}", cfg=cfg)
    if not job:
        return False
    say(f"job {job['id']}: {job['kind']} {job['client']} {job.get('slot_id') or ''}")
    stop = threading.Event()
    t = threading.Thread(target=_beat, args=(job["id"], cfg, stop), daemon=True)
    t.start()
    try:
        result = run_job(job, cfg, runner=runner, sleep=sleep)
        action, body = "done", result
    except Exception as e:  # noqa: BLE001 — the job failed; the queue hears why
        action, body = "fail", str(e)[-TAIL - 100:]
    finally:
        stop.set()
        t.join(timeout=5)
    for i in range(REPORT_TRIES):
        try:
            R.call("POST", f"/api/jobs/{job['id']}/{action}", {"host": host_id(cfg), "result": body}, cfg=cfg)
            break
        except R.RemoteError as e:
            if e.status >= 500 and i < REPORT_TRIES - 1:   # the Worker's own trouble: worth another try
                say(f"job {job['id']}: report failed ({e}), trying again")
                sleep(POLL)
                continue
            if e.status != 409:
                raise
            say(f"job {job['id']}: lease lost, result dropped")   # another host has it now
            break
        except OSError as e:   # the network: a lost report would re-run the job after the lease
            if i == REPORT_TRIES - 1:
                raise
            say(f"job {job['id']}: report failed ({e}), trying again")
            sleep(POLL)
    say(f"job {job['id']}: {action}")
    return True


def run(cfg: dict, *, sleep=time.sleep) -> int:
    reg = register(cfg)
    say(f"host {host_id(cfg)} registered: clients {reg['clients']}" + (f", not a member of {reg['dropped']}" if reg.get("dropped") else ""))
    while True:
        try:
            if not once(cfg, sleep=sleep):
                for done in sync_videos(reg["clients"], cfg) + sync_music(reg["clients"], cfg):
                    say(f"{done}: sent up")
                sleep(POLL)
        except R.RemoteError as e:
            if e.status == 401:
                say("session expired or revoked: run `python -m spine.worker login <api>` again")
                return 3
            say(f"worker error: {e}")
            sleep(POLL)
        except OSError as e:   # the network: try again next minute
            say(f"network: {e}")
            sleep(POLL)


def main(argv: list[str]) -> int:
    if argv[:1] == ["login"] and len(argv) in (2, 4):
        login(argv[1], argv[3] if len(argv) == 4 and argv[2] == "--token" else None)
        return 0
    cfg = R.config()
    if not cfg:
        print("no Worker configured: python -m spine.worker login <api-url>"); return 2
    if argv == ["run"]:
        return run(cfg)
    if argv == ["once"]:
        register(cfg)
        once(cfg)
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
