"""Prepare next week's videos ahead of time (dashboard: "Prepare next week").

    python -m spine.week prepare <client> [2026-W44]   # plan + produce, what the dashboard spawns
    python -m spine.week auto <client>                  # daily cron: runs prepare on the prep day if on

1. Plan: claude -p writes clients/<c>/plans/<week>.yaml, one item per publishing slot
   (grants.yaml `slots`, 7 days): title, pillar, brief, on-screen hook, caption.
2. Slots: each item becomes a post (BRIEFED) with its planned scheduled_at, caption.txt,
   brief.md and meta.json → film engines/remotion/src/films/<id>.tsx.
3. Produce, one by one: claude -p writes the film from the brief, it is registered in
   src/films/index.ts, rendered (reel + story + music + cover, spine/revise.render), QA'd and
   lands in NEEDS_APPROVAL. Approving keeps the planned slot.
Progress: clients/<c>/plans/<week>.json (the dashboard reads it).
"""

from __future__ import annotations

import json
import random
import re
import shutil
import subprocess
import sys
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

import yaml

from . import caption as CAP
from . import jobs as J
from . import lessons as L
from . import clients as C
from . import revise as R
from . import schedule as SCH
from .db import DB
from .remote import RemoteError

ROOT = Path(__file__).resolve().parent.parent
FILMS = ROOT / "engines" / "remotion" / "src" / "films"
MUSIC = "clients/{c}/assets/music/old-steel-449645.mp3"
MOTION = ROOT / "engines" / "remotion" / "motion.yaml"   # tools/motion_catalogue.py
RECENT_MOTION = 30   # posts back that a style may not repeat
PLAN_TIMEOUT = 20 * 60
FILM_TIMEOUT = 25 * 60
ALLOWED_PLAN = "Read Glob Grep Write"
ALLOWED_FILM = "Read Edit Write Glob Grep Bash(npx tsc:*) Bash(npx remotion still:*) Bash(.venv/bin/python -m spine.capture:*)"
DEFAULTS = {"auto": False, "day": "Thursday"}


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def settings(client: str) -> dict:
    return {**DEFAULTS, **(C.load_grants(client).get("week_prep") or {})}


def next_week(today: date | None = None) -> str:
    d = (today or datetime.now(timezone.utc).date()) + timedelta(days=7)
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


def week_days(week: str) -> list[date]:
    y, w = week.split("-W")
    mon = date.fromisocalendar(int(y), int(w), 1)
    return [mon + timedelta(days=i) for i in range(7)]


def slot_times(client: str, week: str) -> list[str]:
    ts = SCH._slots(C.load_grants(client))
    return [datetime.combine(d, t, tzinfo=timezone.utc).isoformat(timespec="seconds") for d in week_days(week) for t in ts]


def free_slot_times(client: str, week: str, own: bool = False) -> list[str]:
    """The week's slots minus those already held by another video (moved or planned earlier).
    own: the week's own planned videos do not count as taken (a rerun reuses their slots)."""
    d = C.client_dir(client)
    db = DB.for_client(d)
    try:
        taken = SCH.taken_slots(db)
        if own:
            taken -= {r["scheduled_at"] for r in db.posts()
                      if r["slot_id"].startswith(week.lower() + "-") and _ours(d, r["slot_id"], week)}
    finally:
        db.close()
    return [t for t in slot_times(client, week) if t not in taken]


def plans_dir(client: str) -> Path:
    p = C.client_dir(client) / "plans"
    p.mkdir(exist_ok=True)
    return p


def status(client: str, week: str) -> dict | None:
    p = plans_dir(client) / f"{week}.json"
    return json.loads(p.read_text()) if p.exists() else None


def _status(client: str, week: str, **kw) -> dict:
    cur = status(client, week) or {}
    cur.update(kw, updated_at=now())
    (plans_dir(client) / f"{week}.json").write_text(json.dumps(cur, indent=1))
    return cur


