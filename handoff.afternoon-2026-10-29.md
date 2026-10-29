# Session Handoff — 2026-10-29 (afternoon)

(Earlier handoffs today, all uncommitted work in the same files — read before committing:
`handoff.polish-2026-10-29.md` (dashboard polish, the one this session started from),
`handoff.pause-2026-10-29.md` (Pause/Play + revise), `handoff.cloudflare-2026-10-29.md` (Cloudflare plan).)

## Goal
Live dashboard UX fixes asked by the user on the rosa dashboard (port 8765), plus two pipeline
features: Instagram music defaults matched to the client, and varied motion styles for generated reels
(from prompt-motion.com) with a visible style tag.

## Current State
- **Nothing committed. No PR.** Edits made in this worktree (branch `cloudflare-plan`) and copied by
  `cp` into the main checkout `~/Projects/tachyon` (branch `main`, dirty), which runs the live dashboard,
  cron and pipeline. A pull/reset there wipes it.
- Dashboard restarted after each change: `setsid nohup python3 -m spine.review.app` from
  `~/Projects/tachyon`, log `~/.tachyon/logs/review.log`. Kill via `ss -ltnp | grep ':8765 '` pid only.
- Tests (last run): test_dashboard + test_dashboard_v3: 92 pass, 3 fail — all pre-existing:
  `test_schedule_times_are_editable`, `test_posts_per_day_add_and_remove` (2 h timezone),
  `test_instagram_track_plays_with_the_video` (ig_sync removed last session; user never answered
  delete-or-invert). test_tracks 8 pass, test_week_motion 2 pass.
- **No UI change was clicked through in a browser by me.** Verified by curl/grep, `node --check` on
  JS, and tests only. User viewed several and reacted (screenshots), not all.
- Motion styles: wired into `spine/week.py` plan + film prompts, `spine/revise.py` notes prompt.
  **Never run end to end** (no week plan / film / revise run with a style yet).

## Active Files
- `spine/review/app.py`: all dashboard UI changes (picker `DTP_JS`, CSS, pickup morph, music search, style pill).
- `spine/tracks.py`: `ig_queries()`, `ig_picks()`; `list_tracks(source="instagram")` with no query → picks.
- `spine/week.py`: `MOTION`, `motion_styles()`, `pick_motion()`, `motion_block()`; plan/film prompts.
- `spine/revise.py`: `_motion_intro()` in `_prompt()` (lazy `from . import week` — circular import).
- `tools/motion_catalogue.py` (new): scrape prompt-motion.com → `engines/remotion/motion.yaml`; `--label` names styles via `claude -p`.
- `engines/remotion/motion.yaml` (new, generated): 88 styles {id, style, title, tags, url, prompt}.
- `tests/test_tracks.py`: + `test_default_list_is_the_clients_sound_not_local_top_searches`.
- `tests/test_week_motion.py` (new): style uniqueness/recent rule; asked-by-name may repeat.
- `tests/test_dashboard.py`: one assert "Nothing new" → "No posts found" (user changed the wording).
- Memory: `~/.claude/projects/-home-shahar-Projects-tachyon/memory/prompt-motion-library.md` + MEMORY.md line.

## Changes Made This Session
1. Answered: approved videos still publish without Claude tokens (publish cron uses Graph API only);
   `spine.week auto`, captions and revise need Claude.
2. Custom time picker: replaced Firefox native datetime popup (can't be spaced/coloured) with own JS
   picker `DTP_JS` (progressive: converts `input[type=datetime-local]` to hidden + `.dtf` button + `.dtp`
   calendar). Mon-first weeks, lime selected day, past days disabled, hour + 5-min selects.
3. Custom time layout (user iterated 3x): final = clicking Custom time hides the whole CTA row
   (`.whentools:has(details.cust[open])>:not(details){display:none}`), date + Save left-aligned;
   no X button; click outside the form = Save (only if value changed, else just closes).
   Month arrows fixed: redraw detached the clicked node, so outside-check uses `e.composedPath()`.
4. Selected state of all animated selectors (`.seg`, `.filt`, `.segind`): `#2d2d2d` bg, white text (app.py ~588).
5. Instagram music: default list = client searches (`ig_queries` key in tracks.yaml, else library
   moods), interleaved/deduped; trending only if client has none. Hint "Picked for Rosa: …".
   Search-as-you-type (350 ms debounce, fetch same page, swap `#music .tracks` + `.hint`);
   AUDIO_JS made delegated. No IG suggestion endpoint exists → "autocomplete" = live results.
6. Motion styles (user: "add it to the pipeline for versatility"): cause of sameness was the film
   prompt telling every film to copy Showreel's language. Now each plan item gets `motion` id, unique
   in the week, not in last 30 posts (`RECENT_MOTION`), unless operator instructions name its `style`.
   Film prompt injects the style prompt as motion language, adapt-never-copy (site says content
   belongs to creators; no licence). Catalogue skips prompts <120 chars and Characters/Photos/Music tags.
7. Style tag: `style` names (2-3 words) generated once by `claude -p`; kept on refresh. Grey pill
   `.mpill` across from the card title; pre-style posts show "House look". Revise prompt knows the
   current style and can switch + write `motion` into meta.json. Some names repeat (e.g. "Kinetic shape type" x2).
8. "Your call" → "Review" (user picked from options).
9. Performance "Updating" tag: flush top-right of card, radius `0 17px 0 12px`, lime bg (applies to every `.upd`).
10. Pickup: not a bug — runs hourly at :17 via insights cron; user's reel at 14:56 missed the 14:17 run.
    Asked the user whether to move it to every 10 minutes; no answer.
11. "Look for manual posts" morphs (blur/slide, 4.6 s) into "N posts found" + drawn green check, or
    "No posts found" / "Could not reach Instagram"; inert (disabled + pointer-events none) ~4.3 s;
    `?picked=` stripped from URL so reload doesn't replay.
12. `.linkbtn:hover` red → `var(--lime-ink)` (#3D6B00). `.btn.danger` stays red.
13. Performance Custom range modal now uses the same picker (DTP_JS handles `input[type=date]` too,
    wrapper `.dtw`, min/max respected, day click closes, label re-click guarded).

## Failed Attempts
- Right-aligned absolute form under Custom time (`:has()` padding-bottom 56px): user said "looks weird"; replaced.
- `.whentools form{display:contents}` (app.py ~355) silently killed the old absolute positioning of the custom form — check it before positioning anything in `.whentools`.
- Implicit f-string concat after a `+ (...)` expression → SyntaxError; deploy killed the server and it didn't restart for one cycle. Run tests before `cp` + restart.
- A JS comment containing "Custom time" broke `test_publish_now_turns_into_publishing` (asserts the text is absent on the page). Avoid UI label words in inline JS/CSS comments.
- prompt-motion.com: 145 of 233 prompts are one-liners like "make a similar version" — useless; filtered out.

## Next Step
1. Ask the user: (a) delete or invert `test_instagram_track_plays_with_the_video`; (b) pickup every 10 min?
2. Before committing: reconcile all four handoffs' work (same files: app.py, revise.py, state.py,
   week.py), branch from main, commit, PR, GitHub agent review (user rule 6). Do not merge.
3. Verify motion styles end to end on one slot: `python3 -m spine.week` plan for a test week, or a
   single `produce()`; check `meta.json` "motion" and the pill.
4. Follow-ups not asked: duplicate style names in motion.yaml; manual uploads get no style;
   music queries "funk"/"pop" are broad — user may set `ig_queries` in `clients/rosa/assets/music/tracks.yaml`.
