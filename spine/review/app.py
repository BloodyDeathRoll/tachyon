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
import sys
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse

from .. import clients as C
from .. import revise as R
from .. import schedule as SCH
from .. import week as W
from ..db import DB

ESC = html.escape
ROOT = Path(__file__).resolve().parent.parent.parent
FONT = ROOT / "dashboard" / "fonts" / "manrope-latin-wght-normal.woff2"
MEDIA_FILES = {"video.mp4", "video-story.mp4", "cover.jpg"}
LIVE_TTL = timedelta(minutes=15)

# ── tags ──────────────────────────────────────────────────────────────────────
TAG = {  # state → (label, css class)
    "NEEDS_APPROVAL": ("Needs approval", "need"),
    "NEEDS_INPUT": ("Needs approval", "need"),
    "APPROVED": ("Scheduled", "sched"), "QUEUED": ("Scheduled", "sched"), "PUBLISHING": ("Scheduled", "sched"),
    "PUBLISHED": ("Live", "live"), "MEASURING": ("Live", "live"), "ANALYZED": ("Live", "live"),
    "MANUAL_HANDOFF": ("Needs approval", "need"),
    "BRIEFED": ("In production", "busy"), "SCRIPTED": ("In production", "busy"),
    "RENDERED": ("In production", "busy"), "QA": ("In production", "busy"),
}
ORDER = {"need": 0, "busy": 1, "sched": 2, "live": 3}


def tag_for(client: str, row) -> tuple[str, str] | None:
    st = R.status(client, row["slot_id"])
    if st and st.get("state") == "running":
        return ("Re-rendering", "busy")
    if row["state"] in ("REJECTED", "SCRIPTED") and st and st.get("state") == "failed":
        return ("Needs approval", "need")
    return TAG.get(row["state"])


# ── formatting ────────────────────────────────────────────────────────────────
def parse(ts: str | None) -> datetime | None:
    if not ts:
        return None
    dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)   # naive timestamps are UTC


def when(ts: str | None) -> str:
    dt = parse(ts)
    return dt.strftime("%a %-d %b, %H:%M UTC") if dt else ""


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
    }
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            f'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{paths[name]}</svg>')


