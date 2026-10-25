"""Client folders and grants (docs/PLAN.md §3 station 0, §1 principle 6).

grants.yaml holds identifiers and autonomy flags, never secrets. Tokens live in the
environment (TACHYON_<CLIENT>_TOKEN) or a .env the operator manages.
"""

from __future__ import annotations

import os
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
CLIENTS = ROOT / "clients"

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


def load_grants(name: str) -> dict:
    data = yaml.safe_load((client_dir(name) / "grants.yaml").read_text()) or {}
    merged = {**DEFAULT_GRANTS, **data}
    merged["auto_reply"] = {**DEFAULT_GRANTS["auto_reply"], **(data.get("auto_reply") or {})}
    return merged


def save_grants(name: str, grants: dict) -> None:
    (client_dir(name) / "grants.yaml").write_text(yaml.safe_dump(grants, sort_keys=False))


def set_flag(name: str, dotted: str, value: bool) -> dict:
    """Flip one autonomy flag or emergency_stop. Anything else is refused."""
    if dotted not in AUTONOMY_FLAGS + ["emergency_stop"]:
        raise ValueError(f"not a switch: {dotted}")
    g = load_grants(name)
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
    g = load_grants(name)
    g[key] = value
    save_grants(name, g)
    return g


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
