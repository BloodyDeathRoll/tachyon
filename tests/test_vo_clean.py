"""tools/vo_clean.py: the hiss in a pause goes to silence; speech and length stay."""
import importlib.util
from pathlib import Path

import numpy as np

spec = importlib.util.spec_from_file_location("vo_clean", Path(__file__).resolve().parent.parent / "tools" / "vo_clean.py")
vc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vc)


def test_hiss_in_a_pause_is_silenced_and_speech_kept():
    sr = vc.SR
    t = np.arange(sr) / sr
    word = (0.5 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)               # 1 s "speech"
    hiss = (0.005 * np.random.default_rng(0).standard_normal(int(.4 * sr))).astype(np.float32)   # ~-46 dB under the peak
    a = np.concatenate([word, hiss, word])
    y = vc.silence_pauses(a)
    assert len(y) == len(a)                                                        # timing unchanged
    mid = y[sr + int(.05 * sr): sr + int(.35 * sr)]
    assert np.abs(mid).max() == 0                                                  # the pause is digital silence
    assert np.allclose(y[: sr - vc.W], a[: sr - vc.W])                             # the word is untouched
    assert np.allclose(y[-sr + vc.W:], a[-sr + vc.W:])


def test_short_dip_inside_speech_is_left_alone():
    sr = vc.SR
    t = np.arange(sr) / sr
    word = (0.5 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)
    a = np.concatenate([word, np.zeros(int(.06 * sr), np.float32), word])          # 60 ms gap: under 120 ms
    assert np.array_equal(vc.silence_pauses(a), a)