# ── page shell ────────────────────────────────────────────────────────────────
CSS = """
@font-face{font-family:Manrope;font-weight:200 800;font-display:swap;src:url(/static/manrope.woff2) format("woff2")}
:root{--ground:#F5F7FB;--card:#fff;--ink:#0B1220;--ink2:#4B5563;--ink3:#6B7280;--rule:#E5E8EF;
--acc:#D1434F;--acc-h:#BF3A45;--acc-bg:#FCF2F3;--green:#1A7F37;--green-bg:#EDF7F0;--amber:#8A4B00;--amber-bg:#FFF4D6;
--blue:#1F4BFF;--blue-bg:#EEF2FF;--grey-bg:#EEF0F3;
--shadow:0 1px 2px rgba(11,18,32,.04),0 8px 24px rgba(11,18,32,.06);--r:20px}
*{box-sizing:border-box}
html,body{margin:0;background:var(--ground);color:var(--ink);font:15px/1.5 Manrope,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
button,textarea{font:inherit}
.shell{display:grid;grid-template-columns:240px minmax(0,1fr);min-height:100vh}
aside{background:#fff;border-right:1px solid var(--rule);padding:28px 20px;display:flex;flex-direction:column;gap:22px;position:sticky;top:0;height:100vh}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:18px;padding:0 8px}
.brand i{width:24px;height:24px;border-radius:7px;background:var(--acc);display:inline-grid;place-items:center}
.brand i:after{content:"";width:9px;height:9px;border-radius:3px;background:#fff}
.proj{position:relative}
.proj summary{list-style:none;display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--rule);border-radius:14px;cursor:pointer}
.proj summary::-webkit-details-marker{display:none}
.proj summary:hover{border-color:#cfd5e1}
.av{width:34px;height:34px;border-radius:10px;background:var(--ink);color:#fff;display:grid;place-items:center;font-weight:700;flex:none}
.proj b{display:block;font-size:15px;line-height:1.2}.proj small{color:var(--ink3);font-size:12.5px}
.proj .chev{margin-left:auto;color:var(--ink3)}
.proj ul{position:absolute;left:0;right:0;top:calc(100% + 6px);background:#fff;border:1px solid var(--rule);border-radius:14px;box-shadow:var(--shadow);list-style:none;margin:0;padding:6px;z-index:5}
.proj li a{display:flex;gap:10px;align-items:center;padding:8px 10px;border-radius:10px}
.proj li a:hover{background:var(--ground)}
nav{display:flex;flex-direction:column;gap:4px}
nav a{display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:12px;color:var(--ink2);font-weight:500}
nav a:hover{background:var(--ground);color:var(--ink)}
nav a.on{background:var(--acc-bg);color:var(--acc);font-weight:600}
.foot{margin-top:auto;font-size:12.5px;color:var(--ink3);border-top:1px solid var(--rule);padding-top:14px}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--green);margin-right:6px;vertical-align:1px}
.dot.off{background:var(--acc)}
main{padding:36px 40px 64px;max-width:1240px;width:100%}
h1{font-size:32px;line-height:1.15;margin:0;font-weight:700;letter-spacing:-.02em}
.sub{color:var(--ink2);margin:6px 0 28px;font-size:16px}
.sub b{color:var(--ink);font-weight:600}
.card{background:var(--card);border-radius:var(--r);box-shadow:var(--shadow);padding:28px}
h2{font-size:19px;margin:0;font-weight:700;letter-spacing:-.01em}
.row{display:flex;align-items:center;justify-content:space-between;gap:16px}
.muted{color:var(--ink3)}
.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-bottom:1px solid var(--rule);margin:-4px 0 22px;padding-bottom:22px}
.stat{padding:0 18px;border-left:1px solid var(--rule)}.stat:first-child{padding-left:0;border-left:0}
.stat span{display:block;color:var(--ink2);font-size:14px}
.stat strong{display:block;font-size:34px;font-weight:700;letter-spacing:-.03em;line-height:1.2;margin-top:4px}
.stat small{color:var(--ink3);font-size:13px}
.chart svg{display:block;width:100%;height:auto}
.chart text{font:12px Manrope,system-ui;fill:var(--ink3)}
.legend{display:flex;gap:18px;font-size:13px;color:var(--ink2);margin-top:10px}
.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.vhead{margin:40px 0 16px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:24px}
.vid{display:block}
.thumb{position:relative;aspect-ratio:9/16;border-radius:18px;overflow:hidden;background:#0b1220;box-shadow:var(--shadow);transition:transform .15s ease,box-shadow .15s ease}
.vid:hover .thumb{transform:translateY(-2px);box-shadow:0 2px 4px rgba(11,18,32,.06),0 16px 32px rgba(11,18,32,.12)}
.thumb img{width:100%;height:100%;object-fit:cover;display:block}
.thumb .tag{position:absolute;left:12px;top:12px}
.vid h3{font-size:16px;margin:12px 0 2px;font-weight:600}
.vid p{margin:0;color:var(--ink3);font-size:13.5px}
.tag{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;padding:5px 11px;border-radius:999px;background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.18)}
.tag:before{content:"";width:8px;height:8px;border-radius:50%}
.tag.need:before{background:var(--acc)}.tag.sched:before{background:var(--blue)}.tag.live:before{background:var(--green)}.tag.busy:before{background:#E0A100}
.empty{border:1.5px dashed var(--rule);border-radius:18px;aspect-ratio:9/16;display:grid;place-items:center;text-align:center;color:var(--ink3);padding:20px;font-size:14px}
.back{display:inline-flex;align-items:center;gap:8px;color:var(--ink2);font-weight:500;margin-bottom:18px}
.back:hover{color:var(--ink)}
.vpage{display:grid;grid-template-columns:minmax(260px,380px) minmax(0,1fr);gap:32px;align-items:start}
.player{position:sticky;top:24px}
.player video{width:100%;aspect-ratio:9/16;border-radius:20px;background:#000;display:block;box-shadow:var(--shadow)}
.seg{display:inline-flex;background:var(--grey-bg);border-radius:12px;padding:4px;margin-top:14px}
.seg a{padding:7px 16px;border-radius:9px;font-size:14px;font-weight:600;color:var(--ink2)}
.seg a.on{background:#fff;color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.08)}
.stack{display:flex;flex-direction:column;gap:24px}
textarea{width:100%;min-height:110px;border:1px solid var(--rule);border-radius:14px;padding:14px 16px;resize:vertical;color:var(--ink);background:#fff;font-size:15px}
textarea:focus{outline:none;border-color:var(--ink);box-shadow:0 0 0 3px rgba(11,18,32,.08)}
.btns{display:flex;gap:12px;flex-wrap:wrap;margin-top:16px}
.btn{display:inline-flex;align-items:center;gap:8px;border:0;border-radius:12px;padding:12px 20px;font-weight:600;cursor:pointer;font-size:15px}
.btn.pri{background:var(--acc);color:#fff}.btn.pri:hover{background:var(--acc-h)}
.btn.sec{background:#fff;color:var(--ink);box-shadow:inset 0 0 0 1px var(--rule)}.btn.sec:hover{box-shadow:inset 0 0 0 1px var(--ink3)}
.btn:focus-visible,a:focus-visible,summary:focus-visible{outline:3px solid rgba(31,75,255,.35);outline-offset:2px}
.hint{color:var(--ink3);font-size:13.5px;margin-top:10px}
.tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:var(--rule);border-radius:16px;overflow:hidden;margin-top:18px}
.tiles div{background:#fff;padding:16px 18px}
.tiles span{display:block;font-size:13.5px;color:var(--ink2)}
.tiles strong{display:block;font-size:26px;font-weight:700;letter-spacing:-.02em;margin-top:2px}
.cap{margin-top:12px;color:var(--ink2);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
details.full summary{list-style:none;cursor:pointer}
details.full summary::-webkit-details-marker{display:none}
details.full .more{display:inline-block;color:var(--blue);font-weight:600;font-size:14px;margin-top:8px}
details.full[open] summary{display:none}
.capfull{white-space:pre-line;color:var(--ink2);margin-top:12px}
.links{display:flex;gap:22px;flex-wrap:wrap;font-size:14px;font-weight:600}
.links a{display:inline-flex;align-items:center;gap:6px;color:var(--ink2)}.links a:hover{color:var(--ink)}
.banner{display:flex;gap:12px;align-items:center;padding:14px 18px;border-radius:14px;background:var(--amber-bg);color:var(--amber);font-weight:600;margin-bottom:24px}
.banner.stop{background:var(--acc);color:#fff}
.note{background:var(--ground);border-radius:14px;padding:14px 16px;margin-top:14px;white-space:pre-line;color:var(--ink2)}
.prog{height:6px;background:var(--grey-bg);border-radius:6px;overflow:hidden;margin-top:16px}
.prog i{display:block;height:100%;background:#E0A100;border-radius:6px;animation:pg 1.6s ease-in-out infinite;width:40%}
@keyframes pg{0%{margin-left:-40%}100%{margin-left:100%}}
pre{white-space:pre-wrap;font:13px/1.55 ui-monospace,monospace;color:var(--ink2);margin:0}
.switch{display:flex;align-items:center;justify-content:space-between;padding:16px 0;border-top:1px solid var(--rule)}
.switch:first-of-type{border-top:0}
.ovgrid{display:grid;grid-template-columns:minmax(0,2fr) minmax(300px,1fr);gap:32px;align-items:start}
.ovgrid .vhead{margin:0 0 16px}
.side{display:flex;flex-direction:column;gap:24px}
.side .card{padding:24px}
.side .stats{grid-template-columns:1fr 1fr;row-gap:18px;margin:18px 0 18px;padding-bottom:18px}
.side .stat:nth-child(3){border-left:0;padding-left:0}
.side .stat strong{font-size:28px}
.btn.small{padding:9px 16px;font-size:14px;border-radius:10px}
.big{font-size:17px;font-weight:600;margin:0}
.times{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;margin-bottom:14px}
.tfield span{display:block;font-size:13px;color:var(--ink2);margin-bottom:6px}
.tfield input{width:100%;min-width:0;font:inherit;font-size:20px;font-weight:600;border:1px solid var(--rule);border-radius:12px;padding:8px 12px;color:var(--ink);background:#fff}
.tfield input:focus{outline:none;border-color:var(--ink);box-shadow:0 0 0 3px rgba(11,18,32,.08)}
.autorow{display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid var(--rule);margin-top:20px;padding-top:16px;font-size:14px;color:var(--ink2)}
.toggle{width:44px;height:26px;border-radius:13px;border:0;background:#D5DAE3;position:relative;cursor:pointer;flex:none;padding:0}
.toggle i{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:left .15s}
.toggle.on{background:var(--green)}.toggle.on i{left:21px}
.ovgrid .grid{grid-template-columns:repeat(auto-fill,minmax(170px,1fr))}
.cal{display:grid;grid-template-columns:64px repeat(7,minmax(0,1fr));gap:10px}
.cal .dh{font-size:13px;color:var(--ink2);text-align:center;padding-bottom:4px}
.cal .dh b{display:block;font-size:20px;color:var(--ink);font-weight:700}
.cal .dh.today b{color:#fff;background:var(--acc);border-radius:10px;width:fit-content;margin:0 auto;padding:0 9px}
.cal .th{font-size:13px;font-weight:600;color:var(--ink2);padding-top:8px}
.cell{aspect-ratio:9/16;border-radius:12px;overflow:hidden;position:relative;background:#0b1220;display:block}
.cell img{width:100%;height:100%;object-fit:cover;display:block}
.cell .tag{position:absolute;left:6px;top:6px;font-size:11px;padding:3px 8px}
.cell .ct{position:absolute;left:0;right:0;bottom:0;padding:22px 8px 8px;background:linear-gradient(transparent,rgba(0,0,0,.75));color:#fff;font-size:12.5px;font-weight:600;line-height:1.25}
.cell.open{background:transparent;border:1.5px dashed var(--rule);display:grid;place-items:center;color:var(--ink3);font-size:12.5px;text-align:center}
.cell.past{opacity:.55}
.calnav{display:flex;gap:8px;align-items:center}
.calnav a{display:inline-grid;place-items:center;width:36px;height:36px;border-radius:10px;background:#fff;box-shadow:inset 0 0 0 1px var(--rule)}
.calnav a.txt{width:auto;padding:0 14px;font-weight:600;font-size:14px}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
@media (max-width:900px){.shell{grid-template-columns:minmax(0,1fr)}nav{overflow-x:auto;max-width:100%}nav a{padding:9px 10px;white-space:nowrap}aside{position:static;height:auto;flex-direction:row;flex-wrap:wrap;align-items:center;padding:14px 16px}
 .foot{display:none}nav{flex-direction:row}main{padding:24px 16px 48px}.vpage{grid-template-columns:1fr}.player{position:static}
 .chart text{font-size:30px}.perfsrc{display:none}
 .ovgrid{grid-template-columns:1fr}.cal{grid-template-columns:44px repeat(7,minmax(0,1fr));gap:4px}.cal .ct{display:none}.cell .tag{font-size:0;padding:4px}.cell .tag:before{margin:0}
 .stats{grid-template-columns:repeat(2,1fr);row-gap:18px}.stat:nth-child(3){border-left:0;padding-left:0}.grid{grid-template-columns:repeat(2,1fr);gap:16px}}
"""


