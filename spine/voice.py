"""Voice-over: an avid surfer who uses the app, first person (clients/<c>/brand.md).

    .venv/bin/python -m spine.voice <client> <slot> "script text"

Local TTS (Kokoro-82M via kokoro-onnx, Apache-2.0; model files in ~/.cache/kokoro, fetched
from the kokoro-onnx GitHub release on first use). Output posts/<slot>/vo.wav, 48 kHz mono,
loudness-normalised to -16 LUFS. meta.json "voiceover" = {script, voice, start, file}.
The mix with music happens in spine/tracks.apply().
"""

from __future__ import annotations

import json
import subprocess
import sys
import urllib.request
from pathlib import Path

from . import clients as C

MODEL_DIR = Path.home() / ".cache" / "kokoro"
RELEASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
FILES = ("kokoro-v1.0.onnx", "voices-v1.0.bin")
DEFAULT_VOICE = "am_michael"
SPEED = 1.08
START = 0.5          # seconds into the video the voice starts
TARGET_LUFS = -15   # one-pass loudnorm lands ~1 dB low on short clips → about -16

_k = None


def _kokoro():
    global _k
    if _k is None:
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        for f in FILES:
            if not (MODEL_DIR / f).exists():
                urllib.request.urlretrieve(RELEASE + f, MODEL_DIR / f)
        from kokoro_onnx import Kokoro
        _k = Kokoro(str(MODEL_DIR / FILES[0]), str(MODEL_DIR / FILES[1]))
    return _k


def clean(script: str) -> str:
    """ig-human basics for speech: no em/en dashes, no invisible characters."""
    s = script.replace("—", ", ").replace("–", ", ")
    s = "".join(ch for ch in s if ch.isprintable() or ch in "\n ")
    return " ".join(s.split())


def make_vo(client: str, slot: str, script: str, voice: str | None = None, start: float = START) -> Path:
    import soundfile as sf
    sd = C.client_dir(client) / "posts" / slot
    meta_p = sd / "meta.json"
    meta = json.loads(meta_p.read_text())
    voice = voice or (C.load_grants(client).get("voice") or DEFAULT_VOICE)
    text = clean(script)
    samples, sr = _kokoro().create(text, voice=voice, speed=SPEED, lang="en-us")
    raw = sd / ".vo-raw.wav"
    sf.write(raw, samples, sr)
    out = sd / "vo.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-af",
                    f"highpass=f=80,loudnorm=I={TARGET_LUFS}:TP=-1.5:LRA=7", "-ar", "48000", "-ac", "1", str(out)], check=True)
    raw.unlink()
    meta["voiceover"] = {"script": text, "voice": voice, "start": start, "file": "vo.wav",
                         "engine": "kokoro-82m (kokoro-onnx, Apache-2.0)"}
    meta_p.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")
    return out


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(__doc__); sys.exit(2)
    print(make_vo(sys.argv[1], sys.argv[2], sys.argv[3]))
