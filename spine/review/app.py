"""Tachyon dashboard — launch and track (docs/PLAN.md CP2). Stdlib only.

    python -m spine.review.app            # http://127.0.0.1:8765

Pages per client:
  /<client>                    Overview: performance at a glance + every video as a card with
                               one tag (Needs approval · Re-rendering · Scheduled · Live)
  /<client>/v/<slot>           One video: preview, approve or send back with notes (→ new render),
                               performance, post text, links to QA and Instagram
  /<client>/v/<slot>/qa        QA report (reachable, never on the main screens)
  /<client>/settings           Autonomy switches and emergency stop

A human decides here. The only model call is the re-render job (spine/revise.py), spawned
when a video is sent back with notes.
"""

from __future__ import annotations

import html
import json
import mimetypes
import os
import re
import sqlite3
import subprocess
import sys
from datetime import date, datetime, time, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse
from zoneinfo import ZoneInfo

from .. import audience as AU
from .. import clients as C
from .. import formats as F
from .. import manual as M
from .. import revise as R
from .. import schedule as SCH
from .. import week as W
from ..db import DB
from ..state import IllegalTransition
from ..publisher.publish import HAND_FROM

ESC = html.escape
ROOT = Path(__file__).resolve().parent.parent.parent
FONT = ROOT / "dashboard" / "fonts" / "inter-var.woff2"
LOGO = ROOT / "dashboard" / "brand" / "tachyon-logo.svg"
ICON = ROOT / "dashboard" / "brand" / "tachyon-icon.svg"
MAX_SLOTS = 6
MEDIA_FILES = {"video.mp4", "video-story.mp4", "cover.jpg", "ig-track.m4a",
               "video-1x1.mp4", "video-4x5.mp4", "video-2x3.mp4", "video-16x9.mp4"}
LIVE_TTL = timedelta(minutes=15)

# ── tags ──────────────────────────────────────────────────────────────────────
TAG = {  # state → (label, css class)
    "NEEDS_APPROVAL": ("Needs approval", "need"),
    "NEEDS_INPUT": ("Needs approval", "need"),
    "APPROVED": ("Scheduled", "sched"), "QUEUED": ("Scheduled", "sched"), "PUBLISHING": ("Scheduled", "sched"),
    "PUBLISHED": ("Live", "live"), "MEASURING": ("Live", "live"), "ANALYZED": ("Live", "live"),
    "REMOVED": ("Removed", "live"),
    "MANUAL_HANDOFF": ("Needs approval", "need"),
    "BRIEFED": ("In production", "busy"), "SCRIPTED": ("In production", "busy"),
    "RENDERED": ("In production", "busy"), "QA": ("In production", "busy"),
}
ORDER = {"need": 0, "busy": 1, "sched": 2, "live": 3}


def tag_for(client: str, row) -> tuple[str, str] | None:
    st = R.status(client, row["slot_id"])
    if st and st.get("state") == "running":
        return ("In production", "busy") if st.get("kind") == "new" else ("Re-rendering", "busy")
    if row["state"] in ("REJECTED", "BRIEFED", "SCRIPTED", "NEEDS_APPROVAL") and st and st.get("state") == "failed":
        return ("Needs approval", "need")
    return TAG.get(row["state"])


# ── formatting ────────────────────────────────────────────────────────────────
def parse(ts: str | None) -> datetime | None:
    if not ts:
        return None
    dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)   # naive timestamps are UTC


def _zone():
    """The machine's time zone (TACHYON_TZ overrides). Times are stored in UTC and shown in this zone."""
    try:
        name = os.environ.get("TACHYON_TZ") or os.path.realpath("/etc/localtime").split("/zoneinfo/", 1)[1]
        return ZoneInfo(name)
    except (IndexError, KeyError, ValueError, OSError):   # unknown zone → UTC
        return timezone.utc


LOCAL = _zone()


def today_local() -> date:
    return datetime.now(LOCAL).date()


def day_slots(grants: dict, day: date) -> dict[str, str]:
    """{local "HH:MM": UTC ISO} for the daily slots that fall on this local day."""
    out = {}
    for dd in (day - timedelta(days=1), day, day + timedelta(days=1)):
        for t in SCH._slots(grants):
            u = datetime.combine(dd, t, tzinfo=timezone.utc)
            if u.astimezone(LOCAL).date() == day:
                out[u.astimezone(LOCAL).strftime("%H:%M")] = u.isoformat(timespec="seconds")
    return dict(sorted(out.items()))


def utc_iso(day: date, hm: str) -> str:
    """A local day + "HH:MM" as the UTC ISO slot key."""
    dt = datetime.combine(day, time.fromisoformat(hm), tzinfo=LOCAL)
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds")


def _shift(hm: str, to_local: bool) -> str:
    """A daily slot time between UTC and local, at today's offset."""
    off = datetime.now(LOCAL).utcoffset() or timedelta(0)
    t = datetime.combine(date(2000, 1, 2), time.fromisoformat(hm)) + (off if to_local else -off)
    return t.strftime("%H:%M")


def publishing(row) -> bool:
    """The publisher has it, or will on its next run (queued and due)."""
    due = row["state"] == "QUEUED" and row["scheduled_at"] and parse(row["scheduled_at"]) <= datetime.now(timezone.utc)
    return row["state"] == "PUBLISHING" or bool(due)


def on_slot(client: str, at: str) -> bool:
    """At one of the daily slots (Auto), or a time picked by hand (Custom time)."""
    dt = parse(at).astimezone(LOCAL)
    return at in day_slots(C.load_grants(client), dt.date()).values()


def when_tools(client: str, slot: str, row, cal: str, at_: str | None) -> str:
    """Publish now (approved only), Swap slot (the calendar), Custom schedule (any future time)."""
    act = f"/{ESC(quote(client))}/v/{ESC(quote(slot))}/decide"
    now_btn = (f"<form method=post action='{act}' onsubmit=\"return confirm('Publish to Instagram now?')\">"
               f"<button class='btn pri' name=action value=publish_now>{icon('ext', 16)}Publish now</button></form>"
               if row["state"] in ("APPROVED", "QUEUED") else "")
    swap = f"<a class='btn sec' href='{cal}'>{icon('cal', 16)}Swap slot</a>" if cal else ""
    val = parse(at_).astimezone(LOCAL).strftime("%Y-%m-%dT%H:%M") if at_ else ""
    custom = (f"<details class=cust><summary class='btn sec'>{icon('clock', 16)}Custom time</summary>"
              f"<form method=post action='{act}' class=btns><input type=datetime-local name=at value='{val}' required aria-label='Custom time'>"
              f"<button class='btn dark' name=action value=custom>Save</button></form></details>")
    return f"<div class='btns whentools'>{now_btn}{swap}{custom}</div>"


CAPTION_LOCKED = ("PUBLISHING", "PUBLISHED", "MEASURING", "ANALYZED", "MANUAL_HANDOFF")


def when(ts: str | None) -> str:
    dt = parse(ts)
    return dt.astimezone(LOCAL).strftime("%a %-d %b, %H:%M") if dt else ""


def ago(ts: str | None) -> str:
    dt = parse(ts)
    if not dt:
        return ""
    s = (datetime.now(timezone.utc) - dt).total_seconds()
    if s < 90:
        return "just now"
    if s < 3600:
        return f"{int(s // 60)} min ago"
    if s < 86400:
        return f"{int(s // 3600)} h ago"
    return f"{int(s // 86400)} d ago"


def num(v) -> str:
    if v is None:
        return "–"
    if isinstance(v, float) and not v.is_integer():
        return f"{v:,.1f}"
    v = int(v)
    return f"{v / 1000:.1f}k" if v >= 10000 else f"{v:,}"


def read(p: Path) -> str:
    return p.read_text() if p.exists() else ""


def meta_of(client: str, slot: str) -> dict:
    p = C.client_dir(client) / "posts" / slot / "meta.json"
    try:
        return json.loads(p.read_text()) if p.exists() else {}
    except json.JSONDecodeError:
        return {}


def title_of(client: str, row) -> str:
    m = meta_of(client, row["slot_id"])
    return m.get("title") or (row["pillar"] or "Untitled video")


def vo_pill(client: str, slot: str) -> str:
    return "<span class=vo title='Has a voice-over'>VO</span>" if meta_of(client, slot).get("voiceover") else ""


def slot_no(slot: str) -> tuple[str, str]:
    """('W44', '03') for 2026-w44-03; ('', slot) for anything else."""
    m = re.fullmatch(r"\d{4}-w(\d+)-(\d+)", slot)
    return (f"W{int(m[1])}", f"{int(m[2]):02d}") if m else ("", slot)


def pv_button(client: str, slot: str) -> str:
    """Play button that opens the quick preview popup (shell JS)."""
    f = C.client_dir(client) / "posts" / slot / "video.mp4"
    if not f.exists():
        return ""
    return (f"<button type=button class=pvb data-pv='{media_url(client, slot, 'video.mp4')}' "
            f"data-href='/{ESC(quote(client))}/v/{ESC(quote(slot))}' aria-label='Quick preview'>{icon('play', 14)}</button>")


def dl_button(client: str, slot: str, cls: str = "dlb") -> str:
    f = C.client_dir(client) / "posts" / slot / "video.mp4"
    if not f.exists():
        return ""
    return (f"<button type=button class={cls} data-dl='{media_url(client, slot, 'video.mp4')}&dl=1' "
            f"aria-label='Download the video' title='Download'>{icon('download', 15)}</button>")


def media_url(client: str, slot: str, f: str) -> str:
    p = C.client_dir(client) / "posts" / slot / f
    v = int(p.stat().st_mtime) if p.exists() else 0
    return f"/{quote(client)}/media/{quote(slot)}/{f}?v={v}"


# ── icons (Lucide, inline) ────────────────────────────────────────────────────
def icon(name: str, size: int = 18) -> str:
    paths = {
        "grid": '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
        "sliders": '<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/>',
        "chev": '<path d="m6 9 6 6 6-6"/>',
        "back": '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
        "ext": '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
        "check": '<path d="M20 6 9 17l-5-5"/>',
        "redo": '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
        "play": '<polygon points="6 3 20 12 6 21 6 3"/>',
        "cal": '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
        "next": '<path d="m9 18 6-6-6-6"/>',
        "prev": '<path d="m15 18-6-6 6-6"/>',
        "grip": '<circle cx="9" cy="5" r="1.4"/><circle cx="15" cy="5" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="19" r="1.4"/><circle cx="15" cy="19" r="1.4"/>',
        "search": '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
        "download": '<path d="M12 15V3"/><path d="m7 10 5 5 5-5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
        "plus": '<path d="M5 12h14"/><path d="M12 5v14"/>',
        "x": '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
        "music": '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
        "edit": '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.4 2.6a1 1 0 0 1 3 3l-9 9a2 2 0 0 1-.85.5l-2.87.84a.5.5 0 0 1-.62-.62l.84-2.87a2 2 0 0 1 .5-.85z"/>',
        "clock": '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
        "link": '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
        "timer": '<line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/>',
        "pause": '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
    }
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            f'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{paths[name]}</svg>')


