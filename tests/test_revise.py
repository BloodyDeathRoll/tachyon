

def test_film_outside_films_dir_is_never_registered_or_deleted(tmp_path, monkeypatch):
    from spine import revise as R, week as W
    films = tmp_path / "engines" / "remotion" / "src" / "films"
    films.mkdir(parents=True)
    (films / "index.ts").write_text("// @imports\n")
    src = films.parent / "Showreel.tsx"
    src.write_text("export const Showreel = 1;\n")
    monkeypatch.setattr(R, "ROOT", tmp_path)
    monkeypatch.setattr(W, "FILMS", films)
    monkeypatch.setattr(R, "_typecheck", lambda: (False, "boom"))
    R._register_if_new({"source": "engines/remotion/src/Showreel.tsx", "reel": "Showreel"})
    assert src.exists() and (films / "index.ts").read_text() == "// @imports\n"