def display(client: str) -> dict:
    g = C.load_grants(client)
    return {"name": g.get("display_name") or client.capitalize(),
            "handle": g.get("ig_username"), "tagline": g.get("tagline"), "stop": bool(g.get("emergency_stop"))}


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
             f"{meta_refresh}<title>{ESC(title)} · {ESC(d['name'])} · Tachyon</title><style>{CSS}</style>"
             f"<div class=shell><aside><div class=brand><i></i>Tachyon</div>"
             f"<details class=proj><summary><span class=av>{ESC(d['name'][:1])}</span><span><b>{ESC(d['name'])}</b>{handle}</span>"
             f"<span class=chev>{icon('chev', 16)}</span></summary><ul>{others}</ul></details>"
             f"<nav>{nav}</nav><div class=foot>{status}</div></aside><main>{body}</main></div></html>")
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
    return f"{stop}<h1>{ESC(title)}</h1><p class=sub>{' · '.join(bits)}</p>"


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


def refresh_live(client: str, db: DB, row) -> None:
    """Pull current numbers for a live video if the last pull is older than LIVE_TTL."""
    if not row["ig_media_id"]:
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
    except Exception:   # no token, no network: show what we have
        pass


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
        out.append(f"<line x1={L} x2={W} y1={y:.1f} y2={y:.1f} stroke='#E5E8EF'/>"
                   f"<text x=0 y={y + 4:.1f}>{num(top * (1 - i / 2))}</text>")
    for i, (d, v) in enumerate(zip(span, vals)):
        x = L + i * bw
        if v:
            h = (H - B - T) * v / top
            out.append(f"<rect x={x + bw * .18:.1f} y={H - B - h:.1f} width={bw * .64:.1f} height={h:.1f} rx=4 fill='#D1434F'>"
                       f"<title>{d}: {num(v)} {key}</title></rect>")
        if key2 and vals2[i]:
            h2 = (H - B - T) * vals2[i] / top
            out.append(f"<rect x={x + bw * .18:.1f} y={H - B - h2:.1f} width={bw * .64:.1f} height=3 rx=1.5 fill='#0B1220'/>")
        if i % max(1, n // 4) == 0 or i == n - 1:
            dt = datetime.fromisoformat(d)
            out.append(f"<text x={x + bw / 2:.1f} y={H - 6} text-anchor=middle>{dt.strftime('%-d %b')}</text>")
    out.append("</svg>")
    return "".join(out)


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
    return (f"<a class=vid href='/{ESC(quote(client))}/v/{ESC(quote(slot))}'><div class=thumb>{img}"
            f"<span class='tag {cls}'>{ESC(label)}</span></div><h3>{ESC(title_of(client, row))}</h3><p>{ESC(line)}</p></a>")


def schedule_card(client: str) -> str:
    times = [t.strftime("%H:%M") for t in SCH._slots(C.load_grants(client))]
    while len(times) < 2:
        times.append("")
    inputs = "".join(
        f"<label class=tfield><span>Post {i + 1}</span><input type=time name=t{i + 1} value='{ESC(t)}' required></label>"
        for i, t in enumerate(times[:2]))
    return (f"<section class=card><div class=row><h2>Publishing schedule</h2><span class=muted>UTC</span></div>"
            f"<p class=muted style='margin:6px 0 16px'>Twice a day, every day.</p>"
            f"<form method=post action='/{ESC(quote(client))}/schedule'><div class=times>{inputs}</div>"
            f"<button class='btn sec small'>Save times</button></form>"
            f"<p class=hint>New times apply to videos approved from now on.</p></section>")


def week_card(client: str) -> str:
    wk = W.next_week()
    days = W.week_days(wk)
    span = f"{days[0].strftime('%-d %b')} – {days[-1].strftime('%-d %b')}"
    st = W.status(client, wk) or {}
    ws = W.settings(client)
    total = len(W.slot_times(client, wk))
    base = f"/{ESC(quote(client))}"
    if st.get("state") == "running":
        if st.get("step") == "planning":
            body = "<p class=big>Planning the week…</p>"
        else:
            body = f"<p class=big>{st.get('done', 0)} of {st.get('total', total)} videos made</p>"
        body += "<div class=prog><i></i></div><p class=hint>Each one lands in Needs approval when it is ready.</p>"
    elif st.get("state") == "done":
        bad = len(st.get("failed") or [])
        body = (f"<p class=big>{st.get('total', total) - bad} of {st.get('total', total)} videos ready</p>"
                f"<p class=hint>{'Approve them before Monday.' if not bad else f'{bad} could not be made; see the calendar.'}</p>"
                f"<a class='btn sec small' href='{base}/calendar?w={wk}'>Open the week</a>")
    else:
        err = f"<div class=note>Last run failed: {ESC(st.get('error') or '')}</div>" if st.get("state") == "failed" else ""
        body = (f"{err}<p class=muted style='margin:0 0 14px'>{total} videos, one for each slot. Claude plans them, makes them and "
                f"sends each one here for approval.</p>"
                f"<form method=post action='{base}/week'><input type=hidden name=action value=prepare>"
                f"<button class='btn pri small'>Prepare next week</button></form>")
    auto = (f"<form method=post action='{base}/week' class=autorow><input type=hidden name=action value=auto>"
            f"<input type=hidden name=value value='{0 if ws['auto'] else 1}'>"
            f"<span>Prepare automatically every {ESC(ws['day'])}</span>"
            f"<button class='toggle {'on' if ws['auto'] else ''}' aria-pressed={'true' if ws['auto'] else 'false'} aria-label='Prepare automatically'><i></i></button></form>")
    return (f"<section class=card><div class=row><h2>Next week</h2><span class=muted>{span}</span></div>"
            f"<div style='margin-top:14px'>{body}</div>{auto}</section>")


def render_overview(client: str) -> bytes:
    d = C.client_dir(client)
    db = DB.for_client(d)
    try:
        for row in db.posts():
            if TAG.get(row["state"], ("", ""))[1] == "live":
                refresh_live(client, db, row)
        days = account_days(db)
        week = days[-7:]
        total = lambda k: sum((x.get(k) or 0) for x in week) if week else None  # noqa: E731
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
                ("Views", total("views"), "last 7 days"),
                ("Reached", total("reach"), "last 7 days"),
                ("Followers", followers, f"as of {datetime.fromisoformat(days[-1]['date']).strftime('%-d %b')}" if days else "no data yet"),
                ("Link taps", total("profile_links_taps"), "last 7 days"),
            ))
        chart = (f"<div class=chart>{bar_chart(days, 'views', 'reach', W=420, H=190)}</div>"
                 f"<div class=legend><span><i style='background:#D1434F'></i>Views</span>"
                 f"<span><i style='background:#0B1220;height:3px'></i>Reached</span></div>") if days else \
                "<p class=muted>The account's daily numbers start the day after the first post.</p>"
        perf = f"<section class=card><h2>Performance</h2><div class=stats>{stats}</div>{chart}</section>"

        summary = []
        if count["need"]:
            summary.append(f"<b>{count['need']} to approve</b>")
        if count["busy"]:
            summary.append(f"{count['busy']} in production")
        if count["sched"]:
            summary.append(f"{count['sched']} scheduled")
        if count["live"]:
            summary.append(f"{count['live']} live")
        cards = "".join(video_card(client, r, t, db) for r, t in rows) or \
            "<div class=empty>No videos yet. Prepare next week to fill this.</div>"
        vids = (f"<div class='row vhead'><h2>Videos</h2><span class=muted>{' · '.join(summary)}</span></div>"
                f"<div class=grid>{cards}</div>")
        body = (header(client, "Overview") +
                f"<div class=ovgrid><div class=maincol>{vids}</div>"
                f"<div class=side>{perf}{schedule_card(client)}{week_card(client)}</div></div>")
        return shell(client, "overview", body, "Overview", refresh=30 if count["busy"] else None)
    finally:
        db.close()


