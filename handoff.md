# Session Handoff — 2026-10-26

## Goal
Tachyon = VP-of-marketing engine for the client Rosa (@rosasurfapp, rosa.surf): Remotion reels → local
dashboard (approve / edit / schedule) → Instagram Graph API publish + insights. This session: get Meta
access back, then a long run of dashboard features the operator asked for.

## Current State
- `main` at `e8e536b` (PRs #2–#10 merged). Only `main` exists on GitHub. This worktree is **detached at
  origin/main**; `~/Projects/tachyon` (main checkout) fast-forwarded to it.
- Dashboard runs from this worktree: `.venv/bin/python -m spine.review.app 8765` → http://127.0.0.1:8765/rosa
  (restart = kill the `spine.review.app 8765` process, start again). 136 tests pass (`.venv/bin/python -m pytest -q`).
- **Meta**: app `1497581085764373` ("Tachyon", owned by a second FB account, "Rusty James"/hotmail login, in Chrome).
  Page token never expires; Meta cuts **data access 2027-01-24** (renew via Graph Explorer before; dashboard banner from
  2027-01-10). Old blocked app `1150072321350463`, env backup `~/Projects/tachyon/.env.local.old-app-1150072321350463`;
  dev-code block ends 2026-11-21 (banner from 2026-11-22).
- Verified live with the new token: insights (hourly cron, last pull showed 28+6=34 views), DM read, Audio API search.
  **Not yet verified: a real API publish from the queue.**
- Uncommitted in this worktree (operator's dashboard work, not mine to commit without asking): re-render notes applied
  to w44-01…14 films (particles), versions/, revise.json/log, two 16:9 format layouts
  (`film-2026-w44-01-16x9.tsx`, `film-2026-w44-13-16x9.tsx`) registered in `engines/remotion/src/films/formats.ts`,
  grants.yaml, meta/qa files.

## Active Files
- `spine/review/app.py` — dashboard (all UI below).
- `spine/revise.py` — re-render jobs; `settle/retry/dismiss`; uploads get a film on first edit.
- `spine/formats.py` — other formats: claude re-lays the film per ratio, Remotion renders, reel's audio muxed.
- `spine/manual.py` — calendar Add new: `add_upload`, `add_prompt`, `_claim` (locked slot booking), `produce`.
- `spine/week.py` — week prep; batch instructions; `write_item` shared with manual.
- `spine/schedule.py` — `preview_slots` (planned slot for unslotted videos).
- `spine/db.py` — `delete_post`. `spine/state.py` — REJECTED→NEEDS_APPROVAL allowed.
- `engines/remotion/src/lib.tsx` (Phone cx/cy, FORMAT_SAFE), `Root.tsx`, `films/formats.ts`.
- `dashboard/brand/tachyon-logo.svg` — from Figma file zmNUNf8OPDOKDlIeM00ulf, Brand page, node 15:2 (logo dark), bg rects stripped.
- `tests/test_dashboard.py` — most new tests.

## Changes Made This Session
1. Meta workaround: second FB account created app 1497581085764373, joined Rosa Surf business portfolio (Gmail invite),
   token via Graph Explorer; IG messages enabled in Business Suite. Dashboard renewal + switch-back banners.
2. Audio API fixed (response key `audio`). It only covers royalty-free Sound Collection — commercial songs impossible via API.
3. "Posted by hand": link an app-posted reel so it is tracked (`/v/<slot>/byhand`).
4. Overview Views = sum of per-reel counters (account total lagged).
5. Publish safety (7 review rounds): any unclear `media_publish` outcome → MANUAL_HANDOFF, never auto-retried.
6. Repo slimmed: films/media local-only; history rewritten with filter-repo (backup bundle `~/Projects/tachyon-history-backup-2026-10-26.bundle`).
7. Edit after approval (revoke); Instagram-track preview plays with the video and fades out.
8. Failed re-render: error card + Re-run (render-only if edit done); no longer blocks Approve; Remotion `--timeout=180000`.
9. Prepare week popup with batch instructions (prefilled with last; auto run reuses them).
10. Calendar shows unapproved videos at their planned slot; approval takes that same slot. Delete video (button + confirm,
    files → `clients/<c>/trash/`, refused once on Instagram). Calendar nav shows week start.
11. Generate new version (1:1/4:5/2:3/16:9) = real re-layout, not crop (user rejected the crop). ~3 min/format.
12. Calendar Add new on open slots: Upload (fitted 9:16, local only, own sound) or Generate (prompt → plan → produce).
13. Live views tab (polls IG once/min while open; 6 calls measured = 1% quota; in-memory, resets on restart).
14. Selector style: selected = bg `#8df0003d`, text `#487b00`, sliding highlight with overshoot snap (0.34 s).

## Failed Attempts
- Adding any phone in Accounts Center: "temporary error sending text" — block is account-wide.
- Business invites to Hotmail/Outlook never arrived; Gmail worked. Accepting via "Continue with Instagram" binds the
  invite to an IG identity (Page invisible in Graph Explorer) — must use "Continue with Facebook".
- Format crop/blur approach (rejected by user). Selector designs rejected: blue #297cff bg; white pill + lime bar; transparent + bar.
- `gh pr merge --delete-branch` fails here ("main already used by worktree"); use `gh api -X PUT repos/.../pulls/N/merge`.
- Repeated "Start dashboard" background tasks report exit 144 — that is the kill on restart, not a crash.

## Next Step
1. Ask the operator whether to commit the uncommitted film/format/meta changes listed above (they are theirs).
2. Verify a real API publish: approve one video, watch `spine/publisher` queue run (cron every 10 min) and the post appear.
3. Follow-ups: comment/DM auto-replies (switches exist, nothing replies); delete
   `~/Projects/tachyon-history-backup-2026-10-26.bundle` once safe; 2026-11-21 retry main account's developer code.
Every merge needs the GitHub agent review on the final commit and an explicit user OK (none carried over).