# what the operator picks → how each video is animated. html: Claude's own HTML film; remotion: the Remotion
# house look; templates: Remotion with a motion style from motion.yaml; random: one of the three per video.
ENGINES = {"html": "Claude", "remotion": "Remotion", "templates": "Templates", "random": "Random"}
LEGACY = {"mix"}   # older batches: html and remotion-with-styles, alternating


def _last(client: str, key: str, default=""):
    best = ("", default)
    for f in plans_dir(client).glob("*.json"):
        try:
            st = json.loads(f.read_text())
        except ValueError:
            continue
        if st.get(key) is not None and (st.get("started_at") or "") >= best[0]:
            best = (st.get("started_at") or "", st[key])
    return best[1]


def last_instructions(client: str) -> str:
    """The operator's brief from the most recent batch (prefills the next one)."""
    return _last(client, "instructions")


def last_engine(client: str) -> str:
    """The most recent batch's engine choice (the next one starts on it)."""
    e = _last(client, "engine", "html")
    return e if e in ENGINES else "html"


def instructions_block(text: str) -> str:
    text = (text or "").strip()
    if not text:
        return ""
    return f"""

The operator's instructions for this batch. Follow them; where they conflict with the house
style or the example films, they win (the safe box, real numbers and rule 13 still hold):
---
{text}
---"""


def begin(client: str, week: str, instructions: str | None = None, engine: str | None = None) -> None:
    """The batch's status file before prepare runs: the operator's brief and engine choice
    (None: the last batch's). The dashboard button and the host (from a plan job's payload)."""
    if instructions is None:
        instructions = last_instructions(client)
    engine = engine if engine in ENGINES else last_engine(client)   # the daily auto run: the last batch's choice
    _status(client, week, state="running", step="planning", done=0, total=len(free_slot_times(client, week)), error=None,
            started_at=now(), instructions=instructions.strip(), engine=engine)


def start(client: str, week: str, instructions: str | None = None, engine: str | None = None) -> None:
    """Dashboard button: spawn prepare detached."""
    begin(client, week, instructions, engine)
    try:
        J.spawn("plan", client, None, ["spine.week", "prepare", client, week], plans_dir(client) / f"{week}.log")
    except (OSError, RemoteError) as e:   # nothing is running: the page must not say so
        _status(client, week, state="failed", error=f"could not start: {e}")
        raise


