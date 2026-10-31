"""The operator's notes teach the pipeline (spine/lessons.py) and the Claude HTML engine (engine "html")."""

import json
import subprocess
from pathlib import Path

import pytest
import yaml

from spine import clients as C
from spine import lessons as L
from spine import revise as R
from spine import week as W
from spine.db import DB

ROOT = Path(__file__).resolve().parent.parent


def _post(d, slot, motion, state, notes=()):
    sd = d / "posts" / slot
    sd.mkdir(parents=True)
    (sd / "meta.json").write_text(json.dumps({"motion": motion, "film": {"engine": "remotion"}}))
    if notes:
        (sd / "revise.json").write_text(json.dumps({"rounds": [{"notes": n, "at": "x"} for n in notes]}))
    db = DB.for_client(d)
    db.create_post(slot, "demo")
    for st in {"NEEDS_APPROVAL": ["BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL"],
               "APPROVED": ["BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL", "APPROVED"]}[state]:
        db.set_state(slot, st)
    db.close()


@pytest.fixture
def demo(tmp_path, monkeypatch):
    monkeypatch.setattr(C, "CLIENTS", tmp_path)
    d = tmp_path / "demo"
    (d / "posts").mkdir(parents=True)
    (d / "grants.yaml").write_text("ig_user_id: \"1\"\n")
    _post(d, "p1", "good", "APPROVED")
    _post(d, "p2", "meh", "NEEDS_APPROVAL", ["The app needs to be MUCH bigger."])
    _post(d, "p3", "bad", "NEEDS_APPROVAL", ["Really dislike the grid look.\nRedo the entire video. New script"])
    _post(d, "p4", "new", "NEEDS_APPROVAL")
    return d


def test_notes_score_the_styles(demo):
    assert L.style_scores("demo") == {"good": "passed", "meh": "fixed", "bad": "rejected"}   # p4 undecided
    block = L.notes_block("demo")
    assert "MUCH bigger" in block and "grid look. Redo" in block                                # verbatim, one line each


def test_a_rejected_style_is_never_picked_and_a_passed_one_may_repeat(demo, monkeypatch, tmp_path):
    cat = tmp_path / "motion.yaml"
    cat.write_text(yaml.safe_dump({"styles": [{"id": k, "title": k, "tags": [], "url": "u", "prompt": "p"}
                                              for k in ("good", "meh", "bad", "new", "x")]}))
    monkeypatch.setattr(W, "MOTION", cat)
    items = [{"motion": "bad"}, {"motion": "good"}, {"motion": "zzz"}]
    W.pick_motion("demo", items, "2026-W45")
    got = [it["motion"] for it in items]
    assert got == ["x", "good", None]   # bad: rejected, replaced; good: used recently but it passed


def test_mix_alternates_engines_and_html_has_no_motion_style(demo):
    W._status("demo", "2026-W45", engine="mix", instructions="")
    db = DB.for_client(demo)
    try:
        for i in (1, 2):
            W.write_item("demo", db, f"2026-w45-0{i}", {"title": "t", "brief": "b", "hook": "h", "caption": "c",
                                                       "motion": "good", "at": "2026-11-02T06:30:00+00:00"}, i, "2026-W45")
    finally:
        db.close()
    m1 = json.loads((demo / "posts" / "2026-w45-01" / "meta.json").read_text())
    m2 = json.loads((demo / "posts" / "2026-w45-02" / "meta.json").read_text())
    assert m1["film"]["engine"] == "html" and m1["film"]["dir"] == "clients/demo/posts/2026-w45-01/film" and m1["motion"] is None
    assert m2["film"]["engine"] == "remotion" and m2["motion"] == "good"


def test_the_next_batch_starts_on_the_last_engine(demo):
    W._status("demo", "2026-W45", engine="html", started_at="2026-10-31T00:00:00+00:00")
    assert W.last_engine("demo") == "html"


def test_revise_renders_an_html_film_with_the_venv_python(demo, monkeypatch):
    sd = demo / "posts" / "p1"
    meta = {"film": {"engine": "html", "dir": "clients/demo/posts/p1/film", "source": "clients/demo/posts/p1/film/index.html"}}
    (sd / "meta.json").write_text(json.dumps(meta))
    cmds = []
    monkeypatch.setattr(R, "_run", lambda cmd, cwd=None: cmds.append(cmd))
    monkeypatch.setattr(R, "_duration", lambda p: 1.0)
    with pytest.raises(Exception):   # no real files come out of the fake: stop after the render calls
        R.render("demo", "p1")
    assert cmds[0][:3] == [R.VENV_PY, "-m", "spine.render"] and cmds[0][-2:] == ["--variant", "reel"]
    assert "clients/demo/posts/p1/film/" in R._engine_intro(meta["film"], sd)   # the edit works on the page
    assert "spine.render clients/demo/posts/p1/film --still" in R._check_intro(meta["film"], sd)


