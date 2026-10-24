"""review/ — approve and watch (docs/PLAN.md CP2). Stdlib only.

    python -m spine.review.app            # http://127.0.0.1:8765

Per client: the posts waiting for approval with video, caption, cover, QA report, slot,
experiment and trial flag; approve / edit caption / reject with a note. Also the
switchboard: autonomy flags and emergency_stop in grants.yaml. A human decides here;
no LLM runs in this process.
"""

from __future__ import annotations

import html
import json
import mimetypes
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from .. import clients as C
from ..db import DB

ESC = html.escape

CSS = """
body{font:14px/1.45 system-ui,sans-serif;color:#111827;margin:0;background:#f7f8fa}
header{padding:16px 24px;background:#fff;border-bottom:1px solid #e5e7eb;display:flex;gap:16px;align-items:center}
h1{font-size:18px;margin:0} h2{font-size:15px;margin:24px 0 8px} main{padding:0 24px 48px;max-width:1280px}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:12px 0;display:grid;grid-template-columns:270px 1fr;gap:20px}
video,img.cover{width:270px;border-radius:8px;background:#000}
.meta{color:#4b5563;font-size:12px} .pill{display:inline-block;border-radius:999px;padding:2px 8px;font-size:11px;background:#efecfe;color:#44298a;margin-right:6px}
.pill.y{background:#fdf6de;color:#735c0d} .pill.r{background:#fdeded;color:#991b1b} .pill.g{background:#eaf7ef;color:#166534}
textarea{width:100%;min-height:90px;font:13px/1.4 ui-monospace,monospace} pre{white-space:pre-wrap;font-size:12px;background:#f7f8fa;padding:8px;border-radius:8px;max-height:220px;overflow:auto}
button{border:1px solid #d1d5db;background:#fff;border-radius:8px;padding:6px 12px;cursor:pointer} button.ok{background:#eaf7ef;border-color:#bce5cb} button.no{background:#fdeded;border-color:#f3c5c5} button.stop{background:#991b1b;color:#fff;border-color:#991b1b}
table{border-collapse:collapse;width:100%;font-size:12px} td,th{border-bottom:1px solid #e5e7eb;padding:6px 8px;text-align:left}
form.inline{display:inline} .switch{display:inline-flex;gap:8px;align-items:center;margin-right:18px}
"""


def page(title: str, body: str) -> bytes:
    return f"<!doctype html><meta charset=utf-8><title>{ESC(title)}</title><style>{CSS}</style>{body}".encode()


def read(p: Path) -> str:
    return p.read_text() if p.exists() else ""


def render_client(name: str) -> bytes:
    d = C.client_dir(name)
    db = DB.for_client(d)
    g = C.load_grants(name)
    waiting = db.posts("NEEDS_APPROVAL")
    stop_cls = "r" if g["emergency_stop"] else "g"
    out = [f"<header><h1>review/ · {ESC(name)}</h1><span class='pill {stop_cls}'>"
           f"{'EMERGENCY STOP' if g['emergency_stop'] else 'running'}</span>"
           f"<span class=meta>{len(waiting)} waiting for approval</span>"
           f"<a href='/' style='margin-left:auto'>all clients</a></header><main>"]

    # switchboard
    out.append("<h2>Switchboard · grants.yaml</h2><div class=card style='grid-template-columns:1fr'><div>")
    for flag in C.AUTONOMY_FLAGS:
        a, b = flag.split(".")
        on = g[a][b]
        out.append(f"<form class='inline switch' method=post action='/{ESC(name)}/flag'>"
                   f"<input type=hidden name=flag value='{flag}'><input type=hidden name=value value='{0 if on else 1}'>"
                   f"<span class='pill {'g' if on else 'y'}'>{flag}: {'on' if on else 'off'}</span>"
                   f"<button>{'turn off' if on else 'turn on'}</button></form>")
    out.append(f"<form class='inline switch' method=post action='/{ESC(name)}/flag'>"
               f"<input type=hidden name=flag value='emergency_stop'><input type=hidden name=value value='{0 if g['emergency_stop'] else 1}'>"
               f"<button class='{'ok' if g['emergency_stop'] else 'stop'}'>{'resume' if g['emergency_stop'] else 'EMERGENCY STOP'}</button></form>")
    out.append("</div></div>")

    # approvals
    out.append("<h2>Waiting for approval</h2>")
    if not waiting:
        out.append("<p class=meta>Nothing waiting.</p>")
    for p in waiting:
        slot = d / "posts" / p["slot_id"]
        caption = read(slot / "caption.txt")
        qa = read(slot / "qa.md")
        meta = read(slot / "meta.json")
        try:
            meta_d = json.loads(meta) if meta else {}
        except json.JSONDecodeError:
            meta_d = {"error": "meta.json unreadable"}
        bust = lambda f: int(f.stat().st_mtime)  # noqa: E731 — cache-buster per file version
        vid = f"<video controls preload=metadata src='/{ESC(name)}/media/{ESC(p['slot_id'])}/video.mp4?v={bust(slot / 'video.mp4')}'></video>" if (slot / "video.mp4").exists() else "<div class=meta>no video.mp4</div>"
        cover = f"<img class=cover src='/{ESC(name)}/media/{ESC(p['slot_id'])}/cover.jpg?v={bust(slot / 'cover.jpg')}'>" if (slot / "cover.jpg").exists() else ""
        pills = [f"<span class=pill>{ESC(str(p['pillar'] or '—'))}</span>",
                 f"<span class='pill y'>{ESC(str(p['hook_formula'] or '—'))}</span>",
                 f"<span class='pill y'>{ESC(str(p['scheduled_at'] or 'unscheduled'))}</span>"]
        if p["experiment_id"]:
            pills.append(f"<span class=pill>exp {ESC(p['experiment_id'])}</span>")
        if p["trial"]:
            pills.append("<span class='pill g'>trial reel</span>")
        out.append(f"<div class=card><div>{vid}{cover}</div><div>"
                   f"<b>{ESC(p['slot_id'])}</b> &nbsp; {''.join(pills)}"
                   f"<div class=meta>{ESC(str(p['angle'] or ''))} · engine {ESC(str(p['engine'] or '—'))} · QA rounds {p['qa_rounds']}</div>"
                   f"<form method=post action='/{ESC(name)}/decide'><input type=hidden name=slot value='{ESC(p['slot_id'])}'>"
                   f"<p><b>Caption</b> (edit before approving)</p><textarea name=caption>{ESC(caption)}</textarea>"
                   f"<p><b>QA</b></p><pre>{ESC(qa) or 'no qa.md'}</pre>"
                   f"<p class=meta>meta.json: {ESC(json.dumps(meta_d, ensure_ascii=False))}</p>"
                   f"<p><input name=note placeholder='note (required to reject)' style='width:60%'> "
                   f"<button class=ok name=action value=approve>Approve</button> "
                   f"<button class=no name=action value=reject>Reject</button></p></form></div></div>")

    # everything else
    out.append("<h2>All posts</h2><table><tr><th>slot</th><th>state</th><th>scheduled</th><th>pillar</th><th>hook</th><th>ig_media_id</th><th>updated</th></tr>")
    for p in db.posts():
        out.append(f"<tr><td>{ESC(p['slot_id'])}</td><td>{ESC(p['state'])}</td><td>{ESC(str(p['scheduled_at'] or ''))}</td>"
                   f"<td>{ESC(str(p['pillar'] or ''))}</td><td>{ESC(str(p['hook_formula'] or ''))}</td>"
                   f"<td>{ESC(str(p['ig_media_id'] or ''))}</td><td class=meta>{ESC(p['updated_at'])}</td></tr>")
    out.append("</table></main>")
    db.close()
    return page(f"review · {name}", "".join(out))


