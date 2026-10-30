"""Original audio bed for a film, synthesised (nothing generative, nothing
licensed from elsewhere). Upbeat by default: this is a surf app, not a memorial.

    .venv/bin/python -m spine.audio <film_dir>     # reads film.json "music", writes audio.wav

film.json:
    "music": {"bpm": 122, "key_hz": 146.83, "mode": "major", "end": 15.0,
              "beats": [0.0, 2.2, 5.5, 8.5, 11.0, 13.0],   # card changes: a riser lands on each
              "hits": [13.0],                                # chord stab (end card)
              "drop": 2.2}                                   # drums enter here; intro before is light

Layers (all deterministic, seed 7): four-on-the-floor kick with a short click, open/closed
hats, clap on 2 and 4, a plucked bass on the root, a bright arpeggio (I–V–vi–IV in the
key) through a bandpass, a shimmering major pad, noise risers into every card change, a
chord stab for hits, side-chain pump from the kick on pad and arp. Stereo 48 kHz, loudnorm
−14 LUFS, true peak −1.5 dB, 1.5 s tail.
"""

from __future__ import annotations

import json
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

SR = 48000
RNG = np.random.default_rng(7)


def t_axis(n: int) -> np.ndarray:
    return np.arange(n) / SR


def onepole_lp(x: np.ndarray, cutoff) -> np.ndarray:
    c = np.broadcast_to(np.asarray(cutoff, dtype=float), x.shape)
    a = 1 - np.exp(-2 * np.pi * c / SR)
    y = np.empty_like(x); acc = 0.0
    for i in range(len(x)):
        acc += a[i] * (x[i] - acc); y[i] = acc
    return y


def onepole_hp(x: np.ndarray, cutoff: float) -> np.ndarray:
    return x - onepole_lp(x, cutoff)


def adsr(n: int, a: float, d: float, s: float, r: float) -> np.ndarray:
    t = t_axis(n); dur = n / SR
    e = np.full(n, s)
    m = t < a; e[m] = t[m] / max(a, 1e-6)
    m = (t >= a) & (t < a + d); e[m] = 1 - (1 - s) * (t[m] - a) / max(d, 1e-6)
    m = t >= dur - r; e[m] = e[m] * np.clip((dur - t[m]) / max(r, 1e-6), 0, 1)
    return e


def place(buf: np.ndarray, start_s: float, x: np.ndarray, gain: float = 1.0) -> None:
    s = int(start_s * SR); e = min(len(buf), s + len(x))
    if s < 0 or s >= len(buf): return
    buf[s:e] += x[: e - s] * gain


# ── instruments ──────────────────────────────────────────────────────────────
def kick(L: float = 0.32) -> np.ndarray:
    n = int(L * SR); t = t_axis(n)
    f = 48 + 110 * np.exp(-t * 28)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7.5)
    click = onepole_hp(RNG.standard_normal(n), 2500) * np.exp(-t * 120) * 0.5
    return body + click


def hat(L: float = 0.06, open_: bool = False) -> np.ndarray:
    n = int((0.22 if open_ else L) * SR); t = t_axis(n)
    x = onepole_hp(RNG.standard_normal(n), 7000)
    return x * np.exp(-t * (9 if open_ else 55)) * 0.35


def clap() -> np.ndarray:
    n = int(0.25 * SR); t = t_axis(n)
    x = onepole_hp(onepole_lp(RNG.standard_normal(n), 3200), 900)
    env = sum(np.exp(-np.clip(t - d, 0, None) * 40) * (t >= d) for d in (0, 0.011, 0.022)) + np.exp(-t * 11) * 0.6
    return x * env * 0.45


def pluck(freq: float, L: float, bright: float = 2600, decay: float = 9) -> np.ndarray:
    n = int(L * SR); t = t_axis(n)
    saw = 2 * ((t * freq) % 1) - 1
    sq = np.sign(np.sin(2 * np.pi * freq * t)) * 0.4
    x = onepole_lp(saw + sq, bright * np.exp(-t * 4) + 300)
    return x * np.exp(-t * decay) * adsr(n, 0.003, 0.05, 1.0, 0.03)


def bass(freq: float, L: float) -> np.ndarray:
    n = int(L * SR); t = t_axis(n)
    x = np.sign(np.sin(2 * np.pi * freq * t)) * 0.6 + np.sin(2 * np.pi * freq * t) * 0.8
    x = onepole_lp(x, 420 + 900 * np.exp(-t * 12))
    return x * adsr(n, 0.004, 0.12, 0.55, 0.05) * np.exp(-t * 2.2)


def pad_chord(freqs: list[float], L: float) -> np.ndarray:
    n = int(L * SR); t = t_axis(n); x = np.zeros(n)
    for f in freqs:
        for det, g in ((-0.006, .5), (0, .7), (0.006, .5)):
            x += (2 * ((t * f * (1 + det)) % 1) - 1) * g
    x = onepole_lp(x, 1800)
    return x * adsr(n, 0.35, 0.3, 0.8, 0.5) / (len(freqs) * 1.7)


def riser(L: float = 1.0) -> np.ndarray:
    n = int(L * SR); t = t_axis(n)
    x = onepole_hp(RNG.standard_normal(n), 400)
    x = onepole_lp(x, 600 + 7000 * (t / L) ** 2)
    return x * (t / L) ** 2.2 * 0.5


