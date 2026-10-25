"""Dia TTS worker (Nari Labs Dia-1.6B, Apache-2.0; no watermark). Own venv:
~/.cache/tachyon-tts/venv (Python 3.12 + torch, CUDA).

    ~/.cache/tachyon-tts/venv/bin/python tools/dia_tts.py jobs.json

jobs.json: [{"text": "[S1] ...", "out": "x.wav", "seed": 11, "prompt": "ref.wav" (optional),
             "prompt_text": "[S1] transcript of ref" (with prompt)}]
A seed fixes the voice; a prompt clip (+ its transcript) keeps one voice across clips.
"""
import json
import random
import sys

import numpy as np
import torch
from dia.model import Dia

jobs = json.load(open(sys.argv[1]))
model = Dia.from_pretrained("nari-labs/Dia-1.6B-0626", compute_dtype="float16", device=torch.device("cuda"))
for j in jobs:
    seed = int(j.get("seed", 11))
    random.seed(seed); np.random.seed(seed); torch.manual_seed(seed); torch.cuda.manual_seed_all(seed)
    text = (j["prompt_text"] + " " + j["text"]) if j.get("prompt") else j["text"]
    audio = model.generate(text, audio_prompt=j.get("prompt"), cfg_scale=float(j.get("cfg", 3.0)),
                           temperature=float(j.get("temperature", 1.2)), top_p=0.95, cfg_filter_top_k=45,
                           max_tokens=int(j.get("max_tokens", 1400)), verbose=False)
    model.save_audio(j["out"], audio)
    print(j["out"], flush=True)
