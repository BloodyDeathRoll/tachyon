"""Turn a short-lived Graph API Explorer token into what the spine runs on.

Facebook Login for Business, own account, Standard Access (PLAN.md §5).

    short-lived user token (1 h)
      -> long-lived user token (60 d)      /oauth/access_token fb_exchange_token
      -> Page token (does not expire)      /{page-id}?fields=access_token

The Page token is what publish, listen and measure use. It stops working only
if the user changes their password, removes the app, or loses the Page role.

Usage:
    python -m spine.publisher.auth exchange <client>   # reads env, writes env
    python -m spine.publisher.auth check    <client>   # debug_token on the stored token

Env file: $TACHYON_ENV (default ~/Projects/tachyon/.env.local), mode 600.
Keys read:  META_APP_ID, META_APP_SECRET, FACEBOOK_ACCESS_TOKEN (short-lived)
Key written: <token_env from grants.yaml>, e.g. TACHYON_ROSA_TOKEN
The short-lived token is removed from the file after a successful exchange.
Tokens are never printed; only their debug metadata is.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from spine.clients import load_grants

GRAPH = "https://graph.facebook.com/v26.0"
DEFAULT_ENV = Path.home() / "Projects" / "tachyon" / ".env.local"


def env_path() -> Path:
    return Path(os.environ.get("TACHYON_ENV", DEFAULT_ENV)).expanduser()


def read_env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.exists():
        return out
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def write_env(path: Path, values: dict[str, str]) -> None:
    lines = [f"{k}={v}" for k, v in values.items()]
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text("\n".join(lines) + "\n")
    os.chmod(tmp, 0o600)
    tmp.replace(path)
    os.chmod(path, 0o600)


def get(path: str, **params: str) -> dict:
    url = f"{GRAPH}/{path}?{urllib.parse.urlencode(params)}"
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        try:
            err = json.loads(body)["error"]
            raise SystemExit(f"Graph error {err.get('code')}: {err.get('message')}") from None
        except (KeyError, ValueError):
            raise SystemExit(f"HTTP {e.code}: {body[:300]}") from None


def debug(token: str, app_token: str) -> dict:
    return get("debug_token", input_token=token, access_token=app_token)["data"]


def describe(d: dict) -> str:
    exp = d.get("expires_at") or 0
    when = "never" if exp == 0 else datetime.fromtimestamp(exp, timezone.utc).isoformat()
    scopes = ",".join(d.get("scopes", []))
    return f"type={d.get('type')} valid={d.get('is_valid')} expires={when} scopes=[{scopes}]"


def exchange(client: str) -> None:
    grants = load_grants(client)
    page_id = grants["page_id"]
    token_key = grants["token_env"]
    path = env_path()
    env = read_env(path)
    for k in ("META_APP_ID", "META_APP_SECRET", "FACEBOOK_ACCESS_TOKEN"):
        if not env.get(k):
            raise SystemExit(f"{path}: missing {k}")
    app_token = f"{env['META_APP_ID']}|{env['META_APP_SECRET']}"

    short = env["FACEBOOK_ACCESS_TOKEN"]
    print("short-lived:", describe(debug(short, app_token)))

    long_user = get(
        "oauth/access_token",
        grant_type="fb_exchange_token",
        client_id=env["META_APP_ID"],
        client_secret=env["META_APP_SECRET"],
        fb_exchange_token=short,
    )["access_token"]
    print("long-lived user:", describe(debug(long_user, app_token)))

    page = get(page_id, fields="id,name,access_token,instagram_business_account{id,username}",
               access_token=long_user)
    page_token = page["access_token"]
    ig = page.get("instagram_business_account") or {}
    if str(ig.get("id")) != str(grants["ig_user_id"]):
        raise SystemExit(f"Page {page_id} is linked to IG {ig}, grants.yaml says {grants['ig_user_id']}")
    print("page token:", describe(debug(page_token, app_token)))
    print(f"page={page['name']} ({page['id']}) ig=@{ig.get('username')} ({ig.get('id')})")

    env[token_key] = page_token
    env.pop("FACEBOOK_ACCESS_TOKEN", None)
    write_env(path, env)
    print(f"wrote {token_key} to {path}; removed FACEBOOK_ACCESS_TOKEN")


def check(client: str) -> None:
    grants = load_grants(client)
    env = read_env(env_path())
    tok = env.get(grants["token_env"])
    if not tok:
        raise SystemExit(f"{grants['token_env']} not set in {env_path()}")
    app_token = f"{env['META_APP_ID']}|{env['META_APP_SECRET']}"
    print(describe(debug(tok, app_token)))
    me = get(grants["ig_user_id"], fields="username,followers_count,media_count", access_token=tok)
    quota = get(f"{grants['ig_user_id']}/content_publishing_limit", access_token=tok)["data"][0]
    print(f"@{me['username']} followers={me['followers_count']} media={me['media_count']} "
          f"published_last_24h={quota['quota_usage']}/100")


def main(argv: list[str]) -> None:
    if len(argv) != 2 or argv[0] not in ("exchange", "check"):
        raise SystemExit(__doc__)
    {"exchange": exchange, "check": check}[argv[0]](argv[1])


if __name__ == "__main__":
    main(sys.argv[1:])
