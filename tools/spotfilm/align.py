"""Word timings of a voice-over take: prints [[word, start_seconds], ...] as JSON.
Runs in the Dia venv (faster-whisper, CPU), like tools/vo_check.py.

    ~/.cache/tachyon-tts/venv/bin/python tools/spotfilm/align.py vo.wav
"""
import json
import subprocess
import sys

import numpy as np
from faster_whisper import WhisperModel

if __name__ == "__main__":
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", sys.argv[1], "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
                         check=True, capture_output=True).stdout
    segs, _ = WhisperModel("small.en", device="cpu", compute_type="int8").transcribe(np.frombuffer(pcm, np.float32), word_timestamps=True)
    print(json.dumps([[w.word.strip(), round(w.start, 3)] for s in segs for w in s.words]))
