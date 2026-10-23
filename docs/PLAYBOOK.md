# Tachyon playbook — run it for any client

Each step names its station in `PLAN.md`, who does it, and what must exist before the
next step. Copy this file to `clients/<name>/PLAYBOOK.md` and tick as you go.

## Week 0 — set up

- [ ] **Accounts** (operator). Instagram Business/Creator account; Meta app with
      Instagram Login; token + `ig_user_id` into `grants.json`. GA4 property id. Blob bucket.
- [ ] **Intake session** (Claude, station 0). Produce `product.md`, `brand.md`,
      `audience.md`, `strategy.md`, `funnel.md`. Every number in `product.md` measured.
- [ ] **CP1** (operator). Approve `strategy.md` + `funnel.md`.
- [ ] **Link in bio** with UTM. Conversion events confirmed firing in GA4.
- [ ] **Hooks library** seeded for this client (pillars × formulas).
- [ ] **Calendar** (Claude, station 1). 4 weeks, 3–5 reels/week, one A/B per week.

## Every slot — Factory (station 2)

- [ ] Script & beats → `script.md` (hook ≤3 s, claims cite `product.md`).
- [ ] Render → `video.mp4` 9:16 (plus 1:1/16:9 if the slot asks), from a film source in git.
- [ ] Package → `caption.txt`, `cover.jpg`, `meta.json` (hashtags, alt, UTM link, spec check).
- [ ] QA → `qa.md` with `VERDICT: APPROVED`. Max 2 revision rounds, then escalate.

## Every week

- [ ] **CP2** (operator). Approve the batch in `review/`. First 2 weeks: per post.
- [ ] **Publish** (cron). Check `tachyon.db` has an `ig_media_id` for every approved slot.
- [ ] **Learn** (Claude, station 6). Read `reports/<week>.md`; accept or reject its
      strategy deltas; it writes the next calendar brief.
- [ ] Dashboard updated for the client.

## Every day (cron + Claude)

- [ ] Measure: insights + GA4 pulled, scorecard refreshed.
- [ ] Listen: comments, mentions and inbound DMs pulled, replies drafted; operator sends.
      Lead-shaped DMs logged as conversions.

## Rules

1. Nothing goes on screen that is not in `product.md`. Re-measure before reuse.
2. 9:16 is the master. Other ratios by relayout, never crop.
3. Film sources live in git under `clients/<name>/films/`. A render from a scratchpad
   does not count as done.
4. One variable per A/B. Pre-register it in `calendar.yaml` before the render.
5. Legal red lines from the client's own docs apply to every asset (for Rosa: no
   competitor data, no scraped cams, attribution where required).
6. `auto_publish` stays false until the operator flips it per client.
