"""The industry study of a new client, as the Worker's `learn` job (docs/PLAYBOOK.md Week 0;
skills/intake/SKILL.md "Industry study"; the page is deploy/worker/src/pages/setup.ts).

The operator's intake comes in the job's payload: the industry, a summary, notes, links and
uploaded files. One `claude -p` run studies the industry and writes one file per stage into
clients/<c>/learn/; while it runs, the files that exist are the progress (reported with the
job's heartbeat, which the page shows). At the end the sections are joined into industry.md
(long) and industry-short.md (the one line, the points, the open questions), both sent up as
client files: the operator approves them online, and every weekly plan reads industry.md.

A stopped job (the heartbeat is refused) kills the run.
"""

from __future__ import annotations

import re
import subprocess
import threading
import time
from datetime import date
from pathlib import Path

from . import clients as C
from . import remote as R
from . import revise as RV

ROOT = Path(__file__).resolve().parent.parent
# the stage keys, as deploy/worker/src/pages/setup.ts STAGES lists them
SECTIONS = (("ecosystem", "Ecosystem"), ("calendar", "Buying cycle and calendar"), ("rules", "Rules"),
            ("vocabulary", "Vocabulary"), ("video", "Video practice"), ("make", "What we can make"))
STAGES = ("sources", *(k for k, _ in SECTIONS), "file")
FILES = {"sources": "0-sources.md", **{k: f"{i}-{k}.md" for i, (k, _) in enumerate(SECTIONS, 1)}, "file": "summary.md"}
ALLOWED = "Read Glob Grep Write WebFetch WebSearch"
TIMEOUT = 45 * 60
WATCH = 5        # seconds between looks at the files
LOG_LINES = 12   # of the live log, sent with the progress
SOURCE = re.compile(r"^\[\d+\]", re.M)


class Stopped(RuntimeError):
    """The job was stopped online: its heartbeat is refused."""


def work_dir(client: str) -> Path:
    if not re.fullmatch(r"[\w-]{1,64}", client):   # a folder name, never a path
        raise ValueError(f"not a client id: {client!r}")
    return C.CLIENTS / client / "learn"


def fetch_sources(client: str, payload: dict, cfg: dict | None = None) -> list[str]:
    """The intake's sources as lines for the prompt; an uploaded file is downloaded to learn/sources/ first."""
    d = work_dir(client) / "sources"
    lines = []
    for s in payload.get("sources") or []:
        if s.get("url"):
            lines.append(f"- {s.get('type', 'Other')}: {s['url']}" + (f" ({s['note']})" if s.get("note") else ""))
        elif s.get("file") is not None and isinstance(s.get("n"), int):
            d.mkdir(parents=True, exist_ok=True)
            p = d / (str(s["n"]) + "-" + re.sub(r"[^\w.-]+", "_", str(s["file"]))[-100:])
            p.write_bytes(R.call("GET", f"/api/intake/{client}/{s['n']}", cfg=cfg, timeout=600, parse=False))
            lines.append(f"- {s.get('type', 'Document')}: the file {p.relative_to(ROOT) if p.is_relative_to(ROOT) else p}")
    return lines


def prompt(client: str, payload: dict, sources: list[str], handle: str | None) -> str:
    d = work_dir(client)
    rel = d.relative_to(ROOT) if d.is_relative_to(ROOT) else d
    answers = "\n".join(f"- {q} {a}" for q, a in (payload.get("answers") or {}).items())
    changes = str(payload.get("changes") or "").strip()
    again = f"""
This is a second pass. The files in {rel}/ are the last study. The operator read it and asks:
{changes}
Rewrite only the files that need it (all of them if any is missing), then {FILES['file']}.
""" if changes else ""
    sections = "\n".join(f"- {rel}/{FILES[k]}: {title}" for k, title in SECTIONS)
    return f"""You are onboarding the client "{client}" to Tachyon, which makes Instagram Reels for it.
Before any video is made you study the client's industry. Read skills/intake/SKILL.md, the part
"Industry study": it says what each section holds. Today is {date.today().isoformat()}.

The business, in the operator's words:
Industry: {payload.get('industry') or ''}
Summary: {payload.get('summary') or ''}
Notes: {payload.get('notes') or '(none)'}
{f'Instagram: @{handle}' if handle else ''}
{('The operator answered earlier questions:' + chr(10) + answers) if answers else ''}
Sources the operator gave (read every one first):
{chr(10).join(sources) or '(none)'}
{again}
Research on the web; never write a fact from memory. Write these files, in this order, each as
soon as its part is done (the operator watches them appear):

- {rel}/{FILES['sources']}: one short paragraph per source above: what it says about the business.
{sections}
- {rel}/{FILES['file']}: the short version, exactly in this form:
    one sentence: the single most useful thing to know before making a video for this client

    ## Ecosystem
    - three points, one line each
    (the same for: ## Buying cycle and calendar, ## Rules, ## Vocabulary, ## Video that works, ## What we can make)

    ## Open questions
    - one line per thing you could not find and the operator must answer (none: leave the section empty)

Rules for the six section files:
- No heading: the text only. Short paragraphs; a list as lines that start with "- ".
- Every fact carries a source number like [3]. End each file with its sources, one per line:
  "[3] https://… · read {date.today().strftime('%-d %b %Y')}". Numbers run on from one file to the next.
- Anything you could not source is marked [assumed] and listed under Open questions.
- Plain words, as you would tell the operator. One page in total across the six.

After each web page or file you read, append one line to {rel}/log.txt saying what you just did
(for example "Read nomadcoffee.example/about"). Change no other file."""


