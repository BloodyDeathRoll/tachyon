#!/usr/bin/env bash
# A PC as a Tachyon host (docs/CLOUDFLARE-PLAN.md, phase 8): everything a generation needs,
# then the sign-in and the service. Run from the checkout, as the user who will run it:
#
#   git clone git@github.com:BloodyDeathRoll/tachyon.git ~/Projects/tachyon
#   cd ~/Projects/tachyon && deploy/setup-pc.sh https://tachyon.<account>.workers.dev
#
# Idempotent: every step checks what is there. What it does not do: install the system
# packages (it says which are missing), copy a client's assets (a zip from the creator goes
# to clients/<c>/assets/, by hand; nothing else of the client is needed, pull() fetches it).
# The sign-in step prompts for the token shown at <worker url>/login.
#
# Needs: Ubuntu-like Linux, python3.12+ with python3-venv, ffmpeg, node 22+ (nvm is fine),
# git, an NVIDIA GPU with CUDA for the voice-over (Dia); `claude` (Claude Code) on PATH.
# TORCH_INDEX overrides the torch wheel index (default CUDA 12.4).
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
API=${1:-}
TTS=$HOME/.cache/tachyon-tts/venv
TORCH_INDEX=${TORCH_INDEX:-https://download.pytorch.org/whl/cu124}
DIA_COMMIT=876125e461a03b157ec905b0fe8b57a0f8b9e7a0   # nari-labs/dia, read 2026-11-04
PY=$ROOT/.venv/bin/python
say() { printf '\n== %s\n' "$*"; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "missing: $1 ($2)"; MISSING=1; }; }

say "system tools"
MISSING=0
need python3 "python3.12+ and python3-venv"
need ffmpeg "apt install ffmpeg"
need ffprobe "apt install ffmpeg"
need node "node 22+: https://github.com/nvm-sh/nvm"
need npm "comes with node"
need git "apt install git"
need claude "Claude Code: https://claude.com/claude-code, then \`claude login\`"
command -v nvidia-smi >/dev/null 2>&1 || echo "note: no nvidia-smi; the Dia voice-over needs CUDA (tools/dia_tts.py)"
if [ "$MISSING" != 0 ]; then echo "install the missing tools, then run this again"; exit 1; fi
python3 -c 'import sys; assert sys.version_info >= (3, 12), sys.version' || { echo "python 3.12+ needed"; exit 1; }
# `venv --help` works without python3-venv on Debian/Ubuntu; ensurepip is what it lacks
python3 -c 'import ensurepip' 2>/dev/null || { echo "python3-venv is missing (apt install python3-venv)"; exit 1; }

say "the spine's venv (.venv): pyyaml, playwright (HTML films), kokoro, soundfile"
cd "$ROOT"
[ -x "$PY" ] || python3 -m venv .venv
"$PY" -m pip install -q --upgrade pip
"$PY" -m pip install -q -e ".[dev]" playwright kokoro-onnx soundfile numpy onnxruntime
"$PY" -m playwright install chromium

say "the TTS venv ($TTS): Dia (voice-over) and faster-whisper (caption pass)"
[ -x "$TTS/bin/python" ] || python3 -m venv "$TTS"
"$TTS/bin/python" -m pip install -q --upgrade pip
# torch first with the CUDA wheels, then Dia from Nari Labs (pinned) and whisper
"$TTS/bin/python" -m pip install -q torch --index-url "$TORCH_INDEX"
"$TTS/bin/python" -m pip install -q "git+https://github.com/nari-labs/dia.git@$DIA_COMMIT" faster-whisper
"$TTS/bin/python" -c 'import torch, dia, faster_whisper; print("torch", torch.__version__, "cuda", torch.cuda.is_available())'

say "Remotion (engines/remotion)"
(cd engines/remotion && npm install --no-audit --no-fund && npx tsc --noEmit)

say "folders"
mkdir -p "$HOME/.tachyon/logs" clients
shopt -s nullglob
for c in clients/*/; do
  if [ -d "$c/assets" ]; then echo "client $(basename "$c"): assets present"; else echo "client $(basename "$c"): no assets/ yet (copy the creator's zip there)"; fi
done
shopt -u nullglob

say "the Worker"
if [ -z "$API" ]; then
  echo "no Worker URL given: run \`.venv/bin/python -m spine.worker login https://tachyon.<account>.workers.dev\` when you have it"
elif [ -f "$HOME/.tachyon/worker.json" ]; then
  echo "signed in already ($HOME/.tachyon/worker.json); \`.venv/bin/python -m spine.worker login $API\` to change it"
else
  "$PY" -m spine.worker login "$API"
fi

say "the service"
mkdir -p "$HOME/.config/systemd/user"
# the checkout's path and its venv's python, whatever the template says
# a user unit gets a minimal PATH: jobs run claude, node and npx (often under nvm or ~/.local/bin).
# nvm's folder names the node version: after a node upgrade, run this script again.
UNIT_PATH="$(dirname "$(command -v claude)"):$(dirname "$(command -v node)"):/usr/local/bin:/usr/bin:/bin"
sed -e "s#%h/Projects/tachyon#$ROOT#" -e "s#/usr/bin/python3#$PY#" -e "/^\[Service\]/a Environment=\"PATH=$UNIT_PATH\"" \
  deploy/tachyon-worker.service > "$HOME/.config/systemd/user/tachyon-worker.service"
if err=$(systemctl --user daemon-reload 2>&1); then
  echo "start it with: systemctl --user enable --now tachyon-worker  (and loginctl enable-linger $USER to keep it up without a session)"
else
  echo "systemctl --user daemon-reload failed: $err"
  echo "the unit is written; with no user session (SSH without linger), run \`loginctl enable-linger $USER\`, log in once, then systemctl --user enable --now tachyon-worker"
fi
echo "done"
