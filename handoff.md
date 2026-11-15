# Session Handoff — 2026-11-15

## Goal
Give Tachyon a new-client flow (the AI studies the client's industry before any video is made,
with screens for it), then redesign the sign-in page, and fix two design gaps the user found
(research not reachable from Settings; the no-client home page had no app design).

## Current State
- All of it is merged and **live**. Worker deployed from `main` `e9c8437`: version
  `def6862a-9154-49e2-851d-2e5c974a8bf5` on https://tachyon.os2.workers.dev.
- Checked after the deploy: live `/login` serves the ring script (`FADE` present) and Google's
  pill button; `/rosa` signed out redirects to `/login`. Signed-in live pages were NOT checked
  (they need the user's Google login).
- Worker tests 102/102, typecheck clean, on the deployed commit.
- Remote DB: migration `deploy/worker/migrations-0004-client-status.sql` applied 2026-11-14
  (`clients.status`, table `client_intake`; `rosa` and `talou` are `active`).
- `spine/learn.py` (the PC-side learner for the `learn` job) has only run in tests, never
  against a real client.
- `rosa` and `talou` were never researched: their industry file page says "No industry file yet".
- Python tests: 3 fail in dashboard/remote-DB code; the same 3 fail on `origin/main` before
  this work (checked 2026-11-14). `test_local_journal_outcome_is_write_once` is one of them.
- Worktree `new-clients-video-dbf543e9` is on `main`, clean.
- Local dev only (not in git): `deploy/worker/.dev.vars` with random `SESSION_SECRET` and
  `TOKEN_SECRET`; local D1 has the schema and one admin user (the user's Gmail), no clients.
  `wrangler dev --port 8787` was left running.
- Branch `login-board` (closed PR #79, never merged) still exists, local and remote.

## Active Files
- `.claude/skills/…intake…`, `docs/PLAYBOOK.md`, `docs/PLAN.md`, planner prompt: the industry
  study step (PR #77).
- `deploy/worker/src/pages/setup.ts`: `/<client>/setup` — business form, learning progress
  (8 `STAGES`, live log), industry file Short/Long, approve / ask for changes / learn again.
- `deploy/worker/migrations-0004-client-status.sql`, `schema.sql`: `clients.status`
  (setup → learning → review → active), `client_intake`.
- `spine/learn.py`: runs the `learn` job, reports stages, writes `clients/<name>/industry.md`.
- `deploy/worker/public/static/login-art.js`: the sign-in ground — a dotted neon ring on a
  noise field with a fading trail (2D canvas, no p5).
- `deploy/worker/src/index.ts` `loginPage`: full-screen dark page, logo (180px) and Google's
  outline pill button centred.
- `deploy/worker/src/pages/settings.ts`: "Business research" row → `/<client>/setup`.
- `deploy/worker/src/pages/home.ts`: `/app` with no client now renders through `shell()` with
  `noClient()`; empty state with Add a client / Members for an admin.
- `deploy/worker/src/pages/shell.ts`: `header(p)` returns only the banners (no title, no client
  line); menu links go to `/app` when there is no client.
- Figma file `zmNUNf8OPDOKDlIeM00ulf` ("Tachyon"), frame `Design`: screens "new client · 1-4",
  and the `login` screen (57:32).

## Changes Made This Session
1. PR #77 (`4ac0a3e`): industry study in the playbook, then its interface. Figma screens first
   (styles taken from the scheduler: `.seg.sm`, `.tag`, `.prog`, `.spin`, `.upok`, `.banner`),
   then the Worker pages, migration and `spine/learn.py`. A client is `active` only after the
   user approves the industry file.
2. PR #78 (`cf361f5`): sign-in panel as 60k WebGL particles building the brand pattern.
   Replaced later (see Failed Attempts).
3. PR #80 (`9b41301`): the line wave from `~/Projects/shahar2026/js/lineWave.js` ported to plain
   canvas (p5's noise re-implemented, no click), line `#8DF000`; Google button changed to
   `theme:"outline", shape:"pill", text:"continue_with", width:215`. `login-art.svg` deleted and
   the test that asserted it changed to match.
4. PR #81 (`caa53f0`): line bent into a ring; page made full screen with logo + button centred;
   "Login" text removed; logo `min(180px,80%)`. The user hand-tuned the script (black ground,
   `LINE = "#8DF0001f"`, radius `0.45 + 1.3*noise`, `drift`, `step(0.003)`); `FADE = 4` added
   because an alpha veil that small never changes an 8-bit pixel — every `FADE` frames a
   `difference` fill with `#010101` takes one level off every pixel.
5. PR #83 (`b6e8bec`): no-client `/app` in the app shell; titles and client lines removed from
   Overview, Calendar, Insights, Settings (user: the side menu already marks both). Account
   keeps its title. Members, Clients, setup and video pages still have titles (not asked).
6. PR #82 (`e9c8437`): Business research row in Settings; rebased onto #83 (conflict on the
   `header(...)` line in `settings.ts`), re-reviewed, merged second.
7. Deployed on the user's explicit request (2026-11-15).
8. Memory added: `always-apply-product-design` (every page through the app shell; never bare).

## Failed Attempts
- Particle build-up of the brand pattern (PR #78, merged then replaced): not what the user
  meant by "animate the particles".
- Board of moving parts — each SVG shape turning/flipping/hopping, snapped to a 320 grid
  (PR #79, closed unmerged after three rounds: scroll removed, slowed, two at a time): user's
  verdict "Not great". Do not revive without being asked.
- Custom-styled Google button: not done. Sign-in posts Google's ID token from
  `google.accounts.id.renderButton`; only Google's own button yields it, so the mockup's pill
  is approximated with Google's outline pill (Google font, 40px, no shadow).
- Alpha-veil trail (`rgba(ground, 0.07)` and the user's `0.003`): leaves residue / never fades
  on an 8-bit canvas. Fixed by the `FADE` decrement, which needs a black ground.
- Local sign-in failed twice: `origin_mismatch` until `http://localhost` (no port) was added
  beside `http://localhost:8787` in the Google client's Authorized JavaScript origins; then
  `no such table: users` because the local D1 was empty (`npm run db:local`, insert a user,
  `.dev.vars`).
- `pkill -f "wrangler dev --port 8787"` inside a compound command kills its own shell.
- The no-client home page was first left as a bare page with no shell; the user was angry.
  Every page goes through `shell()`.

## Next Step
1. Ask the user to confirm the live signed-in pages (`https://tachyon.os2.workers.dev/rosa`,
   `/rosa/settings` → Business research → View) look right; nobody has checked them live.
2. Run the learner against a real client for the first time: add a client in
   `/admin/clients`, fill `/<client>/setup`, let a linked PC claim the `learn` job
   (`spine/learn.py`), and watch the stages and the resulting `clients/<name>/industry.md`.
3. Open decisions for the user (re-ask, do not assume): delete branch `login-board`?
   Remove titles from Members, Clients, setup and video pages too? Research `rosa` and `talou`?
4. Deploy notes: `CLOUDFLARE_API_TOKEN` from `~/Projects/tachyon/.env.local` plus an explicit
   `CLOUDFLARE_ACCOUNT_ID`, then `npx wrangler deploy` from `deploy/worker` on merged `main`.
   Any deploy, merge or branch deletion needs a fresh explicit ask.
