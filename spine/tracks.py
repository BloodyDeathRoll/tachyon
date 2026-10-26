"""Music for a video: pick a track, remux it in (dashboard: the track picker on a video's page).

    .venv/bin/python -m spine.tracks list <client>
    .venv/bin/python -m spine.tracks set <client> <slot> <track_id>
    .venv/bin/python -m spine.tracks catalog <client>     # (re)measure loudness + start points

Library: clients/<c>/assets/music/tracks.yaml (id, title, artist, mood, source, file, start,
lufs, licence, page). "file" tracks are baked into the MP4. "instagram" tracks come from the
Instagram Audio API (Sound Collection) and are attached at publish via audio_configuration;
the MP4 then carries only the voice-over (or silence).

Mix (apply): video stream copied untouched, music from the track's start point, levelled to
MUSIC_LUFS, ducked DUCK_DB under the voice-over while it speaks, 1.2 s fade out at the end.
The voice-over (posts/<slot>/vo.wav, already -16 LUFS) sits on top. Runs in a few seconds.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import yaml

from . import clients as C

ROOT = Path(__file__).resolve().parent.parent
MUSIC_LUFS = -14.0     # music alone (Instagram normalises to about -14)
DUCK_DB = 12.0         # music under the voice-over
FADE = 1.2
VIDEOS = ("video.mp4", "video-story.mp4")


def _lib_path(client: str) -> Path:
    return C.client_dir(client) / "assets" / "music" / "tracks.yaml"


def _library(client: str) -> list[dict]:
    p = _lib_path(client)
    return (yaml.safe_load(p.read_text()) or {}).get("tracks", []) if p.exists() else []


def _rel(p: Path) -> str:
    return str(p.resolve().relative_to(ROOT))


def _file_tracks(client: str) -> list[dict]:
    d = C.client_dir(client) / "assets" / "music"
    out = []
    for t in _library(client):
        if t.get("source", "file") != "file":
            continue
        path = _rel(d / t["file"]) if t.get("file") else None
        out.append({"id": t["id"], "title": t["title"], "artist": t.get("artist"), "mood": t.get("mood"),
                    "source": "file", "path": path, "cover": None, "duration": t.get("duration"),
                    "preview": path if path and path.endswith(".mp3") else t.get("preview")})
    return out


# ── Instagram Audio API (Sound Collection, Facebook Login) ────────────────────
# GET /ig_audio?audio_type=music&user_id=<ig-user-id>[&search_query=…]  (no query = trending)
# fields: audio_id, title, display_artist, duration_in_ms, cover_artwork_thumbnail_uri,
#         on_platform_audio_preview_link, download_url. Attach at publish with
# audio_configuration {audio_id, audio_volume 1-100, video_volume 1-100}.
IG_TTL = 6 * 3600
IG_PREFIX = "ig:"


def _ig_cache_path(client: str) -> Path:
    return C.client_dir(client) / "assets" / "music" / "ig_cache.json"


def _ig_cache(client: str) -> dict:
    p = _ig_cache_path(client)
    try:
        return json.loads(p.read_text()) if p.exists() else {}
    except json.JSONDecodeError:
        return {}


def _ig_save(client: str, cache: dict) -> None:
    p = _ig_cache_path(client)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(cache, indent=1, ensure_ascii=False))


def last_error(client: str) -> str | None:
    return _ig_cache(client).get("_error")


def _ig_parse(rows: list[dict]) -> list[dict]:
    out = []
    for r in rows:
        aid = str(r.get("audio_id") or r.get("id") or "")
        if not aid:
            continue
        ms = r.get("duration_in_ms")
        out.append({"id": IG_PREFIX + aid, "audio_id": aid, "title": r.get("title") or "Untitled",
                    "artist": r.get("display_artist") or r.get("ig_username"), "mood": None, "source": "instagram",
                    "path": None, "cover": r.get("cover_artwork_thumbnail_uri") or r.get("profile_picture_url"),
                    "duration": round(ms / 1000, 1) if ms else None,
                    "preview": r.get("download_url") or None,
                    "link": r.get("on_platform_audio_preview_link")})
    return out


def _ig_fetch(client: str, query: str | None, graph=None) -> list[dict]:
    from .publisher.graph import Graph
    g = graph or Graph(C.token(client))
    params = {"audio_type": "music", "user_id": C.load_grants(client)["ig_user_id"]}
    if query:
        params["search_query"] = query
    res = g.get("ig_audio", **params)
    rows = (res.get("audio") or res.get("data")) if isinstance(res, dict) else res   # API returns {"audio": [...]}
    return _ig_parse(rows or [])


def ig_tracks(client: str, query: str | None = None, graph=None, now: float | None = None) -> list[dict]:
    """Trending (no query) or search results, cached IG_TTL. Fails soft: [] + last_error()."""
    import time
    now = now or time.time()
    key = (query or "").strip().lower() or "trending:"
    cache = _ig_cache(client)
    hit = cache.get(key)
    if hit and now - hit["at"] < IG_TTL:
        return hit["tracks"]
    try:
        tracks = _ig_fetch(client, query, graph)
    except Exception as e:   # broken token, no network, API change: the picker shows the reason
        cache["_error"] = str(e)[:300]
        _ig_save(client, cache)
        return hit["tracks"] if hit else []
    cache[key] = {"at": now, "tracks": tracks}
    cache.pop("_error", None)
    _ig_save(client, cache)
    return tracks


def _ig_known(client: str) -> dict[str, dict]:
    """Every Instagram track seen in any cached list, by id (for set_track after a search)."""
    seen = {}
    for k, v in _ig_cache(client).items():
        if not k.startswith("_"):
            for t in v.get("tracks", []):
                seen[t["id"]] = t
    return seen


def list_tracks(client: str, source: str | None = None, query: str | None = None, graph=None) -> list[dict]:
    """Picker contents. source "file" = our downloaded library, "instagram" = Sound Collection
    via the Audio API, None = both (Instagram only from cache, never a network call)."""
    if source == "file":
        return _file_tracks(client)
    if source == "instagram":
        return ig_tracks(client, query, graph)
    return _file_tracks(client) + list(_ig_known(client).values())


def _meta(client: str, slot: str) -> tuple[Path, dict]:
    p = C.client_dir(client) / "posts" / slot / "meta.json"
    return p, json.loads(p.read_text())


def current_track(client: str, slot: str) -> str | None:
    _, m = _meta(client, slot)
    if m.get("track"):
        return m["track"]
    music = (m.get("film") or {}).get("music") or ""
    for t in _library(client):   # films rendered before the picker: infer from the baked file
        if t.get("file") and music.endswith(t["file"]):
            return t["id"]
    return None


def _duration(p: Path) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                       capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


def _mux(video: Path, track: dict | None, vo: Path | None, vo_start: float, music_dir: Path) -> None:
    dur = _duration(video)
    tmp = video.with_suffix(".mix.mp4")
    cmd = ["ffmpeg", "-v", "error", "-y", "-i", str(video)]
    chains, mixin = [], []
    idx = 1
    if track:
        gain = MUSIC_LUFS - float(track.get("lufs", MUSIC_LUFS))
        cmd += ["-ss", f"{float(track.get('start', 0)):.2f}", "-i", str(music_dir / track["file"])]
        vol = f"volume={gain:.2f}dB"
        if vo:
            vo_len = _duration(vo)
            a, b = vo_start - 0.15, vo_start + vo_len + 0.25
            vol += f",volume=enable='between(t,{a:.2f},{b:.2f})':volume=-{DUCK_DB}dB"
        chains.append(f"[{idx}:a]aresample=48000,aformat=channel_layouts=stereo,{vol},atrim=0:{dur:.3f}[m]")
        mixin.append("[m]")
        idx += 1
    if vo:
        cmd += ["-i", str(vo)]
        ms = int(vo_start * 1000)
        chains.append(f"[{idx}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={ms}|{ms}[v]")
        mixin.append("[v]")
        idx += 1
    if not mixin:   # silent video (instagram track, no voice): Instagram adds the audio
        cmd += ["-f", "lavfi", "-t", f"{dur:.3f}", "-i", "anullsrc=r=48000:cl=stereo"]
        chains.append(f"[{idx}:a]anull[m]")
        mixin.append("[m]")
    mix = (f"{''.join(mixin)}amix=inputs={len(mixin)}:duration=first:normalize=0" if len(mixin) > 1 else f"{mixin[0]}anull")
    chains.append(f"{mix},afade=t=out:st={max(0, dur - FADE):.2f}:d={FADE},alimiter=limit=0.95,apad,atrim=0:{dur:.3f}[a]")
    cmd += ["-filter_complex", ";".join(chains), "-map", "0:v", "-map", "[a]", "-c:v", "copy",
            "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-t", f"{dur:.3f}",
            "-map_metadata", "-1", "-movflags", "+faststart", str(tmp)]
    subprocess.run(cmd, check=True)
    tmp.replace(video)


def apply(client: str, slot: str) -> None:
    """Re-mix both videos from the slot's current track and voice-over."""
    p, m = _meta(client, slot)
    sd = p.parent
    music_dir = C.client_dir(client) / "assets" / "music"
    tid = current_track(client, slot)
    track = next((t for t in _library(client) if t["id"] == tid), None)
    if track and track.get("source", "file") != "file":
        track = None
    vo_meta = m.get("voiceover") or {}
    vo = sd / vo_meta["file"] if vo_meta.get("file") and (sd / vo_meta["file"]).exists() else None
    for f in VIDEOS:
        if (sd / f).exists():
            _mux(sd / f, track, vo, float(vo_meta.get("start", 0.5)), music_dir)


