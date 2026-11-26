"""spine.voice.synth: a Gemini model out of quota hands the same voice to the next model."""
import urllib.error

import pytest

from spine import voice as V


def quota(*full):
    """A fake _gemini whose models in `full` answer 429; returns the models it was called with."""
    calls = []

    def fake(model, name, text, out):
        calls.append((model, name))
        if model in full:
            raise urllib.error.HTTPError("u", 429, "quota", {}, None)
    return calls, fake


def test_out_of_quota_records_the_same_voice_on_the_next_model(monkeypatch, tmp_path):
    calls, fake = quota("gemini-3.8-flash-lite-tts")
    monkeypatch.setattr(V, "_gemini", fake)
    V.synth("g38lite:Kore", "hi", tmp_path / "o.wav")
    assert calls == [("gemini-3.8-flash-lite-tts", "Kore"), ("gemini-3.8-flash-tts", "Kore")]


def test_every_model_out_of_quota_fails(monkeypatch, tmp_path):
    calls, fake = quota(*V.GEMINI.values())
    monkeypatch.setattr(V, "_gemini", fake)
    with pytest.raises(urllib.error.HTTPError):
        V.synth("g25:Sadachbia", "hi", tmp_path / "o.wav")
    assert [m for m, _ in calls][0] == "gemini-2.5-flash-preview-tts" and len(calls) == len(V.GEMINI)


def test_other_errors_do_not_fall_back(monkeypatch, tmp_path):
    def bad(model, name, text, out):
        raise urllib.error.HTTPError("u", 400, "bad", {}, None)
    monkeypatch.setattr(V, "_gemini", bad)
    with pytest.raises(urllib.error.HTTPError):
        V.synth("g38lite:Orus", "hi", tmp_path / "o.wav")