def _claude(prompt: str, allowed: str, timeout: int) -> str:
    r = subprocess.run(["claude", "-p", prompt, "--allowedTools", *R.tools(allowed), "--permission-mode", "acceptEdits"],
                       cwd=ROOT, capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        raise RuntimeError(f"claude failed: {(r.stderr or r.stdout).strip()[-400:]}")
    return r.stdout.strip()


# ── 1. plan ───────────────────────────────────────────────────────────────────
def plan_prompt(client: str, week: str, times: list[str], out: Path) -> str:
    c = f"clients/{client}"
    return f"""You are the marketing lead for the client "{client}". Plan next week's Instagram Reels.

Read first: {c}/strategy.md, {c}/brand.md, {c}/product.md, {c}/audience.md, {c}/funnel.md,
{c}/swipe.md, {c}/CHANGELOG.md, {MOTION.relative_to(ROOT)} (motion styles), every {c}/posts/*/meta.json and caption.txt (what already ran),
and {c}/industry.md, {c}/reports/ and {c}/lessons.yaml if they exist (the industry's practices; what worked).

Week {week} has {len(times)} publishing slots (UTC):
{chr(10).join('- ' + t for t in times)}

Write {out.relative_to(ROOT) if out.is_relative_to(ROOT) else out} as YAML, exactly this shape, one item per slot in that order:

week: {week}
items:
  - at: <slot timestamp from the list>
    title: <2-4 words, how the operator will recognise it>
    pillar: <one of the strategy's content pillars>
    brief: |
      <3-5 sentences: what the 15-30 s video shows, beat by beat. Build it on one message for the
      audience and the real app shown large; no layout gimmicks (grids, tiles, exploding phones)>
    hook: <the first on-screen line, max 6 words>
    theme: <light or dark: which app theme the captures use; alternate so about half are light>
    motion: <only once the brief is written: id of the motion style whose movement suits it, from the
      motion styles file. The style changes how things move, never what the brief shows. A different
      one per item and none that a posts/*/meta.json "motion" already used, unless its score below is
      "passed". Never one scored "rejected". When the operator's instructions name a style by its
      `style` name, use that one>
    voiceover: <optional, on about 1 item in 4: 2-3 short spoken lines, 6-9 s. A surfer friend
      telling you about one feature: easygoing, likeable, a smile in it, laid back or stoked,
      never a newsreader. Talk like speech: "okay so", "honestly", "dude" at most once; short
      bits, contractions, plain words, no em dashes. Omit the key on the others.>
    caption: |
      <the full post text in the brand voice, in the caption structure below>

Rules: vary pillars and hooks across the week, no two items alike; numbers only from
product.md; never "comment for the link" (link in bio, rosa.surf on screen, or a first comment
without a URL); no competitor names.
{CAP.RULES}
The videos can only use these assets: app captures
engines/remotion/public/captures/*.png (dark theme) and engines/remotion/public/captures-light/*.png
(light theme, same file names), Pixabay footage engines/remotion/public/footage/*.mp4,
the logo.{scores_block(client)}{L.notes_block(client)}{instructions_block((status(client, week) or {}).get("instructions"))}
Write the file and nothing else."""


def scores_block(client: str) -> str:
    sc = L.style_scores(client)
    if not sc:
        return ""
    return ("\n\nMotion style scores from the operator's reviews (passed: approved as made; fixed: needed "
            "notes; rejected: thrown out, never use again):\n" + "\n".join(f"- {k}: {v}" for k, v in sorted(sc.items())))


def load_plan(out: Path) -> dict:
    """The plan file; if Claude's YAML does not parse (an unquoted ": " in a brief), Claude repairs it once."""
    try:
        return yaml.safe_load(out.read_text())
    except yaml.YAMLError as e:
        _claude(f"{out} does not parse as YAML: {e}\nFix only the quoting: write every brief and caption as "
                f"a | block scalar and quote any other value with \": \" in it. Keep every value word for word. Write the file and nothing else.",
                ALLOWED_PLAN, PLAN_TIMEOUT)
        return yaml.safe_load(out.read_text())


def plan(client: str, week: str) -> list[dict]:
    times = free_slot_times(client, week, own=True)
    if not times:
        raise ValueError(f"every slot in {week} is already taken")
    out = plans_dir(client) / f"{week}.yaml"
    if not out.exists():   # a rerun picks up the plan a failed run left behind
        _claude(plan_prompt(client, week, times, out), ALLOWED_PLAN, PLAN_TIMEOUT)
    data = load_plan(out)
    if data.get("finished"):   # checked, slotted and styled by an earlier run: reuse it while its slots are free
        gone = [it["at"] for it in data["items"] if it["at"] not in times]
        if gone:
            raise ValueError(f"another video took {', '.join(gone)} since the plan was made; delete {out.name} to plan again")
        return data["items"]
    items = data["items"]
    ats = [a.isoformat(timespec="seconds") if isinstance(a, datetime) else str(a) for a in (it.get("at") for it in items)]
    if not (set(ats) <= set(times) and len(set(ats)) == len(ats)):   # keep the plan's own slots while they are free
        if len(items) != len(times):
            raise ValueError(f"plan has {len(items)} items for {len(times)} slots")
        ats = times   # else the slot list is authoritative, in order
    for it, t in zip(items, ats):
        it["at"] = t
        for k in ("title", "brief", "hook", "caption"):
            if not str(it.get(k) or "").strip():
                raise ValueError(f"plan item {t} has no {k}")
        if re.search(r"comment\s+\S+\s+(for|to get)", it["caption"], re.I):
            raise ValueError(f"plan item {t} asks people to comment for the link (rule 13)")
        it["caption"] = CAP.ensure(client, it["caption"])   # the one caption structure, no credits
    pick_motion(client, items, week, (status(client, week) or {}).get("instructions") or "")
    out.write_text(yaml.safe_dump({"week": week, "finished": True, "items": items}, sort_keys=False,
                                  allow_unicode=True, width=1000))
    return items


def motion_styles() -> dict[str, dict]:
    return {m["id"]: m for m in (yaml.safe_load(MOTION.read_text()) or {}).get("styles", [])} if MOTION.exists() else {}


def pick_motion(client: str, items: list[dict], week: str, asked: str = "") -> None:
    """Every item gets its own motion style, none from the recent posts: the plan's pick when it
    qualifies, else an unused one. A style the operator asked for by name may repeat a recent one.
    No catalogue: no style (the house look)."""
    sc = L.style_scores(client)
    styles = {k: v for k, v in motion_styles().items() if sc.get(k) != "rejected"}   # thrown out once: never again
    metas = sorted((C.client_dir(client) / "posts").glob("*/meta.json"))[-RECENT_MOTION:]
    used = {json.loads(m.read_text()).get("motion") for m in metas}
    free = [k for k in styles if k not in used] or list(styles)
    random.Random(week).shuffle(free)
    free.sort(key=lambda k: sc.get(k) == "fixed")   # untried before the ones that needed notes
    for it in items:
        m = styles.get(it.get("motion") or "")
        wanted = bool(m and m.get("style") and m["style"].lower() in asked.lower())
        if not m or (it["motion"] in used and not wanted and sc.get(it["motion"]) != "passed"):
            it["motion"] = next((k for k in free if k not in used), None)
        used.add(it["motion"])


# ── 2. slots ──────────────────────────────────────────────────────────────────
def film_id(slot: str) -> str:
    return f"film-{slot}"


def _ours(d: Path, slot: str, plan: str) -> bool:
    """True if the slot id is free, or already holds this plan's item (a resumed run)."""
    m = d / "posts" / slot / "meta.json"
    return not m.exists() or json.loads(m.read_text()).get("plan") == plan


def _engine_for(client: str, plan: str, i: int, slot: str = "", choice: str | None = None) -> str:
    """html, remotion or templates for one video: `choice` (a single video), else its batch's."""
    e = choice or (status(client, plan) or {}).get("engine") or "templates"   # batches before the choice: styles
    if e == "mix":
        return "html" if i % 2 else "templates"
    if e == "random":
        return random.Random(f"{plan}/{slot}/{i}").choice(["html", "remotion", "templates"])
    return e if e in ENGINES else "templates"


def write_item(client: str, db: DB, slot: str, it: dict, i: int, plan: str, n_vo: int = 0, engine: str | None = None) -> int:
    """One plan item → posts/<slot>/ (caption, brief, meta with film + track) and a BRIEFED post.
    Returns the voice-over count so far (voices rotate across a batch)."""
    d = C.client_dir(client)
    from . import tracks as T
    lib = [t for t in T.list_tracks(client) if t["source"] == "file"]
    m = re.search(r"-W(\d+)", plan)
    start = int(m[1]) if (lib and m) else 0   # shift the rotation week to week
    sd = d / "posts" / slot
    sd.mkdir(parents=True, exist_ok=True)
    eng = _engine_for(client, plan, i, slot, engine)   # html: Claude's own film; only templates use a motion style
    (sd / "caption.txt").write_text(it["caption"].strip() + "\n")
    (sd / "brief.md").write_text(f"# {it['title']}\n\nHook: {it['hook']}\n\n{it['brief'].strip()}\n")
    fid = film_id(slot)
    tr = lib[(start + i) % len(lib)] if lib else None   # neighbours never share a track
    meta = {"slot_id": slot, "title": it["title"], "pillar": it.get("pillar"), "angle": it["brief"].strip(),
            "hook_formula": it["hook"], "cta": "link in bio (rosa.surf on the end card)",
            "audio_type": f"{tr['title']} ({tr['artist']}), baked in" if tr else "Pixabay 'Old Steel', baked in", "engine": "remotion 4 (engines/remotion)",
            "film": ({"engine": "html", "dir": f"clients/{client}/posts/{slot}/film",
                      "source": f"clients/{client}/posts/{slot}/film/index.html"} if eng == "html" else
                     {"engine": "remotion", "reel": fid, "story": f"{fid}-story",
                      "source": f"engines/remotion/src/films/{fid}.tsx"}) | {"music": tr["path"] if tr else MUSIC.format(c=client)},
            "track": tr["id"] if tr else None,
            "trial": False, "share_to_feed": True, "thumb_offset": 1200, "story": True,
            "landing": "https://rosa.surf/",
            "bio_link_while_live": f"https://rosa.surf/?utm_source=instagram&utm_medium=social&utm_campaign={slot}",
            "plan": plan, "motion": it.get("motion") if eng == "templates" else None, "theme": it.get("theme") if it.get("theme") in ("light", "dark") else ("light" if i % 2 == 0 else "dark")}
    if str(it.get("voiceover") or "").strip():
        from . import voice as V
        meta["voiceover_script"] = " ".join(str(it["voiceover"]).split())
        meta["voiceover_voice"] = V.rotate(client, n_vo)   # different voices across the week
        n_vo += 1
    (sd / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")
    try:
        db.post(slot)
    except KeyError:
        db.create_post(slot, client, scheduled_at=it["at"], pillar=it.get("pillar"), angle=it["title"],
                       hook_formula=it["hook"], engine="remotion")
    if db.post(slot)["state"] == "IDEA":
        db.set_state(slot, "BRIEFED")
    return n_vo


def make_slots(client: str, week: str, items: list[dict]) -> list[str]:
    d = C.client_dir(client)
    db = DB.for_client(d)
    prefix = week.lower()
    slots = []
    n_vo = 0
    n = 0
    try:
        for i, it in enumerate(items, 1):
            n += 1
            while not _ours(d, f"{prefix}-{n:02d}", week):   # skip ids taken by videos added by hand
                n += 1
            slot = f"{prefix}-{n:02d}"
            n_vo = write_item(client, db, slot, it, i, week, n_vo)
            slots.append(slot)
    finally:
        db.close()
    return slots


# ── 3. produce ────────────────────────────────────────────────────────────────
def film_prompt(client: str, slot: str) -> str:
    sd = C.client_dir(client) / "posts" / slot
    fid = film_id(slot)
    meta = json.loads((sd / "meta.json").read_text())
    theme = meta.get("theme", "dark")
    cdir = "captures-light" if theme == "light" else "captures"
    vo = (f"\nA voice-over plays from 0.5 s: \"{meta['voiceover_script']}\". Pace the beats to it and keep "
          f"on-screen text short so it does not repeat the voice word for word." if meta.get("voiceover_script") else "")
    return f"""Make one Instagram Reel as a Remotion composition for the client "{client}".

Brief: {(sd / 'brief.md').read_text()}
App theme: {theme}. Use staticFile("{cdir}/<name>.png") for every app screen.{vo}

Create engines/remotion/src/films/{fid}.tsx that exports `export const SECONDS = <15..30>;` and
`export default` a React component `({{ variant }}: {{ variant: Variant }}) => ...`.
Study engines/remotion/src/Showreel.tsx, Favorites.tsx and lib.tsx first and use their parts:
the 3D floating Phone with real app Screens, H1/Sub type, an end card with the logo and
"rosa.surf →", fast and fun pacing.{motion_block(meta.get("motion"))} Assets you may
use: staticFile("{cdir}/<name>.png") for the files in engines/remotion/public/{cdir},
staticFile("footage/<name>.mp4") for engines/remotion/public/footage, staticFile("fonts/rosa-icon.svg").
Every text and UI element stays inside SAFE[variant]. Only our messages, large: no on-screen text
under 38 px (lib MIN_TYPE), no small-caps eyebrow labels, no data attribution, no "Footage" credit.
Numbers only from clients/{client}/product.md.
Never "comment for the link".{R.capture_hint(client)}{L.notes_block(client)}
Do not edit any other file. Run `npx tsc --noEmit -p .` in
engines/remotion until it passes (you may temporarily add nothing to Root; it is registered for
you afterwards). You may check frames with a scratch entry only if needed. Do not render, do not commit.{instructions_block(_batch_instructions(client, meta))}"""


def motion_block(mid: str | None) -> str:
    m = motion_styles().get(mid or "")
    if not m:
        return " Footage beds and rise animations, like those films."
    return f"""

Motion style for this reel: "{m.get('style') or m['title']}" ({', '.join(m['tags'])}). Its original prompt:
---
{m['prompt']}
---
Take only its motion language from it: how things move, enter and transition, the rhythm, the type
treatment. It never decides what is on screen or the layout: build the brief as written, with the
real app large whenever it appears (the phone fills most of the frame height), only real Rosa
screens from the captures, Rosa's colours and the house end card. Adapt it, never copy it: it is
someone else's piece ({m['url']}). It never overrides the brief, the brand, the operator's notes,
the safe areas or the type rules below; drop any part of it that needs assets we do not have.
"""


def _batch_instructions(client: str, meta: dict) -> str:
    return (status(client, meta["plan"]) or {}).get("instructions") or "" if meta.get("plan") else ""


def register(fid: str) -> None:
    idx = FILMS / "index.ts"
    s = idx.read_text()
    var = re.sub(r"\W", "_", fid)
    if f'"./{fid}"' in s:
        return
    s = s.replace("// @imports", f'import {var}, {{ SECONDS as {var}_s }} from "./{fid}";\n// @imports')
    s = s.replace("  // @films", f'  {{ id: "{fid}", seconds: {var}_s, component: {var} }},\n  // @films')
    idx.write_text(s)


CHECK_FRAMES = 8


def self_check(client: str, slot: str, source: Path, allowed: str = ALLOWED_FILM) -> bool:
    """Claude looks at frames of the finished cut against the brief, the brand and the operator's
    notes, and fixes the film source if one breaks them. True when it changed the source."""
    sd = C.client_dir(client) / "posts" / slot
    cdir = sd / ".check"
    cdir.mkdir(exist_ok=True)
    dur = float(json.loads((sd / "meta.json").read_text()).get("duration_s") or 15)
    for i in range(CHECK_FRAMES):
        t = dur * (i + 0.5) / CHECK_FRAMES
        r = subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.2f}", "-i", str(sd / "video.mp4"), "-frames:v", "1",
                            "-vf", "scale=540:-2", str(cdir / f"{i + 1:02d}-{t:05.2f}s.jpg")], capture_output=True)
        if r.returncode != 0:   # no frames, no check: the first cut goes to approval as it is
            shutil.rmtree(cdir, ignore_errors=True)
            print(f"{slot} self-check skipped: {r.stderr.decode()[-200:]}", file=sys.stderr)
            return False
    before = source.read_text()
    try:
        out = _claude(f"""Review one finished Instagram Reel for the client "{client}" before the operator sees it.
Frames of the cut (the time is in each file name): read every image in {cdir.relative_to(ROOT)}.
Brief: {(sd / 'brief.md').read_text()}
Brand: clients/{client}/brand.md.{L.notes_block(client)}
Check the frames against the brief, the brand and every note above: the app large and only real
Rosa screens, nothing cut off or outside the safe area, text readable, nothing the notes forbid.
If something breaks them, fix it in {source.relative_to(ROOT)} only (keep everything else) and make
sure it still builds. End with one line: CHANGED: <what you fixed>, or OK.""", allowed, FILM_TIMEOUT)
    finally:
        shutil.rmtree(cdir, ignore_errors=True)
    print(f"{slot} self-check: {out.strip().splitlines()[-1] if out.strip() else '?'}", file=sys.stderr)
    return source.read_text() != before


