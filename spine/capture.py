"""Real app captures for films (PLAN.md §3 station 2: inputs are real UI, never mockups).

    .venv/bin/python -m spine.capture rosa [--theme dark] [--out clients/rosa/assets/captures/<date>]

Shoots the live app at phone size (390×844, 3× scale → 1170×2532 PNGs, dark theme by URL
param) for a fixed list of screens, and writes `captures.json` beside them with the URL,
time, viewport and page title of each, so provenance.yaml can point at it. Every capture is
a real page of the live product at that moment; numbers on screen are whatever the app
showed (QA re-measures against product.md anyway).
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from playwright.sync_api import sync_playwright

from spine.clients import client_dir

SCREENS = {
    "rosa": [
        ("home", "/"),
        ("spots", "/spots"),
        ("spot-uluwatu", "/spot/uluwatu"),
        ("spot-uluwatu-full", "/spot/uluwatu", True),      # full page, so a film can scroll it
        ("spot-supertubos", "/spot/supertubos"),
        ("spot-pipeline", "/spot/pipeline"),
        ("map", "/map"),
        ("charts", "/charts"),
        ("search", "/search"),
    ],
}
BASE = {"rosa": "https://rosa.surf"}
ONLY: set[str] = set()


def capture(client: str, theme: str = "dark", out: Path | None = None, full: bool = False) -> Path:
    day = datetime.now(timezone.utc).date().isoformat()
    out = out or client_dir(client) / "assets" / "captures" / day
    out.mkdir(parents=True, exist_ok=True)
    manifest = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True,
                            has_touch=True, color_scheme="dark" if theme == "dark" else "light",
                            locale="en-GB", timezone_id="UTC",
                            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")
        # first-run sheets: the sign-in screen and the install prompt hold for a launch once
        # answered "Not now"; answer them before the app boots so we capture the product
        ctx.add_init_script("""try{sessionStorage.setItem('rosa.signin.seen','1');sessionStorage.setItem('rosa.install.seen','1');
          localStorage.setItem('rosa.duplicate.seen','1');localStorage.setItem('rosa.theme','THEME');}catch(e){}""".replace("THEME", theme))
        page = ctx.new_page()
        only = ONLY
        for entry in SCREENS[client]:
            name, path = entry[0], entry[1]
            full_this = full or (len(entry) > 2 and entry[2])
            if only and name not in only:
                continue
            url = f"{BASE[client]}{path}{'&' if '?' in path else '?'}theme={theme}"
            page.goto(url, wait_until="load", timeout=60000)   # spot pages hold a cam stream open; networkidle never comes
            try:
                page.wait_for_load_state("networkidle", timeout=8000)
            except Exception:
                pass
            page.wait_for_timeout(2500)
            f = out / f"{name}.png"
            page.screenshot(path=str(f), full_page=full_this)
            manifest.append({"file": f.name, "url": url, "title": page.title(), "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                             "viewport": "390x844@3x", "theme": theme})
            print(f"{name:16} {page.title()[:60]}")
        b.close()
    mf = out / "captures.json"
    old = json.loads(mf.read_text()) if mf.exists() else []
    merged = {m["file"]: m for m in old}
    merged.update({m["file"]: m for m in manifest})
    mf.write_text(json.dumps(list(merged.values()), indent=1))
    return out


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__); return 2
    theme = argv[argv.index("--theme") + 1] if "--theme" in argv else "dark"
    out = Path(argv[argv.index("--out") + 1]) if "--out" in argv else None
    global ONLY
    ONLY = set(argv[argv.index("--only") + 1].split(",")) if "--only" in argv else set()
    d = capture(argv[0], theme, out, full="--full" in argv)
    print("wrote", d)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
