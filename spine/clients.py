"""Client folders and grants (docs/PLAN.md §3 station 0, §1 principle 6).

grants.yaml holds identifiers and autonomy flags, never secrets. Tokens live in the
environment (TACHYON_<CLIENT>_TOKEN) or a .env the operator manages.

With a Worker configured (spine/remote.py) the grants are the `clients` row online
(docs/CLOUDFLARE-PLAN.md, "What moves where"): load_grants reads it, save_grants writes it,
and pull() writes the row and the brand markdown (client_files) to clients/<name>/ before a
generation, so the prompts keep reading files. The folder itself stays: the assets live there.
"""

from __future__ import annotations

import copy
import os
import re
import time
from datetime import date
from pathlib import Path

import yaml

from . import remote as R

ROOT = Path(__file__).resolve().parent.parent
CLIENTS = ROOT / "clients"
COLUMNS = ("page_id", "ig_user_id", "ig_username", "emergency_stop", "display_name")   # grants keys kept as columns online (display_name is clients.name)

DEFAULT_GRANTS = {
    "page_id": None,
    "ig_user_id": None,
    "token_env": None,          # name of the env var holding the Page-scoped token
    "ga4_property": None,
    "blob_bucket": None,
    "auto_approve_pillars": [],  # pillars the batch gate may auto-approve
    "auto_reply": {"comments": False, "dm": False},
    "emergency_stop": False,
}

AUTONOMY_FLAGS = ["auto_reply.comments", "auto_reply.dm"]


def list_clients() -> list[str]:
    if not CLIENTS.exists():
        return []
    return sorted(p.name for p in CLIENTS.iterdir() if (p / "grants.yaml").exists())


def client_dir(name: str) -> Path:
    d = CLIENTS / name
    if not (d / "grants.yaml").exists():
        raise KeyError(f"no client {name!r} (missing {d / 'grants.yaml'})")
    return d


def _remote(name: str):
    from .db import RemoteDB   # local import: db imports nothing from here, but keep the cycle out
    cfg = R.config()
    return RemoteDB(name, cfg) if cfg else None


def _row_grants(row: dict) -> dict:
    """The clients row as grants.yaml's dict: the JSON plus the columns."""
    data = dict(row.get("grants") or {})
    data.update({k: row.get(k) for k in ("page_id", "ig_user_id", "ig_username")})
    data["emergency_stop"] = bool(row.get("emergency_stop"))
    data["display_name"] = row.get("name")
    return data


_GRANTS: dict[str, tuple[float, dict]] = {}   # name -> (read at, the remote row's grants)
GRANTS_TTL = 5.0   # a page reads them once per video; an edit here clears it, one elsewhere shows within seconds


def load_grants(name: str, fresh: bool = False) -> dict:
    """fresh: skip the cache, for a read that is written back (set_flag)."""
    db = _remote(name)
    if db:
        hit = _GRANTS.get(name)
        if fresh or not hit or time.monotonic() - hit[0] > GRANTS_TTL:
            hit = _GRANTS[name] = (time.monotonic(), _row_grants(db.client_row()))
        data = copy.deepcopy(hit[1])   # a caller may edit nested keys before save_grants
    else:
        data = yaml.safe_load((client_dir(name) / "grants.yaml").read_text()) or {}
    merged = {**DEFAULT_GRANTS, **data}
    merged["auto_reply"] = {**DEFAULT_GRANTS["auto_reply"], **(data.get("auto_reply") or {})}
    return merged


def save_grants(name: str, grants: dict) -> None:
    _GRANTS.pop(name, None)
    db = _remote(name)
    if db:
        db.set_grants({k: v for k, v in grants.items() if k not in COLUMNS},
                      emergency_stop=bool(grants["emergency_stop"]) if "emergency_stop" in grants else None)   # absent: left as it is
        return
    (client_dir(name) / "grants.yaml").write_text(yaml.safe_dump(grants, sort_keys=False))