def set_track(client: str, slot: str, track_id: str) -> None:
    track = next((t for t in _library(client) if t["id"] == track_id), None) or _ig_known(client).get(track_id)
    if not track:
        raise KeyError(f"no track {track_id}")
    p, m = _meta(client, slot)
    m["track"] = track_id
    if track.get("source", "file") == "instagram":
        # Meta: volumes are integers 1-100. With a voice-over the music sits under it.
        m["audio_configuration"] = {"audio_id": track["audio_id"], "audio_volume": 30 if m.get("voiceover") else 100,
                                    "video_volume": 100 if m.get("voiceover") else 1}
        m["track_info"] = {k: track.get(k) for k in ("title", "artist", "cover", "duration", "link")}
    else:
        m.pop("audio_configuration", None)
        m.setdefault("film", {})["music"] = _rel(C.client_dir(client) / "assets" / "music" / track["file"])
    m["audio_type"] = f"{track['title']} ({track.get('artist')}), {track.get('source', 'file')}"
    p.write_text(json.dumps(m, indent=2, ensure_ascii=False) + "\n")
    apply(client, slot)


# ── catalog: loudness + where the track gets going ────────────────────────────
def _measure(f: Path) -> tuple[float, float]:
    import numpy as np
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", str(f), "-ac", "1", "-ar", "8000", "-f", "s16le", "-"],
                       capture_output=True, check=True)
    x = np.frombuffer(r.stdout, dtype=np.int16).astype(np.float32) / 32768
    sec = x[: len(x) // 4000 * 4000].reshape(-1, 4000)          # half-second blocks
    db = 20 * np.log10(np.sqrt((sec ** 2).mean(axis=1)) + 1e-9)
    body = np.median(db[: min(len(db), 120)])
    start = next((i for i, v in enumerate(db) if v > body - 3), 0) * 0.5
    r = subprocess.run(["ffmpeg", "-hide_banner", "-ss", f"{start}", "-t", "20", "-i", str(f), "-af",
                        "loudnorm=print_format=json", "-f", "null", "-"], capture_output=True, text=True)
    e = r.stderr; j = json.loads(e[e.rindex("{"):e.rindex("}") + 1])
    return round(start, 1), round(float(j["input_i"]), 1)


def catalog(client: str) -> None:
    p = _lib_path(client)
    data = yaml.safe_load(p.read_text())
    d = p.parent
    for t in data["tracks"]:
        if t.get("file") and t.get("source", "file") == "file":
            t["start"], t["lufs"] = _measure(d / t["file"])
            print(f"{t['id']:28} start {t['start']:5.1f} s  {t['lufs']:6.1f} LUFS")
    p.write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True))


def main(argv: list[str]) -> int:
    if argv[:1] == ["list"] and len(argv) == 2:
        for t in list_tracks(argv[1]):
            print(f"{t['id']:28} {t['source']:9} {t['title']} · {t['artist']} · {t['mood']}")
        return 0
    if argv[:1] == ["set"] and len(argv) == 4:
        set_track(*argv[1:]); return 0
    if argv[:1] == ["catalog"] and len(argv) == 2:
        catalog(argv[1]); return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
