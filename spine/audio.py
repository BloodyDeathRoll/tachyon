"""Original audio bed for a film, synthesised (decision 7: nothing generative, nothing
licensed from elsewhere; decision 4 allows Sound Collection later, but this is ours).

    .venv/bin/python -m spine.audio <film_dir>     # reads film.json "music", writes audio.wav

film.json:
    "music": {"bpm": 96, "key_hz": 110, "beats": [0.0, 2.0, 5.0, 8.0, 11.0, 13.0],
              "end": 15.0, "whoosh": [1.9, 4.9, 7.9, 10.9], "hits": [13.0]}

Layers: a slow pad (detuned saws through a low-pass that opens over the film), a sub pulse
on the beat grid, soft noise swells ("whoosh") before each card change, a tonal hit for the
end card, and a 1.5 s tail. Stereo 48 kHz 16-bit, peak −1 dBFS, loudness roughly −16 LUFS
(ffmpeg loudnorm pass at the end).
"""

from __future__ import annotations

import json
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

SR = 48000


def env(n: int, a: float, d: float, s: float, r: float, dur: float) -> np.ndarray:
    t = np.linspace(0, dur, n, endpoint=False)
    e = np.ones(n) * s
    e[t < a] = t[t < a] / max(a, 1e-6)
    m = (t >= a) & (t < a + d)
    e[m] = 1 - (1 - s) * (t[m] - a) / max(d, 1e-6)
    rel = t >= dur - r
    e[rel] *= np.clip((dur - t[rel]) / max(r, 1e-6), 0, 1)
    return e


def lowpass(x: np.ndarray, cutoff: np.ndarray | float) -> np.ndarray:
    """One-pole low-pass with a per-sample cutoff (Hz), cheap and smooth."""
    c = np.broadcast_to(np.asarray(cutoff, dtype=float), x.shape)
    a = 1 - np.exp(-2 * np.pi * c / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += a[i] * (x[i] - acc)
        y[i] = acc
    return y


def saw(freq: float, n: int, detune: float = 0.0) -> np.ndarray:
    t = np.arange(n) / SR
    f = freq * (1 + detune)
    return 2 * ((t * f) % 1.0) - 1


def pad(dur: float, key: float) -> np.ndarray:
    n = int(dur * SR)
    chord = [key, key * 1.5, key * 2, key * 2.378, key * 3]          # root, fifth, octave, minor 7th-ish, 12th
    x = sum(saw(f, n, d) * g for f, d, g in zip(chord, (-0.004, 0.003, -0.002, 0.005, 0.0), (0.5, 0.35, 0.3, 0.2, 0.15)))
    cutoff = np.linspace(180, 1600, n)                               # the filter opens over the film
    x = lowpass(x, cutoff)
    return x * env(n, 1.2, 0.5, 0.8, 1.5, dur) * 0.22


def sub_pulses(dur: float, key: float, beats: list[float], bpm: float) -> np.ndarray:
    n = int(dur * SR); out = np.zeros(n)
    period = 60 / bpm
    grid = np.arange(beats[0] if beats else 0, dur - 1.0, period / 2)
    for i, b in enumerate(grid):
        L = int(0.28 * SR); s = int(b * SR)
        if s + L > n: break
        t = np.arange(L) / SR
        g = 0.9 if i % 4 == 0 else 0.5
        out[s:s + L] += np.sin(2 * np.pi * (key / 2) * t) * np.exp(-t * 9) * g
    return out * 0.6


def whooshes(dur: float, times: list[float]) -> np.ndarray:
    n = int(dur * SR); out = np.zeros(n); rng = np.random.default_rng(7)
    for w in times:
        L = int(0.9 * SR); s = int((w - 0.7) * SR)
        if s < 0 or s + L > n: continue
        noise = rng.standard_normal(L)
        cutoff = np.concatenate([np.linspace(300, 4000, int(L * 0.7)), np.linspace(4000, 600, L - int(L * 0.7))])
        x = lowpass(noise, cutoff)
        shape = np.concatenate([np.linspace(0, 1, int(L * 0.7)) ** 2, np.linspace(1, 0, L - int(L * 0.7)) ** 1.5])
        out[s:s + L] += x * shape * 0.12
    return out


def hits(dur: float, key: float, times: list[float]) -> np.ndarray:
    n = int(dur * SR); out = np.zeros(n)
    for h in times:
        L = int(2.5 * SR); s = int(h * SR)
        if s + L > n: L = n - s
        t = np.arange(L) / SR
        tone = sum(np.sin(2 * np.pi * key * m * t) * (0.5 ** k) for k, m in enumerate((1, 2, 3, 4.01)))
        out[s:s + L] += tone * np.exp(-t * 1.6) * 0.35
    return out


def build(film_dir: Path) -> Path:
    spec = json.loads((film_dir / "film.json").read_text())
    m = spec.get("music", {})
    dur = float(m.get("end", spec["duration"])) + 1.5
    key = float(m.get("key_hz", 110)); bpm = float(m.get("bpm", 96))
    mix = pad(dur, key) + sub_pulses(dur, key, m.get("beats", [0.0]), bpm) + whooshes(dur, m.get("whoosh", [])) + hits(dur, key, m.get("hits", []))
    # end fade so the tail lands with the end card
    n = len(mix); fade = int(1.5 * SR); mix[-fade:] *= np.linspace(1, 0, fade)
    mix = mix / (np.max(np.abs(mix)) + 1e-9) * 0.89
    # a little width: right channel delayed 11 ms on the pad only would need separate buses; keep mono-compatible stereo
    left = mix; right = np.concatenate([np.zeros(int(0.0004 * SR)), mix])[:n]
    stereo = np.stack([left, right], axis=1)
    raw = film_dir / "audio-raw.wav"
    with wave.open(str(raw), "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((stereo * 32767).astype("<i2").tobytes())
    out = film_dir / "audio.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-af", "loudnorm=I=-16:TP=-1.5:LRA=9", "-ar", str(SR), str(out)], check=True)
    raw.unlink()
    return out


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__); return 2
    print(build(Path(argv[0])))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
