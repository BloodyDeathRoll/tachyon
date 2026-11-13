# Session Handoff — 2026-11-13

## Goal
Rosa videos were publishing and showing at 02:00 Israel time instead of 08:30. Find the real cause
(the user had been told before that it was fixed), fix it, merge and deploy.

## Current State
- Fixed, merged and live. PR #75 squashed to `7baf268` on `main`, remote branch
  `time-error-476fdac3` deleted. Worker deployed from `7baf268`: version
  `64d4628d-4594-4bd0-8d32-f5d59672666c` on https://tachyon.os2.workers.dev.
- Worker tests 95/95 on the deployed commit. The site answers (`/` 302, `/static/*` 200).
- Read through the Worker API after the deploy: all 7 QUEUED Rosa videos are on `06:30` or `18:30` UTC
  (08:30 / 20:30 Israel). The user moved the two that were on 00:01 UTC themselves.
- Rosa's grants: `slots ['06:30', '18:30']`, `timezone Asia/Jerusalem`, `publisher worker`.
- NOT tested in a browser (Firefox first is the user's rule). Only the automated tests ran.
- NOT known: why `2026-w47-01` (slot 2026-11-11T18:30 UTC) published at 2026-11-12T00:01:21 UTC,
  5.5 h late. That late publish is what triggered the bug.
- NOT known: who or what made the moves to 00:01 UTC (journal not read; the Worker API has no
  journal read op).
- Three Python tests fail on `main` without this change and were left alone:
  `tests/test_dashboard.py::test_calendar_places_video_in_its_slot`,
  `tests/test_dashboard.py::test_rewritten_voiceover_is_recorded_again`,
  `tests/test_remote_db.py::test_local_journal_outcome_is_write_once`.
- This worktree is on a detached HEAD at `origin/main` (`7baf268`); `deploy/worker/node_modules` here
  is a symlink to the main checkout's.

## Active Files
- `deploy/worker/src/pages/calendar.ts` — Worker calendar: `week()` rows and open cells, `firstFreeOn()`
  (a drop on a day).
- `spine/review/app.py` — local dashboard, same logic: `render_calendar()`, `_first_free_on()`.
- `deploy/worker/test/calendar.test.mjs` — new test "a late publish's time is not a slot…".
- `tests/test_dashboard_v3.py` — new test `test_a_late_publish_is_not_a_slot`.
- `~/.claude/projects/-home-shahar-Projects-tachyon/memory/worker-deploy-credentials.md` — new memory:
  how to deploy.

## Changes Made This Session
1. Read the live rows through `spine.db.RemoteDB("rosa")` from `~/Projects/tachyon` (PC token in
   `~/.tachyon/worker.json`). Found `w47-04`, `w47-06`, `w47-09` scheduled at exactly `00:01:00` UTC,
   off-slot; `w47-04` published 2026-11-13T00:02 UTC (02:02 Israel).
2. Cause, from code plus that data: the calendar made a row for every video time in the week,
   published ones included. The late publish of `w47-01` (00:01:21 UTC = 02:01 Israel) made a 02:01
   row; every other day got an "Open slot" there, and a drop on a day (`firstFreeOn`) took it first
   because it is the earliest time of the day. `00:01:00` is that publish time cut to the minute; the
   custom-time picker steps 5 minutes and "publish now" keeps seconds, so neither produces it.
   No time-zone conversion was wrong: slots stayed `06:30`/`18:30` UTC.
3. Fix (both implementations): a drop on a day counts only daily slots and the times of videos not yet
   published; a row only a published video made renders `cell open past` with no `data-at`. Kept the
   tested behaviour that a custom-timed, unpublished video's row is a drop target.
4. One regression test per implementation; each fails with the source change reverted and passes with it.
5. PR #75, `@claude review` on the final commit: "No issues found". The user asked for merge and
   deploy on 2026-11-13; merged with `--squash --delete-branch`, then deployed.
6. Deploy: `CLOUDFLARE_API_TOKEN` from `~/Projects/tachyon/.env.local` plus `CLOUDFLARE_ACCOUNT_ID`
   read from `GET /client/v4/accounts`, `npx wrangler deploy` in `deploy/worker`.

## Failed Attempts
- `npx wrangler d1 execute tachyon --remote` with the host `wrangler login`: `database … could not be
  found [code: 7404]`. That login is the personal einhanamer account, not Tachyon's.
- Wrangler with only `CLOUDFLARE_API_TOKEN` set: `Authentication error [code: 10000]`. Wrangler used the
  account id cached from the OAuth login. I wrongly told the user the token had no permission and the
  deploy was blocked. The token is fine (direct API calls listed the `tachyon` Worker, D1 and
  `tachyon-media`); setting `CLOUDFLARE_ACCOUNT_ID` fixed it.
- A wait loop `until ! pgrep -f "pytest tests -q"` never ended: `pgrep -f` matched the loop's own
  command line. The full Python suite takes about 2.5 minutes; run it in the background and read its
  output file.
- First version of the new Worker test went `NEEDS_APPROVAL -> PUBLISHED` directly: 409 "transition".
  It needs `APPROVED`, `QUEUED`, `PUBLISHING` first.

## Next Step
1. Open https://tachyon.os2.workers.dev/rosa/calendar in Firefox (then Chrome): the 02:01 row of the
   week of 9 Nov shows no "Open slot" cells, and a video dropped on a day header lands on 08:30 or 20:30.
2. Find why `2026-w47-01` published 5.5 h late. Read the journal with the deploy credentials:
   ```
   cd deploy/worker
   export $(grep -E "^CLOUDFLARE_API_TOKEN=" ~/Projects/tachyon/.env.local | xargs)
   export CLOUDFLARE_ACCOUNT_ID=<id from GET https://api.cloudflare.com/client/v4/accounts>
   npx wrangler d1 execute tachyon --remote --command "SELECT ts, action, intent, outcome, by FROM journal WHERE client='rosa' AND target='2026-w47-01' ORDER BY ts"
   ```
   Column names are from `deploy/worker/src/db.ts` (`journalStmt`); check `schema.sql` first. The publish
   loop is `publishClient()` in `deploy/worker/src/publish.ts`.
3. The same query with `action IN ('post.move','post.scheduled_now')` and `ts >= '2026-11-12'` shows who
   moved `w47-04/06/09`. Both actions write `scheduled_at` (`deploy/worker/src/db.ts`).
4. Ask the user before touching anything remote: no approval from this session carries over.
5. The three failing Python tests on `main` are unexamined.
6. The main checkout `~/Projects/tachyon` is on `higgs-film` at `c745ef5` (main up to #74): the local
   dashboard there does not have the #75 fix. Ask the user, then merge `main` into it.

## Carried over from the 2026-10-29 handoff (checked 2026-11-13)
- Still open: the review page (`spine/review/app.py`) does not show the post `note`. A NEEDS_APPROVAL slot
  sent back by publish shows its reason only when Approve returns the 409.
- Still not checked: whether editing a video after approval re-runs the approval check.
- Still there, ask before removing: worktree `~/.superset/worktrees/tachyon/upload-color-range`.
- Closed: the 2 timezone failures (`test_schedule_times_are_editable`,
  `test_posts_per_day_add_and_remove`) pass on `7baf268`.
