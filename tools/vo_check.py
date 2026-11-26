"""Hear a voice-over take back and refuse it if words are missing or it ends early.
Runs in the Dia venv (faster-whisper, CPU).

    ~/.cache/tachyon-tts/venv/bin/python tools/vo_check.py take.wav "script text"

Prints the transcript; exit 1 when the take misses the script's last words or > 15 % of its words,
or when sound that is not speech comes before the first word (Dia's metallic buzz, w49-03).
"""
import re
import subprocess
import sys

import numpy as np
from faster_whisper import WhisperModel
from faster_whisper.vad import VadOptions, get_speech_timestamps

LEAD_MAX = 0.3   # the take is trimmed to its first sound: clean takes start speaking at 0.0 s


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
    audio = np.frombuffer(pcm, np.float32)
    segs, _ = WhisperModel("small.en", device="cpu", compute_type="int8").transcribe(audio)
    heard = " ".join(s.text.strip() for s in segs)
    print(heard)
    issues = check(heard, script)
    speech = get_speech_timestamps(audio, VadOptions())
    lead = speech[0]["start"] / 16000 if speech else 0.0
    if lead > LEAD_MAX:
        issues.append(f"{lead:.2f} s of noise before the first word")
    if issues:
        print("VO CUT: " + "; ".join(issues), file=sys.stderr)
        sys.exit(1)
