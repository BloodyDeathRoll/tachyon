"""Silence the hiss a TTS take leaves in its pauses, without touching speech or timing.

    python tools/vo_clean.py <in.wav> <out.wav>

Gemini TTS ends each sentence with ~0.35 s of static (around 4 kHz, ~40 dB under the voice).
A pause = 10 ms frames quieter than THRESH_DB (relative to the take's peak) for 120 ms or more;
each pause fades to digital silence (25 ms fades, 10 ms kept after the last word). The length
never changes, so word timings stay valid. Needs numpy (the tachyon-tts venv has it).
"""
from __future__ import annotations

import subprocess
import sys

import numpy as np

SR, W = 48000, 480          # 10 ms frames
THRESH_DB = -36.0
MIN_PAUSE = 12              # frames (120 ms)
FADE, KEEP = int(.025 * SR), int(.01 * SR)


def silence_pauses(a: np.ndarray, th: float = THRESH_DB) -> np.ndarray:
    peak = float(np.abs(a).max()) or 1.0
    n = len(a) // W
    db = 20 * np.log10(np.sqrt((a[:n * W].reshape(n, W) ** 2).mean(1)) / peak + 1e-12)
    quiet = db < th
    g = np.ones(len(a), np.float32)
    i = 0
    while i < n:
        if not quiet[i]:
            i += 1
            continue
        j = i
        while j < n and quiet[j]:
            j += 1
        if j - i >= MIN_PAUSE:
            lo = i * W + (KEEP if i else 0)        # the last word's tail
            hi = j * W if j < n else len(a)        # up to the next word's onset
            if hi - lo > 2 * FADE:
                g[lo:hi] = 0
                g[lo:lo + FADE] = np.linspace(1, 0, FADE)
                if j < n:
                    g[hi - FADE:hi] = np.linspace(0, 1, FADE)
        i = j
    return (a * g).astype(np.float32)


def main(src: str, dst: str) -> None:
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", src, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    y = silence_pauses(np.frombuffer(pcm, np.float32).copy())
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", "-c:a", "pcm_s24le", dst],
                   input=y.tobytes(), check=True)


if __name__ == "__main__":
    main(*sys.argv[1:3])