# ── video page ────────────────────────────────────────────────────────────────
def render_video(client: str, slot: str, variant: str = "reel") -> bytes:
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
        vfile = "video-story.mp4" if variant == "story" and has_story else "video.mp4"
        player = (f"<video controls playsinline preload=metadata poster='{media_url(client, slot, 'cover.jpg')}' "
                  f"src='{media_url(client, slot, vfile)}'></video>") if (sdir / vfile).exists() else \
            "<div class=empty>No video file yet.</div>"
        if has_story:
            base = f"/{quote(client)}/v/{quote(slot)}"
            player += (f"<div class=seg><a href='{base}' class='{'on' if vfile == 'video.mp4' else ''}'>Reel</a>"
                       f"<a href='{base}?as=story' class='{'on' if vfile != 'video.mp4' else ''}'>Story</a></div>")

        # status line under the title
        if cls == "live":
            when_line = f"<span class='tag live'>Live</span> &nbsp;since {when(row['published_at'])}"
        elif cls == "sched":
            when_line = f"<span class='tag sched'>Scheduled</span> &nbsp;{when(row['scheduled_at'])}"
        elif cls == "busy":
            when_line = "<span class='tag busy'>Re-rendering</span>"
        else:
            when_line = "<span class='tag need'>Needs approval</span>"

        blocks = []
        # decision
        if cls == "need":
            nxt = SCH.slot_for_approval(db, row, C.load_grants(client))
            failed = (f"<div class=note><b>The last re-render failed.</b> {ESC(st.get('error') or '')}</div>"
                      if st.get("state") == "failed" else "")
            blocks.append(
                f"<section class=card><h2>Your call</h2>{failed}"
                f"<form method=post action='/{ESC(quote(client))}/v/{ESC(quote(slot))}/decide' style='margin-top:16px'>"
                f"<label for=notes class=muted style='font-size:14px'>What should change? Leave empty to approve.</label>"
                f"<textarea id=notes name=notes placeholder='e.g. Lead with the advantage, not the number. Make it faster.' style='margin-top:8px'></textarea>"
                f"<div class=btns><button class='btn pri' name=action value=approve>{icon('check')}Approve and schedule</button>"
                f"<button class='btn sec' name=action value=reject>{icon('redo')}Send back for a new version</button></div>"
                f"<p class=hint>Approving schedules it for {ESC(when(nxt))}.</p></form></section>")
        elif cls == "busy" and label == "In production":
            blocks.append(f"<section class=card><h2>Being made</h2><div class=prog><i></i></div>"
                          f"<p class=hint>Planned for {ESC(when(row['scheduled_at']))}. It comes back here for approval when it is ready. "
                          f"This page refreshes itself.</p></section>")
        elif cls == "busy":
            step = {"queued": "Starting", "editing": "Applying your notes", "rendering": "Rendering the new version"}.get(st.get("step"), "Working")
            blocks.append(f"<section class=card><h2>{ESC(step)}…</h2><div class=prog><i></i></div>"
                          f"<div class=note>{ESC(st.get('notes') or '')}</div>"
                          f"<p class=hint>Started {ESC(ago((st.get('rounds') or [{}])[-1].get('at')))}. This page refreshes itself.</p></section>")
        elif cls == "sched":
            blocks.append(f"<section class=card><h2>Scheduled</h2><p class=muted style='margin:8px 0 0'>Goes live {ESC(when(row['scheduled_at']))}. "
                          f"The bio link switches to it automatically.</p></section>")

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
        blocks.append(f"<section class=card><h2>Performance</h2>{perf}</section>")

        # post text: two lines, then a clear way to read it all
        cap = read(sdir / "caption.txt").strip()
        if cap:
            blocks.append(f"<section class=card><h2>Post text</h2>"
                          f"<details class=full><summary><div class=cap>{ESC(' '.join(cap.split()))}</div><span class=more>Read the full text</span></summary>"
                          f"<div class=capfull>{ESC(cap)}</div></details></section>")

        links = []
        if row["permalink"]:
            links.append(f"<a href='{ESC(row['permalink'])}' target=_blank rel=noopener>{icon('ext', 16)}Open on Instagram</a>")
        if (sdir / "qa.md").exists():
            links.append(f"<a href='/{ESC(quote(client))}/v/{ESC(quote(slot))}/qa'>QA report</a>")
        if links:
            blocks.append(f"<div class=links>{''.join(links)}</div>")

        body = (f"<a class=back href='/{ESC(quote(client))}'>{icon('back', 16)}Overview</a>"
                f"<h1>{ESC(title_of(client, row))}</h1><p class=sub>{when_line}</p>"
                f"<div class=vpage><div class=player>{player}</div><div class=stack>{''.join(blocks)}</div></div>")
        return shell(client, "overview", body, title_of(client, row), refresh=15 if cls == "busy" else None)
    finally:
        db.close()


