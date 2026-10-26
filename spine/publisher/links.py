"""The bio link, kept current without touching the profile.

Instagram allows one link in the bio and the Graph API cannot change it. So the bio points
at a fixed redirect the client hosts (Rosa: https://rosa.surf/ig, an edge function) and
this module moves the redirect's target to the newest reel's landing page + UTM right after
each publish. Target lives in a Vercel Edge Config item.

grants.yaml:
    bio_link:
      public_url: https://rosa.surf/ig
      edge_config_id: ecfg_...
      team_id: team_...
      key: rosa_ig

Writes go through the Vercel CLI's own login (`vercel api`), so cron needs no extra token.
Every change is journaled by the caller.
"""

from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path


class LinkError(RuntimeError):
    pass


def _api(path: str, method: str, body: dict | None = None, *, runner=subprocess.run) -> dict:
    cmd = ["vercel", "api", path, "--method", method]
    tmp = None
    if body is not None:
        tmp = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False)
        json.dump(body, tmp)
        tmp.close()
        cmd += ["--input", tmp.name]
    try:
        r = runner(cmd, capture_output=True, text=True, timeout=60)
    finally:
        if tmp:
            Path(tmp.name).unlink(missing_ok=True)
    if r.returncode != 0:
        raise LinkError(f"vercel api {method} {path}: {r.stderr.strip()[:300] or r.stdout.strip()[:300]}")
    try:
        return json.loads(r.stdout) if r.stdout.strip() else {}
    except json.JSONDecodeError:
        raise LinkError(f"vercel api {method} {path}: non-JSON reply {r.stdout[:200]!r}") from None


def current(grants: dict, *, runner=subprocess.run) -> str | None:
    b = grants.get("bio_link") or {}
    if not b.get("edge_config_id"):
        return None
    items = _api(f"/v1/edge-config/{b['edge_config_id']}/items?teamId={b['team_id']}", "GET", runner=runner)
    for it in items if isinstance(items, list) else []:
        if it.get("key") == b["key"]:
            return it.get("value")
    return None


def set_target(grants: dict, url: str, *, runner=subprocess.run) -> dict:
    """Point the client's bio redirect at `url`. Returns the Edge Config digest reply."""
    b = grants.get("bio_link") or {}
    for k in ("edge_config_id", "team_id", "key", "public_url"):
        if not b.get(k):
            raise LinkError(f"grants.bio_link.{k} missing")
    host = b["public_url"].split("/")[2]
    if not url.startswith(f"https://{host}/"):
        raise LinkError(f"refusing to point {b['public_url']} at a foreign host: {url}")
    body = {"items": [{"operation": "upsert", "key": b["key"], "value": url}]}
    return _api(f"/v1/edge-config/{b['edge_config_id']}/items?teamId={b['team_id']}", "PATCH", body, runner=runner)