def render_index() -> bytes:
    items = "".join(f"<li><a href='/{ESC(c)}'>{ESC(c)}</a></li>" for c in C.list_clients()) or "<li class=meta>no clients yet</li>"
    return page("review/", f"<header><h1>review/</h1></header><main><ul>{items}</ul></main>")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):  # quiet
        pass

    def _send(self, code: int, body: bytes, ctype: str = "text/html; charset=utf-8") -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")   # slots get renamed; never serve a stale video
        self.end_headers()
        self.wfile.write(body)

    def _redirect(self, to: str) -> None:
        self.send_response(303)
        self.send_header("Location", to)
        self.end_headers()

    def do_GET(self):
        parts = [p for p in urlparse(self.path).path.split("/") if p]
        try:
            if not parts:
                return self._send(200, render_index())
            name = parts[0]
            if len(parts) == 1:
                return self._send(200, render_client(name))
            if len(parts) == 4 and parts[1] == "media":
                f = C.client_dir(name) / "posts" / parts[2] / parts[3]
                if parts[3] not in {"video.mp4", "cover.jpg"} or not f.exists():
                    return self._send(404, b"not found", "text/plain")
                return self._send(200, f.read_bytes(), mimetypes.guess_type(f.name)[0] or "application/octet-stream")
            return self._send(404, b"not found", "text/plain")
        except KeyError as e:
            return self._send(404, f"unknown client {e}".encode(), "text/plain")

    def do_POST(self):
        parts = [p for p in urlparse(self.path).path.split("/") if p]
        length = int(self.headers.get("Content-Length") or 0)
        form = {k: v[0] for k, v in parse_qs(self.rfile.read(length).decode()).items()}
        try:
            name = parts[0]
            d = C.client_dir(name)
            if parts[1] == "flag":
                C.set_flag(name, form["flag"], form["value"] == "1")
                return self._redirect(f"/{name}")
            if parts[1] == "decide":
                db = DB.for_client(d)
                slot = form["slot"]
                if form["action"] == "approve":
                    cap = form.get("caption", "")
                    (d / "posts" / slot).mkdir(parents=True, exist_ok=True)
                    (d / "posts" / slot / "caption.txt").write_text(cap)
                    db.set_state(slot, "APPROVED", note=form.get("note") or None)
                elif form["action"] == "reject":
                    if not form.get("note"):
                        db.close()
                        return self._send(400, b"a rejection needs a note", "text/plain")
                    db.set_state(slot, "REJECTED", note=form["note"])
                db.close()
                return self._redirect(f"/{name}")
            return self._send(404, b"not found", "text/plain")
        except (KeyError, ValueError) as e:
            return self._send(400, str(e).encode(), "text/plain")


def serve(host: str = "127.0.0.1", port: int = 8765) -> ThreadingHTTPServer:
    srv = ThreadingHTTPServer((host, port), Handler)
    return srv


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    s = serve(port=port)
    print(f"review/ on http://127.0.0.1:{port}")
    s.serve_forever()
