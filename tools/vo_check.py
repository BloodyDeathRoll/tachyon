"""Hear a voice-over take back and refuse it if words are missing or it ends early.
Runs in the Dia venv (faster-whisper, CPU).

    ~/.cache/tachyon-tts/venv/bin/python tools/vo_check.py take.wav "script text"

Prints the transcript; exit 1 when the take misses the script's last words or > 15 % of its words.
"""
import re
import subprocess
import sys

import numpy as np
from faster_whisper import WhisperModel


def words(s: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", s.lower().replace("-", " "))


def check(heard: str, script: str) -> list[str]:
    h, s = words(heard), words(script)
    issues = []
    if h[-2:] != s[-2:]:
        issues.append(f"ends {' '.join(h[-3:])!r}, script ends {' '.join(s[-3:])!r}")
    missing = [w for w in s if w not in h]
    if len(missing) > 0.15 * len(s):
        issues.append(f"missing {missing}")
    return issues


assert check("I'm already packing the co-", "I'm already packing the car!")
assert not check("Dude, I just checked Rosa. Packing the car.", "Dude, I just check Rosa. Packing the car!")

if __name__ == "__main__":
    wav, script = sys.argv[1], sys.argv[2]
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", wav, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
                         check=True, capture_output=True).stdout
    segs, _ = WhisperModel("small.en", device="cpu", compute_type="int8").transcribe(np.frombuffer(pcm, np.float32))
    heard = " ".join(s.text.strip() for s in segs)
    print(heard)
    issues = check(heard, script)
    if issues:
        print("VO CUT: " + "; ".join(issues), file=sys.stderr)
        sys.exit(1)
