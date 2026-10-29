# Session Handoff — 2026-10-24

## Goal
Plan Tachyon: a marketing-funnel engine that, given a target product, generates
short-video-first social content, schedules and publishes it (Instagram first),
tracks performance and adapts weekly. Produce a repeatable playbook and a Figma
workflow graph. First client: Rosa (rosa.surf).

## Current State
Planning is complete; no code exists yet.
- `docs/PLAN.md`, `docs/PLAYBOOK.md`, `README.md`, `handoff.md` committed as
  `ddd5c80` on `main` in `~/Projects/tachyon` and pushed to
  https://github.com/BloodyDeathRoll/tachyon (private, created 2026-10-24). The
  Superset worktree branch `planning-new-project-vast-f8736c16` points at the same
  commit. This handoff edit is uncommitted.
- Figma: frame "Tachyon workflow" (node `386:2`, file `DO4wXVmArw9ihwZVx6gTA4`,
  page `workflows`) is drawn and visually checked: 7 stations + 2 checkpoints on a
  spine, factory row of 4 units, return arrow Learn → Calendar, 7 side cards.
  Arrows are single-headed vectors (the line-based helper draws two heads).
- Memory saved: `~/.claude/projects/-home-shahar-Projects-tachyon/memory/tachyon-v1-decisions.md`.
- User settings: removed `disableRemoteControl: true` from `~/.claude/settings.json`
  at the user's request (needs a Claude Code restart to take effect).

## Active Files
- `docs/PLAN.md` — architecture (stations 0–6, CP1/CP2), decisions table, memory
  layout, external services, what is reused from tachion-old, Rosa first run, build order.
- `docs/PLAYBOOK.md` — repeatable per-client checklist (week 0, per slot, weekly, daily, rules).
- `README.md` — pointers to the two docs and the Figma frame.
- `handoff.md` — this file.

## Changes Made This Session
1. Surveyed inputs: `~/Projects/tachion-old` (not "tachhion"), `~/Projects/rosa`,
   `~/Videos/rosa/*.mp4`, Obsidian notes on the HTML motion-film pipeline, the five
   external repos/tools, and the Figma file.
2. Findings that shaped the plan:
   - tachion-old: 3 campaigns, 0 launched; never posted, never ingested metrics,
     never rendered video. Only its prompts and patterns are reused.
   - Rosa: live at rosa.surf, GA4 `G-NKQNM6YLQ1` already fires `app_install`,
     `favorite_add`, `push_optin_start`, `share`; 50 signed-in users on 2026-09-17;
     no social handle, no per-spot share cards.
   - Videos: `rosa-favorites-9x16`, `rosa-swim-9x16` (15 s) and
     `rosa-showreel-v14-30s-blues-9x16` (30 s) are post-ready; `rosa promo.mp4` is
     1920×1080 and needs a 9:16 relayout, not a crop.
   - Film sources (`reel13.html`, `mk*.py`, `audiov15.py`) are lost: the scratchpad
     was wiped; nothing under `/tmp/claude-1000`. Rebuild by replaying the session
     jsonl under `~/.claude/projects/`.
   - instagram-agent-skill has no Instagram API; it only drafts text. Instagram Graph
     API with Instagram Login publishes Reels without a Facebook Page, 100 posts/24 h,
     insights + comments + DMs (reply-only, 24 h window). Postiz is the multi-channel
     adapter for later. Karpathy skills and Layers: not relevant.
3. User decisions (asked via AskUserQuestion, answered 2026-10-24): Graph API direct;
   weekly batch approval with per-post for the first 2 weeks; PC only for now
   (VM only if volume justifies); Instagram only, TikTok + Shorts later.
4. Wrote PLAN, PLAYBOOK, README. Then, on the user's question, extended station 4
   (Listen) to cover comments, mentions and inbound DMs, and stated what is out by
   design (cold DMs, commenting on other accounts).
5. Drew the Figma frame with the workflow-graph skill's design system, then replaced
   the 13 line arrows with single-headed vectors.
6. Removed `disableRemoteControl` from user settings.
7. On the user's instruction: committed, fast-forwarded `main` locally (no PR),
   created the private GitHub repo `BloodyDeathRoll/tachyon` with `gh repo create
   --source=. --push`, and pushed `main`.

## Failed Attempts
- `figma.createLine()` with `strokeCap='ARROW_LINES'` puts an arrowhead on both ends.
  Fix used: `createVector` with a `vectorNetwork` whose end vertex alone has
  `strokeCap:'ARROW_LINES'` (via `setVectorNetworkAsync`).
- `get_metadata` on page `0:1` exceeds the tool output limit; query the saved JSON
  with `jq` instead, or call it on a specific node id.
- Looked for the reel sources on disk; none found. Replay is the only route.

## Next Step
1. Commit this handoff edit when the user asks (never commit unasked).
2. Operator tasks before any code runs for Rosa: create the Instagram Business
   account, create the Meta app (Instagram Login, scopes `instagram_business_basic`,
   `_content_publish`, `_manage_insights`, `_manage_comments`, `_manage_messages`),
   pick a handle.
3. Build order (PLAN.md §7): spine skeleton (`spine/db.py`, `clients/rosa/` from an
   Intake session, `review/` page) → publish one existing clip via the API and pull
   its insights → recover the film sources into `clients/rosa/films/` and build
   `spine/render.py` with `?ar=` / `?theme=` switches → calendar + learn prompts.
4. Re-read `docs/PLAN.md` before touching the Figma frame; the frame must stay
   consistent with it.
