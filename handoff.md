# Session Handoff — 2026-11-12 (evening)

## Goal
Tidy git after the Cloudflare/dashboard work, land the one open PR (#69) and deploy it. Wider
project goal unchanged: Tachyon on Cloudflare's free tier (Worker https://tachyon.os2.workers.dev,
D1 `tachyon`, R2 `tachyon-media`), fixing the online dashboard as the user reports problems.

## Current State
- Live Worker version 0c2d15aa-d7cb-42c4-aa91-882f4edeee73, deployed this session from main
  ee4684e (PR #69). Previous live version: 64b77fdf (main 9873804). Checked: `/app` → 302 to
  `/login?next=%2Fapp` → 200. Signed-in pages not checked live (needs the user's Google sign-in).
- GitHub: no open PRs. Remote branches: main, higgs-film, handoff-2026-10-29-night.
- This worktree (`~/.paradev/worktrees/tachyon/planning-new-project-vast-f8736c16`) is on a
  detached HEAD at 9873804 (main before #69). Uncommitted: handoff.md (this file) and the
  untracked handoff.w45-2026-11-01.md (old W45 handoff, kept on purpose).
- Main checkout `~/Projects/tachyon`: on `higgs-film` at c745ef5, not touched this session.
  higgs-film holds higgs work that is not in main: the HiggsFilm template replaced HiggsHook
  (35c45b6, 10 Nov), one folder per script slug (4910e3d, 11 Nov), no motion engine. It lacks
  #69 (1 main commit); `git merge-tree` of higgs-film + origin/main: clean.
- Local branches left: main (behind origin), higgs-film, upload-color-range (checked out in its
  Paradev worktree `~/.superset/worktrees/tachyon/upload-color-range`, clean, PR #22 merged),
  combo-check (3 commits not in main, no PR), worker-crons-fix (14 commits not in main, no PR),
  handoff-2026-10-29-night (also on GitHub; PR #25 closed).
- The previous handoff (2026-11-12 day) is only in unreachable commit 5d5200a:
  `git show 5d5200a:handoff.md` (gone after git gc). Its still-open items, NOT re-checked
  this session:
  - Rosa's queue had w47-04/06/09 at 00:01 UTC (02:01 Israel), from calendar drops on a day.
    w47-04 is due Fri 13 Nov 00:01 UTC (about 6 h after this handoff, written 18:13 UTC).
    The user was told and has not answered.
  - Not verified live: English Google button, /account, /admin/members, /admin/clients,
    calendar in local time, mixing dim/spinner/one reload (all passed on local Miniflare).
  - Reported, not fixed: phone width scrolls sideways (sidebar top bar ~586px at 390px);
    slots stored in UTC (`grants.slots` 06:30/18:30), so DST shifts Israel's 08:30/20:30;
    Members chips show the full client name (Figma: short); page padding 28/40px vs Figma
    40/48px; the Add picker's open popup with long names unchecked.
  - Unbuilt from the login plan: "Add new client" for non-admins (name + Connect Instagram);
    the IG profile picture as the client's avatar.
  - Tal (tal@talouloren.com, client `talou`, never signed in): waits on the user (add Tal as a
    Google OAuth test user, project tachyon-514410) and on Tal (link @talou_loren to a Facebook
    Page, give Rusty James full control).
  - Main checkout had uncommitted clients/rosa/grants.yaml, clients/rosa/posts/2026-w47-06/meta.json,
    clients/rosa/posts/2026-w47-08/meta.json.
  - Host loop `tachyon-worker` (systemd user service) and the local dashboard
    (`.venv/bin/python -m spine.review.app`) were running.
  - Figma: https://www.figma.com/design/zmNUNf8OPDOKDlIeM00ulf/Tachyon, page "screens", frame
    "Design": members 72:34, clients 72:318, Admin components 71:34.

## Active Files
No code written this session.
- handoff.md: this file.
- handoff.w45-2026-11-01.md: old W45 handoff (1 Nov), untracked; only other copy is in 5d5200a.
- deploy/worker/src/pages/video.ts (#69): the "Mixing …" line uses the `.igwait` row plus
  `role=status`, so its `<i class=spin>` ring gets a size.
- deploy/worker/test/pages.test.mjs (#69): asserts that exact markup.

## Changes Made This Session
1. "commit and push all": `insights-tab` was merged (#42) and its remote deleted, so the
   worktree's uncommitted higgs-hook edits (dated 9 Nov) went to a new branch
   `higgs-hook-motion` (5d5200a, 29 files). Left out `clients/rosa/higgs-hook/example`, a broken
   absolute symlink into the main checkout (it would point at itself there).
2. "cleanup": removed that symlink, the scratch worktree `/tmp/.../051c8637.../scratchpad/reads`
   (clean; d9795c3 in main) and 39 local branches. Each was an ancestor of origin/main or equal
   to a merged PR's head SHA (squash merges). Unmerged branches kept. No remote deleted here.
3. "review, audit, fix, merge and cleanup" (pr-land skill): higgs-hook-motion turned out to be
   superseded by higgs-film. Simulated with `git merge-tree`: into main it merges clean, but
   higgs-film's next main merge then hits 17 conflicts (11 modify/delete incl. HiggsHook.tsx and
   every batch script; content in spine/higgs.py, tests/test_higgs.py, SKILL.md, docs/HIGGS-HOOK.md,
   used.yaml, handoff.md). Asked; the user said "delete it".
4. Deleted higgs-hook-motion locally and on GitHub. Restorable until gc:
   `git branch higgs-hook-motion 5d5200a`. Put handoff.md and handoff.w45 back as uncommitted files.
5. "what about the pr": landed #69. The bot review had run on its final commit c088379 ("LGTM.
   No blockers."; its note that the test is brittle to attribute order was accepted by the
   reviewer as the only check the class is applied). No code changed after the review, so no
   re-review. Main + PR tested locally: same tree as main after the merge (5776f44), Worker
   tests 94/94, `npm run typecheck` clean. The previous session's Firefox screenshot
   (`spin-firefox.png`, taken before the commit) shows the ring beside the text.
   Squash-merged as ee4684e; deleted mix-spinner on GitHub and locally.
6. "deploy it": deployed 0c2d15aa from a clean detached worktree of origin/main; removed that
   worktree afterwards.

## Failed Attempts
- `gh pr merge 69 --squash --delete-branch` from a detached HEAD: the merge happened, the branch
  deletion did not ("could not determine current branch: failed to run git: not on any branch").
  Delete by hand: `git push origin --delete <branch>; git branch -D <branch>`.
- `npm test | grep '^# tests'` matched nothing: `node --test` here prints `ℹ tests 94`,
  `ℹ pass 94`, `ℹ fail 0`.
- `git rev-parse --short A B` fails ("Needed a single revision"): `--short` takes one rev.
- `wrangler deploy` with this PC's own wrangler login hits the wrong account (c283cc56…, error
  7403). Re-verified this session, this works: from a detached worktree of origin/main, with
  `deploy/worker/node_modules` symlinked to `~/Projects/tachyon/deploy/worker/node_modules`:
  `set -a; . ~/Projects/tachyon/.env.local; set +a; export CLOUDFLARE_ACCOUNT_ID=c843548b8fdb7310e2195f6f30ecf598; npx wrangler deploy`
- From the previous handoff, not re-checked: `gh pr edit` fails (GraphQL: Projects (classic)
  deprecated), use `gh api -X PATCH repos/BloodyDeathRoll/tachyon/pulls/<n> -F body=@file`;
  `pkill -f <pattern>` kills its own shell (exit 144), use a pid file; the Miniflare harness
  serves no /static, so save rendered HTML next to a copy of deploy/worker/public/static, serve
  it with `python3 -m http.server`, screenshot with Playwright; Figma plugin `resize()` sets
  auto-layout sizing to FIXED (set primaryAxisSizingMode = "AUTO" after), `createAutoLayout()`
  frames come white (set fills = []).

## Next Step
No approval carries over. This session the user asked for: commit+push, local cleanup, deleting
higgs-hook-motion, merging #69, deploying. Every new merge, deploy, branch deletion or schedule
change needs a fresh, explicit ask.
1. Time-sensitive: check Rosa's queue, then ask the user about the 00:01 UTC slots (w47-04 due
   13 Nov 00:01 UTC). From `deploy/worker` in a worktree, with the env from Failed Attempts:
   `npx wrangler d1 execute tachyon --remote --command "select slot_id, scheduled_at from posts where client='rosa' and state='QUEUED'"`
2. Ask the user to sign in and check live: login, /account, /admin/members, /admin/clients,
   calendar, the mixing spinner. Fix what they report (Firefox first, then Chrome).
3. Ask about leftovers: delete GitHub branch handoff-2026-10-29-night (PR #25 closed)? Archive
   the upload-color-range workspace in Paradev? Keep or delete combo-check and worker-crons-fix?
4. Still open: "Add new client" for non-admins; IG avatar; phone sideways scroll; DST-proof slots.