def produce(client: str, slot: str) -> None:
    d = C.client_dir(client)
    sd = d / "posts" / slot
    db = DB.for_client(d)
    try:
        if db.post(slot)["state"] == "BRIEFED":
            db.set_state(slot, "SCRIPTED")
        meta = json.loads((sd / "meta.json").read_text())
        if (meta.get("film") or {}).get("engine") == "html":
            return _produce_html(client, slot, sd, db, meta)
        fid = film_id(slot)
        if not (FILMS / f"{fid}.tsx").exists() or (sd / ".film_stale").exists():   # stale: Generate New replaces it
            _claude(film_prompt(client, slot), ALLOWED_FILM, FILM_TIMEOUT)
            (sd / ".film_stale").unlink(missing_ok=True)
        if not (FILMS / f"{fid}.tsx").exists():
            raise RuntimeError(f"no film written for {slot}")
        before = (FILMS / "index.ts").read_text()
        register(fid)
        r = subprocess.run(["npx", "tsc", "--noEmit", "-p", "."], cwd=ROOT / "engines" / "remotion", capture_output=True, text=True)
        if r.returncode != 0:
            (FILMS / "index.ts").write_text(before)   # never leave a broken film registered
            raise RuntimeError(f"film {fid} does not typecheck: {r.stdout[-300:]}")
        _voice(client, slot, sd, meta)
        verdicts = R.render(client, slot) | R.spec_verdicts(sd)   # render mixes track + voice-over (spine/tracks.apply)
        src = FILMS / f"{fid}.tsx"
        before = src.read_text()
        if self_check(client, slot, src):
            try:
                r = subprocess.run(["npx", "tsc", "--noEmit", "-p", "."], cwd=ROOT / "engines" / "remotion", capture_output=True, text=True)
                if r.returncode != 0:
                    raise RuntimeError(f"does not typecheck: {r.stdout[-300:]}")
                verdicts = R.render(client, slot) | R.spec_verdicts(sd)
            except Exception as e:   # a broken fix: keep the first cut and its source
                src.write_text(before)
                print(f"{slot}: self-check fix did not render, kept the first cut: {e}", file=sys.stderr)
        _finish(slot, sd, db, verdicts)
    finally:
        db.close()


