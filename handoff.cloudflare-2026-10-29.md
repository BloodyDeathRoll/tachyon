# Session Handoff — 2026-10-29

## Goal
Plan (not build) how Tachyon runs from several machines for two users at zero cost. Outcome: a Cloudflare conversion plan in `docs/CLOUDFLARE-PLAN.md`, to execute in a later session.

## Current State
- `docs/CLOUDFLARE-PLAN.md` committed as `02ce278` on branch `cloudflare-plan` (cut from `origin/main` = `cd5338f`). Not pushed, no PR. Upstream unset on purpose (it was tracking `origin/main`).
- Nothing built. No Cloudflare account, no code.
- The plan's "Free-plan limits" section lacks three Workers Free limits discussed later: 10 ms CPU per request, 50 subrequests per invocation, 5 cron triggers per account. These came from model memory, NOT verified.
- Worktree now on `cloudflare-plan`, not `live-tiles`.
- Uncommitted edits NOT made by this session appeared mid-session in: `spine/db.py`, `spine/publisher/publish.py`, `spine/review/app.py`, `spine/schedule.py`, `spine/state.py`, `dashboard/data.py`, `tests/test_dashboard.py`. Owner unknown (another session?). Untouched, carried onto `cloudflare-plan` uncommitted.
- Previous session's Epic reel work is still open (see Next Step follow-ups).

## Active Files
- `docs/CLOUDFLARE-PLAN.md`: the plan (account, online/local split, D1 tables, job routing, media requests, publish idempotency, dashboard, phases 0-8, limits, open decisions).

## Changes Made This Session
1. User asked how to run from multiple machines. First answer (single hub desktop + Tailscale) rejected: user wants true multi-machine, not a recommendation.
2. Designs discussed: shared DB + lease lock + Blob media; then "online control plane, local media + processing"; then two-user additions (login, `by` column, `version` optimistic lock, media requests between machines via a `media_request` job + temporary relay object).
3. Constraint from user: zero cost (beyond Claude/Higgsfield subs), Vercel is overcrowded. Options given: Turso+Tailscale, Cloudflare, Supabase, GitHub Actions. User chose Cloudflare.
4. User: Tachyon gets a THIRD Cloudflare account (existing: personal `einhanamer` with Rosa `user-api`; OneShot). Plan says operator creates it; ask before any setup; never `wrangler deploy` on the host login.
5. Limits taken from `~/Projects/rosa/deploy/user-api/README.md`: Workers 100k req/day; D1 5M reads + 100k writes/day, 5 GB. R2 10 GB.
6. Load estimate from `clients/rosa/tachyon.db` (19 posts, 270 snapshots, 345 journal rows, journal peak 156/day on 2026-10-26, DB 292 KB, covers 1.9 MB): all under ~10% of limits. Risks: Python (Pyodide) Worker vs 10 ms CPU → lean TS port; hourly insights over 50 subrequests once >~45 posts → chunk; follower snapshots write one row per follower.
7. Committed the plan (user asked).

## Failed Attempts
- Answering with a recommendation (single hub) when the user asked for a way to run on multiple machines: rejected. Answer the question asked.
- Writing "verify free limits in phase 0" when the limits are already documented in Rosa's README: user objected. Check sibling projects (`~/Projects/rosa`, `~/Projects/oneshot`) before marking something unknown.

## Next Step
1. Ask the user who owns the uncommitted `spine/*`, `dashboard/data.py`, `tests/test_dashboard.py` edits before any branch switch or commit in this worktree.
2. Ask whether to add the CPU / subrequest / cron-trigger limits (after verifying them on developers.cloudflare.com) to `docs/CLOUDFLARE-PLAN.md`, and whether to push `cloudflare-plan` + open a PR.
3. Execution later starts at plan phase 0 (operator creates the Tachyon Cloudflare account; Python Worker vs TS decision).

Follow-ups carried from the 2026-10-28 handoff (unverified since, re-check):
- Epic reel: user to hear `~/Videos/rosa/rosa_epic_v5.mp4` and confirm "RO-ZA" pronunciation and caption `~/Videos/rosa/rosa_epic_v5_caption.txt`; "3,056 spots" unchecked against the live app.
- `engines/remotion/src/oneoff/Epic.tsx` untracked; commit or not = user's call. Gemini TTS in `spine/voice.py` = undecided.
- Laptop zip `~/tachyon-laptop-2026-10-28.zip` holds the real token (plan's open decisions list it).
