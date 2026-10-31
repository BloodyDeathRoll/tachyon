"""Claude | Remotion | Templates | Random, everywhere a video is generated; Generate New on a video."""

import json

from spine import manual as M
from spine import week as W
from spine.db import DB

from .test_dashboard import FUTURE, client_dir, req, server  # noqa: F401  (fixtures)


def test_every_generate_box_offers_the_engines_with_claude_first(server, client_dir):  # noqa: F811
    for path in ("/demo", "/demo/calendar?w=2099-W02", "/demo/v/w01-s1"):
        _, body, _ = req(server, "GET", path)
        for k in ("html", "remotion", "templates", "random"):
            assert f"name=engine value={k}" in body, (path, k)
        assert "name=engine value=html checked" in body, path


def test_an_empty_prompt_is_fine_and_the_engine_is_kept(server, client_dir, monkeypatch):  # noqa: F811
    monkeypatch.setattr(M.subprocess, "Popen", lambda *a, **k: None)
    status, _, loc = req(server, "POST", "/demo/new", {"at": FUTURE, "prompt": "", "engine": "templates"})
    assert status == 303
    slot = loc.rsplit("/", 1)[1]
    assert json.loads((client_dir / "posts" / slot / "meta.json").read_text())["engine_choice"] == "templates"


def test_random_picks_one_of_the_three_and_templates_alone_keeps_the_style(client_dir):  # noqa: F811
    got = {W._engine_for("demo", "2026-W45", i, f"s{i}", "random") for i in range(30)}
    assert got == {"html", "remotion", "templates"}
    db = DB.for_client(client_dir)
    try:
        for i, e in enumerate(("remotion", "templates"), 1):
            W.write_item("demo", db, f"x{i}", {"title": "t", "brief": "b", "hook": "h", "caption": "c", "motion": "m",
                                               "at": FUTURE}, i, "manual", engine=e)
    finally:
        db.close()
    assert json.loads((client_dir / "posts" / "x1" / "meta.json").read_text())["motion"] is None
    assert json.loads((client_dir / "posts" / "x2" / "meta.json").read_text())["motion"] == "m"


def test_generate_new_keeps_the_old_cut_and_starts_over(server, client_dir, monkeypatch):  # noqa: F811
    sd = client_dir / "posts" / "w01-s1"
    (sd / "video.mp4").write_bytes(b"old")
    (sd / "brief.md").write_text("old brief")
    (sd / "revise.json").write_text(json.dumps({"rounds": [{"notes": "Redo it. New script", "at": "x"}]}))
    started = []
    monkeypatch.setattr(M, "start", lambda c, s: started.append(s))
    status, _, _ = req(server, "POST", "/demo/v/w01-s1/decide", {"action": "generate", "prompt": "", "engine": "random"})
    assert status == 303 and started == ["w01-s1"]
    v1 = sd / "versions" / "v1"
    assert (v1 / "video.mp4").read_bytes() == b"old" and (v1 / "brief.md").exists() and (v1 / "revise.json").exists()
    assert not (sd / "brief.md").exists() and not (sd / "revise.json").exists()   # a new plan, a fresh notes history
    assert not (sd / "video.mp4").exists()   # the next render must not file the old cut a second time
    meta = json.loads((sd / "meta.json").read_text())
    assert meta["engine_choice"] == "random" and "film" not in meta
    db = DB.for_client(client_dir)
    assert db.post("w01-s1")["state"] == "SCRIPTED"
    db.close()
    from spine import lessons as L
    assert any("Redo it" in h["notes"][0] for h in L.history("demo") if h["notes"])   # the old notes still teach
