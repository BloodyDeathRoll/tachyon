"""Followers who dropped, from Instagram's own data export (the API has no follower list).

The operator downloads the export (Accounts Center → Download your information → JSON,
Followers and following) and uploads it on the dashboard, or drops it in clients/<c>/exports/.
Each export is one snapshot; the newest two are compared.

    python -m spine.audience <client> [export.zip|folder|followers_1.json]   # import, print who dropped
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from spine import clients as C
from spine.db import DB

FOLLOWERS = re.compile(r"(^|/)followers(_\d+)?\.json$")
FOLLOWING = re.compile(r"(^|/)following(_\d+)?\.json$")


def _names(data) -> set[str]:
    """Usernames from one export file, either layout: a list of entries, or {"relationships_…": [entries]}.
    An entry names the account in string_list_data[].value, its href, or its title."""
    if isinstance(data, dict):
        data = next((v for v in data.values() if isinstance(v, list)), [])
    out = set()
    for e in data if isinstance(data, list) else []:
        if not isinstance(e, dict):
            continue
        for s in e.get("string_list_data") or [{}]:
            u = s.get("value") or e.get("title") or (s.get("href") or "").rstrip("/").rsplit("/", 1)[-1]
            if u:
                out.add(u.strip().lstrip("@").lower())
    return out


def _wanted(name: str) -> bool:
    return bool(FOLLOWERS.search(name) or FOLLOWING.search(name))


def _files(path: Path):
    """(name, bytes, written) for the followers / following files only, in a zip, a folder or one file.
    A full export also holds messages and media: those are never read."""
    if path.is_dir():
        for f in sorted(path.rglob("*.json")):
            if _wanted(f.name):
                yield f.relative_to(path).as_posix(), f.read_bytes(), datetime.fromtimestamp(f.stat().st_mtime, timezone.utc)
    elif zipfile.is_zipfile(path):
        try:
            with zipfile.ZipFile(path) as z:
                for i in sorted(z.infolist(), key=lambda i: i.filename):
                    if _wanted(i.filename):
                        yield i.filename, z.read(i), datetime(*i.date_time, tzinfo=timezone.utc)
        except (zipfile.BadZipFile, EOFError) as e:
            raise ValueError(f"the zip is damaged: download it again ({e})") from e
    elif path.name.endswith(".json"):
        yield path.name, path.read_bytes(), datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
    else:
        raise ValueError("not an export: upload the .zip (or its followers JSON)")


def parse_export(path: Path) -> dict:
    """{"followers", "following", "sha", "written"}: written = when Instagram made the export (orders snapshots)."""
    followers: set[str] | None = None
    following: set[str] | None = None
    h, written = hashlib.sha256(), None
    for name, raw, at in _files(path):
        h.update(name.encode() + b"\0" + raw)
        written = max(written or at, at)
        try:
            data = json.loads(raw)
        except ValueError as e:
            raise ValueError(f"{name} is not readable JSON: download the export in JSON format") from e
        if FOLLOWERS.search(name):
            followers = (followers or set()) | _names(data)
        else:
            following = (following or set()) | _names(data)
    if not followers:   # missing, HTML format, or empty: never compare against nothing
        raise ValueError("no followers in it: download the export in JSON format with Followers and following")
    return {"followers": followers, "following": following, "sha": h.hexdigest(),
            "written": (written or datetime.now(timezone.utc)).isoformat(timespec="seconds")}


def import_export(client: str, path: Path) -> int | None:
    """Store one export as a snapshot. None when this exact export is already in."""
    path = Path(path)
    got = parse_export(path)
    db = DB.for_client(C.client_dir(client))
    try:
        db.conn.execute("BEGIN IMMEDIATE")   # the duplicate check and the insert are one step
        if db.conn.execute("SELECT 1 FROM follower_snapshots WHERE file_sha=?", (got["sha"],)).fetchone():
            db.conn.execute("ROLLBACK")
            return None
        cur = db.conn.execute(
            "INSERT INTO follower_snapshots(taken_at, file_sha, source, n_followers, n_following) VALUES (?,?,?,?,?)",
            (got["written"], got["sha"], path.name, len(got["followers"]), None if got["following"] is None else len(got["following"])))
        sid = cur.lastrowid
        db.conn.executemany("INSERT INTO follower_members VALUES (?,?,?)",
                            [(sid, "follower", u) for u in sorted(got["followers"])]
                            + [(sid, "following", u) for u in sorted(got["following"] or ())])
        db.conn.execute("COMMIT")
        return sid
    except Exception:
        if db.conn.in_transaction:
            db.conn.execute("ROLLBACK")
        raise
    finally:
        db.close()


def scan(client: str) -> list[int]:
    """Import whatever export sits in clients/<c>/exports/ and is not in yet (oldest first)."""
    d = C.client_dir(client) / "exports"
    out = []
    for f in sorted((x for x in d.glob("*") if x.suffix in (".zip", ".json") or x.is_dir()), key=lambda x: x.stat().st_mtime) if d.exists() else []:
        try:
            sid = import_export(client, f)
        except ValueError as e:   # one bad file must not stop the rest
            print(f"{f.name}: {e}", file=sys.stderr)
            continue
        if sid:
            out.append(sid)
    return out


def dropped(client: str) -> dict:
    """Followers in the previous export who are gone from the newest one."""
    db = DB.for_client(C.client_dir(client))
    try:
        snaps = db.conn.execute("SELECT * FROM follower_snapshots ORDER BY taken_at DESC, id DESC LIMIT 2").fetchall()
        out = {"snapshots": len(snaps), "since": None, "at": snaps[0]["taken_at"] if snaps else None,
               "followers": snaps[0]["n_followers"] if snaps else None, "dropped": []}
        if len(snaps) == 2:
            new, old = snaps
            out["since"] = old["taken_at"]
            out["dropped"] = [r[0] for r in db.conn.execute(
                "SELECT username FROM follower_members WHERE snapshot_id=? AND kind='follower' "
                "AND username NOT IN (SELECT username FROM follower_members WHERE snapshot_id=? AND kind='follower') "
                "ORDER BY username", (old["id"], new["id"]))]
        return out
    finally:
        db.close()


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__); return 2
    client = argv[0]
    if len(argv) > 1:
        import_export(client, Path(argv[1]))
    else:
        scan(client)
    for u in dropped(client)["dropped"]:
        print(u)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