def pull(name: str) -> list[str]:
    """Before a generation on this PC: the client's brand markdown and grants from online to
    clients/<name>/, so the prompts and spine/week.py keep reading files. The names written.
    The online copy is the store: a file edited on the PC is overwritten, and a file deleted
    online stays here (nothing deletes a client_files row yet; when something does, pull
    should remove what is gone)."""
    if not re.fullmatch(r"[\w-]{1,64}", name):   # a folder name, never a path
        raise ValueError(f"not a client id: {name!r}")
    db = _remote(name)
    if not db:
        return []
    d = CLIENTS / name
    d.mkdir(parents=True, exist_ok=True)

    def put(fname: str, text: str) -> None:
        tmp = d / (fname + ".tmp")   # whole or not at all: a prompt may read the file mid-write
        try:
            tmp.write_text(text)
            tmp.replace(d / fname)
        finally:
            tmp.unlink(missing_ok=True)   # gone after the replace; a failed write leaves nothing behind

    written = []
    for f in db.client_files():
        if "/" in f["name"] or "\\" in f["name"] or not f["name"].endswith(".md"):
            continue   # never a path, never anything but the markdown
        put(f["name"], f["text"])
        written.append(f["name"])
    put("grants.yaml", yaml.safe_dump(_row_grants(db.client_row()), sort_keys=False))
    written.append("grants.yaml")
    return written


def set_flag(name: str, dotted: str, value: bool) -> dict:
    """Flip one autonomy flag or emergency_stop. Anything else is refused."""
    if dotted not in AUTONOMY_FLAGS + ["emergency_stop"]:
        raise ValueError(f"not a switch: {dotted}")
    g = load_grants(name, fresh=True)
    if "." in dotted:
        a, b = dotted.split(".")
        g[a][b] = bool(value)
    else:
        g[dotted] = bool(value)
    save_grants(name, g)
    return g


EDITABLE = {"slots", "week_prep"}   # dashboard-editable settings besides the switches


def set_value(name: str, key: str, value) -> dict:
    if key not in EDITABLE:
        raise ValueError(f"not editable: {key}")
    g = load_grants(name, fresh=True)
    g[key] = value
    save_grants(name, g)
    return g


REPLY_FLAGS = {"comments": "auto_reply.comments", "dm": "auto_reply.dm"}


def video_replies(name: str, slot: str) -> dict:
    """Per-video reply override from posts/<slot>/meta.json: {"custom": bool, "comments": bool, "dm": bool}."""
    import json
    p = client_dir(name) / "posts" / slot / "meta.json"
    try:
        m = json.loads(p.read_text()) if p.exists() else {}
    except json.JSONDecodeError:
        m = {}
    r = m.get("replies") or {}
    return {"custom": bool(r.get("custom")), "comments": bool(r.get("comments")), "dm": bool(r.get("dm"))}


def set_video_replies(name: str, slot: str, **kw) -> dict:
    import json
    p = client_dir(name) / "posts" / slot / "meta.json"
    m = json.loads(p.read_text()) if p.exists() else {}
    r = {**video_replies(name, slot), **{k: bool(v) for k, v in kw.items() if k in ("custom", "comments", "dm")}}
    m["replies"] = r
    p.write_text(json.dumps(m, indent=2, ensure_ascii=False) + "\n")
    return r


def reply_allowed(name: str, kind: str, slot: str | None = None) -> bool:
    """May the listener auto-reply? kind = "comments" | "dm". Emergency stop always wins; a video with
    custom replies on decides for itself; otherwise the project setting decides."""
    if stopped(name):
        return False
    if slot:
        r = video_replies(name, slot)
        if r["custom"]:
            return r[kind]
    a, b = REPLY_FLAGS[kind].split(".")
    return bool(load_grants(name)[a][b])


def stopped(name: str) -> bool:
    return bool(load_grants(name)["emergency_stop"])


def token(name: str) -> str:
    """Page-scoped token: process env first, then the operator's env file
    ($TACHYON_ENV, default ~/Projects/tachyon/.env.local, written by publisher/auth.py)."""
    key = load_grants(name)["token_env"]
    if not key:
        raise RuntimeError(f"no token for {name}: set grants.token_env")
    if os.environ.get(key):
        return os.environ[key]
    from spine.publisher.auth import env_path, read_env  # local import: avoids a cycle
    value = read_env(env_path()).get(key)
    if not value:
        raise RuntimeError(f"no token for {name}: {key} not in env or {env_path()}")
    return value


def data_expires(name: str) -> date | None:
    """Day Meta stops serving data on this client's token unless the app is logged into again
    (written by publisher/auth.py exchange)."""
    key = load_grants(name)["token_env"]
    from spine.publisher.auth import env_path, read_env  # local import: avoids a cycle
    value = read_env(env_path()).get(f"{key}_DATA_EXPIRES") if key else None
    return date.fromisoformat(value) if value else None