def progress(d: Path, since: float, seen: dict[str, float], n_sources: int) -> dict:
    """What the files say: the stages written since the job began, a note per stage, the log."""
    done, notes = [], {}
    for key in STAGES:
        p = d / FILES[key]
        if not (p.is_file() and p.stat().st_size and p.stat().st_mtime >= since):
            continue
        done.append(key)
        if key == "sources":
            notes[key] = f"{n_sources} source{'' if n_sources == 1 else 's'}"
        elif key != "file":
            n = len(SOURCE.findall(p.read_text(errors="replace")))
            if n:
                notes[key] = f"{n} source{'' if n == 1 else 's'}"
    log = d / "log.txt"
    lines = [l.strip() for l in log.read_text(errors="replace").splitlines() if l.strip()] if log.is_file() else []
    for l in lines:
        seen.setdefault(l, time.time())   # a line's time: when it was first seen here
    tail = [{"t": int(seen[l] * 1000), "text": l[:200]} for l in lines[-LOG_LINES:]]
    return {"done": done, "notes": notes, "now": lines[-1][:200] if lines else "", "log": tail}


def short_questions(short: str) -> list[str]:
    """The points under "## Open questions" of the short file."""
    out, inside = [], False
    for l in short.splitlines():
        if l.startswith("## "):
            inside = l[3:].strip().lower() == "open questions"
        elif inside and l.strip().startswith(("- ", "* ")):
            out.append(l.strip()[2:].strip())
    return out


def assemble(client: str, name: str) -> tuple[str, str]:
    """(industry.md, industry-short.md) from the stage files; a missing one is an error."""
    d = work_dir(client)
    missing = [FILES[k] for k in STAGES if not ((d / FILES[k]).is_file() and (d / FILES[k]).read_text().strip())]
    if missing:
        raise RuntimeError(f"the study is incomplete: {', '.join(missing)} not written")
    short = (d / FILES["file"]).read_text().strip() + "\n"
    parts = [f"# {name}: industry file\n"]
    for i, (key, title) in enumerate(SECTIONS, 1):
        parts.append(f"## {i}  {title}\n\n{(d / FILES[key]).read_text().strip()}\n")
    qs = short_questions(short)
    if qs:
        parts.append(f"## {len(SECTIONS) + 1}  Open questions\n\n" + "\n".join(f"- {q}" for q in qs) + "\n")
    return "\n".join(parts), short


def claude(text: str, log: Path, stop: threading.Event, timeout: int = TIMEOUT) -> None:
    """One `claude -p` run with its output in `log`; killed when `stop` is set or the time is up."""
    with log.open("w") as out:
        p = subprocess.Popen(["claude", "-p", text, "--allowedTools", *RV.tools(ALLOWED), "--permission-mode", "acceptEdits"],
                             cwd=ROOT, stdout=out, stderr=subprocess.STDOUT)
        end = time.monotonic() + timeout
        while p.poll() is None:
            if stop.is_set() or time.monotonic() > end:
                p.kill()
                p.wait()
                raise Stopped("stopped") if stop.is_set() else RuntimeError(f"claude ran past {timeout // 60} minutes")
            time.sleep(1)
    if p.returncode != 0:
        raise RuntimeError(f"claude failed: {log.read_text(errors='replace').strip()[-400:]}")


def run(client: str, payload: dict, report, cfg: dict | None = None, *, runner=claude, watch: float = WATCH) -> dict:
    """The whole job. `report(progress)` sends the progress up; when it raises a 409 the job
    was stopped online and the run is killed. The result for `done`."""
    from .db import RemoteDB
    d = work_dir(client)
    C.pull(client)   # the client's folder and grants: a new client has none here yet
    d.mkdir(parents=True, exist_ok=True)
    if not payload.get("changes"):   # a fresh study: the last one's files are not this one's progress
        for f in [*FILES.values(), "log.txt"]:
            (d / f).unlink(missing_ok=True)
    grants = C.load_grants(client)
    sources = fetch_sources(client, payload, cfg)
    (d / "log.txt").touch()
    since = (d / "log.txt").stat().st_mtime   # the job's start on the file clock
    stop, finished, seen, last = threading.Event(), threading.Event(), {}, [None]

    def look() -> None:
        now = progress(d, since, seen, len(sources))
        if now != last[0]:
            last[0] = now
            try:
                report(now)
            except R.RemoteError as e:
                if e.status == 409:   # stopped online, or handed to another PC
                    stop.set()
            except OSError:
                pass   # the network: the next look sends it

    def watcher() -> None:
        while not finished.wait(watch) and not stop.is_set():
            look()

    t = threading.Thread(target=watcher, daemon=True)
    t.start()
    try:
        runner(prompt(client, payload, sources, grants.get("ig_username")), d / "claude.log", stop)
    finally:
        finished.set()
        t.join(timeout=10)
    if stop.is_set():
        raise Stopped("stopped")
    long, short = assemble(client, grants.get("display_name") or client)
    home = C.CLIENTS / client
    (home / "industry.md").write_text(long)
    (home / "industry-short.md").write_text(short)
    (home / "assets").mkdir(exist_ok=True)   # this PC holds the client from now on (spine/worker.py host_clients)
    db = RemoteDB(client, cfg) if cfg else RemoteDB(client)
    db.set_client_file("industry.md", long)
    db.set_client_file("industry-short.md", short)
    return {"files": ["industry.md", "industry-short.md"], "sources": len(SOURCE.findall(long)), "questions": len(short_questions(short))}
