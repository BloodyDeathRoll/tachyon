# Session Handoff — 2026-11-11

## Goal
Update the Rosa higgs-hook "diver" film's on-screen text, then tidy `clients/rosa/higgs-hook/`
into one folder per script named by its slug (samurai, diver, …).

## Current State
- All work is in the MAIN checkout `~/Projects/tachyon`, branch `higgs-film`.
  branch has no higgs code). Nothing pushed. Commits: `6eefb33`, `6449bd4`, `7ced2fe`, `4910e3d`.
- Diver renders done and frame-checked (before the folder move):
  `clients/rosa/higgs-hook/diver/out/video.mp4`, `video-story.mp4`, `video-16x9.mp4`.
  Joke "Check the swell." / "Then commit." (bottom of the safe area); app line "Check in depth."
  at 130px, left-aligned.
- Not re-rendered after the move to slug folders (render path now `public/higgs/<slug>`).
- `tests/test_higgs.py`: 20 pass. `npx tsc --noEmit` in `engines/remotion` clean.
- Notion "higgs-hook scripts": diver row joke/sections updated; "Repo path" set to
  `clients/rosa/higgs-hook/<slug>` on all 10 script rows.
- Uncommitted in main, not mine: `clients/rosa/grants.yaml`, `clients/rosa/posts/2026-w47-06/meta.json`.

## Active Files (main checkout)
- `spine/higgs.py` — CLI now `check|screens|render <client> <slug> [fmt]`; props pass `app` (from
  `app_line`) and `jokeLow` (from `joke_low`) only when set.
- `engines/remotion/src/higgs/HiggsFilm.tsx` — `app?`, `jokeLow?` props; custom app line set like
  "16 days forecast." (130px, two lines, left); `FILM_DEFAULTS.clips` = `higgs/samurai`.
- `tests/test_higgs.py` — two new props tests; fixture path + call signature changed for slug layout.
- `clients/rosa/higgs-hook/<slug>/` — script.json, script.md (old `nn-name.md`), clips, out/.
- `.claude/skills/higgs-hook/SKILL.md`, `docs/HIGGS-HOOK.md` — slug folders, `render <slug>`.
- `engines/remotion/public/higgs/` (gitignored) — renamed `example-01`→`samurai`, `2026-10-30-02`→`diver`.

## Changes Made This Session
1. Diver joke → "No excuses. / Check the swell!"; added optional `app_line` (per-script
   replacement of "Location is everything.") → "Check in depth.".
2. Joke → "Check the swell / before you commit" (17 chars > `JOKE_MAX` 16); custom app line
   enlarged to 16-days style. Temporarily raised JOKE_MAX to 17 (reverted, never committed).
3. Joke → "Check the swell." / "Then commit." (fits 16); added `joke_low` (joke anchored at
   bottom of safe area, gradient flipped) so it clears the diver's helmet; app line left-aligned.
4. Folder tidy: batch/nn folders → slug folders (slug from script.json), batch `index.md`
   files deleted, Notion Repo paths updated. Why: user demanded videos live under the script
   name (script1 samurai, script2 diver), no dates/numbers.

## Failed Attempts
- Raising `JOKE_MAX` to 17 broke `test_check_catches_bad_scripts` (hardcodes "over 16
  characters"); reverted instead of editing the test.
- A template-literal quote mismatch in HiggsFilm.tsx gradient broke the first render of step 3; fixed.

## Next Step
1. Re-render diver from the new path to confirm the slug layout:
   `cd ~/Projects/tachyon && .venv/bin/python -m spine.higgs render rosa diver both`
2. Open questions for the user (ask, don't assume):
   - Diver caption still says "He checks the swell in depth." — change it?
   - Delete old `clients/rosa/higgs-hook/samurai/out/v7, v8, v9, v9-nomusic, v10-nomusic`?
   - Diver is Notion status "Posted": the live IG post has the old text.
3. Push `higgs-film` / open PR only if the user asks.