def render_calendar(client: str, week: str | None) -> bytes:
    today = datetime.now(timezone.utc).date()
    if not week:
        y, w, _ = today.isocalendar()
        week = f"{y}-W{w:02d}"
    days = W.week_days(week)
    times = [t.strftime("%H:%M") for t in SCH._slots(C.load_grants(client))]
    d = C.client_dir(client)
    db = DB.for_client(d)
    try:
        cells: dict[tuple[str, str], list] = {}
        extra_times = set()
        for row in db.posts():
            tag = tag_for(client, row)
            ts = parse(row["published_at"] or row["scheduled_at"])
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
        base = f"/{quote(client)}/calendar"
        head = ("<div class=row style='margin-bottom:20px'>"
                f"<h2>{days[0].strftime('%-d %b')} – {days[-1].strftime('%-d %b %Y')}</h2><div class=calnav>"
                f"<a href='{base}?w={prev_w[0]}-W{prev_w[1]:02d}' aria-label='Previous week'>{icon('prev', 16)}</a>"
                f"<a class=txt href='{base}'>This week</a>"
                f"<a href='{base}?w={next_w[0]}-W{next_w[1]:02d}' aria-label='Next week'>{icon('next', 16)}</a></div></div>")
        g = ["<div class=cal><div></div>"]
        for day in days:
            g.append(f"<div class='dh{' today' if day == today else ''}'>{day.strftime('%a')}<b>{day.day}</b></div>")
        now_ = datetime.now(timezone.utc)
        for hm in rows_t:
            g.append(f"<div class=th>{hm}</div>")
            for day in days:
                items = cells.get((day.isoformat(), hm)) or []
                if items:
                    row, (label, cls) = items[0]
                    slot = row["slot_id"]
                    cov = d / "posts" / slot / "cover.jpg"
                    img = f"<img src='{media_url(client, slot, 'cover.jpg')}' alt='' loading=lazy>" if cov.exists() else ""
                    g.append(f"<a class=cell href='/{ESC(quote(client))}/v/{ESC(quote(slot))}' title='{ESC(title_of(client, row))}'>{img}"
                             f"<span class='tag {cls}'>{ESC(label)}</span><span class=ct>{ESC(title_of(client, row))}</span></a>")
                else:
                    slot_dt = datetime.combine(day, datetime.strptime(hm, "%H:%M").time(), tzinfo=timezone.utc)
                    past = slot_dt < now_
                    g.append(f"<div class='cell open{' past' if past else ''}'>{'' if past else 'Open slot'}</div>")
        g.append("</div>")
        st = W.status(client, week)
        note = ""
        if week == W.next_week() and not st:
            note = (f"<form method=post action='/{ESC(quote(client))}/week' style='margin-top:20px'><input type=hidden name=action value=prepare>"
                    f"<button class='btn pri small'>Prepare this week</button></form>")
        body = header(client, "Calendar") + f"<section class=card>{head}{''.join(g)}{note}</section>"
        return shell(client, "calendar", body, "Calendar")
    finally:
        db.close()


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
                f"<div class=muted style='font-size:14px'>Stops every publish and reply for this project.</div></div>"
                f"<input type=hidden name=flag value=emergency_stop><input type=hidden name=value value='{0 if stop else 1}'>"
                f"<button class='btn {'sec' if stop else 'pri'}'>{'Resume' if stop else 'Stop everything'}</button></form>")
    body = header(client, "Settings") + f"<section class=card>{''.join(rows)}</section>"
    return shell(client, "settings", body, "Settings")


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

    def _file(self, f: Path, ctype: str) -> None:
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
            if parts == ["static", "manrope.woff2"] and FONT.exists():
                return self._file(FONT, "font/woff2")
            name = parts[0]
            C.client_dir(name)
            if len(parts) == 1:
                return self._send(200, render_overview(name))
            if parts[1] == "calendar" and len(parts) == 2:
                return self._send(200, render_calendar(name, q.get("w")))
            if parts[1] == "settings" and len(parts) == 2:
                return self._send(200, render_settings(name))
            if parts[1] == "v" and len(parts) == 3:
                return self._send(200, render_video(name, parts[2], "story" if q.get("as") == "story" else "reel"))
            if parts[1] == "v" and len(parts) == 4 and parts[3] == "qa":
                return self._send(200, render_qa(name, parts[2]))
            if len(parts) == 4 and parts[1] == "media":
                f = C.client_dir(name) / "posts" / parts[2] / parts[3]
                if parts[3] not in MEDIA_FILES or not f.exists():
                    return self._send(404, b"not found", "text/plain")
                return self._file(f, mimetypes.guess_type(f.name)[0] or "application/octet-stream")
            return self._send(404, b"not found", "text/plain")
        except KeyError as e:
            return self._send(404, f"not found: {e}".encode(), "text/plain")
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_POST(self):
        parts = [p for p in urlparse(self.path).path.split("/") if p]
        length = int(self.headers.get("Content-Length") or 0)
        form = {k: v[0] for k, v in parse_qs(self.rfile.read(length).decode(), keep_blank_values=True).items()}
        try:
            name = parts[0]
            d = C.client_dir(name)
            if parts[1] == "flag":
                C.set_flag(name, form["flag"], form["value"] == "1")
                return self._redirect(f"/{quote(name)}/settings")
            if parts[1] == "schedule":
                ts = [form.get("t1", ""), form.get("t2", "")]
                for t in ts:
                    datetime.strptime(t, "%H:%M")   # ValueError → 400
                if ts[0] == ts[1]:
                    return self._send(400, b"the two times must differ", "text/plain")
                C.set_value(name, "slots", sorted(ts))
                return self._redirect(f"/{quote(name)}")
            if parts[1] == "week":
                if form.get("action") == "prepare":
                    wk = form.get("week") or W.next_week()
                    if (W.status(name, wk) or {}).get("state") != "running":
                        W.start(name, wk)
                elif form.get("action") == "auto":
                    ws = W.settings(name)
                    C.set_value(name, "week_prep", {"auto": form.get("value") == "1", "day": ws["day"]})
                return self._redirect(f"/{quote(name)}")
            # /<c>/v/<slot>/decide (dashboard) or /<c>/decide with slot= (older form)
            if parts[1] == "v" and len(parts) == 4 and parts[3] == "decide":
                slot, back = parts[2], f"/{quote(name)}/v/{quote(parts[2])}"
            elif parts[1] == "decide":
                slot, back = form["slot"], f"/{quote(name)}"
            else:
                return self._send(404, b"not found", "text/plain")
            notes = (form.get("notes") or form.get("note") or "").strip()
            db = DB.for_client(d)
            try:
                if form.get("action") == "approve":
                    if "caption" in form:
                        (d / "posts" / slot).mkdir(parents=True, exist_ok=True)
                        (d / "posts" / slot / "caption.txt").write_text(form["caption"])
                    at = SCH.slot_for_approval(db, db.post(slot), C.load_grants(name))
                    db.set_state(slot, "APPROVED", note=notes or None, scheduled_at=at)
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
