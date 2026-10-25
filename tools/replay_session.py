#!/usr/bin/env python3
"""Replay the file-producing tool calls of a Claude Code session transcript (JSONL).

    python3 tools/replay_session.py <session.jsonl> <outdir> [--only reel,mk,audio,pixabay]

Walks the transcript in order and materialises, under <outdir>/files/, every file the
session wrote with the Write tool, applies every Edit (old_string -> new_string) to the
copy, and materialises Bash heredocs of the form `cat > path <<'EOF' ... EOF` (and
`<<EOF`). Files are kept by basename, latest version wins; every earlier version is kept
as <name>.vN. Bash commands that mention the filter words land in commands.log with
their position, so download URLs (Pixabay, fonts) and ffmpeg recipes can be re-run.

This exists because film sources were kept in a session scratchpad that was wiped
(docs/PLAN.md §7). The transcript is the only copy.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

HEREDOC = re.compile(r"cat\s*>\s*(['\"]?)([^\s'\"]+)\1\s*<<\s*-?\s*(['\"]?)(\w+)\3\n(.*?)\n\4(?:\n|$)", re.S)


def iter_tool_uses(path: Path):
    with open(path, errors="replace") as fh:
        for i, line in enumerate(fh):
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            msg = rec.get("message") or rec
            content = msg.get("content") if isinstance(msg, dict) else None
            if not isinstance(content, list):
                continue
            for block in content:
                if isinstance(block, dict) and block.get("type") == "tool_use":
                    yield i, block.get("name"), block.get("input") or {}


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__); return 2
    src, out = Path(argv[0]), Path(argv[1])
    only = argv[argv.index("--only") + 1].split(",") if "--only" in argv else ["reel", "mk", "audio", "pixabay", "film", "render", "showreel"]
    files = out / "files"; files.mkdir(parents=True, exist_ok=True)
    state: dict[str, str] = {}
    versions: dict[str, int] = {}
    log = open(out / "commands.log", "w")
    applied = failed = 0

    def save(name: str, text: str, how: str, pos: int) -> None:
        versions[name] = versions.get(name, 0) + 1
        state[name] = text
        (files / name).write_text(text)
        (files / f"{name}.v{versions[name]}").write_text(text)
        print(f"{pos:7} {how:6} {name} ({len(text)} chars, v{versions[name]})")

    for pos, name, inp in iter_tool_uses(src):
        if name == "Write":
            p = inp.get("file_path", ""); base = os.path.basename(p)
            if any(k in base.lower() for k in only) or any(k in p.lower() for k in only):
                save(base, inp.get("content", ""), "write", pos)
        elif name == "Edit":
            p = inp.get("file_path", ""); base = os.path.basename(p)
            if base in state:
                old, new = inp.get("old_string", ""), inp.get("new_string", "")
                if old and old in state[base]:
                    text = state[base].replace(old, new) if inp.get("replace_all") else state[base].replace(old, new, 1)
                    save(base, text, "edit", pos); applied += 1
                else:
                    failed += 1
                    print(f"{pos:7} edit   {base}: old_string not found ({len(old)} chars)")
        elif name == "Bash":
            cmd = inp.get("command", "")
            low = cmd.lower()
            if any(k in low for k in only) or "ffmpeg" in low or "curl" in low or "wget" in low:
                log.write(f"\n# ---- line {pos} ----\n{cmd}\n")
            for m in HEREDOC.finditer(cmd):
                base = os.path.basename(m.group(2))
                if any(k in base.lower() for k in only) or any(k in m.group(2).lower() for k in only):
                    save(base, m.group(5), "heredc", pos)
    log.close()
    print(f"\n{len(state)} files · edits applied {applied}, failed {failed} · commands.log written")
    for n in sorted(state):
        print(f"  {n:34} {len(state[n]):8} chars  v{versions[n]}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
