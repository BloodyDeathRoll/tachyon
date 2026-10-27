"""spine/audience.py: Instagram data export → follower snapshots → who dropped."""

import json
import zipfile

import pytest
import yaml

from spine import audience as AU
from spine import clients as C


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(C, "CLIENTS", tmp_path)
    d = tmp_path / "demo"
    d.mkdir()
    (d / "grants.yaml").write_text(yaml.safe_dump({"display_name": "Demo", "ig_user_id": "1"}))
    return "demo"


def export(path, followers, following=()):
    """Both layouts Instagram has used: followers as a list with value, following under relationships_* with title."""
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("connections/followers_and_following/followers_1.json", json.dumps(
            [{"title": "", "string_list_data": [{"href": f"https://www.instagram.com/{u}", "value": u, "timestamp": 1}]} for u in followers]))
        z.writestr("connections/followers_and_following/following.json", json.dumps(
            {"relationships_following": [{"title": u, "string_list_data": [{"href": f"https://www.instagram.com/_u/{u}", "timestamp": 1}]} for u in following]}))
    return path


def test_parse_both_layouts(tmp_path):
    got = AU.parse_export(export(tmp_path / "a.zip", ["Ann", "bob"], ["carl"]))
    assert got["followers"] == {"ann", "bob"} and got["following"] == {"carl"}


def test_dropped_compares_the_last_two_exports(client, tmp_path):
    assert AU.import_export(client, export(tmp_path / "1.zip", ["ann", "bob", "dan"]))
    r = AU.dropped(client)
    assert r["snapshots"] == 1 and r["dropped"] == [] and r["followers"] == 3
    assert AU.import_export(client, export(tmp_path / "1b.zip", ["ann", "bob", "dan"])) is None   # same export twice: ignored
    AU.import_export(client, export(tmp_path / "2.zip", ["ann", "eve"]))
    assert AU.dropped(client)["dropped"] == ["bob", "dan"]


def test_export_without_followers_is_refused(tmp_path):
    p = tmp_path / "x.zip"
    with zipfile.ZipFile(p, "w") as z:
        z.writestr("index.html", "<html></html>")
    with pytest.raises(ValueError):
        AU.parse_export(p)


def test_scan_picks_up_the_exports_folder(client, tmp_path):
    d = C.client_dir(client) / "exports"
    d.mkdir()
    export(d / "a.zip", ["ann"])
    assert len(AU.scan(client)) == 1 and AU.scan(client) == []


def test_empty_damaged_and_html_exports_are_refused(tmp_path):
    empty = export(tmp_path / "e.zip", [])
    cut = tmp_path / "cut.zip"
    cut.write_bytes(export(tmp_path / "ok.zip", ["ann"]).read_bytes()[:-40])
    for p in (empty, cut):
        with pytest.raises(ValueError):
            AU.parse_export(p)


def test_an_older_export_uploaded_late_does_not_flip_the_comparison(client, tmp_path):
    import os
    new = export(tmp_path / "new.zip", ["ann"])
    old = export(tmp_path / "old.zip", ["ann", "bob"])
    with zipfile.ZipFile(old) as z:   # rewrite with an older date inside the zip
        items = [(i, z.read(i)) for i in z.infolist()]
    with zipfile.ZipFile(old, "w") as z:
        for i, raw in items:
            i.date_time = (2026, 1, 1, 0, 0, 0)
            z.writestr(i, raw)
    os.utime(old)
    AU.import_export(client, new)
    AU.import_export(client, old)
    assert AU.dropped(client)["dropped"] == ["bob"]


def test_only_the_follower_files_are_read(tmp_path):
    p = export(tmp_path / "a.zip", ["ann"])
    with zipfile.ZipFile(p, "a") as z:
        z.writestr("your_instagram_activity/messages/inbox/x/message_1.json", "not json at all")
    assert AU.parse_export(p)["followers"] == {"ann"}
