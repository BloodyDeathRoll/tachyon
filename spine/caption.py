"""The post text (caption.txt): one structure for every post, planned, generated or uploaded.

    python -m spine.caption write <client> <slot>    # an uploaded video: write its caption from the video

Structure (the operator's edited w44 captions, 2026-10-28):

    Hook: one short line, a question or a plain statement. The CTA may sit on it.

    One to three short paragraphs: what the video shows, in plain surfer words.

    A closing line of facts from product.md (spots, 16 days out, four updates a day, free).
    CTA, if not on the hook line: "rosa.surf, link in bio." (endings may vary)
    .
    .
    .
    #three #hashtags #here

Never: data-source credits (NOAA, ECMWF, CC-BY ...), model or tech names, URLs other than
rosa.surf, "comment for the link".
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from . import clients as C

ROOT = Path(__file__).resolve().parent.parent
MAX = 2200
SPACER = ".\n.\n."

RULES = """The caption follows this structure exactly (it matches every post already live):

<hook: one short line, a question or a plain statement; the CTA may sit at its end>

<one to three short paragraphs: what the video shows, in plain surfer words>

<a closing line of facts from product.md, e.g. "3,056 spots, 16 days out, four updates a day. Free.">
<the CTA here if it is not on the hook line>
.
.
.
#three #hashtags #only

The CTA lands on rosa.surf; vary the ending: "rosa.surf, link in bio.", "Free at rosa.surf, link in bio.",
"rosa.surf/charts, link in bio.", "Link in bio.". Never write data-source credits or licences
(NOAA, ECMWF, GFS, DWD, Open-Meteo, OISST, EOT20, CC-BY), model names, API or other technical
terms, URLs other than rosa.surf, or "comment for the link". Short, casual, no em dashes."""

# lines that are credits or tech talk, never in a caption (operator deleted them, 2026-10-28)
TECH = re.compile(r"\b(NOAA|ECMWF|GFS|GFS-Wave|DWD|GWAM|Open-Meteo|OISST|EOT20|CC-BY|Copernicus|"
                  r"licen[cs]e|API|JSON|Remotion|Pixabay)\b", re.I)
HASHTAG_LINE = re.compile(r"^(#[\w]+)( #[\w]+){2}$")
COMMENT_FOR = re.compile(r"comment\s+\S+\s+(for|to get)", re.I)


def usual_tags(client: str) -> list[str]:
    """The client's three most used hashtags across its captions (for a caption that has none)."""
    from collections import Counter
    n = Counter()
    for f in (C.client_dir(client) / "posts").glob("*/caption.txt"):
        last = (f.read_text().strip().split("\n") or [""])[-1]
        if HASHTAG_LINE.match(last):
            n.update(last.split())
    return [t for t, _ in n.most_common(3)] if len(n) >= 3 else []


def normalize(text: str, fallback_tags: list[str] | None = None) -> str:
    """Repairs what can be repaired without writing anything new: drops credit / tech lines,
    trims spaces, keeps one blank line between paragraphs, puts the dots spacer right
    above the hashtag line (the client's usual three when the caption has none)."""
    lines = [l.rstrip() for l in text.replace("\r\n", "\n").strip().split("\n")]
    lines = [l for l in lines if not TECH.search(l)]
    tags = []
    while lines and (lines[-1].startswith("#") or lines[-1] in ("", ".")):
        l = lines.pop()
        if l.startswith("#"):
            tags = l.split() + tags
    body = re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()
    out = body + "\n" + SPACER
    tags = tags or list(fallback_tags or [])
    if tags:
        out += "\n" + " ".join(tags)
    return out + "\n"


def lint(text: str) -> list[str]:
    """Problems that keep a caption off the structure; empty means it fits."""
    t = text.strip()
    issues = []
    if len(t) > MAX:
        issues.append(f"{len(t)} characters, Instagram allows {MAX}")
    lines = t.split("\n")
    if len(lines) < 5 or "\n".join(lines[-4:-1]) != SPACER:
        issues.append("no '.' '.' '.' spacer right above the hashtags")
    if not lines or not HASHTAG_LINE.match(lines[-1]):
        issues.append("the last line must be exactly three hashtags")
    if "rosa.surf" not in t.lower() and "link in bio" not in t.lower():
        issues.append("no CTA (rosa.surf or link in bio)")
    bad = sorted({m.group(0) for m in TECH.finditer(t)})
    if bad:
        issues.append(f"credits or tech words: {', '.join(bad)}")
    if COMMENT_FOR.search(t):
        issues.append("asks people to comment for the link")
    if "—" in t:
        issues.append("em dash")
    return issues


