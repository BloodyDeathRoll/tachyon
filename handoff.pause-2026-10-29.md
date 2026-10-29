# Session Handoff — 2026-10-29

(The previous handoff in this file, from the Cloudflare planning session, was saved to
`handoff.cloudflare-2026-10-29.md`.)

## Goal
Three things on the dashboard and the revise pipeline:
1. A Pause/Play control on a scheduled video.
2. Debug why "new version" for rosa `2026-w44-03` returned the same clip.
3. Replace w44-03 with a new idea.

## Current State
- **Everything is uncommitted.** It lives in the worktree `live-tiles` (this worktree) AND was copied into the main checkout `~/Projects/tachyon`. The dashboard (port 8765) runs from the main checkout. A `git pull` or reset there wipes it. No PR exists.
- **Pause/Play works in tests.** It was checked once by screenshot (icon-only pause beside the date). The paused view and the play flow were never clicked in a real browser.
- **Revise fixes are in place and tested:**
  - A run that changes nothing makes no render and shows "No new version".
  - A rewritten voice-over script is re-recorded.
  - The pipeline type-checks the film itself.
  - The agent runs in `engines/remotion` with `--add-dir` (verified once with a real `claude -p`).
- **w44-03 "Everything's free" is rendered** and in NEEDS_APPROVAL; the user has not reviewed it.
  - Voice-over: Dia `seed8`, one take, starts at 1.1 s.
  - Words were verified with whisper; loudness looked even, but nobody has listened to it.
- **DB columns `angle` / `hook_formula` for w44-03 are still the old "No account" text.** Only meta.json and brief.md were updated.
- **Tests:** two failures already on HEAD, both timezone-related:
  - `test_schedule_times_are_editable`
  - `test_posts_per_day_add_and_remove`
- **Another session edited `spine/review/app.py` in THIS worktree at 08:18.** The "Your call" card now has "Ask for new version", which breaks `test_video_page_has_decision_text_preview_and_qa_link`. That change is not mine and is not in the main checkout. Find its owner before committing `app.py`.
- HEAD of `live-tiles` moved to `02ce278` (Cloudflare plan commit) during the session.

## Active Files
- `spine/state.py`: new state `PAUSED` (APPROVED/QUEUED → PAUSED → QUEUED/NEEDS_APPROVAL/REJECTED/MANUAL_HANDOFF).
- `spine/schedule.py`, `spine/db.py`, `spine/publisher/publish.py`, `dashboard/data.py`: PAUSED is added to ACTIVE, MOVABLE, HAND_FROM and the scheduled group.
- `spine/review/app.py`:
  - `hold_button()` and `overdue()`.
  - pause/resume actions; `Handler._publish_now()` extracted.
  - "Paused" tag, pause icon on cards and the calendar.
  - date line reads "Paused <date>" or "Paused, overdue".
  - "No new version" error card.
- `spine/revise.py`: `_vo_intro`, `NoChange`, `_snapshot`, `_revoice`, `_typecheck`, the "voicing" step, and the edit cwd and `--add-dir`.
- `spine/voice.py`: `import soundfile` moved to the Kokoro branch, because the dashboard's system python3 has no soundfile.
- `tests/test_dashboard.py`: new tests: `test_pause_and_play`, `test_edit_that_changes_nothing_is_not_a_new_version`, `test_rewritten_voiceover_is_recorded_again`, `test_edit_that_breaks_the_types_is_not_rendered`, `test_edit_runs_in_remotion_with_the_repo_added`.
- Main checkout only:
  - `clients/rosa/posts/2026-w44-03/{caption.txt,meta.json,brief.md,vo.wav,video*.mp4}`; old cuts are in `versions/v4`, `v5`.
  - `engines/remotion/src/films/film-2026-w44-03.tsx`: new film, `T` retimed to the voice-over words.

## Changes Made This Session
1. Publish now: verified that it moves `scheduled_at` to now and spawns `spine.publisher.publish <client> <slot>` at once.
2. Pause/Play:
   - Built as a new state rather than a flag. `publish_slot` already refuses non-QUEUED, and `set_state` blocks PAUSED→PUBLISHING, so cron cannot publish a paused video.
   - A paused video keeps its slot.
   - Play with the time ahead → QUEUED; with the time passed → move to now + publish (with a confirm).
   - The user then asked for: pause as an icon only, beside the date, and the date line reading "Paused <date>" or "Paused, overdue".
3. w44-03 debug: the revise agent replied "I made no changes" (the voice-over was a fixed `vo.wav` it could not change), yet the pipeline rendered the same film and set NEEDS_APPROVAL as a new version.
4. Revise fixes:
   - no-change detection;
   - the voice-over script can be edited → re-recorded in one take, same voice;
   - `vo.wav` is kept in versions;
   - a re-run after a voice-over failure re-records it.
5. w44-03 new idea: the user picked "Everything's free" with "live cams" and no cam count. Fed it through the fixed revise flow (notes POSTed to `/rosa/v/2026-w44-03/decide` action=reject).
   - The agent could not run tsc/still (permission refused) and guessed the beat times.
   - I retimed `T` to the whisper word times (VO start 0.5 → 1.1), type-checked, re-rendered with `python3 -m spine.revise render rosa 2026-w44-03`, and rewrote the caption, title and brief.
6. The user said "YES, fix" for the agent checks.
7. Memory `voiceover-style.md` updated: on 2026-10-29 the user said Dia is fine, keep it consistent, no half-yelling. The Gemini VO scripts had been moved to Trash that morning.

## Failed Attempts
- **`firefox --headless --screenshot` to the scratchpad or /tmp fails** ("Could not find profile folder"), because it is the snap Firefox. It works with the profile and output under `~/snap/firefox/common/...`.
- **`pkill -f "python3 -m spine.review.app"` inside a bash -c also killed the calling shell** (exit 144) and took the dashboard down. Use `kill $(pgrep -f '^python3 -m spine.review.app')`. Restart with `(setsid nohup python3 -m spine.review.app >> ~/.tachyon/logs/review.log 2>&1 < /dev/null &)` from `~/Projects/tachyon`.
- **faster_whisper in `~/.cache/tachyon-tts/venv` cannot open files** (`av.open` metadata_errors TypeError). Feed it a numpy float32 16 kHz array decoded by ffmpeg. `.venv` has no faster_whisper.
- **The revise agent with cwd=ROOT was refused `npx tsc` and `npx remotion still`.** Now fixed via cwd=REMOTION + `--add-dir ROOT`.
- **A wrapper `<div class=wbig>` around the date broke the regex in `test_unslotted_video_shows_on_the_calendar_where_the_page_says`.** Replaced with a CSS grid on `.whenl`, with no wrapper.

## Next Step
1. Ask the user to watch and listen to w44-03 at http://127.0.0.1:8765/rosa/v/2026-w44-03 (voice consistency, beat timing). Do not approve for them.
2. Ask whether to commit: branch from `main` (not `live-tiles`, whose HEAD has the Cloudflare commit), add only the files listed above minus the other session's `app.py` "Ask for new version" change, then open a PR, run the review and report. Don't merge.
3. Open items to raise with the user:
   - DB `angle`/`hook_formula` for w44-03 are stale.
   - Beat timing after a voice-over rewrite is still guessed: the agent cannot hear the voice-over. A possible fix is a second timing pass fed whisper word times.
