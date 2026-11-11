"""clients/<c>/tachyon.db, the posts' text files, grants.yaml and the brand markdown as SQL
for D1 (docs/CLOUDFLARE-PLAN.md, phase 1).

    python -m spine.migrate_d1 <client> > /tmp/<client>.sql
    cd deploy/worker && npx wrangler d1 execute tachyon --remote --file /tmp/<client>.sql

The file replaces the client's rows online with the local ones (it deletes them first), so
it can run again after a failed or partial run. Row ids are not kept (one D1 holds every
client); journal order is kept by insertion order. Videos and covers are not in it: R2 is
phase 4. Nothing secret is read: grants.yaml holds no token.
"""

from __future__ import annotations

import json
import sqlite3
import sys
import time
from pathlib import Path

from . import clients as C

# the Python tables whose rows move as they are, plus `client`; `id` is dropped on the id-keyed ones
TABLES = ["posts", "metric_snapshots", "experiments", "conversions", "engage_log", "costs", "journal"]
FILES = ("caption.txt", "first_comment.txt", "meta.json")   # posts/<slot>/, to post_files
CLIENT_COLUMNS = ("page_id", "ig_user_id", "ig_username")   # grants.yaml keys that are clients columns


def quote(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, bytes):
        return "X'" + v.hex() + "'"
    return "'" + str(v).replace("'", "''") + "'"


def _insert(table: str, row: dict) -> str:
    cols = list(row)
    return f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join(quote(row[c]) for c in cols)});"


def dump(client: str, *, now_ms: int | None = None) -> str:
    d = C.client_dir(client)
    now_ms = now_ms if now_ms is not None else int(time.time() * 1000)
    out = [f"-- {client}: {d / 'tachyon.db'} and files, for D1 (spine/migrate_d1.py)", "PRAGMA foreign_keys = ON;"]
    for t in [*TABLES, "follower_snapshots", "post_files", "client_files"]:   # replace, so a re-run is safe
        out.append(f"DELETE FROM {t} WHERE client = {quote(client)};")   # follower_members go with their snapshots
    out.append(f"DELETE FROM clients WHERE id = {quote(client)};")

    conn = sqlite3.connect(d / "tachyon.db")
    conn.row_factory = sqlite3.Row
    try:
        for t in TABLES:
            for r in conn.execute(f"SELECT * FROM {t} ORDER BY rowid"):
                row = {"client": client, **{k: r[k] for k in r.keys() if k != "id" or t in ("experiments",)}}
                out.append(_insert(t, row))
        for s in conn.execute("SELECT * FROM follower_snapshots ORDER BY id"):
            out.append(_insert("follower_snapshots", {"client": client, **{k: s[k] for k in s.keys() if k != "id"}}))
            for m in conn.execute("SELECT kind, username FROM follower_members WHERE snapshot_id=? ORDER BY kind, username", (s["id"],)):
                out.append("INSERT INTO follower_members (snapshot_id, kind, username) "
                           f"SELECT id, {quote(m['kind'])}, {quote(m['username'])} FROM follower_snapshots "
                           f"WHERE client = {quote(client)} AND file_sha = {quote(s['file_sha'])};")
        slots = [r["slot_id"] for r in conn.execute("SELECT slot_id FROM posts ORDER BY slot_id")]
    finally:
        conn.close()

    for slot in slots:
        for name in FILES:
            p = d / "posts" / slot / name
            if p.exists():
                out.append(_insert("post_files", {"client": client, "slot_id": slot, "name": name, "text": p.read_text(),
                                                  "updated_at": int(p.stat().st_mtime * 1000)}))

    g = C.load_grants(client)
    out.append(_insert("clients", {
        "id": client, "name": g.get("display_name") or client,
        **{k: g.get(k) for k in CLIENT_COLUMNS},
        "grants": json.dumps({k: v for k, v in g.items() if k not in CLIENT_COLUMNS and k != "emergency_stop"},
                             ensure_ascii=False, sort_keys=True),
        "emergency_stop": bool(g.get("emergency_stop")), "publisher": "local", "created_at": now_ms}))
    for p in sorted(d.glob("*.md")):
        out.append(_insert("client_files", {"client": client, "name": p.name, "text": p.read_text(),
                                            "updated_at": int(p.stat().st_mtime * 1000)}))
    return "\n".join(out) + "\n"


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print(__doc__); return 2
    sys.stdout.write(dump(argv[0]))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