FILM = """<!doctype html><meta charset=utf-8><body style="margin:0;background:#000">
<div id=b style="position:absolute;width:200px;height:200px;background:#2bd"></div>
<script>window.__film={seek(t){document.getElementById('b').style.left=(t*800)+'px';}};</script>"""


@pytest.mark.skipif(not (ROOT / ".venv" / "bin" / "python").exists(), reason="Playwright lives in .venv")
def test_an_html_film_renders_a_still_and_a_video(tmp_path):
    f = tmp_path / "film"
    f.mkdir()
    (f / "index.html").write_text(FILM)
    (f / "film.json").write_text(json.dumps({"duration": 0.5, "width": 320, "height": 568}))
    py = str(ROOT / ".venv" / "bin" / "python")
    r = subprocess.run([py, "-m", "spine.render", str(f), "--still", "0.25", str(tmp_path / "s.png")], cwd=ROOT, capture_output=True, text=True)
    assert r.returncode == 0 and (tmp_path / "s.png").stat().st_size > 0, r.stderr
    r = subprocess.run([py, "-m", "spine.render", str(f), str(tmp_path / "v.mp4"), "--fps", "20"], cwd=ROOT, capture_output=True, text=True)
    assert r.returncode == 0 and (tmp_path / "v.mp4").stat().st_size > 0, r.stderr


@pytest.mark.skipif(not (ROOT / ".venv" / "bin" / "python").exists(), reason="Playwright lives in .venv")
def test_an_html_film_gets_its_other_formats(demo, monkeypatch):
    from spine import formats as F
    sd = demo / "posts" / "p1"
    f = sd / "film"
    f.mkdir()
    (f / "index.html").write_text(FILM)
    (f / "film.json").write_text(json.dumps({"duration": 0.3, "width": 1080, "height": 1920}))
    py = str(ROOT / ".venv" / "bin" / "python")
    subprocess.run([py, "-m", "spine.render", str(f), str(sd / "video.mp4"), "--fps", "20"], cwd=ROOT, check=True, capture_output=True)
    (f / "index-16x9.html").write_text(FILM)   # the layout Claude would write (newer than index.html)
    monkeypatch.setattr(F, "ROOT", demo.parent)   # film["dir"] is relative to the repo root
    film = {"engine": "html", "dir": "demo/posts/p1/film", "source": "demo/posts/p1/film/index.html"}
    (sd / "meta.json").write_text(json.dumps({"film": film}))
    calls = []
    real = F._run
    monkeypatch.setattr(F, "_run", lambda cmd, cwd, timeout=None: calls.append(cmd[0]) or real(cmd, ROOT if cmd[0] == py or cmd[1:3] == ["-m", "spine.render"] else cwd, timeout))
    out = F._make_one("demo", "p1", "16x9")
    assert "claude" not in calls and out.exists()   # an up-to-date layout is reused
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v", "-show_entries", "stream=width,height", "-of", "csv=p=0", str(out)],
                       capture_output=True, text=True)
    assert r.stdout.strip() == "1920,1080"


def test_explicit_redo_rejects_a_style_but_a_plain_note_does_not(demo):
    _post(demo, "p5", "lighter", "NEEDS_APPROVAL", ["Make the entire video lighter."])
    assert L.style_scores("demo")["lighter"] == "fixed"


def test_an_html_edit_that_only_adds_an_asset_is_a_change(demo):
    sd = demo / "posts" / "p1"
    film = {"engine": "html", "dir": "film", "source": "film/index.html"}
    import spine.revise as RV
    RV_ROOT = RV.ROOT
    try:
        RV.ROOT = demo / "posts" / "p1"
        (sd / "film").mkdir()
        (sd / "film" / "index.html").write_text("x")
        before = RV._snapshot(sd, film)
        (sd / "film" / "charts-americas.png").write_bytes(b"png")
        assert RV._snapshot(sd, film) != before
    finally:
        RV.ROOT = RV_ROOT


def test_film_prompts_offer_a_fresh_capture():
    assert "--shot <name> <path>" in R.capture_hint("rosa") and "spine.capture" in R.ALLOWED and "spine.capture" in W.ALLOWED_FILM
