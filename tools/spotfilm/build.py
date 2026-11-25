"""Build one Rosa map film (a single surf spot on a satellite picture) from its spec.

    python tools/spotfilm/build.py <spec.yaml> <film_dir> [--date YYYY-MM-DD] [--vo vo.wav] [--vo-start 0.5]

Writes <film_dir>/index.html (tools/spotfilm/film.html), spec.js, film.json, the two satellite
pictures, the font and the logo: the "html" film engine of spine/render.py.

Two kinds of film, `type` in the spec:
  forecast  the spot's next 7 days from --date (the day the video goes out), read live from Rosa's
            own forecast: the best day, its swell, its wind, the week. No voice.
            Build it again close to the publish day: the forecast moves.
  explain   the spot explained, beat by beat as written in the spec (`beats`, each with a `say`
            line). With --vo the beats are cut to the words of the recorded voice-over.

Satellite pictures are fetched once per spot (tools/spotfilm/sat.py, needs rasterio; SPOTFILM_SAT_PY
names the Python that has it) and kept in the film folder.
"""

from __future__ import annotations

import argparse
import gzip
import json
import math
import os
import re
import shutil
import subprocess
import sys
import urllib.request
from datetime import date, timedelta
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
DATA = "https://rosa-data-opal.vercel.app/data/spots/{id}.json"
WORD = {"FLAT": "Flat", "POOR": "Poor", "FAIR": "Fair", "GOOD": "Good", "FIRING": "Epic"}   # rosa web/src/conditions.ts
WIND_COL = {"offshore": "#24b161", "cross-shore": "#e48022", "onshore": "#d0574a"}
WIND_WORD = {"offshore": "offshore", "cross-shore": "cross-shore", "onshore": "onshore"}
POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
NAMES = {"N": "North", "NNE": "North-northeast", "NE": "Northeast", "ENE": "East-northeast", "E": "East",
         "ESE": "East-southeast", "SE": "Southeast", "SSE": "South-southeast", "S": "South",
         "SSW": "South-southwest", "SW": "Southwest", "WSW": "West-southwest", "W": "West",
         "WNW": "West-northwest", "NW": "Northwest", "NNW": "North-northwest"}
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
END = {"line": "Your spot.<br>The next 16 days.", "button": "Free at rosa.surf"}
WPS = 2.7            # spoken words a second, for a film cut before its voice-over exists
END_S = 3.6          # the closing card


def compass(deg: float) -> str:
    return POINTS[int((deg % 360) / 22.5 + 0.5) % 16]


def height(m: float, units: str) -> str:
    return f"{round(m * 3.28084)}" if units == "ft" else f"{m:.1f}"


def span(lo: float, hi: float, units: str) -> str:
    a, b = height(lo, units), height(hi, units)
    return f"{a} {units}" if a == b else f"{a}-{b} {units}"