def _voice(client: str, slot: str, sd: Path, meta: dict) -> None:
    if meta.get("voiceover_script") and not (sd / "vo.wav").exists():
        from . import voice as V
        V.make_vo(client, slot, meta["voiceover_script"], voice=meta.get("voiceover_voice"))


def _finish(slot: str, sd: Path, db: DB, verdicts: dict) -> None:
    db.set_state(slot, "RENDERED")
    qa = R._qa_md(slot, verdicts, None, None)
    (sd / "qa.md").write_text(qa)
    db.set_state(slot, "QA", qa_verdict=qa.strip().splitlines()[-1])
    db.set_state(slot, "NEEDS_APPROVAL" if qa.rstrip().endswith("APPROVED") else "NEEDS_INPUT")


def _produce_html(client: str, slot: str, sd: Path, db: DB, meta: dict) -> None:
    """Engine html: Claude writes the film as its own HTML page; spine/render.py captures it."""
    fdir = ROOT / meta["film"]["dir"]
    (sd / ".film_stale").unlink(missing_ok=True)   # Generate New from a Remotion film to an HTML one
    if not (fdir / "index.html").exists():
        fdir.mkdir(parents=True, exist_ok=True)
        _claude(html_prompt(client, slot), R.ALLOWED_HTML, FILM_TIMEOUT)
    for f in ("index.html", "film.json"):
        if not (fdir / f).exists():
            raise RuntimeError(f"no {f} written for {slot}")
    _voice(client, slot, sd, meta)
    verdicts = R.render(client, slot) | R.spec_verdicts(sd)
    src = fdir / "index.html"
    before = src.read_text()
    if self_check(client, slot, src, R.ALLOWED_HTML):
        try:
            verdicts = R.render(client, slot) | R.spec_verdicts(sd)
        except Exception as e:   # a broken fix: keep the first cut and its source
            src.write_text(before)
            print(f"{slot}: self-check fix did not render, kept the first cut: {e}", file=sys.stderr)
    _finish(slot, sd, db, verdicts)


