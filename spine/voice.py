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
import urllib.error
import urllib.request
from pathlib import Path

from . import clients as C

ROOT = Path(__file__).resolve().parent.parent

MODEL_DIR = Path.home() / ".cache" / "kokoro"
RELEASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
FILES = ("kokoro-v1.0.onnx", "voices-v1.0.bin")
# Voices: "<engine>:<name>[@speed]". The roster is the operator's pick from the auditions in
# clients/<c>/assets/voice-auditions/ (grants.yaml `voices` overrides it); the week rotates it.
# Operator's picks 2026-11-26 from the w49-03 auditions (Gemini prebuilt voices). Engine = the
# Gemini model the voice was heard on: g38lite = gemini-3.8-flash-lite-tts, g25 = gemini-2.5-flash-preview-tts.
# Heard as anchor-like (narration only, not the surfer rotation): g25:Iapetus, g25:Enceladus, g25:Vindemiatrix.
ROSTER = ["g38lite:Gacrux", "g38lite:Kore", "g38lite:Orus", "g38lite:Rasalgethi", "g25:Sadachbia", "g38lite:Sadachbia"]
GEMINI = {"g38": "gemini-3.8-flash-tts", "g38lite": "gemini-3.8-flash-lite-tts",
          "g31": "gemini-3.1-flash-tts-preview", "g25": "gemini-2.5-flash-preview-tts"}
# The direction the picks were auditioned with; the script follows "#### TRANSCRIPT".
GEMINI_NOTES = """# AUDIO PROFILE
A surfer in his or her late twenties, telling friends about a spot they love.

## DIRECTOR'S NOTES
Style: awake, bright and happy. A real smile in the voice, genuinely stoked on the good bits, warm and casual on the rest.
Not sleepy, not drowsy, not dreamy. Not a news anchor, not an advert, not shouting.
Pace: a natural, relaxed talking speed with a short breath between sentences. Never rushed, never speeding up at the end.
Every word crisp and clear. "Roza" is said RO-za.

#### TRANSCRIPT
"""
DIA_PY = Path.home() / ".cache" / "tachyon-tts" / "venv" / "bin" / "python"   # Python 3.12 + torch + dia
DEFAULT_VOICE = ROSTER[0]
SPEED = 1.08
START = 0.5          # seconds into the video the voice starts
TARGET_LUFS = -15   # one-pass loudnorm lands ~1 dB low on short clips → about -16

_k = None
ENGINES = {"kokoro": "kokoro-82m (kokoro-onnx, Apache-2.0)",
           "dia": "dia-1.6b (Nari Labs, Apache-2.0), local GPU",
           **{k: f"{m} (Google AI Studio free tier, SynthID watermark), pauses silenced" for k, m in GEMINI.items()}}
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


def _dia(client: str, name: str, text: str, out: Path) -> None:
    """Dia-1.6B (Nari Labs, Apache-2.0, no watermark) in its own venv. The voice is a reference
    clip + transcript in clients/<c>/assets/voices/dia-<name>.wav/.txt, so it stays the same voice."""
    import tempfile
    ref = C.client_dir(client) / "assets" / "voices" / f"dia-{name}"
    job = {"text": "[S1] " + text, "out": str(out), "seed": int("".join(ch for ch in name if ch.isdigit()) or 7),
           "max_tokens": 2800}
    if ref.with_suffix(".wav").exists():
        job |= {"prompt": str(ref.with_suffix(".wav")), "prompt_text": ref.with_suffix(".txt").read_text().strip()}
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump([job], f)
    subprocess.run([str(DIA_PY), str(ROOT / "tools" / "dia_tts.py"), f.name], check=True, capture_output=True)


def _gemini(model: str, name: str, text: str, out: Path) -> None:
    """Gemini TTS prebuilt voice, one whole take, then tools/vo_clean.py silences the hiss it
    leaves after each sentence. Key: GEMINI_API_KEY (env, else ~/Projects/tachyon/.env.local).
    Free tier is about 10 calls a day per model."""
    import base64
    import os
    from .publisher.auth import env_path, read_env
    key = os.environ.get("GEMINI_API_KEY") or read_env(env_path()).get("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("no GEMINI_API_KEY in the env or .env.local")
    body = {"contents": [{"parts": [{"text": GEMINI_NOTES + text}]}],
            "generationConfig": {"responseModalities": ["AUDIO"],
                                 "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": name}}}}}
    req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                                 data=json.dumps(body).encode(), method="POST",
                                 headers={"x-goog-api-key": key, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        pcm = base64.b64decode(json.load(r)["candidates"][0]["content"]["parts"][0]["inlineData"]["data"])
    raw = out.with_name(f".gemini-raw-{out.stem}.wav")
    venv = ROOT / ".venv" / "bin" / "python"   # vo_clean needs numpy, which the repo venv has (not the Dia one)
    try:
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", "-", str(raw)],
                       input=pcm, check=True)
        r = subprocess.run([str(venv) if venv.exists() else sys.executable, str(ROOT / "tools" / "vo_clean.py"), str(raw), str(out)],
                           capture_output=True, text=True)
        if r.returncode:
            raise RuntimeError(f"vo_clean failed: {r.stderr.strip()[-800:]}")
    finally:
        raw.unlink(missing_ok=True)


def synth(spec: str, text: str, out: Path, client: str = "rosa") -> None:
    """Raw speech for `text` in voice `spec` → out (wav, any rate)."""
    engine, name, speed = parse(spec)
    if engine in GEMINI:
        # the free tier is about 10 calls a day per model: out of quota, the same voice on the next model
        models = [GEMINI[engine], *(m for k, m in GEMINI.items() if k != engine)]
        for i, model in enumerate(models):
            try:
                _gemini(model, name, text, out)
                break
            except urllib.error.HTTPError as e:
                if e.code != 429 or i == len(models) - 1:
                    raise
                print(f"{name}: {model} is out of quota, recording on {models[i + 1]}", file=sys.stderr)
    elif engine == "dia":
        _dia(client, name, text, out)
    elif engine == "kokoro":
        import soundfile as sf   # Kokoro only: the dashboard's Python has no soundfile
        samples, sr = _kokoro().create(text, voice=name, speed=speed, lang="en-us")
        sf.write(out, samples, sr)
    else:
        raise ValueError(f"unknown voice engine {engine}")


def vo_file(client: str, text: str, voice: str, out: Path) -> Path:
    """One take of `text` → out: trimmed, -16 LUFS, 48 kHz mono."""
    raw = out.with_name(".vo-raw.wav")
    synth(voice, spoken(client, text), raw, client)
    trim = "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-af",
                    f"{trim}highpass=f=80,loudnorm=I={TARGET_LUFS}:TP=-1.5:LRA=7", "-ar", "48000", "-ac", "1", str(out)], check=True)
    raw.unlink()
    return out


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
