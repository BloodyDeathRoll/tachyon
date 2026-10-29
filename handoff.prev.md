# Session Handoff — 2026-10-28

## Goal
Tachyon = VP-of-marketing engine for Rosa (@rosasurfapp): Remotion reels → local dashboard → Instagram Graph API publish + insights.
This session: fix the silent-reel incident (w44-10), add Remove from Instagram, move the live system out of the worktree,
one caption structure for all posts (+ captions written from uploaded videos), auto pickup of reels posted straight to Instagram.

## Current State
- **Live system now runs from `~/Projects/tachyon`** (main checkout, `main` at c8a5021): cron (all 4 jobs), dashboard
  (`.venv/bin/python -m spine.review.app 8765` → http://127.0.0.1:8765/rosa), all videos/DB/assets/exports (copied byte-identical, 113 mp4).
  `.env.local` token there too. New `.venv` there (same 45 packages).
- The superset worktree (`/home/shahar/.superset/worktrees/tachyon/planning-new-project-vast-f8736c16`) = code only. Its
  data copy is STALE (also has a test-only slot 2026-w44-15 from a pickup trial). Never run the dashboard/cron from it.
- PRs #17–#20 merged (agent-reviewed + audited each). Remote branches deleted. Tests: 176 pass with
  `TACHYON_TZ=UTC .venv/bin/python -m pytest -q` (in ~/Projects/tachyon).
- Picked Instagram songs are baked into the MP4 (downloaded `ig-track.m4a`); `audio_configuration` is never sent.
  Queued w43-04, w44-01/02/07/09/12 re-mixed with their picked songs; sound verified (peak ~0 dB). NOT yet verified on a
  real publish: w44-07 was due 2026-10-28 20:30 local — check it went out WITH sound.
- Instagram shows these as "Original audio", not the song name (consequence of baking).
- w44-10: operator removed it from Instagram and then deleted it in the dashboard (folder in `clients/rosa/trash/`);
  its tracked files show as deleted in git in ~/Projects/tachyon (operator's action, uncommitted).
- Auto pickup live: operator's hand-posted reel imported as **2026-w44-15** (MEASURING, cover only: Instagram withholds
  `media_url` for reels with licensed songs).
- Caption structure (PR #18) live for planner, Add new → Generate, and uploads; upload captions are written in the background
  (frames + faster-whisper speech) — merged but not yet run through a real dashboard upload.
- Uncommitted in ~/Projects/tachyon: `handoff.md`, `handoff.md.local-backup`, `clients/rosa/posts/2026-w44-13/bio_link_handoff.md`
  (obsolete), w44-10 deletions. In worktree: `engines/remotion/src/films/film-2026-w44-13.tsx` (not from this session),
  `engines/remotion/src/oneoff/` (not from this session).

## Active Files
- `spine/publisher/spec_check.py` — `max_volume()`; refuses silent audio (< -50 dB) at QA and publish.
- `spine/tracks.py` — `ig_song()` (local copy or re-download of the picked IG song); `apply()` bakes it in.
- `spine/publisher/publish.py` — no `audio_configuration`; `remove_live()` (DELETE media; 100/33 = already gone → REMOVED).
- `spine/publisher/graph.py` — `Graph.delete`.
- `spine/state.py` — new `REMOVED` state (from PUBLISHED/MEASURING/ANALYZED).
- `spine/measure/insights.py` — skips REMOVED; `run()` calls pickup first (fail-soft).
- `spine/caption.py` — RULES, `lint`, `normalize` (strips credits/tech lines, spacer, usual 3 hashtags), `ensure`,
  `write_for_upload` (frames + `transcript()` via `~/.cache/tachyon-tts/venv` faster_whisper, audio piped from ffmpeg).
- `spine/week.py`, `spine/manual.py` — plan prompt carries caption RULES; captions normalised; upload spawns `python -m spine.caption write`.
- `spine/pickup.py` — import/link unlinked recent Reels (since oldest linked post, ≤5 per run, under publish lock; no-file reels = cover only).
- `spine/review/app.py` — Remove from Instagram card, REMOVED tag, cover-only player, "Look for manual posts" link on schedule card (`POST /<c>/pickup` → `?picked=<found>-<failed>`).
- `clients/rosa/brand.md` — no data attribution in captions.
- tests: `test_publish.py`, `test_tracks.py`, `test_caption.py`, `test_pickup.py`, `test_dashboard.py` additions.
- Memory: `data-lives-in-main-checkout.md`.

## Changes Made This Session
1. Committed operator's 15 caption edits.
2. Built laptop zip `~/tachyon-laptop-2026-10-28.zip` (demo only, no cron; contains the real token at operator's request).
3. w44-10 published silent: `audio_configuration` accepted by Meta, song not attached. Added silence gate (spec_check), Remove from Instagram, REMOVED state.
4. Operator rejected both "block" and "switch to library song": the picked IG song must be what goes out → bake the downloaded song into the MP4, stop sending `audio_configuration` (#17).
5. Moved live system + data from worktree to ~/Projects/tachyon (cron paused during copy, verified identical, cron repointed).
6. Caption structure from operator-edited captions; banned the NOAA/ECMWF/CC-BY credits line the operator kept deleting; upload captions from video (#18).
7. Auto pickup + "Look for manual posts" link (#19); review fixes (cutoff, full-caption match, per-run cap, failure count).
8. Reels with no `media_url` imported cover-only; titles = first caption sentence (#20).

## Failed Attempts
- `audio_configuration` (Audio API) at publish: Meta returned success, reel went out silent. Docs say nothing; PLAN.md's "verified working 2026-10-25" was never a real post. Don't rely on it.
- Proposing a block (silent gate alone) or swapping to library songs: operator furious. The picked song must play. Solve, don't block, no excuses.
- `pkill -f "spine.review.app 8765"` inside a Bash command kills the calling shell (pattern matches its own cmdline) → exit 144. Use TaskStop on the task id, or kill by port: `ss -ltnp | grep ':8799 '`.
- `git checkout -- spine/publisher/publish.py` to undo one change wiped other uncommitted work (remove_live) — re-added by hand.
- faster_whisper in tachyon-tts venv can't open files (PyAV `metadata_errors` TypeError) → pipe 16 kHz f32 PCM from ffmpeg. Music-only clips transcribe as "you" → < 4 words = no speech.
- Instagram API omits `media_url` for reels with licensed songs → first live pickup failed until #20.
- The auto `claude-review` run sometimes finishes in ~5 s with no comment; then comment `@claude review` on the PR to get a real review.

## Next Step
1. Check w44-07 (due 2026-10-28 20:30 local) published WITH sound: `sqlite3 ~/Projects/tachyon/clients/rosa/tachyon.db "select state,permalink from posts where slot_id='2026-w44-07'"`, `tail ~/.tachyon/logs/publish.log`; ask operator to confirm audio on the phone.
2. Ask operator: commit/clean the uncommitted items in ~/Projects/tachyon (w44-10 deletions, `bio_link_handoff.md`, `handoff.md.local-backup`)? Who owns worktree `film-2026-w44-13.tsx` / `src/oneoff/`?
3. First real dashboard upload: confirm the caption appears (written in background; errors go to `posts/<slot>/revise.log`).
4. Deferred by operator: Tailscale access from the laptop to the desktop dashboard ("circle back").
5. Carried over: UTC-pinning fixture for 2 TZ-dependent tests (needs OK); comment/DM auto-replies; delete `~/Projects/tachyon-history-backup-2026-10-26.bundle` once safe; 2026-11-21 retry main FB dev account; Meta data access renew before 2027-01-24.
Every merge needs the GitHub agent review on the final commit and an explicit operator OK. No approval carries over.