# ── page shell ────────────────────────────────────────────────────────────────
CSS = """
@font-face{font-family:Inter;font-weight:100 900;font-display:swap;src:url(/static/inter.woff2) format("woff2")}
:root{--ground:#F8F8F8;--card:#fff;--ink:#111;--ink2:#4A4A4A;--ink3:#6B6B6B;--rule:#E8E8E8;
--side:#131313;--side2:#1E1E1E;--sideink:#A3A3A3;
--lime:#8DF000;--lime-h:#7ED800;--lime-bg:#F2FCE0;--lime-ink:#3D6B00;
--acc:#111;--acc-h:#2A2A2A;--green:#22C55E;--amber:#E0A100;--blue:#3B82F6;--grey-bg:#EFEFEF;
--shadow:0 1px 2px rgba(0,0,0,.04);--r:16px}
*{box-sizing:border-box}
html{scroll-behavior:smooth}@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
html,body{margin:0;background:var(--ground);color:var(--ink);font:15px/1.5 Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
button,textarea,input,select{font:inherit}
.shell{display:grid;grid-template-columns:240px minmax(0,1fr);min-height:100vh}
aside{background:var(--side);color:#fff;padding:28px 12px 16px;display:flex;flex-direction:column;gap:22px;position:sticky;top:0;height:100vh}
.brand{display:block;padding:0 16px;line-height:0}
.brand img{height:36px;width:auto;margin:-4px 0 -2px -6px}
.proj{position:relative;margin:0 4px}
.proj summary{list-style:none;display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid #2C2C2C;background:var(--side2);border-radius:12px;cursor:pointer}
.proj summary::-webkit-details-marker{display:none}
.proj summary:hover{border-color:#444}
.av{width:32px;height:32px;border-radius:9px;background:var(--lime);color:var(--ink);display:grid;place-items:center;font-weight:800;flex:none}
.proj b{display:block;font-size:14.5px;line-height:1.2;color:#fff}.proj small{color:var(--sideink);font-size:12.5px}
.proj .chev{margin-left:auto;color:var(--sideink)}
.proj ul{position:absolute;left:0;right:0;top:calc(100% + 6px);background:var(--side2);border:1px solid #2C2C2C;border-radius:12px;list-style:none;margin:0;padding:6px;z-index:5}
.proj li a{display:flex;gap:10px;align-items:center;padding:8px 10px;border-radius:8px;color:#fff}
.proj li a:hover{background:#2A2A2A}
nav{display:flex;flex-direction:column;gap:2px}
nav a{display:flex;align-items:center;gap:12px;padding:9px 14px;border-radius:9px;color:var(--sideink);font-weight:500;font-size:14.5px}
nav a:hover{color:#fff;background:#1C1C1C}
nav a.on{background:#fff;color:var(--ink);font-weight:600}
.foot{margin-top:auto;font-size:12.5px;color:var(--sideink);padding:12px 6px 0;border-top:1px solid #262626}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--lime);margin-right:6px;vertical-align:1px}
.dot.off{background:#EF4444}
main{padding:28px 40px 64px;width:100%}
h1{font-size:28px;line-height:1.15;margin:0;font-weight:700;letter-spacing:-.02em}
.sub{color:var(--ink3);margin:6px 0 24px;font-size:14.5px}
.sub b{color:var(--ink);font-weight:600}
.card{background:var(--card);border-radius:var(--r);border:1px solid var(--rule);padding:24px}
h2{font-size:17px;margin:0;font-weight:700;letter-spacing:-.01em}
.row{display:flex;align-items:center;justify-content:space-between;gap:16px}
.muted{color:var(--ink3)}
.count{display:inline-grid;place-items:center;min-width:22px;height:20px;padding:0 7px;border-radius:999px;background:var(--ink);color:#fff;font-size:12px;font-weight:700;margin-left:8px;vertical-align:2px}
.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-bottom:1px solid var(--rule);margin:-4px 0 22px;padding-bottom:22px}
.stat{padding:0 18px;border-left:1px solid var(--rule)}.stat:first-child{padding-left:0;border-left:0}
.stat span{display:block;color:var(--ink3);font-size:13.5px}
.stat strong{display:block;font-size:32px;font-weight:800;letter-spacing:-.03em;line-height:1.2;margin-top:2px}
.stat small{color:var(--ink3);font-size:12.5px}
.chart svg{display:block;width:100%;height:auto}
.chart text{font:12px Inter,system-ui;fill:var(--ink3)}
.legend{display:flex;gap:18px;font-size:13px;color:var(--ink2);margin-top:10px}
.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.vhead{margin:0 0 16px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:20px}
.vid{display:block}
.thumb{position:relative;aspect-ratio:260/290;border-radius:16px;overflow:hidden;background:#111;transition:transform .15s ease,box-shadow .15s ease}
.vid:hover .thumb{transform:translateY(-2px);box-shadow:0 12px 28px rgba(0,0,0,.14)}
.thumb img{width:100%;height:100%;object-fit:cover;object-position:50% 30%;display:block}
.thumb:after{content:"";position:absolute;inset:70% 0 0;background:linear-gradient(transparent,rgba(0,0,0,.78));pointer-events:none}
.thumb .tt{position:absolute;left:16px;right:16px;bottom:40px;color:#fff;font-weight:800;font-size:19px;line-height:1.15;letter-spacing:-.01em;z-index:1}
.thumb .tag{position:absolute;left:16px;bottom:12px;z-index:1}
.stw{position:absolute;left:16px;bottom:12px;z-index:1;width:26px;height:26px;border-radius:50%;background:#000;color:var(--blue);display:grid;place-items:center}   /* the live tag's look and height */
.vid h3{font-size:15px;margin:10px 2px 0;font-weight:600}
.vid p{margin:1px 2px 0;color:var(--ink3);font-size:13px}
.tag{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;background:#000;color:#fff;white-space:nowrap}
.tag:before{content:"";width:6px;height:6px;border-radius:50%;background:#fff}
.tag.need{background:var(--lime);color:var(--ink);font-weight:700;font-size:12.5px;padding:5px 12px}.tag.need:before{display:none}
.tag.sched{background:#fff;color:var(--ink)}.tag.sched:before{background:var(--blue)}
.tag.live:before{background:var(--lime)}
.tag.busy{background:rgba(0,0,0,.6)}.tag.busy:before{background:var(--amber)}
.empty{border:1.5px dashed var(--rule);border-radius:16px;aspect-ratio:260/290;display:grid;place-items:center;text-align:center;color:var(--ink3);padding:20px;font-size:14px}
.back{display:inline-flex;align-items:center;gap:8px;color:var(--ink3);font-weight:500;margin-bottom:16px}
.back:hover{color:var(--ink)}
.vpage{display:grid;grid-template-columns:minmax(280px,400px) minmax(0,1fr) minmax(0,1fr);gap:24px;align-items:start}
.hno{font-size:15px;font-weight:600;color:var(--ink3);vertical-align:middle;margin-left:6px}
.whencard .btn{flex:none}.whentools form{display:contents}details.cust{flex-basis:100%}details.cust summary{list-style:none;width:max-content}details.cust summary::-webkit-details-marker{display:none}details.cust input{border:1px solid var(--rule);border-radius:10px;padding:8px 10px;font:inherit}
.player{position:sticky;top:24px}
.frame{position:relative;border-radius:18px;overflow:hidden;background:#000}
.frame video{width:100%;aspect-ratio:9/16;display:block}
.ui{position:absolute;inset:0;pointer-events:none;display:none}
.showui .ui{display:block}
.ui i{position:absolute;left:0;right:0;background:rgba(141,240,0,.22);border:1px dashed rgba(141,240,0,.9)}
.ui b{position:absolute;border:2px dashed #fff;border-radius:4px}
.ui span{position:absolute;right:8px;font:600 11px Inter;color:#fff;background:rgba(0,0,0,.6);padding:2px 6px;border-radius:6px}
.pctl{display:flex;gap:12px;align-items:center;justify-content:space-between;margin-top:14px;flex-wrap:wrap}
.seg{display:inline-flex;background:var(--grey-bg);border-radius:999px;padding:3px}
.seg a{padding:6px 14px;border-radius:999px;font-size:13.5px;font-weight:600;color:var(--ink3)}
.seg a.on{background:#8df0003d;color:#487b00}
.seg,.filt{position:relative}.segind{position:absolute;left:0;top:0;border-radius:999px;background:#8df0003d;opacity:0;pointer-events:none;
  transition:transform .34s cubic-bezier(.34,1.56,.64,1),width .34s cubic-bezier(.34,1.56,.64,1)}   /* overshoot, then snap */
.js-ind>a,.js-ind>button{position:relative;z-index:1;transition:color .2s}.js-ind>a.on,.js-ind>button.on{background:transparent!important}
@media (prefers-reduced-motion:reduce){.segind{transition:none}}
.chk{display:inline-flex;align-items:center;gap:8px;font-size:13.5px;color:var(--ink2);cursor:pointer}
.chk input{accent-color:var(--ink);width:16px;height:16px}
.stack{display:flex;flex-direction:column;gap:20px}
textarea{width:100%;min-height:110px;border:1px solid var(--rule);border-radius:12px;padding:14px 16px;resize:vertical;color:var(--ink);background:#fff;font-size:15px}
textarea:focus,select:focus,.tfield input:focus{outline:none;border-color:var(--ink);box-shadow:0 0 0 3px rgba(0,0,0,.06)}
.btns{display:flex;gap:12px;flex-wrap:wrap;margin-top:16px}
.pickup{margin-left:auto;white-space:nowrap;font-size:14px}.picknote{margin:8px 0 0;text-align:right;font-size:13px}.linkbtn{background:none;border:0;padding:0;cursor:pointer;color:inherit;font:inherit;font-weight:600}
.btn{display:inline-flex;align-items:center;gap:8px;border:0;border-radius:10px;padding:11px 18px;font-weight:600;cursor:pointer;font-size:14.5px}
.btn.pri{background:var(--lime);color:var(--ink)}.btn.pri:hover{background:var(--lime-h)}
.btn.danger{background:#d92d20;color:#fff}.btn.danger:hover{background:#b42318}
.btn.dangerline{color:#b42318}
.btn.sec{background:#fff;color:var(--ink);box-shadow:inset 0 0 0 1px var(--rule)}.btn.sec:hover{box-shadow:inset 0 0 0 1px #BDBDBD}
.btn.dark{background:var(--ink);color:#fff}.btn.dark:hover{background:var(--acc-h)}
.btn:focus-visible,a:focus-visible,summary:focus-visible,.cell:focus-visible{outline:3px solid rgba(141,240,0,.8);outline-offset:2px}
.hint{color:var(--ink3);font-size:13px;margin-top:10px}
.tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:var(--rule);border-radius:12px;overflow:hidden;margin-top:16px;border:1px solid var(--rule)}
.tiles div{background:#fff;padding:14px 16px}
.tiles span{display:block;font-size:13px;color:var(--ink3)}
.tiles strong{display:block;font-size:24px;font-weight:800;letter-spacing:-.02em;margin-top:2px}
.cap{margin-top:12px;color:var(--ink2);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
details.full summary{list-style:none;cursor:pointer}
details.full summary::-webkit-details-marker{display:none}
details.full .more{display:inline-block;color:var(--ink);text-decoration:underline;text-underline-offset:3px;font-weight:600;font-size:14px;margin-top:8px}
details.full[open] summary{display:none}
.capfull{white-space:pre-line;color:var(--ink2);margin-top:12px}
.links{display:flex;gap:22px;flex-wrap:wrap;justify-content:flex-end;align-items:center;font-size:14px;font-weight:600}
.linkbtn{border:0;background:none;padding:0;font:inherit;color:var(--ink3);cursor:pointer}.linkbtn:hover{color:#b42318}
.links a{display:inline-flex;align-items:center;gap:6px;color:var(--ink3)}.links a:hover{color:var(--ink)}
.banner{display:flex;gap:12px;align-items:center;padding:14px 18px;border-radius:12px;background:#FFF4D6;color:#8A4B00;font-weight:600;margin-bottom:24px}
.banner.stop{background:#EF4444;color:#fff}
.errcard{border-color:#f0b4b4}.errcard h2{color:#b42318}
pre.errlog{background:var(--ground);border-radius:12px;padding:14px 16px;margin:14px 0 16px;font-size:12.5px;line-height:1.5;
  white-space:pre-wrap;word-break:break-all;max-height:220px;overflow:auto;color:var(--ink2)}
.note{background:var(--ground);border-radius:12px;padding:14px 16px;margin-top:14px;white-space:pre-line;color:var(--ink2)}
.prog{height:6px;background:var(--grey-bg);border-radius:6px;overflow:hidden;margin-top:16px}
.prog i{display:block;height:100%;background:var(--lime);border-radius:6px;animation:pg 1.6s ease-in-out infinite;width:40%}
@keyframes pg{0%{margin-left:-40%}100%{margin-left:100%}}
pre{white-space:pre-wrap;font:13px/1.55 ui-monospace,monospace;color:var(--ink2);margin:0}
.switch{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:16px 0;border-top:1px solid var(--rule)}
.switch:first-of-type{border-top:0}
.ovgrid{display:grid;grid-template-columns:minmax(0,2fr) minmax(320px,1fr);gap:28px;align-items:start}
.side{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:20px;align-items:start}
.side .perf{grid-column:1/-1}
.side .stats{grid-template-columns:1fr 1fr;row-gap:16px;margin:16px 0;padding-bottom:16px}
.side .stat:nth-child(3){border-left:0;padding-left:0}
.side .stat strong{font-size:28px}
.btn.small{padding:8px 14px;font-size:13.5px;border-radius:9px}
.big{font-size:16px;font-weight:600;margin:0}
.times{display:flex;flex-direction:column;gap:8px;margin:14px 0}
.tfield{display:flex;align-items:center;gap:10px}
.tfield span{font-size:13px;color:var(--ink3);width:52px;flex:none}
.tfield input{flex:1;min-width:0;font-size:17px;font-weight:600;border:1px solid var(--rule);border-radius:10px;padding:7px 12px;color:var(--ink);background:#fff}
.x{width:34px;height:34px;flex:none;border-radius:9px;border:0;background:transparent;color:var(--ink3);cursor:pointer;display:grid;place-items:center}
.x:hover{background:var(--grey-bg);color:var(--ink)}
.x:disabled{opacity:.3;cursor:default;background:transparent}
.autorow{display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid var(--rule);margin-top:20px;padding-top:16px;font-size:14px;color:var(--ink2)}
.toggle{width:44px;height:26px;border-radius:13px;border:0;background:#D4D4D4;position:relative;cursor:pointer;flex:none;padding:0}
.toggle i{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:left .15s}
.toggle.on{background:var(--lime)}.toggle.on i{left:21px}
.cal{display:grid;gap:12px}
.cal .dh{font-size:13px;color:var(--ink3);text-align:center;padding-bottom:4px}
.cal .dh b{display:block;font-size:20px;color:var(--ink);font-weight:700}
.cal .dh.today b{color:var(--ink);background:var(--lime);border-radius:9px;width:fit-content;margin:0 auto;padding:0 9px}
.cal .th{font-size:13px;font-weight:600;color:var(--ink3);padding-top:8px}
.cell{aspect-ratio:260/290;border-radius:12px;overflow:hidden;position:relative;background:#111;display:block;transition:transform .12s,box-shadow .12s,outline-color .12s;outline:3px solid transparent;outline-offset:2px}
.cell[draggable=true]{cursor:grab}
.cell.dragging{opacity:.35}
.cell.over{outline-color:var(--lime);transform:scale(1.03)}
.cell img{width:100%;height:100%;object-fit:cover;object-position:50% 30%;display:block;pointer-events:none}
.cell .tag{position:absolute;left:6px;top:6px;font-size:10.5px;padding:2px 7px}
.cell .tag.need{font-size:10.5px;padding:3px 8px}
.cell .ct{position:absolute;left:0;right:0;bottom:0;padding:24px 8px 8px;background:linear-gradient(transparent,rgba(0,0,0,.8));color:#fff;font-size:12.5px;font-weight:700;line-height:1.2}
.cell.open{background:transparent;border:1.5px dashed #D4D4D4;display:grid;place-items:center;color:var(--ink3);font-size:12.5px;text-align:center}
.cell.past{opacity:.5}
.calnav{display:flex;gap:8px;align-items:center}
.calnav a{display:inline-grid;place-items:center;width:36px;height:36px;border-radius:9px;background:#fff;box-shadow:inset 0 0 0 1px var(--rule)}
.calnav a.txt{width:auto;padding:0 14px;font-weight:600;font-size:14px}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--ink);color:#fff;padding:10px 16px;border-radius:10px;font-size:14px;font-weight:600;display:none;z-index:20}
.tracks{display:flex;flex-direction:column;gap:6px;margin-top:14px;max-height:340px;overflow:auto}
.trk{display:flex;align-items:center;gap:12px;padding:8px 10px;border-radius:10px;border:1px solid var(--rule)}
.trk.on{border-color:var(--ink);background:var(--lime-bg)}
.trk .tn{flex:1;min-width:0}
.trk .tn b{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.trk .tn small{color:var(--ink3);font-size:12.5px}
.pl{width:32px;height:32px;border-radius:50%;border:0;background:var(--ink);color:#fff;cursor:pointer;display:grid;place-items:center;flex:none}
.no{position:absolute;left:10px;top:10px;z-index:2;font:700 11.5px Inter;color:#fff;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);padding:3px 8px;border-radius:7px;letter-spacing:.02em}
.pvb{position:absolute;right:10px;top:10px;z-index:2;width:34px;height:34px;border-radius:50%;border:0;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);color:#fff;display:grid;place-items:center;cursor:pointer;transition:background .15s,transform .15s}
.pvb:hover{background:var(--lime);color:var(--ink);transform:scale(1.08)}
.pvb svg{margin-left:2px}
.cell .tools{position:absolute;right:6px;top:6px;z-index:2;display:flex;gap:4px}
.cell .tools .pvb{position:static;width:28px;height:28px}
.grip{width:28px;height:28px;border-radius:8px;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);color:#fff;display:grid;place-items:center;cursor:grab}
.cell .no{left:6px;top:6px;font-size:10.5px;padding:2px 6px}
.cell .cb{position:absolute;left:0;right:0;bottom:0;padding:26px 8px 8px;background:linear-gradient(transparent,rgba(0,0,0,.82));display:flex;flex-direction:column;gap:5px;align-items:flex-start}
.cell .cb .tag{position:static}.cell .cb .stw{position:static;width:20px;height:20px}
.cell .cb .ct{position:static;padding:0;background:none}
.cell.hl{outline-color:var(--lime);animation:hl 1.4s ease-in-out 3}
@keyframes hl{50%{outline-color:transparent}}
body.dnd .cell.open[data-at]{border-color:var(--lime);background:var(--lime-bg);color:var(--lime-ink)}
.cell.dragging{opacity:.35;transform:scale(.96)}
.month{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}
.mh{font-size:13px;color:var(--ink3);text-align:center;padding-bottom:2px}
.mday{border:1px solid var(--rule);border-radius:12px;padding:8px;min-height:120px;transition:background .12s,border-color .12s}
.mday b{font-size:14px;display:inline-block;padding:0 6px;border-radius:7px}
.mday.today b{background:var(--lime)}
.mday.out{opacity:.45}
.mday.over{border-color:var(--lime);background:var(--lime-bg)}
.mcells{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:6px;margin-top:6px}
.cell.mini{border-radius:8px;outline-width:2px}
.cell.mini .no{left:3px;top:3px;font-size:9.5px;padding:1px 4px;border-radius:5px}
.cell.mini .pvb{width:24px;height:24px;right:auto;top:auto;left:50%;top:50%;transform:translate(-50%,-50%);opacity:0}
.cell.mini:hover .pvb{opacity:1}
.cell.mini .pvb svg{width:11px;height:11px}
.cell.mini .mt{position:absolute;left:0;right:0;bottom:0;font:600 10px Inter;color:#fff;background:linear-gradient(transparent,rgba(0,0,0,.8));padding:10px 4px 3px}
.mdot{position:absolute;right:4px;top:4px;width:8px;height:8px;border-radius:50%;background:#fff;box-shadow:0 0 0 1.5px rgba(0,0,0,.4)}
.mdot.need{background:var(--lime)}.mdot.sched{background:var(--blue)}.mdot.live{background:var(--green)}.mdot.busy{background:var(--amber)}
.cell.mini.open{font-size:10.5px;border-width:1px;cursor:pointer}.cell.mini.open[data-add]:hover{border-color:var(--ink3);color:var(--ink)}
.cell.open{gap:6px;align-content:center}.addnew{border:0;background:#fff;box-shadow:inset 0 0 0 1px var(--rule);border-radius:999px;padding:5px 12px;
  font:600 12.5px Inter,system-ui;color:var(--ink);cursor:pointer}.addnew:hover{box-shadow:inset 0 0 0 1px var(--ink)}
body.dnd .addnew{display:none}
.pvm{position:fixed;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(6px);z-index:50;display:grid;place-items:center;padding:24px}
.pvm[hidden]{display:none}
.pvbox{display:flex;flex-direction:column;gap:12px;align-items:center;animation:pop .18s ease-out}
.pvbox video{height:min(78vh,820px);aspect-ratio:9/16;border-radius:18px;background:#000;display:block}
.pvbar{display:flex;gap:10px}
@keyframes pop{from{transform:scale(.96);opacity:0}}
.srch{display:flex;align-items:center;gap:8px;border:1px solid var(--rule);border-radius:10px;padding:8px 12px;margin-top:14px;color:var(--ink3)}
.srch input{border:0;outline:0;flex:1;min-width:0;font-size:14.5px;color:var(--ink);background:transparent}
.srch:focus-within{border-color:var(--ink)}
.art{width:36px;height:36px;border-radius:6px;object-fit:cover;flex:none}
.pl.off{background:#D4D4D4;cursor:default}
@media (max-width:1400px){.vpage{grid-template-columns:minmax(260px,360px) minmax(0,1fr)}.vpage .c3{grid-column:2}.vpage>.player{grid-row:span 2}}
.upst[hidden]{display:none}.upst{margin-top:16px;display:flex;flex-direction:column;gap:8px;font-size:14px;color:var(--ink2)}
.upbar{height:6px;background:var(--grey-bg);border-radius:6px;overflow:hidden}.upbar i{display:block;height:100%;width:0;background:var(--lime);transition:width .2s}
.upst.busy .upbar i{width:40%!important;animation:pg 1.6s ease-in-out infinite}.upst.err{color:#b42318}.upst.err .upbar{display:none}
label.btn.off{opacity:.5;pointer-events:none}
.upok{display:flex;align-items:center;gap:8px;margin:14px 0 0;color:#2e7d32;font-weight:600;font-size:14px}
.dnum{font-size:22px;font-weight:800}.lnk{font-weight:600;text-decoration:underline;text-underline-offset:3px}
dialog.dlg{border:0;border-radius:18px;padding:28px 30px;width:min(480px,92vw);max-height:80vh;box-shadow:0 24px 48px rgba(0,0,0,.25)}
dialog.dlg::backdrop{background:rgba(0,0,0,.5);backdrop-filter:blur(4px)}dialog.dlg .drops{max-height:60vh}
.drops{list-style:none;margin:14px 0 0;padding:0;display:flex;flex-direction:column;gap:6px;max-height:320px;overflow:auto}
.crow .btn{white-space:nowrap;flex:none}.drops a{font-weight:600}.drops a:hover{text-decoration:underline}
.ghost{position:fixed;left:0;top:0;z-index:60;pointer-events:none;box-shadow:0 24px 48px rgba(0,0,0,.35);border-radius:12px;opacity:.95;transition:none}
.cell[data-slot]{touch-action:pan-y;user-select:none;-webkit-user-select:none}
.grip{touch-action:none}
.dlb{position:absolute;right:10px;bottom:10px;z-index:2;width:34px;height:34px;border-radius:50%;border:0;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);color:#fff;display:grid;place-items:center;cursor:pointer;transition:background .15s,transform .15s}
.dlb:hover{background:#fff;color:var(--ink);transform:scale(1.08)}
.dl{display:inline-flex;align-items:center;gap:6px;font-size:13.5px;font-weight:600;color:var(--ink2)}.dl:hover{color:var(--ink)}
.seg.sm a{padding:5px 10px;font-size:12.5px}
.views{margin-top:6px}
.views .chart{margin-top:12px}
.range{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px}
.range input{border:1px solid var(--rule);border-radius:9px;padding:6px 10px;font-size:14px;color:var(--ink)}
.rrows{margin-top:10px}
.rrow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid var(--rule)}
.rrow b{display:block;font-size:14.5px;font-weight:600}.rrow small{color:var(--ink3);font-size:12.5px}
.rrow.inh .toggle{opacity:.45;cursor:not-allowed}
.rblock{margin-top:16px;border-top:1px solid var(--rule)}
.rblock .rrow:first-child{border-top:0}
.rhead b{font-size:14.5px}
.rgm{position:fixed;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(4px);z-index:50;display:grid;place-items:center;padding:24px}
.rgm[hidden]{display:none}
.rgbox{background:#fff;border-radius:16px;padding:24px;display:flex;flex-direction:column;gap:12px;min-width:300px;animation:pop .18s ease-out}
.pop{display:inline-block}.lvbars{display:flex;align-items:flex-end;gap:3px;height:120px;border-bottom:1px solid var(--rule)}
.lvbars i{flex:1;background:#297cff;border-radius:3px 3px 0 0;min-height:2px}.lvbars i.e{background:var(--grey-bg);height:4px}.tag.gen{background:#FEF3C7;color:#92400E;border-radius:999px}.fmtseg{margin-bottom:12px;flex-wrap:wrap}.rgbox.wide{width:min(560px,100%)}.rgbox textarea{min-height:130px}
.rgbox label{display:flex;flex-direction:column;gap:6px;font-size:13.5px;color:var(--ink3)}
.rgbox input{border:1px solid var(--rule);border-radius:9px;padding:8px 10px;font-size:15px;color:var(--ink)}
.chips{position:absolute;left:10px;top:10px;z-index:2;display:flex;gap:4px;align-items:center}
.chips .no{position:static}
.cell .chips{left:6px;top:6px}.cell.mini .chips{left:3px;top:3px}
.vo{font:700 10.5px Inter;color:#fff;background:#5c2f93;padding:3px 7px;border-radius:999px;letter-spacing:.04em}
.cell .vo{font-size:9.5px;padding:2px 6px}
.filt button{border:0;background:transparent;padding:6px 12px;border-radius:999px;font-size:13.5px;font-weight:600;color:var(--ink3);cursor:pointer;display:inline-flex;gap:6px;align-items:center}
.filt button i{font-style:normal;font-size:11.5px;background:#E2E2E2;color:var(--ink2);border-radius:999px;padding:0 6px;min-width:18px;text-align:center}
.filt button.on{background:#8df0003d;color:#487b00}.filt button.on i{background:var(--lime);color:var(--ink)}
.vid[hidden]{display:none}
.cell.dim{opacity:.18;filter:grayscale(1);transition:opacity .2s}
.tdo{font-size:14px;font-weight:600;color:var(--ink3);margin-left:6px}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
@media (max-width:1100px){.ovgrid{grid-template-columns:1fr}}
@media (max-width:900px){.shell{grid-template-columns:minmax(0,1fr)}nav{overflow-x:auto;max-width:100%}nav a{padding:8px 10px;white-space:nowrap}aside{position:static;height:auto;flex-direction:row;flex-wrap:wrap;align-items:center;padding:14px 16px}
 .foot{display:none}nav{flex-direction:row}main{padding:20px 16px 48px}.vpage{grid-template-columns:1fr}.player{position:static}.vpage .c3{grid-column:auto}.month{gap:3px}.mday{min-height:70px;padding:4px}.mcells{grid-template-columns:1fr}
 .cal{gap:4px}.cal .ct{display:none}.cell .tag{font-size:0;padding:4px}.cell .tag:before{margin:0}
 .stats{grid-template-columns:repeat(2,1fr);row-gap:18px}.stat:nth-child(3){border-left:0;padding-left:0}.grid{grid-template-columns:repeat(2,1fr);gap:12px}.thumb .tt{font-size:15px;left:10px;right:10px;bottom:36px}.thumb .tag{left:10px}}
/* Figma (Tachyon file, screens / video screen): the source of truth for these components */
.shell{grid-template-columns:288px minmax(0,1fr)}
aside{background:#111;padding:0 16px 20px;gap:8px}
.brand{height:88px;display:flex;align-items:center;padding:0 16px}
.proj{margin:0}
.proj summary{height:80px;padding:0 16px;gap:10px;background:#222;border:0;border-radius:10px}
.proj summary .av{width:36px;height:36px;border-radius:50%;font-size:15px;font-weight:700;color:#1a1a1a}
.proj b{font-size:14px;font-weight:600}.proj small{font-size:12px;color:#999}
nav{padding:16px 0;gap:4px}
nav a{height:48px;padding:0 16px;gap:14px;border-radius:8px;color:#888;font-weight:400;font-size:14px}
nav a.on{background:#fff;color:#111;font-weight:600}
.foot{border-top:0;padding:0 4px;font-size:12px;color:#888}.foot .dot{width:10px;height:10px;margin-right:8px}
main{padding:18px 48px 64px}
.back{font-size:14px;margin:0 0 34px}
h1{font-size:32px;line-height:39px;font-weight:700}
.hno{font-size:18px;font-weight:400;color:#999;margin-left:14px}
.sub{margin:8px 0 30px;font-size:14px;color:#888}
.sub .tag.sched{background:#e8f5e9;color:#2e7d32;font-weight:500;padding:4px 10px;margin-right:6px}.sub .tag.sched:before{background:#2e7d32;width:8px;height:8px}
.card{border-radius:18px;border-color:#e5e7eb;padding:36px 30px}
h2{font-size:20px;line-height:24px}
#music h2{font-size:24px;line-height:29px}
.btn,.btn.small{display:inline-flex;align-items:center;justify-content:center;gap:10px;border:1px solid transparent;border-radius:9px;
  padding:11px 15px;font-size:16px;line-height:20px;font-weight:500;box-shadow:none}
.btn.sec{background:#fff;color:#374151;border-color:#d1d5db;box-shadow:none}.btn.sec:hover{border-color:#9ca3af;box-shadow:none}
.btn.pri{background:var(--lime);color:#111827;font-weight:700}
.btn.plain{background:none;color:#374151}.btn.plain:hover{background:#f3f4f6}
.btn:disabled{opacity:.6;cursor:default}
.seg{background:#efefef;padding:0}
.seg a,.filt button{padding:12px 16px;font-weight:600;color:#6b6b6b}
.seg a.on,.filt button.on,.segind{background:linear-gradient(#8df0003d,#8df0003d),#fff;color:#487b00}
.seg.sm a{padding:6px 12px;font-size:13.5px;line-height:18px}
.vpage{grid-template-columns:minmax(280px,480px) minmax(0,808fr) minmax(0,816fr);gap:28px}
.vpage>.player{padding-right:14px}
@media (max-width:1800px){.vpage{grid-template-columns:minmax(260px,min(480px,30vw)) minmax(0,1fr)}.vpage .c3{grid-column:2}.vpage>.player{grid-row:span 2}}
.vpage .stack{gap:28px}
.fmtseg{margin-bottom:23px}
.frame{border-radius:14px}
.pctl{margin-top:23px;justify-content:space-between}
.pdiv{border:0;border-top:1px solid #e5e7eb;margin:23px 0}
.chk.big{padding:0 16px;gap:16px;font-size:16px;line-height:20px;font-weight:500;color:#374151}.chk.big input{width:20px;height:20px}
.crow{display:flex;gap:14px;align-items:center;margin-top:16px}
.crow p{flex:1;min-width:0;margin:0;color:#333}
.crow p.clamp{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:normal}
details.capedit>summary{list-style:none;cursor:pointer}details.capedit>summary::-webkit-details-marker{display:none}
details.capedit[open]>summary{display:none}
.whencard{padding-bottom:28px}
.whencard>.row{flex-wrap:wrap;row-gap:16px}
.whenl{display:flex;flex-direction:column;gap:8px}
.whenl .wl{font-size:16px;line-height:20px;color:#9ca3af}
.whenl .big{font-size:24px;line-height:29px;font-weight:700;color:#111827;margin:0}
.whenl .wm{font-size:16px;line-height:20px;color:#6b7280}
.whentools{margin:0;gap:14px;align-items:center}
details.cust{position:relative;flex-basis:auto}details.cust>summary{list-style:none}details.cust>summary::-webkit-details-marker{display:none}
details.cust form{position:absolute;right:0;top:calc(100% + 8px);z-index:10;background:#fff;border:1px solid #e5e7eb;border-radius:12px;
  padding:14px;margin:0;box-shadow:0 12px 28px rgba(0,0,0,.12);flex-wrap:nowrap}
details.cust input{border:1px solid #d1d5db;border-radius:9px;padding:10px 12px;font:inherit}
.rblock{margin-top:20px;border-top:1px solid #e5e7eb;padding-top:18px}
.rrow b{font-size:18px;line-height:22px;font-weight:700;color:#111827}.rrow small{display:block;margin-top:8px;font-size:16px;line-height:20px;color:#9ca3af}
.rblock .rrow:first-child{padding-top:0}
.links{gap:16px}
.tracks{gap:8px;margin-top:36px;max-height:440px}
.trk{height:80px;padding:0 12px;gap:14px;border-radius:18px;border:1px solid #e8e8e8;flex:none}
.trk.on{background:rgba(141,240,0,.24);border-color:#8df000}
.trk .tn b{font-size:16px;font-weight:700;color:#111}.trk .tn small{display:block;margin-top:3px;font-size:14px;color:#999}
.pl{width:36px;height:36px;background:#2d2d2d}
.inuse{cursor:default}.inuse i{width:10px;height:10px;border-radius:50%;background:var(--green)}

/* overview: performance (numbers | graph) and videos on the left, side cards on the right, square thumbs */
.ovgrid{grid-template-columns:minmax(0,1fr) minmax(400px,520px)}
.side{grid-template-columns:1fr}
.maincol .perf{margin-bottom:28px}
.perfin{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:36px;align-items:stretch}
.perfin>div:first-child{display:flex;flex-direction:column}.perfin>div:first-child .stats{margin:auto 0}   /* numbers centred against the graph */
.perf .stats{grid-template-columns:repeat(4,minmax(0,1fr));padding:0;border-bottom:0}
.perf .stat{padding:0 14px;text-align:center}.perf .stat:first-child{padding-left:0}
.perf .stat strong{font-size:44px;line-height:1.15}
.perf .views{margin-top:0}
.vhd{display:flex;align-items:center;gap:12px}.seg a svg{display:block}.seg a[data-range]{display:inline-flex;align-items:center}
.vhd strong{font-size:32px;font-weight:800;letter-spacing:-.02em;line-height:1}
.vhd span{display:block;color:var(--ink);font-size:14px;font-weight:600}.vhd small{display:block;color:var(--ink3);font-size:12.5px}
.vbody{height:200px;margin-top:14px}.perf .vbody{height:170px}   /* same height in every range: switching never moves the page */
.vbody .chart{height:100%;margin:0}.vbody .chart svg{height:100%;width:100%}
.vbody .live{height:100%;display:flex;flex-direction:column}.vbody .lvbars{flex:1;height:auto}.vbody .live .hint{margin-top:6px}
.grid{grid-template-columns:repeat(auto-fill,minmax(170px,1fr))}
.thumb{aspect-ratio:1/1}
.thumb .tt{font-size:16px;bottom:38px}
@media (max-width:1900px){.perfin{grid-template-columns:1fr;gap:24px}}
@media (max-width:1100px){.ovgrid{grid-template-columns:1fr}}
"""