def stab(freqs: list[float], L: float = 2.2) -> np.ndarray:
    n = int(L * SR); t = t_axis(n); x = np.zeros(n)
    for f in freqs:
        x += (2 * ((t * f) % 1) - 1) + np.sin(2 * np.pi * f * 2 * t) * 0.3
    x = onepole_lp(x, 3500 * np.exp(-t * 2) + 500)
    return x * np.exp(-t * 1.9) / len(freqs)


# ── arrangement ──────────────────────────────────────────────────────────────
MAJOR = [0, 2, 4, 5, 7, 9, 11]


def degree(root_hz: float, deg: int, octave: int = 0) -> float:
    semis = MAJOR[deg % 7] + 12 * (deg // 7) + 12 * octave
    return root_hz * 2 ** (semis / 12)


def build(film_dir: Path) -> Path:
    spec = json.loads((film_dir / "film.json").read_text())
    m = spec.get("music", {})
    end = float(m.get("end", spec["duration"])); dur = end + 1.5
    bpm = float(m.get("bpm", 122)); beat = 60 / bpm; bar = 4 * beat
    root = float(m.get("key_hz", 146.83))           # D
    drop = float(m.get("drop", 2.2))
    n = int(dur * SR)
    drums = np.zeros(n); bassb = np.zeros(n); arp = np.zeros(n); pad = np.zeros(n); fx = np.zeros(n)

    # chords I–V–vi–IV, one per bar, from the drop; a soft I before it
    prog = [0, 4, 5, 3]
    nbars = int(np.ceil(dur / bar)) + 1
    k_, h_, ho_, c_ = kick(), hat(), hat(open_=True), clap()
    for b in range(nbars):
        t0 = b * bar
        chord_deg = prog[b % 4]
        chord = [degree(root, chord_deg + d, 1) for d in (0, 2, 4)]
        place(pad, t0, pad_chord(chord, bar + 0.4), 0.55 if t0 >= drop - bar else 0.35)
        for i in range(16):                                   # 16ths
            tt = t0 + i * beat / 4
            if tt >= end: break
            if tt >= drop:
                if i % 4 == 0: place(drums, tt, k_, 1.0)
                if i % 2 == 0: place(drums, tt, h_, 0.9 if i % 4 else 0.6)
                if i % 4 == 2: place(drums, tt, ho_ if i == 14 else h_, 0.5)
                if i in (4, 12): place(drums, tt, c_, 0.8)
                # bass: root on the beat, octave bounce on the off-beats
                if i % 4 == 0: place(bassb, tt, bass(degree(root, chord_deg, -1), beat * 0.9), 0.9)
                if i % 4 == 2: place(bassb, tt, bass(degree(root, chord_deg, 0), beat * 0.45), 0.6)
            # arpeggio: chord tones up and down, 16ths, brighter after the drop
            tone = chord[[0, 1, 2, 1][i % 4]] * (2 if i % 8 >= 4 else 1)
            if tt >= drop or i % 2 == 0:
                place(arp, tt, pluck(tone, beat * 0.5, 2600 if tt >= drop else 1400), 0.42 if tt >= drop else 0.22)
    for r in m.get("beats", []):
        if r > 0.9: place(fx, r - 1.0, riser(1.0), 0.8)
    for hsec in m.get("hits", []):
        chord = [degree(root, d, 1) for d in (0, 2, 4, 7)]
        place(fx, hsec, stab(chord), 0.9)
        place(drums, hsec, k_, 1.1)

    # side-chain pump from the kick grid on pad + arp
    pump = np.ones(n); t = t_axis(n)
    for tt in np.arange(drop, end, beat):
        s = int(tt * SR); L = int(beat * SR * 0.9)
        seg = np.clip((np.arange(L) / SR) / (beat * 0.45), 0, 1) ** 1.6
        e = min(n, s + L); pump[s:e] = np.minimum(pump[s:e], 0.35 + 0.65 * seg[: e - s])
    pad *= pump; arp *= pump

    mix = drums * 0.9 + bassb * 0.8 + arp * 0.9 + pad * 0.6 + fx * 0.8
    fade = int(1.5 * SR); mix[-fade:] *= np.linspace(1, 0, fade) ** 0.7
    mix = mix / (np.max(np.abs(mix)) + 1e-9) * 0.9
    # width: arp and hats a touch wider via a tiny inter-channel delay on the arp only
    d = int(0.0007 * SR)
    left = mix + np.concatenate([arp[d:], np.zeros(d)]) * 0.12
    right = mix + np.concatenate([np.zeros(d), arp[:-d]]) * 0.12
    stereo = np.stack([left, right], axis=1); stereo /= (np.max(np.abs(stereo)) + 1e-9) / 0.9
    raw = film_dir / "audio-raw.wav"
    with wave.open(str(raw), "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((stereo * 32767).astype("<i2").tobytes())
    out = film_dir / "audio.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-af", "loudnorm=I=-14:TP=-1.5:LRA=8", "-ar", str(SR), str(out)], check=True)
    raw.unlink()
    return out


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__); return 2
    print(build(Path(argv[0])))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
