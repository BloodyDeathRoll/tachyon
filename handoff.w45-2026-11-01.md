# Session Handoff — 2026-11-01

(Previous handoff, 2026-10-30 higgs-hook, is in git history: `git log -p -- handoff.md`.)

## Goal
Get Rosa's week W45 (2–8 Nov) made through the automatic system with better animation, and fix
every dashboard/pipeline bug hit on the way (calendar drop, plan YAML, reruns, IG tracks, engines).

## Current State
- GitHub `main` = `d94b590` (PR #36). Main checkout `~/Projects/tachyon` on `d94b590`.
- Open: PR #37 (tests only: every allowed-tools list reaches `claude` whole). Auto review on final
  commit `ca6c628`: "No issues found". A second `@claude` review was requested and was still running.
  Not merged. Worktree is on branch `tool-rules-tests`.
- Dashboard restarted from main checkout at `2156d5d` (PR #35 code). PR #36 changes no dashboard code,
  so no restart needed. Nothing new clicked through in a browser.
- W45: plan exists (`clients/rosa/plans/2026-W45.yaml`, untracked in main checkout). 7 of 13 videos had
  revision notes, most asking for a new script. #04 and #09 reruns failed with
  `claude edit failed: error: unknown option '-m'` → fixed in PR #36. Reruns not pressed since.
- Untested for real: PR #34 learning loop (lessons, style scores, self-check), the Claude HTML engine
  (`spine/render.py`), formats for HTML films, `spine.capture` geo captures inside a film run,
  PR #35 Generate New, Random engine. All covered by tests only.
- Main checkout has uncommitted w44-11 changes (meta.json, qa.md, revise.json, film .tsx, index.ts,
  `engines/remotion/src/lib.tsx`) and untracked W45 plan files. Not ours to commit without a look.

## Active Files
- `spine/review/app.py`: calendar day drop, progress card, IG tracks async, engine picker, Generate New.
- `spine/week.py`: plan YAML repair, rerun reuse of the saved plan, `pick_motion`, engines, `ALLOWED_*`.
- `spine/revise.py`: `tools()` (allowed-tools split fix), `ALLOWED`, `ALLOWED_HTML`, `capture_hint`.
- `spine/lessons.py`: notes → lessons, style scores (redo note bans a style).
- `spine/render.py`: Claude HTML film → frames/mp4 via Playwright (`.venv/bin/python`).
- `spine/capture.py`: live app screenshots, geo override (Charts over the Americas).
- `spine/formats.py`: per-ratio formats, now also HTML films.
- `tests/test_learning.py`, `tests/test_dashboard*.py`: new tests for all of the above.

## Changes Made This Session (2026-10-31 → 11-01)
1. PR #30: drop a video on a day (month view, week header) → first open slot, incl. custom times.
2. PR #31: plan YAML with unquoted `: ` → one Claude repair pass; brief/caption as block scalars.
3. PR #32: rerun reuses the failed run's plan (normalised `at`); items keep their own free slot;
   rerun stops if a slot was taken since. Prepare card: progress, ETA, current video, 30 s refresh.
4. PR #33: Instagram music tab renders instantly, spinner, error text if the list fails.
5. PR #34: learning loop (user's notes into plan/film/self-check prompts, style scores, brief first
   then style, 8-frame self-check) + Claude plain-HTML engine + formats for HTML + capture tool.
   Why: user said motion styles made worse films; one-liner Claude HTML looked far better.
6. PR #35: "Animate with" Claude | Remotion | Templates | Random (default Claude) in Add new,
   Prepare next week, Generate New. Empty prompt = random script. Review card: Approve / Edit /
   Generate New; edit view: Update / Cancel / Generate New. Generate New refused unless pending.
7. PR #36: allowed-tools string was split on spaces → `-m` reached `claude`. `revise.tools()` fix.
8. PR #37 (open): parametrized test over all 5 tool lists.
- PR #25 (stale 10-29 handoff) closed by user request; its branch `handoff-2026-10-29-night` still exists.

## Failed Attempts
- Motion styles as the main look: user rejected most W45 films. Style drove the concept (grids,
  bento bars, tiny app). Proposing to roll back to the house look angered the user: never roll back,
  move forward (styles stay, Claude HTML added).
- Charts captures only showed Europe/Africa; revise could not take a new capture (no permission)
  and returned "No new version" 3 times on #04. Fixed by `spine.capture` + allowed rule in PR #34.
- That rule had spaces → PR #36 bug. Check `--allowedTools` args with the real `claude` CLI.
- Agent review "passed" in 40 s with no comment on PR #36: not a real review. Request `@claude`.
- `@claude` first posts a "working…" placeholder; wait for the job run, not the first comment.
- Dashboard restart was blocked by permissions once; old process had already died.
- Running IG searches in parallel would break an existing order test; user not asked yet, not done.

## Next Step
1. Check PR #37's `@claude` review; report; merge only if the user asks.
2. User presses Re-run on W45 #04 and #09; watch `clients/rosa/posts/2026-w45-04/` revise result.
   This is the first real run of capture + learning loop.
3. Prepare a week (or Generate New) with the Claude engine; inspect the first real HTML film.
4. Open asks: IG search parallel (needs test change, ask); DST drift of slots (10-29 handoff);
   higgs-hook batch `2026-10-30` still waiting for clips; VOs 01/02 mention trips.
5. Review notes left as is: `revise.tools()` regex drops rules with `-`/`.`/`)` (now caught by
   PR #37 test); `formats.py:239` import inside `try`.
