"""The Worker, from a PC (docs/CLOUDFLARE-PLAN.md): where it is, who we are, one call.

Config: ~/.tachyon/worker.json, written by `python -m spine.worker login`:

    {"api": "https://tachyon.<account>.workers.dev", "token": "<session>", "host": "<this PC's id>"}

TACHYON_API and TACHYON_TOKEN override the file; TACHYON_API set to the empty string
means "no Worker": the local SQLite is used (the tests set it). TACHYON_HOME moves the
folder (default ~/.tachyon).
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path

TIMEOUT = 120


def home() -> Path:
    return Path(os.environ.get("TACHYON_HOME") or "~/.tachyon").expanduser()


def config() -> dict | None:
    """{"api", "token", "host"} or None when this PC runs on the local SQLite."""
    api = os.environ.get("TACHYON_API")
    if api is not None:
        return {"api": api.rstrip("/"), "token": os.environ.get("TACHYON_TOKEN", ""), "host": os.environ.get("TACHYON_HOST", "")} if api else None
    p = home() / "worker.json"
    if not p.exists():
        return None
    cfg = json.loads(p.read_text())
    return {"api": str(cfg.get("api", "")).rstrip("/"), "token": cfg.get("token", ""), "host": cfg.get("host", "")} if cfg.get("api") else None


def save_config(cfg: dict) -> Path:
    p = home() / "worker.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(cfg, indent=1) + "\n")
    p.chmod(0o600)   # the session token signs in as the user
    return p


class RemoteError(RuntimeError):
    """The Worker answered with an error: `status`, `error` (the short code), `detail` (a sentence or None)."""

    def __init__(self, status: int, error: str, detail: str | None = None):
        super().__init__(f"{status} {error}" + (f": {detail}" if detail else ""))
        self.status, self.error, self.detail = status, error, detail


opener = urllib.request.urlopen   # swapped by the tests


def call(method: str, path: str, body=None, *, cfg: dict | None = None, raw: bytes | None = None,
         headers: dict | None = None, timeout: int = TIMEOUT, parse: bool = True):
    """One request to the Worker; the parsed JSON answer (None for 204), or the bytes with
    parse=False. A non-2xx answer raises RemoteError; a network failure raises the OSError
    (URLError) as is."""
    cfg = cfg or config()
    if not cfg:
        raise RemoteError(0, "config", "no Worker configured: run `python -m spine.worker login`")
    # a named agent: Cloudflare refuses urllib's default one on workers.dev (error 1010)
    h = {"Authorization": f"Bearer {cfg['token']}", "User-Agent": "tachyon-pc/1", **(headers or {})}
    data = raw
    if body is not None:
        data = json.dumps(body).encode()
        h["Content-Type"] = "application/json"
    if data is not None:
        h["Content-Length"] = str(len(data))
    req = urllib.request.Request(cfg["api"] + path, data=data, method=method, headers=h)
    try:
        with opener(req, timeout=timeout) as r:
            text = r.read()
            status = r.status
    except urllib.error.HTTPError as e:
        text = e.read()
        try:
            err = json.loads(text)
        except ValueError:
            err = {}
        raise RemoteError(e.code, err.get("error") or text[:200].decode(errors="replace"), err.get("detail")) from None
    if not parse:
        return text
    if status == 204 or not text:
        return None
    return json.loads(text)