def _claude(prompt: str, timeout: int = 10 * 60) -> str:
    r = subprocess.run(["claude", "-p", prompt, "--allowedTools", "Read", "--permission-mode", "acceptEdits"],
                       cwd=ROOT, capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        raise RuntimeError(f"claude failed: {(r.stderr or r.stdout).strip()[-400:]}")
    return r.stdout


def _between(out: str) -> str:
    m = re.search(r"<caption>\s*(.*?)\s*</caption>", out, re.S)
    if not m:
        raise RuntimeError("no <caption> in the answer")
    return m.group(1)


def ensure(client: str, text: str, context: str = "", ask=None) -> str:
    """Normalise; if it still does not fit and `ask` is given, have Claude fix it (once)."""
    tags = usual_tags(client)
    t = normalize(text, tags)
    issues = lint(t)
    if not issues or ask is None:
        return t
    c = f"clients/{client}"
    fixed = ask(f"""Rewrite this Instagram caption so it fits the structure. Keep its meaning and wording
where you can. Read {c}/brand.md and {c}/product.md first (numbers only from product.md).
{RULES}

Problems now: {'; '.join(issues)}
{context}
Caption:
<caption>
{text.strip()}
</caption>

Answer with the fixed caption between <caption> and </caption> and nothing else.""")
    return normalize(_between(fixed), tags)


# ── uploads: read the video, write the caption ───────────────────────────────
WHISPER_PY = Path.home() / ".cache" / "tachyon-tts" / "venv" / "bin" / "python"   # has faster_whisper


def frames(video: Path, out: Path, n: int = 6) -> list[Path]:
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                                str(video)], capture_output=True, text=True, check=True).stdout.strip() or 0)
    paths = []
    for i in range(n):
        p = out / f"frame-{i + 1}.jpg"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{dur * (i + 0.5) / n:.2f}", "-i", str(video),
                        "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "4", str(p)], check=True)
        paths.append(p)
    return paths


def transcript(video: Path) -> str:
    """What is said in the video ('' when nothing is, or speech-to-text is not installed)."""
    if not WHISPER_PY.exists():
        return ""
    # audio decoded by ffmpeg (that venv's PyAV cannot open files), 16 kHz mono float
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
                         capture_output=True, timeout=5 * 60).stdout
    if not pcm:
        return ""
    code = ("import sys,numpy as np;from faster_whisper import WhisperModel;"
            "a=np.frombuffer(sys.stdin.buffer.read(),dtype=np.float32);"
            "m=WhisperModel('small',device='cpu',compute_type='int8');"
            "s,_=m.transcribe(a,vad_filter=True);print(' '.join(x.text.strip() for x in s))")
    r = subprocess.run([str(WHISPER_PY), "-c", code], input=pcm, capture_output=True, timeout=10 * 60)
    r.stdout = r.stdout.decode(errors="replace")
    said = r.stdout.strip() if r.returncode == 0 else ""
    return said if len(said.split()) >= 4 else ""   # music alone comes back as a stray "you"


def write_for_upload(client: str, slot: str, ask=_claude) -> str:
    d = C.client_dir(client)
    sd = d / "posts" / slot
    video = sd / "video.mp4"
    c = f"clients/{client}"
    with tempfile.TemporaryDirectory() as tmp:
        shots = frames(video, Path(tmp))
        said = transcript(video)
        out = ask(f"""You write the Instagram caption for a Reel the operator uploaded for "{client}".
Read {c}/brand.md, {c}/product.md and {c}/strategy.md, and a few {c}/posts/*/caption.txt to hear the voice.
Look at these frames from the video, in order: {', '.join(str(p) for p in shots)}.
{('What is said in the video: ' + said) if said else 'Nothing is said in the video.'}
Write about what the video actually shows; numbers only from product.md.
{RULES}

Answer with the caption between <caption> and </caption> and nothing else.""")
    if (sd / "caption.txt").exists() and (sd / "caption.txt").read_text().strip():
        return (sd / "caption.txt").read_text()   # the operator wrote one meanwhile: theirs stands
    text = ensure(client, _between(out), ask=ask)
    (sd / "caption.txt").write_text(text)
    return text


def main(argv: list[str]) -> int:
    if len(argv) == 3 and argv[0] == "write":
        try:
            print(write_for_upload(argv[1], argv[2]))
            return 0
        except Exception as e:  # noqa: BLE001 — the video stays; the operator can write the text
            print(f"caption failed: {e}", file=sys.stderr)
            return 1
        finally:
            (C.client_dir(argv[1]) / "posts" / argv[2] / "caption.writing").unlink(missing_ok=True)
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