def html_prompt(client: str, slot: str) -> str:
    sd = C.client_dir(client) / "posts" / slot
    meta = json.loads((sd / "meta.json").read_text())
    fdir = meta["film"]["dir"]
    cdir = "captures-light" if meta.get("theme") == "light" else "captures"
    vo = (f"\nA voice-over plays from 0.5 s: \"{meta['voiceover_script']}\". Pace the beats to it and keep "
          f"on-screen text short so it does not repeat the voice word for word." if meta.get("voiceover_script") else "")
    return f"""Make one Instagram Reel for the client "{client}": a 15-30 s motion piece that looks like the best
app-launch motion design out there. You are the motion designer: pick the look, the movement and the
pacing yourself. No templates and no framework.

Brief: {(sd / 'brief.md').read_text()}
App theme: {meta.get('theme', 'dark')}. Brand: clients/{client}/brand.md. Numbers only from clients/{client}/product.md.{vo}

Build it as one self-contained page: {fdir}/index.html plus {fdir}/film.json, which holds
{{"duration": <seconds>, "width": 1080, "height": 1920}}. Use any technique (CSS, SVG, canvas, WebGL,
plain JS) but nothing from the network: copy every file you use into {fdir}/ with cp. Real Rosa app
screens only, from engines/remotion/public/{cdir}/; footage from engines/remotion/public/footage/; the
font engines/remotion/public/fonts/inter-latin-wght-normal.woff2 and the logo
engines/remotion/public/fonts/rosa-icon.svg.

How it is rendered: the page is opened from file:// and window.__film.seek(t) is called for every
frame, then screenshotted. seek(t) must put everything where it is at t seconds, computed from t
alone: no real clock, no requestAnimationFrame loop, no CSS animation or transition running on its
own. If you use <video>, seek it and return a promise that resolves once it has the frame. Read
?variant=reel|story from the URL. Keep every text and button inside the safe box (x 65 to 1015,
y 285 to 1248 for reel; y 269 to 1248 for story): Instagram's own UI covers the rest. No text under
38 px. No music or voice in the page; the soundtrack is mixed in afterwards.
Never "comment for the link".{R.capture_hint(client)} Copy a new capture into {fdir}/ too.{L.notes_block(client)}
Look at your work: `.venv/bin/python -m spine.render {fdir} --still <seconds> {fdir}/.still.png` renders one
frame (and prints page errors); check several moments and fix what is off. Delete .still.png when
done. Do not render the video, do not commit, do not edit files outside {fdir}/.{instructions_block(_batch_instructions(client, meta))}"""


