#!/usr/bin/env bash
# A PC as a Tachyon host (docs/CLOUDFLARE-PLAN.md, phase 8): everything a generation needs,
# then the sign-in and the service. Run from the checkout, as the user who will run it:
#
#   git clone git@github.com:BloodyDeathRoll/tachyon.git ~/Projects/tachyon
#   cd ~/Projects/tachyon && deploy/setup-pc.sh https://tachyon.<account>.workers.dev
#
# Idempotent: every step checks what is there. What it does not do: install the system
# packages (it says which are missing), copy a client's assets (a zip from the creator goes
# to clients/<c>/assets/, by hand; nothing else of the client is needed, pull() fetches it),
# or sign in for you (the last step opens the question).
#
# Needs: Ubuntu-like Linux, python3.12+, python3-venv, ffmpeg, node 22+ (nvm is fine), git,
# an NVIDIA GPU with CUDA for the voice-over (Dia); `claude` (Claude Code) on PATH.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
API=${1:-}
TTS=$HOME/.cache/tachyon-tts/venv
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
[ "$MISSING" = 0 ] || { echo "install the missing tools, then run this again"; exit 1; }
python3 -c 'import sys; assert sys.version_info >= (3, 12), sys.version' || { echo "python 3.12+ needed"; exit 1; }

say "the spine's venv (.venv): pyyaml, playwright (HTML films), kokoro, soundfile"
cd "$ROOT"
[ -x .venv/bin/python ] || python3 -m venv .venv
.venv/bin/python -m pip install -q --upgrade pip
.venv/bin/python -m pip install -q -e ".[dev]" playwright kokoro-onnx soundfile numpy onnxruntime
.venv/bin/python -m playwright install chromium >/dev/null

say "the TTS venv ($TTS): Dia (voice-over) and faster-whisper (caption pass)"
[ -x "$TTS/bin/python" ] || python3 -m venv "$TTS"
"$TTS/bin/python" -m pip install -q --upgrade pip
# torch first with CUDA wheels, then Dia from Nari Labs and whisper
"$TTS/bin/python" -m pip install -q torch --index-url https://download.pytorch.org/whl/cu124
"$TTS/bin/python" -m pip install -q "git+https://github.com/nari-labs/dia.git" faster-whisper
"$TTS/bin/python" -c 'import torch, dia, faster_whisper; print("torch", torch.__version__, "cuda", torch.cuda.is_available())'

say "Remotion (engines/remotion)"
(cd engines/remotion && npm install --no-audit --no-fund >/dev/null && npx tsc --noEmit)

say "folders"
mkdir -p "$HOME/.tachyon/logs" clients
for c in clients/*/; do
  [ -d "$c/assets" ] && echo "client $(basename "$c"): assets present" || echo "client $(basename "$c"): no assets/ yet (copy the creator's zip there)"
done

say "the Worker"
if [ -z "$API" ]; then
  echo "no Worker URL given: run \`python3 -m spine.worker login https://tachyon.<account>.workers.dev\` when you have it"
elif [ -f "$HOME/.tachyon/worker.json" ]; then
  echo "signed in already ($HOME/.tachyon/worker.json); \`python3 -m spine.worker login $API\` to change it"
else
  python3 -m spine.worker login "$API"
fi

say "the service"
mkdir -p "$HOME/.config/systemd/user"
sed "s#%h/Projects/tachyon#$ROOT#" deploy/tachyon-worker.service > "$HOME/.config/systemd/user/tachyon-worker.service"
systemctl --user daemon-reload
echo "start it with: systemctl --user enable --now tachyon-worker  (and loginctl enable-linger $USER to keep it up without a session)"
echo "done"