def fetch_forecast(spot_id: str) -> dict:
    req = urllib.request.Request(DATA.format(id=spot_id), headers={"Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read()
        return json.loads(gzip.decompress(raw) if r.headers.get("Content-Encoding") == "gzip" else raw)


def week(payload: dict, start: str) -> list[dict]:
    """The 7 forecast days from `start` (the spot's own calendar days)."""
    days = [d for d in payload["days"] if d["date"] >= start][:7]
    if len(days) < 7:
        raise ValueError(f"the forecast has {len(days)} days from {start}, a week needs 7")
    return days


def best_hour(payload: dict, day: str) -> dict:
    """The best-rated daylight hour of a day (the hour a surfer would paddle out)."""
    hours = [h for h in payload["hours"] if h["t"][:10] == day and 6 <= int(h["t"][11:13]) <= 18]
    return max(hours, key=lambda h: (h["rating"], h["h_mid"]))


def forecast_beats(spec: dict, payload: dict, start: str) -> list[dict]:
    u = spec.get("units", "m")
    days = week(payload, start)
    best = max(days, key=lambda d: (d["rating_max"], d["h_max"][1]))
    hr = best_hour(payload, best["date"])
    sw = max([s for s in hr["swells"] if s.get("in_window", True)] or hr["swells"], key=lambda s: s["h"] * s["period"])
    wd, cls = hr["wind"], hr["wind"]["class"]
    dn = lambda d: DAYS[date.fromisoformat(d).weekday()]
    d0, d6 = date.fromisoformat(days[0]["date"]), date.fromisoformat(days[6]["date"])
    when = f"{d0.day} {d0:%b} to {d6.day} {d6:%b}"
    name, title = spec["name"], [f"{spec['name']},", "<em>next 7 days</em>"]
    cams = spec.get("cams") or {}
    cam = lambda k, d: {**d, **(cams.get(k) or {})}
    far = spec.get("far_km", 70)
    beats = [
        {"len": 2.6, "cam": cam("open", {"km": far * .62, "tilt": 20, "rot": -8, "orbit": 3}), "kicker": spec["place"], "title": title},
        {"len": 3.8, "cam": cam("spot", {"km": 5.5, "tilt": 52, "rot": 22}), "kicker": spec["place"], "title": title,
         "pins": [{"at": spec["at"], "name": name, "tag": when}]},
        {"len": 4.4, "cam": cam("swell", {"km": 8, "tilt": 47, "rot": -18}), "kicker": f"{dn(best['date'])}'s swell",
         "title": [f"{NAMES[compass(sw['dir'])]},", f"<em>{round(sw['period'])} seconds</em>"],
         "swell": {"dir": sw["dir"], "period": sw["period"]},
         "card": {"chips": [{"v": span(hr["h"][0], hr["h"][1], u), "k": "waves"}, {"v": f"{round(sw['period'])} s", "k": "period"},
                            {"v": compass(sw["dir"]), "k": "swell from"}]}},
        {"len": 4.2, "cam": cam("wind", {"km": 6.2, "tilt": 50, "rot": 12}), "kicker": f"{dn(best['date'])}'s wind",
         "title": [f"{NAMES[compass(wd['dir'])]},", f"<em style='color:{WIND_COL[cls]}'>{WIND_WORD[cls]}</em>"],
         "wind": {"dir": wd["dir"], "kph": wd["kph"], "cls": cls},
         "card": {"chips": [{"v": f"{round(wd['kph'])}", "k": "km/h"}, {"v": compass(wd["dir"]), "k": "wind from"},
                            {"v": WIND_WORD[cls].split("-")[0].capitalize(), "k": "shore" if cls != "offshore" else "clean", "col": WIND_COL[cls]}]}},
        {"len": 4.8, "cam": cam("week", {"km": 10, "tilt": 40, "rot": -6}), "kicker": when, "title": ["Best day:", f"<em>{dn(best['date'])}</em>"],
         "card": {"title": name, "pill": {"bucket": best["bucket"], "text": WORD[best["bucket"]]},
                  "week": [{"name": dn(d["date"])[:3], "h": height(d["h_max"][1], u), "rating": d["rating_max"], "bucket": d["bucket"],
                            "best": d is best} for d in days]},
         "sub": f"Wave height, {'feet' if u == 'ft' else 'metres'}"},
    ]
    return beats


def vo_words(wav: Path) -> list[tuple[str, float]]:
    """Every word of the recorded voice-over with the second it starts (tools/spotfilm/align.py)."""
    py = os.environ.get("SPOTFILM_WHISPER_PY") or str(Path.home() / ".cache" / "tachyon-tts" / "venv" / "bin" / "python")
    r = subprocess.run([py, str(HERE / "align.py"), str(wav)], capture_output=True, text=True, check=True)
    return [tuple(x) for x in json.loads(r.stdout)]


def say_starts(says: list[str], heard: list[tuple[str, float]]) -> list[float]:
    """When each `say` line starts in the take: the script's word count mapped onto the heard words
    (the take was checked word for word, so the counts match but for a contraction or two)."""
    counts = [len(s.split()) for s in says]
    total, out, at = sum(counts), [], 0
    for c in counts:
        out.append(heard[min(len(heard) - 1, round(at * len(heard) / total))][1])
        at += c
    return out


def point(spec: dict, p) -> list[float]:
    """A place in a spec: [lat, lon], or {km: [east, north]} from the spot (read off the satellite picture)."""
    if isinstance(p, dict):
        e, n = p["km"]
        lat, lon = spec["at"]
        return [lat + n / 110.54, lon + e / (111.32 * math.cos(math.radians(lat)))]
    return p


def explain_beats(spec: dict, vo: Path | None, vo_start: float) -> list[dict]:
    beats = [json.loads(json.dumps(b)) for b in spec["beats"]]
    for b in beats:
        if "at" in b["cam"]:
            b["cam"]["at"] = point(spec, b["cam"]["at"])
        if b.get("ride"):
            b["ride"] |= {"a": point(spec, b["ride"]["a"]), "b": point(spec, b["ride"]["b"])}
        for p in b.get("pins") or []:
            p["at"] = point(spec, p.get("at", spec["at"]))
    says = [b.get("say", "") for b in beats]
    if vo:
        heard = vo_words(vo)
        starts = [vo_start + s for s in say_starts(says, heard)]
        dur = float(subprocess.run(["ffprobe", "-v", "0", "-show_entries", "format=duration", "-of", "csv=p=0", str(vo)],
                                   capture_output=True, text=True, check=True).stdout)
        ends = starts[1:] + [vo_start + dur + 0.5]
        starts[0] = 0.0
    else:
        starts, t = [], 0.0
        for s in says:
            starts.append(t)
            t += max(2.4, len(s.split()) / WPS + 0.35)
        ends = starts[1:] + [t]
    for b, a, z in zip(beats, starts, ends):
        b["len"] = z - a
        b.setdefault("sub", b.pop("say", None))
        b.pop("say", None)
    return beats


def timeline(beats: list[dict], end: dict) -> dict:
    t = 0.0
    for b in beats:
        b["t0"], b["t1"] = round(t, 3), round(t + b.pop("len"), 3)
        t = b["t1"]
    last = beats[-1]["cam"]
    beats.append({"t0": t, "t1": round(t + END_S, 3), "cam": {**last, "km": last["km"] * 1.5, "tilt": 34}})
    return {"dur": round(t + END_S, 2), "beats": beats, "end": {"t": round(t + 0.4, 3), **end}}


def imagery(spec: dict, film_dir: Path) -> dict:
    """near.jpg / near-sea.png / far.jpg in the film folder; fetched only when missing."""
    lat, lon = spec["at"]
    out = {}
    for name, km in (("near", spec.get("near_km", 12)), ("far", spec.get("far_km", 70))):
        meta = film_dir / f"{name}.json"
        if not meta.exists() or json.loads(meta.read_text())["width_km"] != km:
            py = os.environ.get("SPOTFILM_SAT_PY") or sys.executable
            subprocess.run([py, str(HERE / "sat.py"), str(lat), str(lon), str(km), str(film_dir / name)], check=True, capture_output=True)
        out[name] = json.loads(meta.read_text())
    (film_dir / "far-sea.png").unlink(missing_ok=True)
    return out


def build(spec_path: Path, film_dir: Path, start: str | None = None, vo: Path | None = None, vo_start: float = 0.5) -> dict:
    spec = yaml.safe_load(spec_path.read_text())
    film_dir.mkdir(parents=True, exist_ok=True)
    payload = fetch_forecast(spec["spot"])
    spec.setdefault("at", [payload["spot"]["lat"], payload["spot"]["lon"]])
    im = imagery(spec, film_dir)
    if spec["type"] == "forecast":
        beats = forecast_beats(spec, payload, start or (date.today() + timedelta(days=1)).isoformat())
    else:
        beats = explain_beats(spec, vo, vo_start)
    film = timeline(beats, {**END, **(spec.get("end") or {})})
    lat, lon = spec["at"]
    film |= {"spot": {"lat": lat, "lon": lon, "name": spec["name"]},
             "near": {"src": "near.jpg", "sea": "near-sea.png", "km": im["near"]["width_km"], "lat": lat, "lon": lon, "m_per_px": im["near"]["m_per_px"]},
             "far": {"src": "far.jpg", "km": im["far"]["width_km"], "lat": lat, "lon": lon}}
    (film_dir / "spec.js").write_text("window.SPEC = " + json.dumps(film, indent=1, ensure_ascii=False) + ";\n")
    (film_dir / "film.json").write_text(json.dumps({"duration": film["dur"], "width": 1080, "height": 1920}) + "\n")
    shutil.copy2(HERE / "film.html", film_dir / "index.html")
    for f in ("inter-latin-wght-normal.woff2", "rosa-icon.svg"):
        src = HERE.parent.parent / "engines" / "remotion" / "public" / "fonts" / f
        if not (film_dir / f).exists():
            shutil.copy2(src, film_dir / f)
    return {"duration": film["dur"], "generated_at": payload.get("generated_at"), "notice": im["near"]["notice"],
            "text": re.sub(r"<[^>]+>", " ", json.dumps([[b.get("kicker"), b.get("title"), b.get("sub")] for b in beats], ensure_ascii=False))}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("spec", type=Path)
    ap.add_argument("film_dir", type=Path)
    ap.add_argument("--date")
    ap.add_argument("--vo", type=Path)
    ap.add_argument("--vo-start", type=float, default=0.5)
    a = ap.parse_args()
    print(json.dumps(build(a.spec, a.film_dir, a.date, a.vo, a.vo_start), indent=1, ensure_ascii=False))
