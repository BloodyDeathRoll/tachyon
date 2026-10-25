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
import re
import subprocess
import sys
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

import yaml

from . import clients as C
from . import revise as R
from . import schedule as SCH
from .db import DB

ROOT = Path(__file__).resolve().parent.parent
FILMS = ROOT / "engines" / "remotion" / "src" / "films"
MUSIC = "clients/{c}/assets/music/old-steel-449645.mp3"
PLAN_TIMEOUT = 20 * 60
FILM_TIMEOUT = 25 * 60
ALLOWED_PLAN = "Read Glob Grep Write"
ALLOWED_FILM = "Read Edit Write Glob Grep Bash(npx tsc:*) Bash(npx remotion still:*)"
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


def start(client: str, week: str) -> None:
    """Dashboard button: spawn prepare detached."""
    _status(client, week, state="running", step="planning", done=0, total=len(slot_times(client, week)), error=None, started_at=now())
    log = (plans_dir(client) / f"{week}.log").open("a")
    subprocess.Popen([sys.executable, "-m", "spine.week", "prepare", client, week], cwd=ROOT,
                     stdout=log, stderr=subprocess.STDOUT, start_new_session=True)


def _claude(prompt: str, allowed: str, timeout: int) -> str:
    r = subprocess.run(["claude", "-p", prompt, "--allowedTools", *allowed.split(" "), "--permission-mode", "acceptEdits"],
                       cwd=ROOT, capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        raise RuntimeError(f"claude failed: {(r.stderr or r.stdout).strip()[-400:]}")
    return r.stdout.strip()


# ── 1. plan ───────────────────────────────────────────────────────────────────
def plan_prompt(client: str, week: str, times: list[str], out: Path) -> str:
    c = f"clients/{client}"
    return f"""You are the marketing lead for the client "{client}". Plan next week's Instagram Reels.

Read first: {c}/strategy.md, {c}/brand.md, {c}/product.md, {c}/audience.md, {c}/funnel.md,
{c}/swipe.md, {c}/CHANGELOG.md, every {c}/posts/*/meta.json and caption.txt (what already ran),
and {c}/reports/ and {c}/lessons.yaml if they exist (what worked).

Week {week} has {len(times)} publishing slots (UTC):
{chr(10).join('- ' + t for t in times)}

Write {out.relative_to(ROOT)} as YAML, exactly this shape, one item per slot in that order:

week: {week}
items:
  - at: <slot timestamp from the list>
    title: <2-4 words, how the operator will recognise it>
    pillar: <one of the strategy's content pillars>
    brief: <3-5 sentences: what the 8-15 s video shows, beat by beat, using the real app>
    hook: <the first on-screen line, max 6 words>
    theme: <light or dark: which app theme the captures use; alternate so about half are light>
    voiceover: <optional, on about 1 item in 4: 2-3 short spoken lines, 6-9 s. A surfer friend
      telling you about one feature: easygoing, likeable, a smile in it, laid back or stoked,
      never a newsreader. Talk like speech: "okay so", "honestly", "dude" at most once; short
      bits, contractions, plain words, no em dashes. Omit the key on the others.>
    caption: |
      <the full post text in the brand voice>

Rules: vary pillars and hooks across the week, no two items alike; numbers only from
product.md; never "comment for the link" (link in bio, rosa.surf on screen, or a first comment
without a URL); no competitor names; the caption follows brand.md (data attribution line,
three hashtags). The videos can only use these assets: app captures
engines/remotion/public/captures/*.png (dark theme) and engines/remotion/public/captures-light/*.png
(light theme, same file names), Pixabay footage engines/remotion/public/footage/*.mp4,
the logo. Write the file and nothing else."""


def plan(client: str, week: str) -> list[dict]:
    times = slot_times(client, week)
    out = plans_dir(client) / f"{week}.yaml"
    _claude(plan_prompt(client, week, times, out), ALLOWED_PLAN, PLAN_TIMEOUT)
    data = yaml.safe_load(out.read_text())
    items = data["items"]
    if len(items) != len(times):
        raise ValueError(f"plan has {len(items)} items for {len(times)} slots")
    for it, t in zip(items, times):
        it["at"] = t   # the slot list is authoritative
        for k in ("title", "brief", "hook", "caption"):
            if not str(it.get(k) or "").strip():
                raise ValueError(f"plan item {t} has no {k}")
        if re.search(r"comment\s+\S+\s+(for|to get)", it["caption"], re.I):
            raise ValueError(f"plan item {t} asks people to comment for the link (rule 13)")
    return items


# ── 2. slots ──────────────────────────────────────────────────────────────────
def film_id(slot: str) -> str:
    return f"film-{slot}"


def make_slots(client: str, week: str, items: list[dict]) -> list[str]:
    d = C.client_dir(client)
    db = DB.for_client(d)
    prefix = week.lower()
    slots = []
    n_vo = 0
    from . import tracks as T
    lib = [t for t in T.list_tracks(client) if t["source"] == "file"]
    start = int(week.split("-W")[1]) if lib else 0   # shift the rotation week to week
    try:
        for i, it in enumerate(items, 1):
            slot = f"{prefix}-{i:02d}"
            sd = d / "posts" / slot
            sd.mkdir(parents=True, exist_ok=True)
            (sd / "caption.txt").write_text(it["caption"].strip() + "\n")
            (sd / "brief.md").write_text(f"# {it['title']}\n\nHook: {it['hook']}\n\n{it['brief'].strip()}\n")
            fid = film_id(slot)
            tr = lib[(start + i) % len(lib)] if lib else None   # neighbours never share a track
            meta = {"slot_id": slot, "title": it["title"], "pillar": it.get("pillar"), "angle": it["brief"].strip(),
                    "hook_formula": it["hook"], "cta": "link in bio (rosa.surf on the end card)",
                    "audio_type": f"{tr['title']} ({tr['artist']}), baked in" if tr else "Pixabay 'Old Steel', baked in", "engine": "remotion 4 (engines/remotion)",
                    "film": {"engine": "remotion", "reel": fid, "story": f"{fid}-story",
                             "source": f"engines/remotion/src/films/{fid}.tsx",
                             "music": tr["path"] if tr else MUSIC.format(c=client)},
                    "track": tr["id"] if tr else None,
                    "trial": False, "share_to_feed": True, "thumb_offset": 1200, "story": True,
                    "landing": "https://rosa.surf/",
                    "bio_link_while_live": f"https://rosa.surf/?utm_source=instagram&utm_medium=social&utm_campaign={slot}",
                    "plan": week, "theme": it.get("theme") if it.get("theme") in ("light", "dark") else ("light" if i % 2 == 0 else "dark")}
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
                db.set_state(slot, "BRIEFED")
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

Create engines/remotion/src/films/{fid}.tsx that exports `export const SECONDS = <8..15>;` and
`export default` a React component `({{ variant }}: {{ variant: Variant }}) => ...`.
Study engines/remotion/src/Showreel.tsx, Favorites.tsx and lib.tsx first and use the same
language: footage beds, the 3D floating Phone with real app Screens, H1/Sub type, rise
animations, an end card with the logo and "rosa.surf →", fast and fun pacing. Assets you may
use: staticFile("{cdir}/<name>.png") for the files in engines/remotion/public/{cdir},
staticFile("footage/<name>.mp4") for engines/remotion/public/footage, staticFile("fonts/rosa-icon.svg").
Every text and UI element stays inside SAFE[variant]. Only our messages, large: no on-screen text
under 38 px (lib MIN_TYPE), no small-caps eyebrow labels, no data attribution, no "Footage" credit
(attribution lives in the caption). Numbers only from clients/{client}/product.md.
Never "comment for the link". Do not edit any other file. Run `npx tsc --noEmit -p .` in
engines/remotion until it passes (you may temporarily add nothing to Root; it is registered for
you afterwards). You may check frames with a scratch entry only if needed. Do not render, do not commit."""


def register(fid: str) -> None:
    idx = FILMS / "index.ts"
    s = idx.read_text()
    var = re.sub(r"\W", "_", fid)
    if f'"./{fid}"' in s:
        return
    s = s.replace("// @imports", f'import {var}, {{ SECONDS as {var}_s }} from "./{fid}";\n// @imports')
    s = s.replace("  // @films", f'  {{ id: "{fid}", seconds: {var}_s, component: {var} }},\n  // @films')
    idx.write_text(s)


def produce(client: str, slot: str) -> None:
    d = C.client_dir(client)
    sd = d / "posts" / slot
    db = DB.for_client(d)
    try:
        if db.post(slot)["state"] == "BRIEFED":
            db.set_state(slot, "SCRIPTED")
        fid = film_id(slot)
        if not (FILMS / f"{fid}.tsx").exists():
            _claude(film_prompt(client, slot), ALLOWED_FILM, FILM_TIMEOUT)
        if not (FILMS / f"{fid}.tsx").exists():
            raise RuntimeError(f"no film written for {slot}")
        before = (FILMS / "index.ts").read_text()
        register(fid)
        r = subprocess.run(["npx", "tsc", "--noEmit", "-p", "."], cwd=ROOT / "engines" / "remotion", capture_output=True, text=True)
        if r.returncode != 0:
            (FILMS / "index.ts").write_text(before)   # never leave a broken film registered
            raise RuntimeError(f"film {fid} does not typecheck: {r.stdout[-300:]}")
        meta = json.loads((sd / "meta.json").read_text())
        if meta.get("voiceover_script") and not (sd / "vo.wav").exists():
            from . import voice as V
            V.make_vo(client, slot, meta["voiceover_script"], voice=meta.get("voiceover_voice"))
        verdicts = R.render(client, slot)   # render mixes track + voice-over (spine/tracks.apply)
        db.set_state(slot, "RENDERED")
        qa = R._qa_md(slot, verdicts, None, None)
        (sd / "qa.md").write_text(qa)
        db.set_state(slot, "QA", qa_verdict=qa.strip().splitlines()[-1])
        db.set_state(slot, "NEEDS_APPROVAL" if qa.rstrip().endswith("APPROVED") else "NEEDS_INPUT")
    finally:
        db.close()


def prepare(client: str, week: str) -> int:
    try:
        _status(client, week, state="running", step="planning", error=None)
        y = plans_dir(client) / f"{week}.yaml"
        items = yaml.safe_load(y.read_text())["items"] if y.exists() else plan(client, week)
        slots = make_slots(client, week, items)
        _status(client, week, step="producing", total=len(slots), done=0, slots=slots)
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