def prepare(client: str, week: str) -> int:
    try:
        _status(client, week, state="running", step="planning", error=None)
        items = plan(client, week)
        slots = make_slots(client, week, items)
        _status(client, week, step="producing", total=len(slots), done=0, slots=slots, producing_at=now())
        failed = []
        for i, slot in enumerate(slots):
            _status(client, week, current=slot)
            try:
                produce(client, slot)
            except Exception as e:   # one bad film must not stop the week
                failed.append({"slot": slot, "error": str(e)[-300:]})
                print(f"{slot}: {e}", file=sys.stderr)
            _status(client, week, done=i + 1, failed=failed)
        _status(client, week, state="done", step="done", current=None)
        return 0
    except Exception as e:
        _status(client, week, state="failed", error=str(e)[-600:])
        print(f"prepare failed: {e}", file=sys.stderr)
        return 1


def auto(client: str) -> int:
    s = settings(client)
    today = datetime.now(timezone.utc)
    if not s["auto"] or today.strftime("%A") != s["day"] or C.stopped(client):
        return 0
    wk = next_week(today.date())
    if status(client, wk):
        return 0
    start(client, wk)
    return 0


def main(argv: list[str]) -> int:
    if len(argv) >= 2 and argv[0] == "prepare":
        return prepare(argv[1], argv[2] if len(argv) > 2 else next_week())
    if len(argv) == 2 and argv[0] == "auto":
        return auto(argv[1])
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
