"""spine/week.py motion styles: every reel in a week gets its own, none from recent posts."""

import json

import yaml

from spine import clients as C
from spine import week as W


def test_each_item_gets_its_own_style_never_a_recent_one(tmp_path, monkeypatch):
    cat = tmp_path / "motion.yaml"
    cat.write_text(yaml.safe_dump({"styles": [{"id": k, "title": k, "tags": ["Shapes"], "url": "u", "prompt": "p"}
                                              for k in ("a", "b", "c", "d")]}))
    monkeypatch.setattr(W, "MOTION", cat)
    monkeypatch.setattr(C, "CLIENTS", tmp_path)
    (tmp_path / "demo" / "posts" / "old").mkdir(parents=True)
    (tmp_path / "demo" / "posts" / "old" / "meta.json").write_text(json.dumps({"motion": "a"}))
    (tmp_path / "demo" / "grants.yaml").write_text("ig_user_id: \"1\"\n")
    items = [{"motion": "b"}, {"motion": "b"}, {"motion": "a"}, {"motion": "zzz"}]
    W.pick_motion("demo", items, "2026-W45")
    got = [it["motion"] for it in items]
    assert got[0] == "b" and "a" not in got and None not in got[:3] and len(set(got[:3])) == 3
    assert got[3] is None                     # catalogue used up: the house look, never a repeat
    assert "Motion style" in W.motion_block("b") and "Motion style" not in W.motion_block(None)


def test_a_style_asked_for_by_name_may_repeat(tmp_path, monkeypatch):
    cat = tmp_path / "motion.yaml"
    cat.write_text(yaml.safe_dump({"styles": [{"id": "a", "style": "Particle swarm", "title": "a", "tags": [], "url": "u", "prompt": "p"},
                                              {"id": "b", "style": "Blueprint UI", "title": "b", "tags": [], "url": "u", "prompt": "p"}]}))
    monkeypatch.setattr(W, "MOTION", cat)
    monkeypatch.setattr(C, "CLIENTS", tmp_path)
    (tmp_path / "demo" / "posts" / "old").mkdir(parents=True)
    (tmp_path / "demo" / "grants.yaml").write_text("ig_user_id: \"1\"\n")
    (tmp_path / "demo" / "posts" / "old" / "meta.json").write_text(json.dumps({"motion": "a"}))
    items = [{"motion": "a"}]
    W.pick_motion("demo", items, "2026-W45", "more like the particle swarm one")
    assert items[0]["motion"] == "a"
