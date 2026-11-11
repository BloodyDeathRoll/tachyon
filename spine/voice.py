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

ROOT = Path(__file__).resolve().parent.parent

MODEL_DIR = Path.home() / ".cache" / "kokoro"
RELEASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
FILES = ("kokoro-v1.0.onnx", "voices-v1.0.bin")
# Voices: "<engine>:<name>[@speed]". The roster is the operator's pick from the auditions in
# clients/<c>/assets/voice-auditions/ (grants.yaml `voices` overrides it); the week rotates it.
ROSTER = ["dia:seed5", "dia:seed8", "dia:seed9", "dia:seed3"]
DIA_PY = Path.home() / ".cache" / "tachyon-tts" / "venv" / "bin" / "python"   # Python 3.12 + torch + dia
DEFAULT_VOICE = ROSTER[0]
SPEED = 1.08
START = 0.5          # seconds into the video the voice starts
TARGET_LUFS = -15   # one-pass loudnorm lands ~1 dB low on short clips → about -16

_k = None
ENGINES = {"kokoro": "kokoro-82m (kokoro-onnx, Apache-2.0)",
           "dia": "dia-1.6b (Nari Labs, Apache-2.0), local GPU"}
# Not used: Chatterbox (embeds a Perth neural watermark in every output; no-AI-label rule),
# ElevenLabs (no key). Dia and Kokoro write plain audio with no watermark.


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


# How brand words are said. Spelled phonetically in the TTS input only; captions and meta keep
# the real spelling. grants.yaml `pronounce: {word: spoken}` adds or overrides per client.
PRONOUNCE = {"rosa": {"Rosa": "Roza", "rosa.surf": "Roza dot surf", "ROSA": "Roza"}}


def spoken(client: str, text: str) -> str:
    import re
    rules = {**PRONOUNCE.get(client, {}), **(C.load_grants(client).get("pronounce") or {})}
    for word in sorted(rules, key=len, reverse=True):   # "rosa.surf" before "Rosa"
        text = re.sub(rf"(?<![\w.]){re.escape(word)}(?![\w])", rules[word], text, flags=re.I)
    return text


def clean(script: str) -> str:
    """ig-human basics for speech: no em/en dashes, no invisible characters."""
    s = script.replace("—", ", ").replace("–", ", ")
    s = "".join(ch for ch in s if ch.isprintable() or ch in "\n ")
    return " ".join(s.split())


def roster(client: str) -> list[str]:
    return list(C.load_grants(client).get("voices") or ROSTER)


def rotate(client: str, i: int) -> str:
    r = roster(client)
    return r[i % len(r)]


def parse(spec: str) -> tuple[str, str, float]:
    """"kokoro:am_puck@1.1" → ("kokoro", "am_puck", 1.1); a bare name is a Kokoro voice."""
    engine, _, rest = spec.partition(":") if ":" in spec else ("kokoro", "", spec)
    name, _, sp = rest.partition("@")
    return engine, name, float(sp) if sp else SPEED


def _dia(client: str, name: str, text: str, out: Path, take: int = 0) -> None:
    """Dia-1.6B (Nari Labs, Apache-2.0, no watermark) in its own venv. The voice is a reference
    clip + transcript in clients/<c>/assets/voices/dia-<name>.wav/.txt, so it stays the same voice."""
    import tempfile
    ref = C.client_dir(client) / "assets" / "voices" / f"dia-{name}"
    # A trailing speaker tag stops Dia ending the take early (it clipped the last word without it)
    job = {"text": "[S1] " + text + " [S1]", "out": str(out), "seed": int("".join(ch for ch in name if ch.isdigit()) or 7) + 1000 * take,
           "max_tokens": 2800}
    if ref.with_suffix(".wav").exists():
        job |= {"prompt": str(ref.with_suffix(".wav")), "prompt_text": ref.with_suffix(".txt").read_text().strip()}
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump([job], f)
    subprocess.run([str(DIA_PY), str(ROOT / "tools" / "dia_tts.py"), f.name], check=True, capture_output=True)


def synth(spec: str, text: str, out: Path, client: str = "rosa", take: int = 0) -> None:
    """Raw speech for `text` in voice `spec` → out (wav, any rate). take > 0: a fresh Dia sample."""
    engine, name, speed = parse(spec)
    if engine == "dia":
        _dia(client, name, text, out, take)
    elif engine == "kokoro":
        import soundfile as sf   # Kokoro only: the dashboard's Python has no soundfile
        samples, sr = _kokoro().create(text, voice=name, speed=speed, lang="en-us")
        sf.write(out, samples, sr)
    else:
        raise ValueError(f"unknown voice engine {engine}")


def vo_file(client: str, text: str, voice: str, out: Path, takes: int = 5) -> Path:
    """One whole take of `text` → out: trimmed, -16 LUFS, 48 kHz mono. Every take is heard back
    (tools/vo_check.py); a cut take is thrown away and a fresh one generated, never spliced."""
    raw, new = out.with_name(".vo-raw.wav"), out.with_name(".vo-new.wav")
    # the tail trim skips clicks under 50 ms after the last word and keeps 0.15 s of its decay
    trim = ("silenceremove=start_periods=1:start_threshold=-45dB,areverse,"
            "silenceremove=start_periods=1:start_threshold=-45dB:start_duration=0.05:start_silence=0.15,areverse,")
    errors = []
    for take in range(takes):
        synth(voice, spoken(client, text), raw, client, take)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-af",
                        f"{trim}highpass=f=80,loudnorm=I={TARGET_LUFS}:TP=-1.5:LRA=7", "-ar", "48000", "-ac", "1", str(new)], check=True)
        raw.unlink()
        heard = subprocess.run([str(DIA_PY), str(ROOT / "tools" / "vo_check.py"), str(new), text], capture_output=True, text=True)
        if heard.returncode == 0:
            return new.replace(out)
        errors.append(heard.stderr.strip()[-200:] or "vo_check failed")
    new.unlink(missing_ok=True)   # never hand on a cut take; the previous vo.wav stays
    raise RuntimeError(f"{takes} takes cut off: " + " | ".join(errors))


def make_vo(client: str, slot: str, script: str, voice: str | None = None, start: float = START) -> Path:
    sd = C.client_dir(client) / "posts" / slot
    meta_p = sd / "meta.json"
    meta = json.loads(meta_p.read_text())
    voice = voice or (meta.get("voiceover") or {}).get("voice") or DEFAULT_VOICE
    if ":" not in voice:
        voice = f"kokoro:{voice}"
    text = clean(script)
    out = vo_file(client, text, voice, sd / "vo.wav")
    engine, name, speed = parse(voice)
    meta["voiceover"] = {"script": text, "voice": voice, "speed": speed, "start": start, "file": "vo.wav",
                         "engine": ENGINES[engine]}
    meta_p.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")
    return out


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(__doc__); sys.exit(2)
    print(make_vo(sys.argv[1], sys.argv[2], sys.argv[3]))