def display(client: str) -> dict:
    g = C.load_grants(client)
    return {"name": g.get("display_name") or client.capitalize(),
            "handle": g.get("ig_username"), "tagline": g.get("tagline"), "stop": bool(g.get("emergency_stop"))}


SEG_JS = """
(()=>{const ON='a.on,button.on';
const place=(g,el,anim)=>{const i=g.querySelector(':scope>.segind');if(!i||!el)return;i.style.transition=anim?'':'none';
 i.style.width=el.offsetWidth+'px';i.style.height=el.offsetHeight+'px';i.style.transform=`translate(${el.offsetLeft}px,${el.offsetTop}px)`;i.style.opacity=1;};
const init=g=>{if(g.querySelector(':scope>.segind'))return;const i=document.createElement('span');i.className='segind';g.prepend(i);g.classList.add('js-ind');
 place(g,g.querySelector(ON),false);
 g.addEventListener('click',e=>{const t=e.target.closest('a,button');if(!t||t.parentElement!==g)return;
  if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||t.target==='_blank'||t.hasAttribute('download'))return;   // opens elsewhere: this page keeps its tab
  place(g,t,true);g.querySelectorAll(':scope>a,:scope>button').forEach(x=>x.classList.toggle('on',x===t));
  const h=t.tagName==='A'&&t.getAttribute('href');if(h&&!h.startsWith('#')){e.preventDefault();
   setTimeout(()=>location.href=t.href,matchMedia('(prefers-reduced-motion:reduce)').matches?0:360);}});
 if(window.ResizeObserver)new ResizeObserver(()=>place(g,g.querySelector(ON),false)).observe(g);
 new MutationObserver(()=>place(g,g.querySelector(ON),true)).observe(g,{subtree:true,attributes:true,attributeFilter:['class']});};
const all=()=>document.querySelectorAll('.seg,.filt').forEach(init);
all();if(document.fonts)document.fonts.ready.then(()=>document.querySelectorAll('.js-ind').forEach(g=>place(g,g.querySelector(ON),false)));
addEventListener('pageshow',e=>{if(e.persisted)location.reload();});   // Back: show the page's real tab, not the one clicked
addEventListener('resize',()=>document.querySelectorAll('.js-ind').forEach(g=>place(g,g.querySelector(ON),false)));})();
// a selector, a form or a button that reloads this page brings it back where it was: never a jump to the top or an anchor
(()=>{const K='tachyon.keep',save=()=>{try{sessionStorage.setItem(K,JSON.stringify([location.pathname,scrollY]))}catch(_){}};
document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(!a||a.target==='_blank'||a.hasAttribute('download'))return;
 const u=new URL(a.href,location.href);if(u.origin===location.origin&&u.pathname===location.pathname)save();},true);
document.addEventListener('submit',save,true);
const back=()=>{try{const v=JSON.parse(sessionStorage.getItem(K)||'null');sessionStorage.removeItem(K);
 if(v&&v[0]===location.pathname)scrollTo({top:v[1],behavior:'instant'});}catch(_){}};
if(document.readyState==='loading')addEventListener('DOMContentLoaded',back);else back();})();
"""


PV_JS = """
(()=>{const m=document.getElementById('pvm'),v=m.querySelector('video'),o=document.getElementById('pvopen');
const close=()=>{v.pause();v.removeAttribute('src');v.load();m.hidden=true;};
document.addEventListener('click',e=>{const d=e.target.closest('[data-dl]');
 if(d){e.preventDefault();e.stopPropagation();const a=document.createElement('a');a.href=d.dataset.dl;a.download='';document.body.appendChild(a);a.click();a.remove();return;}
 const b=e.target.closest('[data-pv]');
 if(b){e.preventDefault();e.stopPropagation();v.src=b.dataset.pv;o.href=b.dataset.href;m.hidden=false;v.play().catch(()=>{});return;}
 if(e.target===m||e.target.closest('#pvx'))close();},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!m.hidden)close();});})();
"""


def shell(client: str, active: str, body: str, title: str, refresh: int | None = None) -> bytes:
    d = display(client)
    others = "".join(
        f"<li><a href='/{ESC(quote(c))}'><span class=av>{ESC(display(c)['name'][:1])}</span>{ESC(display(c)['name'])}</a></li>"
        for c in C.list_clients())
    handle = f"<small>@{ESC(d['handle'])}</small>" if d["handle"] else ""
    nav = "".join(
        f"<a href='/{ESC(quote(client))}{href}' class='{'on' if key == active else ''}'>{icon(ic)}{label}</a>"
        for key, href, ic, label in (("overview", "", "grid", "Overview"), ("calendar", "/calendar", "cal", "Calendar"),
                                    ("settings", "/settings", "sliders", "Settings")))
    status = ("<span class='dot off'></span>Emergency stop is on" if d["stop"] else "<span class=dot></span>Running")
    meta_refresh = f"<meta http-equiv=refresh content={refresh}>" if refresh else ""
    html_ = (f"<!doctype html><html lang=en><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
             f"{meta_refresh}<title>{ESC(title)} · {ESC(d['name'])} · Tachyon</title><link rel=icon href='/static/icon.svg'><style>{CSS}</style>"
             f"<div class=shell><aside><a class=brand href='/'><img src='/static/logo.svg' alt='Tachyon'></a>"
             f"<details class=proj><summary><span class=av>{ESC(d['name'][:1])}</span><span><b>{ESC(d['name'])}</b>{handle}</span>"
             f"<span class=chev>{icon('chev', 16)}</span></summary><ul>{others}</ul></details>"
             f"<nav>{nav}</nav><div class=foot>{status}</div></aside><main>{body}</main></div>"
             f"<div class=pvm id=pvm hidden><div class=pvbox><video controls playsinline></video>"
             f"<div class=pvbar><a class='btn sec small' id=pvopen href='#'>Open the video page</a>"
             f"<button class='btn dark small' id=pvx>Close</button></div></div></div><script>{PV_JS}{SEG_JS}</script></html>")
    return html_.encode()


def header(client: str, title: str) -> str:
    d = display(client)
    bits = [f"<b>{ESC(d['name'])}</b>"]
    if d["handle"]:
        bits.append(f"@{ESC(d['handle'])}")
    if d["tagline"]:
        bits.append(ESC(d["tagline"]))
    stop = ("<div class='banner stop'>Emergency stop is on. Nothing publishes until it is turned off in Settings.</div>"
            if d["stop"] else "")
    renew = ""
    exp = C.data_expires(client)
    if exp and (exp - date.today()).days <= 14:
        renew = ("<div class='banner'>Meta data access ends "
                 f"{exp.isoformat()}. In Chrome, generate a new token at "
                 "<a href='https://developers.facebook.com/tools/explorer/'>Graph API Explorer</a>, "
                 "put it in ~/Projects/tachyon/.env.local as FACEBOOK_ACCESS_TOKEN, then run "
                 f"<code>python -m spine.publisher.auth exchange {ESC(client)}</code>.</div>")
    from spine.publisher.auth import env_path, read_env
    if date.today() >= date(2026, 11, 22) and read_env(env_path()).get("META_APP_ID") == "1497581085764373":
        renew += ("<div class='banner'>Switch back to the original Meta app (1150072321350463). "
                  "In Firefox, open <a href='https://developers.facebook.com/apps/'>developers.facebook.com/apps</a> "
                  "and enter the phone code. Then generate a token for that app in "
                  "<a href='https://developers.facebook.com/tools/explorer/'>Graph API Explorer</a>.</div>")
    return f"{stop}{renew}<h1>{ESC(title)}</h1><p class=sub>{' · '.join(bits)}</p>"


# ── data ──────────────────────────────────────────────────────────────────────
def account_days(db: DB) -> list[dict]:
    """One row per day from the daily account snapshots (latest wins)."""
    days: dict[str, dict] = {}
    for s in db.snapshots(None):
        if s["source"] == "ig_account" and s["window"] == "daily" and s["metrics"].get("date"):
            days[s["metrics"]["date"]] = s["metrics"]
    return [days[k] for k in sorted(days)]


def media_latest(db: DB, slot: str) -> tuple[dict | None, str | None]:
    snaps = [s for s in db.snapshots(slot) if s["source"] == "ig_media"]
    if not snaps:
        return None, None
    s = max(snaps, key=lambda x: x["collected_at"])
    return s["metrics"], s["collected_at"]


def views_7d(db: DB) -> int | None:
    """Views our videos gained in the last 7 days, from their own counters, so the tile adds up
    to the video cards (the account-level number lags behind)."""
    cut = datetime.now(timezone.utc) - timedelta(days=7)
    total, any_ = 0, False
    for row in db.posts():
        if not row["ig_media_id"]:
            continue
        snaps = sorted((x for x in db.snapshots(row["slot_id"]) if x["source"] == "ig_media"), key=lambda x: x["collected_at"])
        if not snaps:
            continue
        any_ = True
        latest = snaps[-1]["metrics"].get("views") or 0
        before = [x for x in snaps if parse(x["collected_at"]) <= cut]
        base = (before[-1]["metrics"].get("views") or 0) if before and parse(row["published_at"]) < cut else 0
        total += max(latest - base, 0)
    return total if any_ else None


def refresh_live(client: str, db: DB, row) -> None:
    """Pull current numbers for a live video if the last pull is older than LIVE_TTL."""
    if not row["ig_media_id"] or row["state"] == "REMOVED":
        return
    _, at = media_latest(db, row["slot_id"])
    if at and datetime.now(timezone.utc) - parse(at) < LIVE_TTL:
        return
    try:
        from ..measure.insights import derived, fetch_media
        from ..publisher.graph import Graph
        m = fetch_media(Graph(C.token(client)), row["ig_media_id"])
        m["_derived"] = derived(m, meta_of(client, row["slot_id"]).get("duration_s"))
        db.add_snapshot(row["slot_id"], "ig_media", "live", m)
        from ..measure.insights import hour_key
        db.add_snapshot(row["slot_id"], "ig_media", hour_key(), m)   # also feeds the views-per-hour chart
    except Exception:   # no token, no network: show what we have
        pass


def ig_sync(client: str, slot: str) -> str:
    """An Instagram track is attached at publish, so the file is silent of it. Play the local copy
    alongside the video, following play, pause, seek, loop and the player's volume."""
    m = meta_of(client, slot)
    cfg = m.get("audio_configuration")
    if not cfg:
        return ""
    T = _tracks()
    f = T.ig_preview(client, slot) if T else None
    if not f:
        return ""
    try:
        vol = max(1, min(100, int(cfg.get("audio_volume", 100)))) / 100
    except (TypeError, ValueError):
        vol = 1.0
    return (f"<audio id=igtrack preload=auto src='{media_url(client, slot, f.name)}'></audio>"
            "<script>(()=>{const v=document.querySelector('#frame video'),a=document.getElementById('igtrack');if(!v||!a)return;"
            f"const MV={vol};"
            "const sync=()=>{if(a.duration)a.currentTime=v.currentTime%a.duration};"
            "const fade=()=>v.duration?Math.max(0,Math.min(1,(v.duration-v.currentTime)/1.2)):1;"   # same 1.2 s fade as baked tracks
            "const vol=()=>{a.volume=v.muted?0:Math.min(1,v.volume*MV*fade())};"
            "let raf=0;const tick=()=>{raf=0;if(!v.paused){vol();raf=requestAnimationFrame(tick)}};"
            "v.addEventListener('play',()=>{if(!raf)raf=requestAnimationFrame(tick)});"
            "v.addEventListener('play',()=>{sync();vol();a.play().catch(()=>{})});"
            "v.addEventListener('pause',()=>a.pause());v.addEventListener('seeked',()=>{sync();vol()});"
            "v.addEventListener('volumechange',vol);v.addEventListener('ended',()=>a.pause());"
            "setInterval(()=>{if(!v.paused&&a.duration&&Math.abs(a.currentTime-v.currentTime%a.duration)>0.3)sync()},1000);})();</script>")


# ── charts ────────────────────────────────────────────────────────────────────
def bar_chart(days: list[dict], key: str, key2: str | None = None, W: int = 960, H: int = 220) -> str:
    end = datetime.now(timezone.utc).date()
    first = datetime.fromisoformat(days[0]["date"]).date() if days else end
    n = max(7, min(30, (end - first).days + 1))
    span = [(end - timedelta(days=i)).isoformat() for i in range(n - 1, -1, -1)]
    by = {d["date"]: d for d in days}
    vals = [(by.get(d) or {}).get(key) for d in span]
    vals2 = [(by.get(d) or {}).get(key2) for d in span] if key2 else []
    top = max([v or 0 for v in vals + vals2] + [1])
    step = 10 ** max(0, len(str(int(top))) - 1)
    top = ((int(top) // step) + 1) * step
    L, B, T = 30, 24, 10
    bw = (W - L) / n
    out = [f"<svg viewBox='0 0 {W} {H}' role=img aria-label='{ESC(key)} per day, last {n} days'>"]
    for i in range(3):
        y = T + (H - B - T) * i / 2
        out.append(f"<line x1={L} x2={W} y1={y:.1f} y2={y:.1f} stroke='#E8E8E8'/>"
                   f"<text x=0 y={y + 4:.1f}>{num(top * (1 - i / 2))}</text>")
    for i, (d, v) in enumerate(zip(span, vals)):
        x = L + i * bw
        if v:
            h = (H - B - T) * v / top
            out.append(f"<rect x={x + bw * .18:.1f} y={H - B - h:.1f} width={bw * .64:.1f} height={h:.1f} rx=4 fill='#8DF000'>"
                       f"<title>{d}: {num(v)} {key}</title></rect>")
        if key2 and vals2[i]:
            h2 = (H - B - T) * vals2[i] / top
            out.append(f"<rect x={x + bw * .18:.1f} y={H - B - h2:.1f} width={bw * .64:.1f} height=3 rx=1.5 fill='#111'/>")
        if i % max(1, n // 4) == 0 or i == n - 1:
            dt = datetime.fromisoformat(d)
            out.append(f"<text x={x + bw / 2:.1f} y={H - 6} text-anchor=middle>{dt.strftime('%-d %b')}</text>")
    out.append("</svg>")
    return "".join(out)


# ── views over time ───────────────────────────────────────────────────────────
GRANS = ("live", "hour", "day", "month", "custom")
LIVE_EVERY = 60          # seconds between Instagram calls for the Live view (6 calls measured at 1 % of quota)
LIVE_KEEP = 30           # minutes shown
_LIVE: dict[tuple[str, str], list[tuple[float, int]]] = {}   # (client, slot or "") -> [(epoch, total views)]


def live_views(client: str, slot: str | None) -> dict:
    """Views right now (sum of live videos, or one video), sampled from Instagram at most once a
    minute while someone has the Live view open. Each sample keeps per-video counts, so a video
    going live adds no spike. Samples live in memory: a restart starts afresh."""
    import threading
    import time as _t
    with _LIVE_LOCK.setdefault(client, threading.Lock()):
        key = (client, slot or "")
        pts = _LIVE.setdefault(key, [])
        now_ = _t.time()
        err = None
        if not pts or now_ - pts[-1][0] >= LIVE_EVERY - 1:
            db = DB.for_client(C.client_dir(client))
            try:
                rows = [r for r in ([db.post(slot)] if slot else db.posts()) if r["ig_media_id"] and r["state"] != "REMOVED"]
                from ..publisher.graph import Graph
                g = Graph(C.token(client))
                per = {}
                for r in rows:
                    if r["ig_media_id"]:
                        d = g.get(f"{r['ig_media_id']}/insights", metric="views")
                        per[r["slot_id"]] = int(((d.get("data") or [{}])[0].get("values") or [{}])[0].get("value") or 0)
                pts.append((now_, per))
            except Exception as e:  # noqa: BLE001 — no token or network: say so, keep the samples
                err = str(e)[:200]
            finally:
                db.close()
        del pts[:-(LIVE_KEEP + 1)]
        per_min = [{"t": int(b_[0]), "v": sum(max(0, n - a_[1][k]) for k, n in b_[1].items() if k in a_[1])}
                   for a_, b_ in zip(pts, pts[1:])]
        out = {"total": sum(pts[-1][1].values()) if pts else None, "points": per_min,
               "since": int(pts[0][0]) if pts else None, "every": LIVE_EVERY}
        if err:
            out["error"] = err
        return out


_LIVE_LOCK: dict = {}


def live_block(base_json: str) -> str:
    """Live views: one bar per minute; the header's #lvnew shows the last 30 minutes."""
    return (f"<div class=live data-src='{ESC(base_json)}'>"
            f"<div class=lvbars id=lvbars></div><p class=hint id=lvnote>One bar per minute while this page is open. "
            f"Instagram's counter can lag a few minutes.</p>"
            "<script>(()=>{const w=document.currentScript.parentElement,b=w.querySelector('#lvbars'),v=w.closest('.views')||w;"
            "const draw=d=>{if(d.error){w.querySelector('#lvnote').textContent='Instagram did not answer: '+d.error;return}"
            "const s=d.points.reduce((a,p)=>a+p.v,0),n=v.querySelector('#lvnew');if(n)n.textContent=s.toLocaleString();"
            "const pts=Array(Math.max(0,30-d.points.length)).fill(null).concat(d.points.slice(-30));const mx=Math.max(1,...d.points.map(p=>p.v));"
            "b.innerHTML=pts.map(p=>p?`<i style='height:${Math.max(4,p.v/mx*100)}%' title='${new Date(p.t*1000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}: ${p.v}'></i>`:'<i class=e></i>').join('');};"
            "const go=()=>fetch(w.dataset.src).then(r=>r.json()).then(draw).catch(()=>{});go();setInterval(go,60000);})();</script></div>")


def _bucket(dt: datetime, g: str) -> datetime:
    if g == "hour":
        return dt.replace(minute=0, second=0, microsecond=0)
    if g == "day":
        return dt.replace(hour=0, minute=0, second=0, microsecond=0)
    return dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _next(dt: datetime, g: str) -> datetime:
    if g == "hour":
        return dt + timedelta(hours=1)
    if g == "day":
        return dt + timedelta(days=1)
    return (dt.replace(day=28) + timedelta(days=4)).replace(day=1)


def view_window(g: str, frm: str | None, to: str | None) -> tuple[str, datetime, datetime]:
    """(granularity, start, end) for the chart. Custom picks hour/day/month from the span."""
    now = datetime.now(LOCAL)
    if g == "custom" and frm and to:
        a = datetime.fromisoformat(frm).replace(tzinfo=LOCAL)
        b = datetime.fromisoformat(to).replace(tzinfo=LOCAL) + timedelta(days=1)
        if b <= a:
            a, b = b - timedelta(days=1), a + timedelta(days=1)
        span = (b - a).days
        return ("hour" if span <= 3 else "day" if span <= 120 else "month"), a, min(b, now + timedelta(hours=1))
    if g == "hour":
        return "hour", _bucket(now - timedelta(hours=47), "hour"), now
    if g == "month":
        s = now.replace(day=1)
        for _ in range(11):
            s = (s - timedelta(days=1)).replace(day=1)
        return "month", _bucket(s, "month"), now
    return "day", _bucket(now - timedelta(days=29), "day"), now


def views_series(db: DB, slot: str | None, g: str, start: datetime, end: datetime) -> list[tuple[datetime, int]]:
    """Views gained per bucket, from the cumulative per-video snapshots (publish time counts as 0).
    slot=None sums every video."""
    posts = [db.post(slot)] if slot else [r for r in db.posts() if r["published_at"]]
    gains: dict[datetime, int] = {}
    for r in posts:
        if not r["published_at"]:
            continue
        pts = [(parse(r["published_at"]).astimezone(LOCAL), 0)]
        pts += sorted((parse(s["collected_at"]).astimezone(LOCAL), int(s["metrics"].get("views") or 0))
                      for s in db.snapshots(r["slot_id"]) if s["source"] == "ig_media")
        for (t0, v0), (t1, v1) in zip(pts, pts[1:]):
            if v1 > v0:
                k = _bucket(t1, g)
                gains[k] = gains.get(k, 0) + (v1 - v0)
    out, t = [], _bucket(start, g)
    while t < end:
        out.append((t, gains.get(t, 0)))
        t = _next(t, g)
    return out


def views_chart(series: list[tuple[datetime, int]], g: str, W: int = 600, H: int = 200) -> str:
    n = len(series) or 1
    top = max([v for _, v in series] + [1])
    step = 10 ** max(0, len(str(int(top))) - 1)
    top = ((int(top) // step) + 1) * step
    L, B, T = 34, 22, 8
    bw = (W - L) / n
    fmt = {"hour": "%H:%M", "day": "%-d %b", "month": "%b %y"}[g]
    out = [f"<svg viewBox='0 0 {W} {H}' role=img aria-label='Views per {g}'>"]
    for i in range(3):
        y = T + (H - B - T) * i / 2
        out.append(f"<line x1={L} x2={W} y1={y:.1f} y2={y:.1f} stroke='#E8E8E8'/><text x=0 y={y + 4:.1f}>{num(top * (1 - i / 2))}</text>")
    every = max(1, n // 5)
    for i, (t, v) in enumerate(series):
        x = L + i * bw
        if v:
            h = (H - B - T) * v / top
            out.append(f"<rect x={x + bw * .15:.1f} y={H - B - h:.1f} width={max(bw * .7, 1):.1f} height={h:.1f} rx={min(3, bw * .3):.1f} fill='#8DF000'>"
                       f"<title>{t.strftime(fmt if g != 'hour' else '%-d %b %H:%M')}: {num(v)} views</title></rect>")
        if i % every == 0:
            out.append(f"<text x={x + bw / 2:.1f} y={H - 5} text-anchor=middle>{t.strftime(fmt)}</text>")
    out.append("</svg>")
    return "".join(out)


def popup(trigger: str, box: str) -> str:
    """A button that opens a centred box (`box` is the inner form). Esc, Cancel or a click
    outside closes it."""
    return (f"<div class=pop>{trigger}<div class=rgm hidden>{box}</div><script>(()=>{{"
            "const w=document.currentScript.parentElement,m=w.querySelector('.rgm');"
            "w.querySelector('[data-open]').addEventListener('click',e=>{e.preventDefault();m.hidden=false;"
            "const f=m.querySelector('textarea,input:not([type=hidden]),button');if(f)f.focus();});"
            "m.addEventListener('click',e=>{if(e.target===m||e.target.closest('[data-close]'))m.hidden=true;});"
            "document.addEventListener('keydown',e=>{if(e.key==='Escape')m.hidden=true;});})();</script></div>")


def prepare_button(client: str, week: str, label: str) -> str:
    base = f"/{ESC(quote(client))}"
    last = W.last_instructions(client)
    box = (f"<form method=post action='{base}/week' class='rgbox wide'><input type=hidden name=action value=prepare>"
           f"<input type=hidden name=week value='{ESC(week)}'>"
           f"<h2>{ESC(label)}</h2>"
           f"<label>Instructions for this batch<textarea name=instructions rows=6 "
           f"placeholder='e.g. Add our Rosa app particles to the empty dark areas. Try a light, airy style with new layouts.'>{ESC(last)}</textarea></label>"
           f"<p class=hint style='margin:0'>Applies to every video in the batch. Leave empty for the usual style. "
           f"{'Prefilled with the last batch&#39;s instructions.' if last else ''}</p>"
           f"<div class=btns><button class='btn pri small'>Start</button><button type=button class='btn sec small' data-close>Cancel</button></div></form>")
    return popup(f"<button type=button class='btn pri small' data-open>{ESC(label)}</button>", box)


def views_block(client: str, db: DB, slot: str | None, q: dict, base: str, W: int = 600, H: int = 200, default: str = "day") -> str:
    """Number | Views + period, the range selector across, then a fixed-height body (switching never moves the page)."""
    g = q.get("g") if q.get("g") in GRANS else default
    seg = "".join(f"<a href='{base}?g={x}' class='{'on' if g == x else ''}'>{x.capitalize()}</a>" if x != "custom" else
                  f"<a href='#' data-range class='{'on' if g == x else ''}' title='Custom range' aria-label='Custom range'>{icon('cal', 16)}</a>" for x in GRANS)
    head = lambda n, lab, per: (f"<div class=row style='flex-wrap:wrap;gap:10px'><div class=vhd><strong{' id=lvnew' if g == 'live' else ''}>{n}</strong>"  # noqa: E731
                                f"<div><span>{lab}</span><small>{per}</small></div></div><div class='seg sm'>{seg}</div></div>")
    today = today_local()
    custom = (f"<div class=rgm hidden><form method=get action='{base}' class=rgbox><input type=hidden name=g value=custom>"
              f"<h2>Custom range</h2><label>From<input type=date name=from value='{ESC(q.get('from') or (today - timedelta(days=13)).isoformat())}'></label>"
              f"<label>To<input type=date name=to value='{ESC(q.get('to') or today.isoformat())}'></label>"
              f"<div class=btns><button class='btn dark small'>Show</button><button type=button class='btn sec small' data-rgclose>Cancel</button></div></form></div>")
    keep = ("<script>(()=>{const v=document.currentScript.closest('.views'),m=v.querySelector('.rgm');"
            "v.querySelector('[data-range]').addEventListener('click',e=>{e.preventDefault();m.hidden=false;m.querySelector('input[type=date]').focus();});"
            "m.addEventListener('click',e=>{if(e.target===m||e.target.closest('[data-rgclose]'))m.hidden=true;});"
            "document.addEventListener('keydown',e=>{if(e.key==='Escape')m.hidden=true;});})();</script>")
    if g == "live":
        src = f"/{quote(client)}/live.json" + (f"?slot={quote(slot)}" if slot else "")
        return f"<div id=views class=views>{head('…', 'Views', 'last 30 min')}{custom}<div class=vbody>{live_block(src)}</div>{keep}</div>"
    eg, a, b = view_window(g, q.get("from"), q.get("to"))
    series = views_series(db, slot, eg, a, b)
    total = sum(v for _, v in series)
    span = {"hour": "last 48 hr", "day": "last 30 days", "month": "last 12 mon"}.get(g, "custom")
    body = (f"<div class=chart>{views_chart(series, eg, W=W, H=H)}</div>" if total else
            "<p class=muted style='margin:14px 0 4px'>No views in this period yet.</p>")
    return f"<div id=views class=views>{head(num(total), 'Views', span)}{custom}<div class=vbody>{body}</div>{keep}</div>"


# ── overview ──────────────────────────────────────────────────────────────────
def video_card(client: str, row, tag: tuple[str, str], db: DB) -> str:
    slot = row["slot_id"]
    cover = C.client_dir(client) / "posts" / slot / "cover.jpg"
    img = f"<img src='{media_url(client, slot, 'cover.jpg')}' alt='' loading=lazy>" if cover.exists() else ""
    label, cls = tag
    if cls == "live":
        m, _ = media_latest(db, slot)
        line = f"{num((m or {}).get('views'))} views · {num((m or {}).get('reach'))} reached" if m else f"Live since {when(row['published_at'])}"
    elif cls == "sched":
        line = f"Posts {when(row['scheduled_at'])}" if row["scheduled_at"] else "Waiting for a slot"
    elif cls == "busy":
        line = (f"For {when(row['scheduled_at'])}" if row["scheduled_at"] and label == "In production" else "New version on the way")
    else:
        line = "Review and approve"
    wk, no = slot_no(slot)
    return (f"<a class=vid data-cls='{cls}' href='/{ESC(quote(client))}/v/{ESC(quote(slot))}'><div class=thumb>{img}"
            f"<span class=chips><span class=no title='{ESC(wk)} video {ESC(no)}'>{ESC(wk + ' · ' if wk else '')}#{ESC(no)}</span>{vo_pill(client, slot)}</span>"
            f"{pv_button(client, slot)}{dl_button(client, slot)}"
            + (f"<span class=stw title='Scheduled' aria-label='Scheduled'>{icon('timer', 14)}</span>" if cls == "sched"
               else f"<span class='tag {cls}'>{ESC(label)}</span>") + "</div>"
            f"<h3>{ESC(title_of(client, row))}</h3>{'' if cls == 'need' else f'<p>{ESC(line)}</p>'}</a>")


def pick_text(picked: str) -> str:
    """'<found>-<failed>' from the last "Look for manual posts" → words for the card."""
    m = re.fullmatch(r"(\d+)-(\d+)", picked)
    if not m:
        return "Could not reach Instagram"
    found, failed = int(m[1]), int(m[2])
    parts = [("Nothing new" if not failed else "") if not found else ("1 post found" if found == 1 else f"{found} posts found")]
    if failed:
        parts.append(f"{failed} could not be added")
    return " · ".join(p for p in parts if p)


def schedule_card(client: str, picked: str | None = None) -> str:
    times = sorted(_shift(t.strftime("%H:%M"), True) for t in SCH._slots(C.load_grants(client)))
    base = f"/{ESC(quote(client))}/schedule"
    n = len(times)
    rows = "".join(
        f"<div class=tfield><span>Post {i + 1}</span><input type=time name=t value='{ESC(t)}' required aria-label='Post {i + 1} time'>"
        f"<button class=x name=remove value={i} formnovalidate {'disabled' if n == 1 else ''} aria-label='Remove post {i + 1}' title='Remove'>{icon('x', 16)}</button></div>"
        for i, t in enumerate(times))
    per = {1: "Once a day", 2: "Twice a day", 3: "Three times a day"}.get(n, f"{n} times a day")
    add = (f"<button class='btn sec small' name=add value=1 {'disabled' if n >= MAX_SLOTS else ''}>{icon('plus', 15)}Add a post</button>")
    pick_note = ""
    if picked is not None:   # the result of the last "Look for manual posts"
        pick_note = f"<p class='muted picknote'>{ESC(pick_text(picked))}</p>"
    return (f"<section class=card><div class=row><h2>Publishing schedule</h2><span class=muted>{ESC(datetime.now(LOCAL).tzname() or "")}</span></div>"
            f"<p class=muted style='margin:4px 0 0;font-size:14px'>{per}, every day.</p>"
            f"<form method=post action='{base}'><div class=times>{rows}</div>"
            f"<div class=btns style='margin-top:0;align-items:center;flex-wrap:nowrap'><button class='btn dark small' name=save value=1>Save</button>{add}"
            f"<button class='lnk linkbtn pickup' formaction='/{ESC(quote(client))}/pickup' formnovalidate>"
            f"Look for manual posts</button></div>{pick_note}</form>"
            "</section>")


def week_card(client: str) -> str:
    wk = W.next_week()
    days = W.week_days(wk)
    span = f"{days[0].strftime('%-d %b')} – {days[-1].strftime('%-d %b')}"
    st = W.status(client, wk) or {}
    ws = W.settings(client)
    total = len(W.free_slot_times(client, wk))
    base = f"/{ESC(quote(client))}"
    if st.get("state") == "running":
        if st.get("step") == "planning":
            body = "<p class=big>Planning the week…</p>"
        else:
            body = f"<p class=big>{st.get('done', 0)} of {st.get('total', total)} videos made</p>"
        body += "<div class=prog><i></i></div><p class=hint>Each one lands in Needs approval when it is ready.</p>"
    elif st.get("state") == "done":
        bad = len(st.get("failed") or [])
        body = (f"<div class=crow><p><b>{st.get('total', total) - bad} of {st.get('total', total)} videos ready.</b> "
                f"{'Approve them before Monday.' if not bad else f'{bad} could not be made; see the calendar.'}</p>"
                f"<a class='btn sec' href='{base}/calendar?w={wk}'>Open the week</a></div>")
    else:
        err = f"<div class=note>Last run failed: {ESC(st.get('error') or '')}</div>" if st.get("state") == "failed" else ""
        body = (f"{err}<div class=crow><p>{total} videos, one for each slot. Claude plans them, makes them and "
                f"sends each one here for approval.</p>{prepare_button(client, wk, 'Prepare next week')}</div>")
    auto = (f"<form method=post action='{base}/week' class=autorow><input type=hidden name=action value=auto>"
            f"<input type=hidden name=value value='{0 if ws['auto'] else 1}'>"
            f"<span>Prepare automatically every {ESC(ws['day'])}</span>"
            f"<button class='toggle {'on' if ws['auto'] else ''}' aria-pressed={'true' if ws['auto'] else 'false'} aria-label='Prepare automatically'><i></i></button></form>")
    return (f"<section class=card><div class=row><h2>Next week</h2><span class=muted>{span}</span></div>"
            f"<div style='margin-top:16px'>{body}</div>{auto}</section>")


def render_overview(client: str, q: dict | None = None) -> bytes:
    d = C.client_dir(client)
    db = DB.for_client(d)
    try:
        for row in db.posts():
            if TAG.get(row["state"], ("", ""))[1] == "live":
                refresh_live(client, db, row)
        days = account_days(db)
        week = days[-7:]
        roll = next((x["metrics"] for x in db.snapshots(None) if x["source"] == "ig_account" and x["window"] == "7d"), None)
        total = lambda k: (roll.get(k) if roll else sum((x.get(k) or 0) for x in week) if week else None)  # noqa: E731
        vviews = views_7d(db)
        followers = days[-1].get("followers_count") if days else None
        rows = [(r, tag_for(client, r)) for r in db.posts()]
        rows = [(r, t) for r, t in rows if t]
        key = lambda r: parse(r["published_at"] or r["scheduled_at"] or r["updated_at"]).timestamp()  # noqa: E731
        rows.sort(key=lambda rt: (ORDER[rt[1][1]], key(rt[0]) if rt[1][1] in ("sched", "busy") else -key(rt[0])))
        count = {c: sum(1 for _, t in rows if t[1] == c) for c in ORDER}
        live_rows = [rt for rt in rows if rt[1][1] == "live"]
        rows = [rt for rt in rows if rt[1][1] != "live"] + live_rows[:8]

        stats = "".join(
            f"<div class=stat><span>{lab}</span><strong>{num(v)}</strong><small>{note}</small></div>"
            for lab, v, note in (
                ("Views", vviews if vviews is not None else total("views"), "last 7 days"),
                ("Reached", total("reach"), "last 7 days"),
                ("Followers", followers, f"as of {datetime.fromisoformat(days[-1]['date']).strftime('%-d %b')}" if days else "no data yet"),
                ("Link taps", total("profile_links_taps"), "last 7 days"),
            ))
        chart = views_block(client, db, None, q or {}, f"/{quote(client)}", W=600, H=170, default="hour")   # the wide column: keep text at its size
        perf = f"<section class='card perf'><div class=perfin><div><h2>Performance</h2><div class=stats>{stats}</div></div><div>{chart}</div></div></section>"

        shown = {c: sum(1 for _, t in rows if t[1] == c) for c in ORDER}
        filt = "".join(
            f"<button type=button data-f='{k}' class='{'on' if k == 'all' else ''}'>{lab}<i>{n}</i></button>"
            for k, lab, n in (("all", "All", len(rows)), ("need", "Needs approval", shown["need"]), ("busy", "In production", shown["busy"]),
                              ("sched", "Scheduled", shown["sched"]), ("live", "Live", shown["live"])) if k == "all" or n)
        cards = "".join(video_card(client, r, t, db) for r, t in rows) or \
            "<div class=empty>No videos yet. Prepare next week to fill this.</div>"
        vids = (f"<div class='row vhead' style='flex-wrap:wrap'><h2>Videos{f' <span class=tdo>{shown["need"]} to approve</span>' if shown['need'] else ''}</h2><div class='seg filt' role=group aria-label='Show'>{filt}</div></div>"
                f"<div class=grid id=vgrid>{cards}</div><p class='muted fempty' hidden>Nothing here right now.</p>"
                "<script>(()=>{const K='tachyon.ovfilter',g=document.getElementById('vgrid'),e=document.querySelector('.fempty');"
                "const set=f=>{let n=0;g.querySelectorAll('.vid').forEach(v=>{const s=f==='all'||v.dataset.cls===f;v.hidden=!s;n+=s;});"
                "document.querySelectorAll('.filt button').forEach(b=>b.classList.toggle('on',b.dataset.f===f));e.hidden=n>0;"
                "try{localStorage.setItem(K,f)}catch(_){}};"
                "document.querySelectorAll('.filt button').forEach(b=>b.addEventListener('click',()=>set(b.dataset.f)));"
                "let f='all';try{f=localStorage.getItem(K)||'all'}catch(_){}if(!document.querySelector(`.filt [data-f='${f}']`))f='all';set(f);})();</script>")
        body = (header(client, "Overview") +
                f"<div class=ovgrid><div class=maincol>{perf}{vids}</div>"
                f"<div class=side>{schedule_card(client, (q or {}).get('picked'))}{week_card(client)}{dropped_card(client)}</div></div>")
        return shell(client, "overview", body, "Overview", refresh=30 if count["busy"] else None)
    finally:
        db.close()


UPLOAD_JS = """window.tUp=window.tUp||function(inp){const f=inp.files[0];if(!f)return;inp.value='';
const c=inp.closest('.card'),st=c.querySelector('.upst'),bar=st.querySelector('i'),t=st.querySelector('span'),lab=inp.closest('label');
const fail=m=>{st.className='upst err';t.textContent=m;lab.classList.remove('off');};
st.hidden=false;st.className='upst';bar.style.width='0';t.textContent='Uploading… 0%';lab.classList.add('off');
const x=new XMLHttpRequest();x.open('POST',inp.dataset.url+'?name='+encodeURIComponent(f.name));
x.upload.onprogress=e=>{if(e.lengthComputable){const p=Math.round(e.loaded/e.total*100);bar.style.width=p+'%';t.textContent='Uploading… '+p+'%';}};
x.upload.onload=()=>{st.className='upst busy';t.textContent='Reading the export…';};
x.onload=()=>{let d={};try{d=JSON.parse(x.responseText)}catch(_){}
 if(x.status===200&&d.html)c.outerHTML=d.html;else fail(d.error||x.responseText||'The upload failed. Try again.');};
x.onerror=()=>fail('The upload failed: check the connection and try again.');x.send(f);};"""


def dropped_card(client: str, note: str = "") -> str:
    """Followers who dropped between the last two Instagram exports (spine/audience.py).
    Upload shows its progress, then 'Reading the export…', then this card again with the result (and `note`)."""
    r = AU.dropped(client)   # the upload imports; files left in clients/<c>/exports/ come in with the daily cron
    up = (f"<label class='btn sec'>{icon('plus', 16)}Upload export<input type=file accept='.zip,.json' hidden "
          f"data-url='/{ESC(quote(client))}/audience/upload' onchange='tUp(this)'></label>")
    status = "<div class=upst hidden><div class=upbar><i></i></div><span></span></div>"
    done = f"<p class=upok>{icon('check', 15)}{ESC(note)}</p>" if note else ""
    if not r["snapshots"]:
        body = f"<div class=crow><p>Upload your Instagram export (JSON, Followers and following) to start.</p>{up}</div>"
    elif r["snapshots"] == 1:
        body = (f"<div class=crow><p>First export saved: <b>{num(r['followers'])}</b> followers. "
                f"Upload the next one to see who dropped.</p>{up}</div>")
    else:
        since = parse(r["since"]).astimezone(LOCAL).strftime("%-d %b")
        n = len(r["dropped"])
        names = "".join(f"<li><a href='https://www.instagram.com/{ESC(quote(u))}/' target=_blank rel=noopener>@{ESC(u)}</a></li>"
                        for u in r["dropped"])
        lst = f" <a href='#' class=lnk onclick='event.preventDefault();document.getElementById(\"droplist\").showModal()'>See the list</a>" if n else ""
        dlg = (f"<dialog class=dlg id=droplist><div class=row><h2>{n} followers dropped since {since}</h2>"
               f"<button class=x onclick='this.closest(\"dialog\").close()' aria-label='Close'>{icon('x', 16)}</button></div>"
               f"<ul class=drops>{names}</ul></dialog>") if n else ""   # outside the <p>: a dialog cannot sit in one
        body = (f"<div class=crow><p><b class=dnum>{n}</b> {'follower' if n == 1 else 'followers'} dropped since {since}.{lst}</p>{up}</div>{dlg}")
    at = parse(r["at"]).astimezone(LOCAL).strftime("%-d %b, %H:%M") if r["at"] else ""
    last = f"<p class=hint>Last export {at} · {num(r['followers'])} followers.</p>" if at else ""
    return (f"<section class=card id=dropped><h2>Followers who dropped</h2>{body}{status}{done}{last}"
            f"<script>{UPLOAD_JS}</script></section>")


# ── music ─────────────────────────────────────────────────────────────────────
def _tracks():
    try:
        from .. import tracks as T
        return T
    except Exception:
        return None


AUDIO_JS = """
(()=>{let a=null,cur=null;const PL=document.getElementById('i-play').innerHTML,PS=document.getElementById('i-pause').innerHTML;
const reset=()=>{if(cur)cur.innerHTML=PL;cur=null;};
document.querySelectorAll('.pl[data-src]').forEach(x=>x.addEventListener('click',()=>{
 if(cur===x){a.pause();reset();return;}
 if(a)a.pause();reset();a=new Audio(x.dataset.src);cur=x;x.innerHTML=PS;
 a.onended=reset;a.play().catch(()=>reset());}));})();
"""


def music_card(client: str, slot: str, cls: str, src: str = "file", q: str = "") -> str:
    T = _tracks()
    if not T or cls == "live":
        return ""
    src = "instagram" if src in ("ig", "instagram") else "file"
    try:
        try:
            lib = T.list_tracks(client, source=src, query=q or None)
        except TypeError:          # older tracks.py without source/query
            lib = [t for t in T.list_tracks(client) if (t.get("source") or "file") == src]
        cur = T.current_track(client, slot)
    except Exception as e:
        lib, cur = [], None
        err = str(e)
    else:
        err = (getattr(T, "last_error", lambda c: None)(client) if src == "instagram" and not lib else None)
    base = f"/{ESC(quote(client))}/v/{ESC(quote(slot))}"
    seg = (f"<div class=seg><a href='{base}' class='{'on' if src == 'file' else ''}'>Library</a>"
           f"<a href='{base}?music=ig' class='{'on' if src == 'instagram' else ''}'>Instagram</a></div>")
    search = ""
    if src == "instagram":
        search = (f"<form method=get action='{base}' class=srch><input type=hidden name=music value=ig>"
                  f"{icon('search', 16)}<input name=q value='{ESC(q)}' placeholder='Search Instagram music' aria-label='Search Instagram music'>"
                  f"</form><p class=hint style='margin:8px 0 0'>{'Results for “' + ESC(q) + '”' if q else 'Trending on Instagram'}. "
                  f"The track is attached on Instagram when it publishes; here it plays with the video so you can hear the mix.</p>")
    rows = []
    for t in lib:
        on = t["id"] == cur
        prev_src = (t.get("preview") if str(t.get("preview") or "").startswith("http")
                    else f"/{quote(client)}/track/{quote(t['id'])}" if (t.get("preview") or t.get("path")) else None)
        prev = (f"<button type=button class=pl data-src='{ESC(prev_src)}' aria-label='Play {ESC(t['title'])}'>{icon('play', 16)}</button>"
                if prev_src else f"<span class='pl off' title='No preview available'>{icon('music', 14)}</span>")
        art = f"<img class=art src='{ESC(t['cover'])}' alt=''>" if t.get("cover") else ""
        who = ESC(t.get("artist") or "")
        mood = f" · {ESC(t['mood'])}" if t.get("mood") else ""
        dur = f" · {int(t['duration']) // 60}:{int(t['duration']) % 60:02d}" if t.get("duration") else ""
        btn = ("<span class='btn sec inuse'><i></i>In use</span>" if on else
               f"<button class='btn sec' name=track value='{ESC(t['id'])}'>Use</button>")
        rows.append(f"<div class='trk{' on' if on else ''}'>{prev}{art}<div class=tn><b>{ESC(t['title'])}</b><small>{who}{mood}{dur}</small></div>{btn}</div>")
    if not rows:
        msg = ("Instagram music is not reachable right now: " + ESC(err)) if err else "Nothing found."
        rows.append(f"<p class=muted style='margin:6px 0 0'>{msg}</p>")
    icons_ = f"<template id=i-play>{icon('play', 16)}</template><template id=i-pause>{icon('pause', 16)}</template>"
    return (f"<section class=card id=music><div class=row><h2>Music</h2>{seg}</div>{search}"
            f"<form method=post action='{base}/track' class=tracks><input type=hidden name=src value='{src}'>{''.join(rows)}</form>"
            f"{icons_}<script>{AUDIO_JS}</script></section>")


def replies_card(client: str, slot: str) -> str:
    r = C.video_replies(client, slot)
    g = C.load_grants(client)
    base = f"/{ESC(quote(client))}/v/{ESC(quote(slot))}/replies"
    rows = []
    for kind, lab in (("comments", "Reply to comments"), ("dm", "Reply to messages")):
        proj = bool(g["auto_reply"][kind])
        on = r[kind] if r["custom"] else proj
        note = "Set for this video" if r["custom"] else f"From Settings: {'on' if proj else 'off'}"
        btn = (f"<form method=post action='{base}'><input type=hidden name={kind} value='{0 if on else 1}'>"
               f"<button class='toggle {'on' if on else ''}' {'' if r['custom'] else 'disabled'} aria-pressed={'true' if on else 'false'} aria-label='{lab}'><i></i></button></form>")
        rows.append(f"<div class='rrow{'' if r['custom'] else ' inh'}'><div><b>{lab}</b><small>{note}</small></div>{btn}</div>")
    custom = (f"<form method=post action='{base}'><input type=hidden name=custom value='{0 if r['custom'] else 1}'>"
              f"<button class='toggle {'on' if r['custom'] else ''}' aria-pressed={'true' if r['custom'] else 'false'} aria-label='Custom for this video'><i></i></button></form>")
    stop = "<p class=hint>Emergency stop is on: nothing replies.</p>" if g["emergency_stop"] else ""
    head = (f"<div class='rrow rhead'><div><b>Custom replies for this video</b>"
            + ("" if r["custom"] else f"<small>Off: Settings decide (comments {'on' if g['auto_reply']['comments'] else 'off'}, "
                                      f"messages {'on' if g['auto_reply']['dm'] else 'off'})</small>")
            + f"</div>{custom}</div>")
    return f"<div id=replies class=rblock>{head}{''.join(rows) if r['custom'] else ''}{stop}</div>"


def formats_button(client: str, slot: str, have: list[str]) -> str:
    st = F.status(client, slot)
    if st.get("state") == "running":
        doing = {"writing": "Laying out", "rendering": "Rendering", "queued": "Waiting to make", "checking": "Checking"}.get(st.get("step"), "Generating")
        return f"<span class='tag gen'>{doing} {ESC(F.LABEL.get(st.get('current'), ''))}…</span>"
    err = (f"<p class=hint style='color:#b42318;margin:0'>Last run failed: {ESC(st.get('error') or '')}</p>"
           if st.get("state") == "failed" else "")
    act = f"/{ESC(quote(client))}/v/{ESC(quote(slot))}/formats"
    boxes = "".join(f"<label class=chk style='flex-direction:row;gap:8px;color:var(--ink)'><input type=checkbox name=r value={r} "
                    f"{'' if r in have else 'checked'}>{F.LABEL[r]}{' <span class=muted>(remake)</span>' if r in have else ''}</label>"
                    for r in F.RATIOS)
    box = (f"<form method=post action='{act}' class=rgbox><h2>Generate other formats</h2>"
           f"<p class=muted style='margin:0;max-width:400px'>For posting by hand on other platforms. Each format is a new layout "
           f"of this film (same words, beats and footage, placed for that size), rendered with the reel's sound. "
           f"A few minutes per format. A video with an Instagram track comes out without that music.</p>{err}{boxes}"
           f"<div class=btns><button class='btn pri small'>Generate</button><button type=button class='btn sec small' data-close>Cancel</button></div></form>")
    return popup(f"<button type=button class='btn plain' data-open>Generate new version</button>", box)


# ── video page ────────────────────────────────────────────────────────────────
def render_video(client: str, slot: str, variant: str = "reel", music: str = "file", q: str = "", qs: dict | None = None) -> bytes:
    d = C.client_dir(client)
    db = DB.for_client(d)
    try:
        row = db.post(slot)
        sdir = d / "posts" / slot
        tag = tag_for(client, row) or ("Not on the plan", "busy")
        label, cls = tag
        if cls == "live":
            refresh_live(client, db, row)
        st = R.status(client, slot) or {}
        has_story = (sdir / "video-story.mp4").exists()
        fmts = F.ready(client, slot)
        vfile = ("video-story.mp4" if variant == "story" and has_story else
                 f"video-{variant}.mp4" if variant in fmts else "video.mp4")
        is_story = vfile == "video-story.mp4"
        is_fmt = vfile not in ("video.mp4", "video-story.mp4")
        # what Instagram covers: Meta's safe zones (top 14 %, bottom 35 %, 6 % sides) and, for the
        # reel, the 4:5 crop it gets in the profile grid / feed
        ui = ("<div class=ui><i style='top:0;height:14%'></i><i style='bottom:0;height:35%'></i>"
              + ("" if is_story else "<b style='left:0;right:0;top:14.84%;bottom:14.84%'></b><span style='top:15.4%'>Feed 4:5 crop</span>")
              + f"<span style='top:1%'>{'Story' if is_story else 'Reel'} UI</span><span style='bottom:1%'>{'Reply bar' if is_story else 'Caption · buttons'}</span></div>")
        ar = "9/16" if not is_fmt else F.LABEL[variant].replace(":", "/")
        poster = "" if is_fmt else f" poster='{media_url(client, slot, 'cover.jpg')}'"
        player = (f"<div class=frame id=frame><video controls playsinline preload=metadata{poster} style='aspect-ratio:{ar}' "
                  f"src='{media_url(client, slot, vfile)}'></video>{'' if is_fmt else ui}</div>") if (sdir / vfile).exists() else \
            "<div class=empty>No video file yet.</div>"
        base = f"/{quote(client)}/v/{quote(slot)}"
        opts = [("reel", "Reel", base)] + ([("story", "Story", f"{base}?as=story")] if has_story else []) \
            + [(r, F.LABEL[r], f"{base}?as={r}") for r in fmts]
        cur = "story" if is_story else variant if is_fmt else "reel"
        seg = ("<div class='seg fmtseg'>" + "".join(f"<a href='{h}' class='{'on' if k == cur else ''}'>{lab}</a>" for k, lab, h in opts)
               + "</div>") if len(opts) > 1 else ""
        what = "story" if is_story else F.LABEL[variant] if is_fmt else "reel"
        dls = (f"<a class='btn sec' href='{media_url(client, slot, vfile)}&dl=1' download>{icon('download', 16)}Download {what}</a>"
               if (sdir / vfile).exists() else "")
        player = seg + player
        if not is_fmt:
            player += ig_sync(client, slot)
        m_ = meta_of(client, slot)
        film_src = (m_.get("film") or {}).get("source")
        can_fmt = not (m_.get("upload") and not (film_src and (ROOT / film_src).exists()))   # an upload until its first edit
        player += (f"<div class=pctl><span>{formats_button(client, slot, fmts) if can_fmt else ''}</span>{dls}</div>"
                   + ("" if is_fmt else "<hr class=pdiv><label class='chk big'><input type=checkbox "
                      "onchange=\"document.getElementById('frame').classList.toggle('showui',this.checked)\">Show what Instagram covers</label>"))

        # status line under the title
        if cls == "live":
            when_line = f"<span class='tag live'>Live</span> &nbsp;since {when(row['published_at'])}"
        elif cls == "sched":
            when_line = f"<span class='tag sched'>Scheduled</span> &nbsp;{when(row['scheduled_at'])}"
        elif cls == "busy":
            when_line = f"<span class='tag busy'>{ESC(label)}</span>"
        else:
            when_line = "<span class='tag need'>Needs approval</span>"

        blocks = []
        # decision
        if cls == "need" and st.get("state") == "failed":
            step = {"editing": "while editing the film", "rendering": "while rendering",
                    "finishing": "after rendering"}.get(st.get("step"), "before it started")
            is_new = st.get("kind") == "new"
            rerun = ("Tries again from where it stopped, with the same prompt." if is_new else
                     "Renders again with the change already made." if st.get("step") in ("rendering", "finishing")
                     else "Runs the edit and the render again with the same notes.")
            blocks.append(
                f"<section class='card errcard' id=error><h2>{'Making it failed' if is_new else 'Re-render failed'}</h2>"
                f"<p class=hint>Failed {ESC(step)} {ESC(ago(st.get('failed_at') or st.get('updated_at')))}. "
                + ("Nothing was made yet.</p>" if is_new and not (sdir / "video.mp4").exists() else
                   "The new cut is in place (it failed after rendering), so you can approve it or send new notes.</p>"
                   if st.get("step") == "finishing" else
                   "The video here is still the previous cut, so you can approve it or send new notes.</p>")
                + (f"<p class=hint><b>{'Your prompt' if is_new else 'Your notes'}:</b> {ESC(st.get('notes') or '')}</p>" if st.get("notes") else "")
                + f"<pre class=errlog>{ESC(st.get('error') or 'No error text.')}</pre>"
                f"<form method=post action='/{ESC(quote(client))}/v/{ESC(quote(slot))}/decide'>"
                f"<div class=btns><button class='btn pri' name=action value=retry>{icon('redo')}Re-run</button></div>"
                f"<p class=hint>{rerun}</p></form></section>")
        nothing_yet = st.get("kind") == "new" and not (sdir / "video.mp4").exists()
        if cls == "need" and not nothing_yet:
            blocks.append(
                f"<section class=card><h2>Your call</h2>"
                f"<form method=post action='/{ESC(quote(client))}/v/{ESC(quote(slot))}/decide' style='margin-top:16px'>"
                f"<label for=notes class=muted style='font-size:14px'>What should change? Leave empty to approve.</label>"
                f"<textarea id=notes name=notes placeholder='e.g. Lead with the advantage, not the number. Make it faster.' style='margin-top:8px'></textarea>"
                f"<div class=btns><button class='btn pri' name=action value=approve>{icon('check')}Approve and schedule</button>"
                f"<button class='btn sec' name=action value=reject>{icon('redo')}Send back for a new version</button></div>"
                f"</form></section>")
        elif row["state"] in ("APPROVED", "QUEUED"):
            blocks.append(
                f"<section class=card><h2>Your call</h2>"
                f"<form method=post action='/{ESC(quote(client))}/v/{ESC(quote(slot))}/decide' class=crow>"
                f"<p>Approved. Something came up? Take the approval back and keep editing; it stays off Instagram until you approve again.</p>"
                f"<button class='btn sec' name=action value=revoke>{icon('edit', 16)}Edit</button>"
                f"</form></section>")
        elif cls == "busy" and label == "In production":
            blocks.append(f"<section class=card><h2>Being made</h2><div class=prog><i></i></div>"
                          f"<p class=hint>Planned for {ESC(when(row['scheduled_at']))}. It comes back here for approval when it is ready. "
                          f"This page refreshes itself.</p></section>")
        elif cls == "busy":
            step = {"queued": "Starting", "editing": "Applying your notes", "rendering": "Rendering the new version"}.get(st.get("step"), "Working")
            blocks.append(f"<section class=card><h2>{ESC(step)}…</h2><div class=prog><i></i></div>"
                          f"<div class=note>{ESC(st.get('notes') or '')}</div>"
                          f"<p class=hint>Started {ESC(ago((st.get('rounds') or [{}])[-1].get('at')))}. This page refreshes itself.</p></section>")

        right = []
        # when it publishes, with a way to change it
        at_ = row["published_at"] if cls == "live" else (row["scheduled_at"] or (preview_slot(client, db, slot) if cls == "need" else None))
        cal = ""
        if at_:
            dt_ = parse(at_)
            y_, w_, _ = dt_.isocalendar()
            cal = f"/{ESC(quote(client))}/calendar?w={y_}-W{w_:02d}&hl={ESC(quote(slot))}"
        if row["state"] == "REMOVED":
            wtxt, wh, act = "Removed from Instagram", when(at_), ""
        elif cls == "live":
            wtxt, wh = "Published", when(at_)
            act = (f"<a class='btn sec' href='{ESC(row['permalink'])}' target=_blank rel=noopener>{icon('ext', 16)}Open on Instagram</a>"
                   if row["permalink"] else "")
        else:
            wtxt = {"sched": "Goes live", "need": "Planned for", "busy": "Planned for"}.get(cls, "Planned for")
            wh = when(at_) if at_ else "No slot yet"
            act = ""
        if not act:
            act = (f"<div class='btns whentools'><button class='btn pri' disabled>{icon('ext', 16)}Publishing…</button></div>"
                   if publishing(row) else when_tools(client, slot, row, cal, at_) if cls != "live" and row["state"] in DB.MOVABLE else "")
        mode = "" if cls == "live" or not at_ else "Auto" if on_slot(client, at_) else "Custom"
        right.append(f"<section class='card whencard'><div class=row><div class=whenl><span class=wl>{wtxt}</span>"
                     f"<p class=big>{ESC(wh)}</p>{f'<span class=wm>{mode}</span>' if mode else ''}</div>{act}</div>"
                     + replies_card(client, slot) + "</section>")

        if row["state"] not in NO_DELETE and (st.get("state") != "running"):
            right_end = delete_card(client, slot, title_of(client, row))
        elif row["state"] in LIVE and row["ig_media_id"]:
            right_end = remove_card(client, slot, title_of(client, row))
        else:
            right_end = ""
        byhand = (f"<section class=card><h2>Posted it by hand?</h2><div class=crow>"
                  f"<p>Want to use a song only the Instagram app has? Post manually in the app, then link the post here so it gets tracked.</p>"
                  f"<a class='btn sec' href='/{ESC(quote(client))}/v/{ESC(quote(slot))}/byhand'>{icon('link', 16)}Link</a></div></section>"
                  if row["state"] in HAND_FROM else "")

        # performance
        m, at = media_latest(db, slot)
        if m:
            dv = m.get("_derived") or {}
            avg = m.get("ig_reels_avg_watch_time")
            tiles = [("Views", num(m.get("views"))), ("Accounts reached", num(m.get("reach"))), ("Likes", num(m.get("likes"))),
                     ("Shares", num(m.get("shares"))), ("Saves", num(m.get("saved"))),
                     ("Avg. watch", f"{avg / 1000:.1f} s" if avg else "–")]
            hold = dv.get("hold")
            perf = (f"<div class=tiles>{''.join(f'<div><span>{a}</span><strong>{b}</strong></div>' for a, b in tiles)}</div>"
                    f"<p class=hint>Updated {ESC(ago(at))}{(' · watched to the end on average' if hold >= 1 else f' · watched {hold * 100:.0f}% on average') if hold else ''}.</p>")
        elif cls == "live":
            perf = "<p class=muted style='margin:8px 0 0'>First numbers arrive within the hour.</p>"
        else:
            perf = "<p class=muted style='margin:8px 0 0'>Numbers appear once it is live.</p>"
        if row["published_at"]:
            perf += views_block(client, db, slot, qs or {}, f"/{quote(client)}/v/{quote(slot)}")
        perf_card = f"<section class=card><h2>Performance</h2>{perf}</section>"

        blocks.append(music_card(client, slot, cls, music, q))
        if row["published_at"]:
            blocks.insert(0, perf_card)   # published: performance leads the middle column

        # post text: two lines, then Edit (until it goes out) or Read
        cap = read(sdir / "caption.txt").strip()
        short = ESC(' '.join(cap.split())) or "No text yet."
        if row["state"] not in CAPTION_LOCKED and not row["published_at"]:   # editable until it goes out
            right.append(f"<section class=card><h2>Post text</h2>"
                         f"<details class=capedit><summary class=crow><p class=clamp>{short}</p>"
                         f"<span class='btn sec' title='Read the full text and edit'>{icon('edit', 16)}Edit</span></summary>"
                         f"<form method=post action='/{ESC(quote(client))}/v/{ESC(quote(slot))}/decide' style='margin-top:16px'>"
                         f"<textarea name=caption rows=14 maxlength=2200 aria-label='Post text'>{ESC(cap)}</textarea>"
                         f"<div class=btns><button class='btn dark' name=action value=caption>Save text</button>"
                         f"<button type=button class='btn sec' onclick=\"this.closest('details').open=false\">Cancel</button></div></form></details></section>")
        elif cap:
            right.append(f"<section class=card><h2>Post text</h2>"
                         f"<details class=capedit><summary class=crow><p class=clamp>{short}</p>"
                         f"<span class='btn sec' title='Read the full text'>Read</span></summary>"
                         f"<div class=capfull>{ESC(cap)}</div></details></section>")
        right.append(byhand)

        links = []
        if (sdir / "qa.md").exists():
            links.append(f"<a class='btn plain' href='/{ESC(quote(client))}/v/{ESC(quote(slot))}/qa'>QA report</a>")
        if right_end:
            links.append(right_end)
        if links:
            right.append(f"<div class=links>{''.join(links)}</div>")

        body = (f"<a class=back href='/{ESC(quote(client))}'>{icon('back', 16)}Overview</a>"
                f"<h1>{ESC(title_of(client, row))} <span class=hno>{ESC(' · '.join(x for x in slot_no(slot) if x))}</span></h1><p class=sub>{when_line}</p>"
                f"<div class=vpage><div class=player>{player}</div><div class='stack c2'>{''.join(blocks)}</div>"
                f"<div class='stack c3'>{''.join(right)}</div></div>")
        making = F.status(client, slot).get("state") == "running"
        return shell(client, "overview", body, title_of(client, row), refresh=15 if cls == "busy" or publishing(row) else 5 if making else None)
    finally:
        db.close()


CAL_JS = """
(()=>{
// remember this view (week/month + date) for the next visit to the calendar
document.cookie='cal___C__='+encodeURIComponent(location.search.replace(/[?&]hl=[^&]*/,''))+';path=/;max-age=31536000;samesite=lax';
const toast=document.getElementById('toast');
const say=(t,ms)=>{toast.textContent=t;toast.style.display='block';if(ms)setTimeout(()=>toast.style.display='none',ms);};
// press and hold (or grab the dots) to drag; a quick click still opens the video
const HOLD=350,SLOP=8;let st=null;
const targetAt=(x,y)=>{const e=document.elementFromPoint(x,y);if(!e)return null;
 const t=e.closest('.cell[data-slot],.cell[data-at],[data-day]');return t&&t!==st.el&&!st.el.contains(t)?t:null;};
document.querySelectorAll('.cell[data-slot]').forEach(c=>{
 c.addEventListener('dragstart',e=>e.preventDefault());
 c.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('.pvb'))return;
  const grip=!!e.target.closest('.grip');
  st={el:c,x:e.clientX,y:e.clientY,id:e.pointerId,on:false,over:null,timer:null};
  const start=()=>{if(!st)return;st.on=true;c.setPointerCapture(st.id);const r=c.getBoundingClientRect();
   const g=c.cloneNode(true);g.classList.add('ghost');g.style.width=r.width+'px';g.style.height=r.height+'px';
   st.dx=st.x-r.left;st.dy=st.y-r.top;st.g=g;document.body.appendChild(g);move(st.x,st.y);
   c.classList.add('dragging');document.body.classList.add('dnd');if(navigator.vibrate)navigator.vibrate(15);};
  if(grip){e.preventDefault();start();}else st.timer=setTimeout(start,HOLD);});});
const move=(x,y)=>{st.g.style.transform=`translate(${x-st.dx}px,${y-st.dy}px) rotate(-2deg) scale(1.04)`;
 const t=targetAt(x,y);if(t!==st.over){if(st.over)st.over.classList.remove('over');st.over=t;if(t)t.classList.add('over');}};
document.addEventListener('pointermove',e=>{if(!st||e.pointerId!==st.id)return;
 if(!st.on){if(Math.hypot(e.clientX-st.x,e.clientY-st.y)>SLOP){clearTimeout(st.timer);st=null;}return;}
 e.preventDefault();move(e.clientX,e.clientY);});
const end=async e=>{if(!st||e.pointerId!==st.id)return;clearTimeout(st.timer);const s=st;st=null;if(!s.on)return;
 // swallow the click that follows a drag so it does not open the page
 const kill=ev=>{ev.preventDefault();ev.stopPropagation();};window.addEventListener('click',kill,{capture:true,once:true});setTimeout(()=>window.removeEventListener('click',kill,true),50);
 document.body.classList.remove('dnd');if(s.over)s.over.classList.remove('over');
 const t=e.type==='pointerup'?s.over:null;
 if(!t){s.g.remove();s.el.classList.remove('dragging');return;}
 const b=new URLSearchParams({slot:s.el.dataset.slot});
 if(t.dataset.slot)b.set('swap',t.dataset.slot);else if(t.dataset.at)b.set('at',t.dataset.at);else b.set('day',t.dataset.day);
 const r=await fetch('/__C__/move',{method:'POST',body:b});
 s.g.remove();s.el.classList.remove('dragging');
 if(!r.ok){say(await r.text(),3000);return;}
 const tgt=t.dataset.day?t.querySelector('.cell.open[data-at]')||t:t;
 const A=s.el.getBoundingClientRect(),B=tgt.getBoundingClientRect(),ease='transform .5s cubic-bezier(.2,.8,.2,1)';
 [s.el,tgt].forEach(x=>{x.style.position='relative';x.style.zIndex=3;x.style.transition=ease;});
 requestAnimationFrame(()=>{s.el.style.transform=`translate(${B.left-A.left}px,${B.top-A.top}px) scale(${B.width/A.width})`;
  if(tgt!==t||t.dataset.slot||t.dataset.at)tgt.style.transform=`translate(${A.left-B.left}px,${A.top-B.top}px) scale(${A.width/B.width})`;});
 setTimeout(()=>location.reload(),560);};
document.addEventListener('pointerup',end);document.addEventListener('pointercancel',end);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&st&&st.on){st.g.remove();st.el.classList.remove('dragging');document.body.classList.remove('dnd');if(st.over)st.over.classList.remove('over');st=null;}});
const hl=document.querySelector('.cell.hl');if(hl)hl.scrollIntoView({block:'center',behavior:'smooth'});
// status filter: non-matching videos fade out, the grid keeps its shape (remembered)
const FK='tachyon.calfilter',setF=f=>{document.querySelectorAll('.cell[data-cls]').forEach(c=>c.classList.toggle('dim',f!=='all'&&c.dataset.cls!==f));
 document.querySelectorAll('.calfilt button').forEach(b=>b.classList.toggle('on',b.dataset.f===f));try{localStorage.setItem(FK,f)}catch(_){}};
document.querySelectorAll('.calfilt button').forEach(b=>b.addEventListener('click',()=>setF(b.dataset.f)));
let f0='all';try{f0=localStorage.getItem(FK)||'all'}catch(_){}setF(f0);
})();
"""


def _cal_items(client: str, db: DB, first, last) -> dict:
    out: dict[tuple[str, str], list] = {}
    preview = SCH.preview_slots(db, unslotted(client, db), C.load_grants(client))
    for row in db.posts():
        tag = tag_for(client, row)
        ts = parse(row["published_at"] or row["scheduled_at"] or preview.get(row["slot_id"]))
        ts = ts and ts.astimezone(LOCAL)
        if tag and ts and first <= ts.date() <= last:
            out.setdefault((ts.date().isoformat(), ts.strftime("%H:%M")), []).append((row, tag))
    return out


def _cell(client: str, row, tag, past: bool, hl: str | None, mini: bool = False, hm: str = "") -> str:
    label, cls = tag
    slot = row["slot_id"]
    cov = C.client_dir(client) / "posts" / slot / "cover.jpg"
    img = f"<img src='{media_url(client, slot, 'cover.jpg')}' alt='' loading=lazy>" if cov.exists() else ""
    movable = row["state"] in DB.MOVABLE and not past
    dnd = f" draggable=true data-slot='{ESC(slot)}'" if movable else ""
    grip = f"<span class=grip title='Drag to move or swap'>{icon('grip', 14)}</span>" if movable else ""
    _, no = slot_no(slot)
    t = ESC(title_of(client, row))
    badge = (f"<span class=stw title='Scheduled' aria-label='Scheduled'>{icon('timer', 12)}</span>" if cls == "sched"
             else f"<span class='tag {cls}'>{ESC(label)}</span>")   # scheduled: the stopwatch, as on the overview
    if mini:
        return (f"<a class='cell mini{' hl' if slot == hl else ''}' data-cls='{cls}' href='/{ESC(quote(client))}/v/{ESC(quote(slot))}' title='{hm} · {t}'{dnd}>{img}"
                f"<span class=chips><span class=no>#{ESC(no)}</span></span><span class='mdot {cls}'></span><span class=mt>{hm}</span>{pv_button(client, slot)}</a>")
    return (f"<a class='cell{' hl' if slot == hl else ''}' data-cls='{cls}' href='/{ESC(quote(client))}/v/{ESC(quote(slot))}' title='{t}'{dnd}>{img}"
            f"<span class=chips><span class=no>#{ESC(no)}</span>{vo_pill(client, slot)}</span><span class=tools>{grip}{pv_button(client, slot)}</span>"
            f"<span class=cb>{badge}<span class=ct>{t}</span></span></a>")


def _cal_head(client: str, view: str, title: str, prev: str, today_q: str, nxt: str, label: str = "Today") -> str:
    base = f"/{quote(client)}/calendar"
    t = today_local()
    y, w, _ = t.isocalendar()
    seg = (f"<div class=seg><a href='{base}?w={y}-W{w:02d}' class='{'on' if view == 'week' else ''}'>Week</a>"
           f"<a href='{base}?view=month&m={t:%Y-%m}' class='{'on' if view == 'month' else ''}'>Month</a></div>")
    filt = "".join(f"<button type=button data-f='{k}' class='{'on' if k == 'all' else ''}'>{lab}</button>"
                   for k, lab in (("all", "All"), ("need", "Needs approval"), ("busy", "In production"), ("sched", "Scheduled"), ("live", "Live")))
    return ("<div class=row style='margin-bottom:12px;flex-wrap:wrap'>"
            f"<div class=row style='gap:16px;flex-wrap:wrap'><h2>{title}</h2>{seg}<div class='seg filt calfilt' role=group aria-label='Show'>{filt}</div></div><div class=calnav>"
            f"<a href='{base}?{prev}' aria-label='Previous'>{icon('prev', 16)}</a>"
            f"<a class=txt href='{base}?{today_q}' title='Back to today'>{ESC(label)}</a>"
            f"<a href='{base}?{nxt}' aria-label='Next'>{icon('next', 16)}</a></div></div>"
            "<p class=hint style='margin:0 0 16px'>Grab a video by its dots and drop it on another to swap them, or on an open slot to move it. "
            "Press play for a quick look. Live videos stay put.</p>")


def render_month(client: str, month: str | None, hl: str | None = None) -> bytes:
    today = today_local()
    first = (datetime.strptime(month, "%Y-%m").date() if month else today.replace(day=1))
    nxt_m = (first.replace(day=28) + timedelta(days=4)).replace(day=1)
    prv_m = (first - timedelta(days=1)).replace(day=1)
    start = first - timedelta(days=first.weekday())
    end = nxt_m - timedelta(days=1)
    end = end + timedelta(days=6 - end.weekday())
    grants = C.load_grants(client)
    d = C.client_dir(client)
    db = DB.for_client(d)
    try:
        items = _cal_items(client, db, start, end)
        now_ = datetime.now(timezone.utc)
        g = ["<div class=month>"] + [f"<div class=mh>{x}</div>" for x in ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")]
        day = start
        while day <= end:
            times = day_slots(grants, day)
            hms = sorted(set(times) | {hm for (dd, hm) in items if dd == day.isoformat()})
            cells = []
            for hm in hms:
                iso_ = utc_iso(day, hm)
                past = parse(iso_) < now_ + SCH.LEAD
                got = items.get((day.isoformat(), hm))
                if got:
                    cells.append(_cell(client, got[0][0], got[0][1], past, hl, mini=True, hm=hm))
                elif not past:
                    add_ = f" data-add='{iso_}'" if hm in times else ""
                    cells.append(f"<div class='cell mini open' data-at='{iso_}'{add_} title='Open slot {hm}'>{hm}</div>")
            out = " out" if day.month != first.month else ""
            tod = " today" if day == today else ""
            drop = f" data-day='{day.isoformat()}'" if day >= today else ""
            g.append(f"<div class='mday{out}{tod}'{drop}><b>{day.day}</b><div class=mcells>{''.join(cells)}</div></div>")
            day += timedelta(days=1)
        g.append("</div>")
        head = _cal_head(client, "month", first.strftime("%B %Y"), f"view=month&m={prv_m:%Y-%m}", f"view=month&m={today:%Y-%m}",
                         f"view=month&m={nxt_m:%Y-%m}", label=first.strftime("%b %Y"))
        body = (header(client, "Calendar") + f"<section class=card>{head}{''.join(g)}</section>"
                f"<div class=toast id=toast></div><script>{CAL_JS.replace('__C__', quote(client))}</script>{add_new_box(client)}")
        return shell(client, "calendar", body, "Calendar")
    finally:
        db.close()


NO_DELETE = {"PUBLISHING", "PUBLISHED", "MEASURING", "ANALYZED", "MANUAL_HANDOFF"}   # live, or maybe live


def delete_video(client: str, slot: str) -> None:
    """Remove a video from the plan and the dashboard. Its folder moves to clients/<c>/trash/,
    so nothing is lost by accident. Refused once it is (or may be) on Instagram."""
    import shutil
    d = C.client_dir(client)
    db = DB.for_client(d)
    try:
        row = db.post(slot)
        if row["state"] in NO_DELETE:
            raise ValueError("this video is on Instagram (or may be): it cannot be deleted here")
        if (R.status(client, slot) or {}).get("state") == "running":
            raise ValueError("a re-render is running: wait for it to finish")
        src = d / "posts" / slot
        dst = d / "trash" / f"{slot}-{datetime.now(timezone.utc):%Y%m%dT%H%M%S}"
        if src.exists():
            dst.parent.mkdir(exist_ok=True)
            shutil.move(src, dst)
        try:
            db.delete_post(slot)
        except Exception:
            if dst.exists():
                shutil.move(dst, src)   # keep files and row together
            raise
    finally:
        db.close()


def delete_card(client: str, slot: str, title: str) -> str:
    act = f"/{ESC(quote(client))}/v/{ESC(quote(slot))}/delete"
    box = (f"<form method=post action='{act}' class=rgbox><h2>Delete this video?</h2>"
           f"<p class=muted style='margin:0;max-width:380px'>&ldquo;{ESC(title)}&rdquo; leaves the plan, the calendar and the dashboard. "
           f"Its files move to clients/{ESC(client)}/trash, so they can be recovered by hand.</p>"
           f"<div class=btns><button class='btn danger small'>Delete</button><button type=button class='btn sec small' data-close>Cancel</button></div></form>")
    return popup(f"<button type=button class='btn sec' data-open>{icon('x', 16)}Delete video</button>", box)


LIVE = {"PUBLISHED", "MEASURING", "ANALYZED"}


def remove_card(client: str, slot: str, title: str) -> str:
    act = f"/{ESC(quote(client))}/v/{ESC(quote(slot))}/remove"
    box = (f"<form method=post action='{act}' class=rgbox><h2>Remove from Instagram?</h2>"
           f"<p class=muted style='margin:0;max-width:380px'>&ldquo;{ESC(title)}&rdquo; is deleted from Instagram for good, "
           f"with its likes, comments and views. Its numbers so far stay here. This cannot be undone.</p>"
           f"<div class=btns><button class='btn danger small'>Remove</button><button type=button class='btn sec small' data-close>Cancel</button></div></form>")
    return popup(f"<button type=button class='btn sec' data-open>{icon('x', 16)}Remove from Instagram</button>", box)


def add_new_box(client: str) -> str:
    """Calendar: one popup for every open slot's Add new: upload a video, or describe one."""
    c = ESC(quote(client))
    return (f"<div class=rgm id=addnew hidden><div class='rgbox wide'>"
            f"<h2>Add a video <span class=muted id=addat style='font-weight:500;font-size:15px'></span></h2>"
            f"<div class='seg sm' id=addtabs><a href='#' data-tab=up class=on>Upload</a><a href='#' data-tab=gen>Generate</a></div>"
            f"<form id=addup data-c='{c}'><label>Your video<input type=file name=file accept='video/*' required></label>"
            f"<p class=hint style='margin:0'>Fitted to 9:16 and kept on this computer (not in git). It keeps its own sound until you pick a track; "
            f"your first edit note turns it into an editable film.</p>"
            f"<div class=btns><button class='btn pri small'>Upload</button><button type=button class='btn sec small' data-close>Cancel</button>"
            f"<span class=muted id=addprog></span></div></form>"
            f"<form id=addgen method=post action='/{c}/new' hidden><input type=hidden name=at>"
            f"<label>What should the video be?<textarea name=prompt rows=6 required "
            f"placeholder='e.g. A light, airy reel on the swell chart: the particles rising behind the phone, ending on rosa.surf'></textarea></label>"
            f"<p class=hint style='margin:0'>Claude plans it from this, then makes it like a week video. A few minutes; it lands in Needs approval.</p>"
            f"<div class=btns><button class='btn pri small'>Generate</button><button type=button class='btn sec small' data-close>Cancel</button></div></form>"
            f"</div></div><script>{ADD_JS}</script>")


ADD_JS = """(()=>{const m=document.getElementById('addnew');if(!m)return;const up=document.getElementById('addup'),gen=document.getElementById('addgen'),
prog=document.getElementById('addprog');let at='';
const open=a=>{at=a;gen.at.value=a;const d=new Date(a);document.getElementById('addat').textContent=d.toLocaleString(undefined,
{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});prog.textContent='';m.hidden=false;};
document.addEventListener('click',e=>{const b=e.target.closest('[data-add]');if(b&&!document.body.classList.contains('dnd')){e.preventDefault();open(b.dataset.add);}});
m.addEventListener('click',e=>{if(e.target===m||e.target.closest('[data-close]'))m.hidden=true;});
document.addEventListener('keydown',e=>{if(e.key==='Escape')m.hidden=true;});
document.querySelectorAll('#addtabs a').forEach(t=>t.addEventListener('click',e=>{e.preventDefault();
document.querySelectorAll('#addtabs a').forEach(x=>x.classList.toggle('on',x===t));up.hidden=t.dataset.tab!=='up';gen.hidden=t.dataset.tab!=='gen';}));
up.addEventListener('submit',async e=>{e.preventDefault();const f=up.file.files[0];if(!f)return;prog.textContent='Uploading…';
const r=await fetch(`/${up.dataset.c}/new/upload?at=${encodeURIComponent(at)}&name=${encodeURIComponent(f.name)}`,{method:'POST',body:f});
if(r.ok){location.href=r.url}else{prog.textContent=await r.text()}});})();"""


def unslotted(client: str, db: DB) -> list[str]:
    """Videos waiting for approval that hold no slot yet (their slot is a preview)."""
    return [r["slot_id"] for r in db.posts() if not r["scheduled_at"] and not r["published_at"]
            and (tag_for(client, r) or ("", ""))[1] == "need"]


def preview_slot(client: str, db: DB, slot: str) -> str | None:
    return SCH.preview_slots(db, unslotted(client, db), C.load_grants(client)).get(slot)


def render_calendar(client: str, week: str | None, hl: str | None = None) -> bytes:
    today = today_local()
    if not week:
        y, w, _ = today.isocalendar()
        week = f"{y}-W{w:02d}"
    days = W.week_days(week)
    grants = C.load_grants(client)
    slots_on = {day: day_slots(grants, day) for day in days}
    times = set().union(*slots_on.values())
    d = C.client_dir(client)
    db = DB.for_client(d)
    try:
        cells: dict[tuple[str, str], list] = {}
        extra_times = set()
        preview = SCH.preview_slots(db, unslotted(client, db), C.load_grants(client))
        for row in db.posts():
            tag = tag_for(client, row)
            ts = parse(row["published_at"] or row["scheduled_at"] or preview.get(row["slot_id"]))
            ts = ts and ts.astimezone(LOCAL)
            if not tag or not ts or not (days[0] <= ts.date() <= days[-1]):
                continue
            hm = ts.strftime("%H:%M")
            if hm not in times:
                # published or scheduled off-slot: put it in its own row
                extra_times.add(hm)
            cells.setdefault((ts.date().isoformat(), hm), []).append((row, tag))
        rows_t = sorted(set(times) | extra_times)
        prev_w = (days[0] - timedelta(days=7)).isocalendar()
        next_w = (days[0] + timedelta(days=7)).isocalendar()
        ty, tw, _ = today.isocalendar()
        head = _cal_head(client, "week", f"{days[0].strftime('%-d %b')} – {days[-1].strftime('%-d %b %Y')}",
                         f"w={prev_w[0]}-W{prev_w[1]:02d}", f"w={ty}-W{tw:02d}", f"w={next_w[0]}-W{next_w[1]:02d}",
                         label=days[0].strftime("%a %-d %b"))
        g = ["<div class=cal style='grid-template-columns:56px repeat(7,minmax(0,1fr))'><div></div>"]
        for day in days:
            g.append(f"<div class='dh{' today' if day == today else ''}'>{day.strftime('%a')}<b>{day.day}</b></div>")
        now_ = datetime.now(timezone.utc)
        for hm in rows_t:
            g.append(f"<div class=th>{hm}</div>")
            for day in days:
                items = cells.get((day.isoformat(), hm)) or []
                iso = utc_iso(day, hm)
                past = parse(iso) < now_ + SCH.LEAD
                if items:
                    g.append(_cell(client, items[0][0], items[0][1], past, hl))
                else:
                    drop = "" if past else f" data-at='{iso}'"
                    g.append(f"<div class='cell open{' past' if past else ''}'{drop}>"
                             + ("" if past else "<span>Open slot</span>" + (f"<button type=button class=addnew data-add='{iso}'>+ Add new</button>"
                                                                           if hm in slots_on[day] else ""))
                             + "</div>")
        g.append("</div>")
        st = W.status(client, week)
        note = ""
        if week == W.next_week() and not st:
            note = f"<div style='margin-top:20px'>{prepare_button(client, week, 'Prepare this week')}</div>"
        body = (header(client, "Calendar") + f"<section class=card>{head}{''.join(g)}{note}</section>"
                f"<div class=toast id=toast></div><script>{CAL_JS.replace('__C__', quote(client))}</script>{add_new_box(client)}")
        return shell(client, "calendar", body, "Calendar")
    finally:
        db.close()


def render_byhand(client: str, slot: str) -> bytes:
    """Pick which recent Instagram post is this slot, posted by hand in the app."""
    d = C.client_dir(client)
    db = DB.for_client(d)
    try:
        row = db.post(slot)
    finally:
        db.close()
    back = f"/{quote(client)}/v/{quote(slot)}"
    head = (f"<a class=back href='{ESC(back)}'>{icon('back', 16)}{ESC(title_of(client, row))}</a>"
            f"<h1>Link the Instagram post</h1><p class=sub>Pick the post you made by hand for this video. Only posts not linked to another video are shown.</p>")
    if row["state"] not in HAND_FROM:
        return shell(client, "overview", head + "<section class=card><p class=muted>This video is already published or not ready.</p></section>", "Link post")
    try:
        from spine.publisher.publish import hand_candidates
        cands = hand_candidates(client)
    except Exception as e:  # noqa: BLE001 — no token or network: say so
        return shell(client, "overview", head + f"<section class=card><p class=muted>Could not reach Instagram: {ESC(str(e))}</p></section>", "Link post")
    if not cands:
        return shell(client, "overview", head + "<section class=card><p class=muted>No unlinked posts on Instagram yet. Post it in the app, then reload this page.</p></section>", "Link post")
    words = set(re.findall(r"[a-z]{4,}", read(d / "posts" / slot / "caption.txt").lower()))
    score = lambda c: len(words & set(re.findall(r"[a-z]{4,}", (c.get("caption") or "").lower())))
    best = max(cands, key=score)["id"] if words and max(map(score, cands)) else None
    items = []
    for c in cands:
        img = c.get("thumbnail_url") or c.get("media_url") or ""
        cap = " ".join((c.get("caption") or "No caption").split())
        tag = "<span class='tag live' style='margin-left:8px'>Best match</span>" if c["id"] == best else ""
        items.append(
            f"<form method=post action='{ESC(back)}/byhand' class=row style='gap:14px;align-items:center;padding:12px 0;border-top:1px solid var(--line, #eee)'>"
            + (f"<img src='{ESC(img)}' alt='' style='width:54px;height:96px;object-fit:cover;border-radius:8px;flex:none'>" if img else "")
            + f"<div style='flex:1;min-width:0'><b>{ESC(when(c.get('timestamp')))}</b>{tag}"
            f"<div class=muted style='font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'>{ESC(cap)}</div>"
            f"<a class=muted style='font-size:13px' href='{ESC(c.get('permalink') or '#')}' target=_blank rel=noopener>Open on Instagram</a></div>"
            f"<input type=hidden name=media value='{ESC(c['id'])}'><button class='btn pri small'>This one</button></form>")
    return shell(client, "overview", head + f"<section class=card>{''.join(items)}</section>", "Link post")


def render_qa(client: str, slot: str) -> bytes:
    d = C.client_dir(client)
    db = DB.for_client(d)
    try:
        row = db.post(slot)
        qa = read(d / "posts" / slot / "qa.md") or "No QA report."
        body = (f"<a class=back href='/{ESC(quote(client))}/v/{ESC(quote(slot))}'>{icon('back', 16)}{ESC(title_of(client, row))}</a>"
                f"<h1>QA report</h1><p class=sub>{ESC(slot)}</p><section class=card><pre>{ESC(qa)}</pre></section>")
        return shell(client, "overview", body, "QA report")
    finally:
        db.close()


def render_settings(client: str) -> bytes:
    g = C.load_grants(client)
    names = {"auto_reply.comments": ("Reply to comments", "Answers comments under our own posts without asking."),
             "auto_reply.dm": ("Reply to messages", "Answers DMs that people send us.")}
    rows = []
    for flag in C.AUTONOMY_FLAGS:
        a, b = flag.split(".")
        on = g[a][b]
        lab, desc = names.get(flag, (flag, ""))
        rows.append(f"<form class=switch method=post action='/{ESC(quote(client))}/flag'><div><b>{ESC(lab)}</b><div class=muted style='font-size:14px'>{ESC(desc)}</div></div>"
                    f"<input type=hidden name=flag value='{flag}'><input type=hidden name=value value='{0 if on else 1}'>"
                    f"<button class='btn {'pri' if on else 'sec'}'>{'On' if on else 'Off'}</button></form>")
    stop = g["emergency_stop"]
    rows.append(f"<form class=switch method=post action='/{ESC(quote(client))}/flag'><div><b>Emergency stop</b>"
                f"<div class=muted style='font-size:14px'>Stops every publish and reply for this project. "
                f"Any video can override the two reply switches on its own page (Replies, Custom for this video).</div></div>"
                f"<input type=hidden name=flag value=emergency_stop><input type=hidden name=value value='{0 if stop else 1}'>"
                f"<button class='btn {'sec' if stop else 'pri'}'>{'Resume' if stop else 'Stop everything'}</button></form>")
    body = header(client, "Settings") + f"<section class=card>{''.join(rows)}</section>"
    return shell(client, "settings", body, "Settings")


def _first_free_on(db: DB, day: str, grants: dict, exclude: str) -> str | None:
    taken = SCH.taken_slots(db, exclude=exclude)
    lim = datetime.now(timezone.utc) + SCH.LEAD
    for iso in day_slots(grants, date.fromisoformat(day)).values():
        if parse(iso) >= lim and iso not in taken:
            return iso
    return None


def _free_time(ts: list[str]) -> str:
    """A sensible new slot: the middle of the longest gap in the day."""
    mins = sorted(int(t[:2]) * 60 + int(t[3:]) for t in ts) or [390]
    gaps = [((mins[(i + 1) % len(mins)] - m) % 1440 or 1440, m) for i, m in enumerate(mins)]
    gap, start = max(gaps)
    m = (start + gap // 2) % 1440
    m -= m % 15
    while f"{m // 60:02d}:{m % 60:02d}" in ts:
        m = (m + 15) % 1440
    return f"{m // 60:02d}:{m % 60:02d}"


# ── http ──────────────────────────────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):  # quiet
        pass

    def _send(self, code: int, body: bytes, ctype: str = "text/html; charset=utf-8") -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _file(self, f: Path, ctype: str, download: str | None = None) -> None:
        """Serve a file with Range support so the video can seek."""
        size = f.stat().st_size
        rng = self.headers.get("Range")
        if rng and rng.startswith("bytes="):
            a, _, b = rng[6:].partition("-")
            start = int(a) if a else max(0, size - int(b))
            end = min(int(b), size - 1) if a and b else size - 1
            if start >= size:
                self.send_response(416); self.send_header("Content-Range", f"bytes */{size}"); self.end_headers(); return
            with f.open("rb") as fh:
                fh.seek(start); data = fh.read(end - start + 1)
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        else:
            data = f.read_bytes()
            self.send_response(200)
        self.send_header("Content-Type", ctype)
        if download:
            self.send_header("Content-Disposition", f'attachment; filename="{download}"')
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _redirect(self, to: str) -> None:
        self.send_response(303)
        self.send_header("Location", to)
        self.end_headers()

    def do_GET(self):
        u = urlparse(self.path)
        parts = [p for p in u.path.split("/") if p]
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        try:
            if not parts:
                cl = C.list_clients()
                return self._redirect(f"/{quote(cl[0])}") if cl else self._send(200, b"No clients yet.", "text/plain")
            if parts == ["static", "inter.woff2"] and FONT.exists():
                return self._file(FONT, "font/woff2")
            if parts == ["static", "logo.svg"] and LOGO.exists():
                return self._file(LOGO, "image/svg+xml")
            if parts == ["static", "icon.svg"] and ICON.exists():
                return self._file(ICON, "image/svg+xml")
            name = parts[0]
            C.client_dir(name)
            if len(parts) == 1:
                return self._send(200, render_overview(name, q))
            if parts[1] == "calendar" and len(parts) == 2:
                if not u.query:
                    from http.cookies import SimpleCookie
                    from urllib.parse import unquote
                    ck = SimpleCookie(self.headers.get("Cookie") or "")
                    saved = unquote(ck[f"cal_{name}"].value) if f"cal_{name}" in ck else ""
                    if saved.startswith("?") and len(saved) > 1:
                        return self._redirect(f"/{quote(name)}/calendar{saved}")
                if q.get("view") == "month":
                    return self._send(200, render_month(name, q.get("m"), q.get("hl")))
                return self._send(200, render_calendar(name, q.get("w"), q.get("hl")))
            if parts[1] == "settings" and len(parts) == 2:
                return self._send(200, render_settings(name))
            if len(parts) == 2 and parts[1] == "live.json":
                body = json.dumps(live_views(name, q.get("slot") or None)).encode()
                return self._send(200, body, "application/json")
            if parts[1] == "v" and len(parts) == 3:
                return self._send(200, render_video(name, parts[2], q.get("as") if q.get("as") in ("story", *F.RATIOS) else "reel",
                                                    q.get("music") or "file", q.get("q") or "", q))
            if parts[1] == "v" and len(parts) == 4 and parts[3] == "byhand":
                return self._send(200, render_byhand(name, parts[2]))
            if parts[1] == "v" and len(parts) == 4 and parts[3] == "qa":
                return self._send(200, render_qa(name, parts[2]))
            if len(parts) == 3 and parts[1] == "track":
                T = _tracks()
                t = next((t for t in (T.list_tracks(name) if T else []) if t["id"] == parts[2]), None)
                f = ROOT / (t.get("preview") or t.get("path") or "") if t else None
                if not f or not f.is_file():
                    return self._send(404, b"not found", "text/plain")
                return self._file(f, mimetypes.guess_type(f.name)[0] or "audio/mpeg")
            if len(parts) == 4 and parts[1] == "media":
                f = C.client_dir(name) / "posts" / parts[2] / parts[3]
                if parts[3] not in MEDIA_FILES or not f.exists():
                    return self._send(404, b"not found", "text/plain")
                tail = parts[3][len("video"):-len(f.suffix)] if parts[3].startswith("video") else ""
                fname = f"{name}-{parts[2]}{tail}{f.suffix}" if q.get("dl") else None
                return self._file(f, mimetypes.guess_type(f.name)[0] or "application/octet-stream", fname)
            return self._send(404, b"not found", "text/plain")
        except KeyError as e:
            return self._send(404, f"not found: {e}".encode(), "text/plain")
        except (BrokenPipeError, ConnectionResetError):
            pass

    UPLOAD_MAX = 2 * 1024 ** 3

    def _audience(self, name: str):
        """Overview → Followers who dropped → Upload export: raw body, kept in clients/<c>/exports/."""
        q = {k: v[0] for k, v in parse_qs(urlparse(self.path).query).items()}
        try:
            length = int(self.headers.get("Content-Length") or 0)
            d = C.client_dir(name)
        except (ValueError, KeyError):
            return self._send(400, b"bad request", "text/plain")
        if not length or length > self.UPLOAD_MAX:
            return self._send(413 if length else 400, b"empty or too large", "text/plain")
        ext = ".zip" if (q.get("name") or "").lower().endswith(".zip") else ".json"
        dst = d / "exports" / f"{datetime.now(timezone.utc):%Y%m%dT%H%M%S}-{os.urandom(3).hex()}{ext}"
        dst.parent.mkdir(parents=True, exist_ok=True)
        with dst.open("wb") as f:
            left = length
            while left:
                chunk = self.rfile.read(min(1 << 20, left))
                if not chunk:
                    break
                f.write(chunk)
                left -= len(chunk)
        if left:
            dst.unlink(missing_ok=True)
            return self._send(400, b"the upload was cut off: try again", "text/plain")
        try:
            sid = AU.import_export(name, dst)
        except (ValueError, OSError, sqlite3.Error) as e:
            dst.unlink(missing_ok=True)
            return self._send(400, json.dumps({"error": str(e)}).encode(), "application/json")
        if sid is None:
            dst.unlink(missing_ok=True)
            note = "This export was already in: nothing changed."
        else:
            r = AU.dropped(name)
            note = (f"Export read: {num(r['followers'])} followers." if r["snapshots"] < 2 else
                    f"Export read: {num(r['followers'])} followers, {len(r['dropped'])} dropped.")
        return self._send(200, json.dumps({"html": dropped_card(name, note)}).encode(), "application/json")

    def _upload(self, name: str):
        """Calendar → Add new → Upload: the file is the raw request body (streamed to disk)."""
        import tempfile
        q = {k: v[0] for k, v in parse_qs(urlparse(self.path).query).items()}
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return self._send(400, b"bad Content-Length", "text/plain")
        if not length or length > self.UPLOAD_MAX:
            return self._send(413 if length else 400, b"empty or too large (2 GB max)", "text/plain")
        try:
            C.client_dir(name)
        except KeyError:
            return self._send(404, b"not found", "text/plain")
        fd, tmp_ = tempfile.mkstemp(suffix=Path(q.get("name") or "x.mp4").suffix or ".mp4")
        os.close(fd)
        tmp = Path(tmp_)
        try:
            with tmp.open("wb") as f:
                left = length
                while left:
                    chunk = self.rfile.read(min(1 << 20, left))
                    if not chunk:
                        break
                    f.write(chunk)
                    left -= len(chunk)
            if left:
                return self._send(400, b"the upload was cut off: try again", "text/plain")
            slot = M.add_upload(name, q.get("at") or "", tmp, q.get("name") or "upload.mp4")
            return self._redirect(f"/{quote(name)}/v/{quote(slot)}")
        except (ValueError, RuntimeError) as e:
            return self._send(400, str(e).encode(), "text/plain")
        except KeyError:
            return self._send(404, b"not found", "text/plain")
        except (OSError, subprocess.TimeoutExpired) as e:   # ffmpeg missing, disk full, a stuck encode
            return self._send(500, f"could not take the upload: {e}".encode(), "text/plain")
        finally:
            tmp.unlink(missing_ok=True)

    def do_POST(self):
        parts = [p for p in urlparse(self.path).path.split("/") if p]
        if len(parts) == 3 and parts[1:] == ["new", "upload"]:
            return self._upload(parts[0])
        if len(parts) == 3 and parts[1:] == ["audience", "upload"]:
            return self._audience(parts[0])
        length = int(self.headers.get("Content-Length") or 0)
        self._multi = parse_qs(self.rfile.read(length).decode(), keep_blank_values=True)
        form = {k: v[0] for k, v in self._multi.items()}
        try:
            name = parts[0]
            d = C.client_dir(name)
            if parts[1] == "flag":
                C.set_flag(name, form["flag"], form["value"] == "1")
                return self._redirect(f"/{quote(name)}/settings")
            if parts[1] == "pickup":   # "Look for manual posts": the hourly pickup, now
                from spine import pickup as PK
                try:
                    res = PK.pickup(name)
                    n = f"{sum(1 for r in res if 'slot_id' in r)}-{sum(1 for r in res if 'error' in r)}"
                except Exception:  # noqa: BLE001 — no token or network: say so on the card
                    n = "err"
                return self._redirect(f"/{quote(name)}?picked={n}")
            if parts[1] == "schedule":
                ts = [t for t in self._multi.get("t", []) if t] or \
                    [form[k] for k in sorted((k for k in form if re.fullmatch(r"t\d+", k)), key=lambda k: int(k[1:])) if form[k]]
                if "remove" in form and len(ts) > 1:
                    i = int(form["remove"])
                    if 0 <= i < len(ts):
                        ts.pop(i)
                for t in ts:
                    datetime.strptime(t, "%H:%M")   # ValueError → 400
                if "add" in form:
                    if len(ts) >= MAX_SLOTS:
                        return self._send(400, f"at most {MAX_SLOTS} posts a day".encode(), "text/plain")
                    ts.append(_free_time(ts))
                if not ts:
                    return self._send(400, b"keep at least one post a day", "text/plain")
                if len(set(ts)) != len(ts):
                    return self._send(400, b"two posts cannot share a time", "text/plain")
                C.set_value(name, "slots", sorted(_shift(t, False) for t in ts))   # shown local, stored UTC
                return self._redirect(f"/{quote(name)}")
            if parts[1] == "move":
                db = DB.for_client(d)
                try:
                    slot = form["slot"]
                    if form.get("swap"):
                        db.move(slot, "", swap_with=form["swap"])
                    else:
                        at = form.get("at") or _first_free_on(db, form["day"], C.load_grants(name), slot)
                        if not at:
                            return self._send(400, b"no open slot left that day", "text/plain")
                        when_ = parse(at)
                        if when_ < datetime.now(timezone.utc) + SCH.LEAD:
                            return self._send(400, b"that slot is too close or already past", "text/plain")
                        if at in SCH.taken_slots(db, exclude=slot):
                            return self._send(400, b"that slot is taken", "text/plain")
                        db.move(slot, at)
                finally:
                    db.close()
                return self._send(200, b"ok", "text/plain")
            if parts[1] == "v" and len(parts) == 4 and parts[3] == "replies":
                kw = {k: form[k] == "1" for k in ("custom", "comments", "dm") if k in form}
                if not kw:
                    return self._send(400, b"nothing to change", "text/plain")
                if ("comments" in kw or "dm" in kw) and not C.video_replies(name, parts[2])["custom"]:
                    return self._send(400, b"turn on custom for this video first", "text/plain")
                if kw.get("custom") and not C.video_replies(name, parts[2])["custom"]:
                    g = C.load_grants(name)   # start from the project's current setting
                    kw = {"custom": True, "comments": bool(g["auto_reply"]["comments"]), "dm": bool(g["auto_reply"]["dm"])}
                C.set_video_replies(name, parts[2], **kw)
                return self._redirect(f"/{quote(name)}/v/{quote(parts[2])}")
            if parts[1] == "v" and len(parts) == 4 and parts[3] == "byhand":
                from spine.publisher.publish import PublishError, link_by_hand
                try:
                    link_by_hand(name, parts[2], form["media"])
                except PublishError as e:
                    return self._send(400, str(e).encode(), "text/plain")
                return self._redirect(f"/{quote(name)}/v/{quote(parts[2])}")
            if parts[1] == "v" and len(parts) == 4 and parts[3] == "track":
                T = _tracks()
                if not T:
                    return self._send(400, b"no track library", "text/plain")
                T.set_track(name, parts[2], form["track"])
                ig = "?music=ig" if form.get("src") == "instagram" else ""
                return self._redirect(f"/{quote(name)}/v/{quote(parts[2])}{ig}")
            if parts[1] == "week":
                if form.get("action") == "prepare":
                    wk = form.get("week") or W.next_week()
                    if (W.status(name, wk) or {}).get("state") != "running":
                        W.start(name, wk, form.get("instructions") or "")
                elif form.get("action") == "auto":
                    ws = W.settings(name)
                    C.set_value(name, "week_prep", {"auto": form.get("value") == "1", "day": ws["day"]})
                return self._redirect(f"/{quote(name)}")
            # /<c>/v/<slot>/decide (dashboard) or /<c>/decide with slot= (older form)
            if parts[1] == "new" and len(parts) == 2:
                try:
                    slot = M.add_prompt(name, form.get("at") or "", form.get("prompt") or "")
                except ValueError as e:
                    return self._send(400, str(e).encode(), "text/plain")
                return self._redirect(f"/{quote(name)}/v/{quote(slot)}")
            if parts[1] == "v" and len(parts) == 4 and parts[3] == "formats":
                db = DB.for_client(d)
                try:
                    db.post(parts[2])
                finally:
                    db.close()
                F.start(name, parts[2], self._multi.get("r") or [])
                return self._redirect(f"/{quote(name)}/v/{quote(parts[2])}")
            if parts[1] == "v" and len(parts) == 4 and parts[3] == "remove":
                from spine.publisher.publish import PublishError, remove_live
                try:
                    remove_live(name, parts[2])
                except KeyError:
                    return self._send(404, b"no such video", "text/plain")
                except PublishError as e:
                    return self._send(409, str(e).encode(), "text/plain")
                return self._redirect(f"/{quote(name)}/v/{quote(parts[2])}")
            if parts[1] == "v" and len(parts) == 4 and parts[3] == "delete":
                try:
                    delete_video(name, parts[2])
                except KeyError:
                    return self._send(404, b"no such video", "text/plain")
                except ValueError as e:
                    return self._send(409, str(e).encode(), "text/plain")
                return self._redirect(f"/{quote(name)}")
            if parts[1] == "v" and len(parts) == 4 and parts[3] == "decide":
                slot, back = parts[2], f"/{quote(name)}/v/{quote(parts[2])}"
            elif parts[1] == "decide":
                slot, back = form["slot"], f"/{quote(name)}"
            else:
                return self._send(404, b"not found", "text/plain")
            notes = (form.get("notes") or form.get("note") or "").strip()
            db = DB.for_client(d)
            try:
                R.settle(db, name, slot)   # a failed re-render must not block approve / new notes
                if form.get("action") == "retry" and (R.status(name, slot) or {}).get("kind") == "new":
                    if (R.status(name, slot) or {}).get("state") == "failed":
                        M.start(name, slot)
                elif form.get("action") == "retry":
                    try:
                        R.retry(name, slot, db)
                    except OSError:
                        pass   # retry() put the failure back on the page
                elif form.get("action") == "approve":
                    if "caption" in form:
                        (d / "posts" / slot).mkdir(parents=True, exist_ok=True)
                        (d / "posts" / slot / "caption.txt").write_text(form["caption"])
                    row_ = db.post(slot)
                    at = ((not row_["scheduled_at"] and preview_slot(name, db, slot))
                          or SCH.slot_for_approval(db, row_, C.load_grants(name)))   # the slot the calendar showed
                    db.set_state(slot, "APPROVED", note=notes or None, scheduled_at=at)
                    R.dismiss(name, slot)
                elif form.get("action") == "caption":
                    row_ = db.post(slot)
                    if row_["state"] in CAPTION_LOCKED or row_["published_at"]:
                        return self._send(409, b"too late: it is already publishing or live", "text/plain")
                    text = form.get("caption", "").replace("\r\n", "\n").strip()
                    if len(text) > 2200:
                        return self._send(400, b"Instagram allows 2200 characters at most", "text/plain")
                    (d / "posts" / slot).mkdir(parents=True, exist_ok=True)
                    (d / "posts" / slot / "caption.txt").write_text(text + "\n")
                elif form.get("action") == "publish_now":
                    state_ = db.post(slot)["state"]
                    if state_ not in ("APPROVED", "QUEUED"):
                        return self._send(409, b"approve it first", "text/plain")
                    db.move(slot, datetime.now(timezone.utc).isoformat(timespec="seconds"))
                    if state_ == "APPROVED":
                        db.set_state(slot, "QUEUED")
                    logs = Path.home() / ".tachyon" / "logs"
                    logs.mkdir(parents=True, exist_ok=True)
                    with open(logs / "publish.log", "a") as log:   # this video only (locked against cron)
                        subprocess.Popen([sys.executable, "-m", "spine.publisher.publish", name, slot],
                                         cwd=Path(__file__).resolve().parents[2], stdout=log, stderr=log, start_new_session=True)
                elif form.get("action") == "custom":
                    at = datetime.fromisoformat(form["at"]).replace(tzinfo=LOCAL).astimezone(timezone.utc).isoformat(timespec="seconds")
                    if parse(at) <= datetime.now(timezone.utc):
                        return self._send(400, b"pick a time in the future", "text/plain")
                    if at in SCH.taken_slots(db, exclude=slot):
                        return self._send(409, b"another video holds that time", "text/plain")
                    db.move(slot, at)
                elif form.get("action") == "revoke":
                    if db.post(slot)["state"] != "NEEDS_APPROVAL":   # a second click is a no-op
                        try:
                            db.set_state(slot, "NEEDS_APPROVAL", note="approval taken back to keep editing")
                        except IllegalTransition:
                            return self._send(409, b"too late: it is already publishing or live", "text/plain")
                elif form.get("action") == "reject":
                    if not notes:
                        return self._send(400, b"a rejection needs a note: say what should change", "text/plain")
                    db.set_state(slot, "REJECTED", note=notes)
                    if (meta_of(name, slot).get("film") or {}).get("engine") == "remotion":
                        R.start(name, slot, notes)
                else:
                    return self._send(400, b"unknown action", "text/plain")
            finally:
                db.close()
            return self._redirect(back)
        except (KeyError, ValueError) as e:
            return self._send(400, str(e).encode(), "text/plain")


def serve(host: str = "127.0.0.1", port: int = 8765) -> ThreadingHTTPServer:
    return ThreadingHTTPServer((host, port), Handler)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    s = serve(port=port)
    print(f"Tachyon dashboard on http://127.0.0.1:{port}")
    s.serve_forever()
