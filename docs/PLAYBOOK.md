# Tachyon playbook — run it for any client

Each step names its station in `PLAN.md`, who does it, and what must exist before the
next step. Copy this file to `clients/<name>/PLAYBOOK.md` and tick as you go.

## Week 0 — set up

- [ ] **Accounts** (operator). Facebook Page (unpublished is fine); Instagram
      professional account linked to it; Meta app with Facebook Login for Business,
      Standard Access, the scopes in `PLAN.md` §5. Page id, `ig_user_id`, token ref into
      `grants.yaml`. GA4 property id. Blob bucket.
- [ ] **Intake session** (Claude, station 0). `product.md`, `brand.md`, `audience.md`,
      `strategy.md`, `funnel.md`, `competitors.yaml`, `profile.md`. Every number in
      `product.md` measured. Voice copied to `~/.claude/instagram/voice.md`.
- [ ] **Assets** with `provenance.yaml` each; no generative-model output.
- [ ] **CP1** (operator). Approve `strategy.md`, `funnel.md`, `profile.md`. Apply the
      profile rewrite by hand.
- [ ] **Link in bio** set once to the client's fixed redirect (Rosa: `rosa.surf/ig`); `grants.bio_link` filled so `publish.py` moves its target at each publish. Conversion events confirmed firing in GA4. No links in comments (not clickable).
- [ ] **Swipe file** from Business Discovery (`swipe.md`).
- [ ] **First publish test**: one existing clip through QA (metadata stripped) and
      `publish.py`; insights pulled at 24 h; no "AI info" label on the post.

## Every week

- [ ] **Monday, Plan** (Claude, station 1). `calendar.yaml` with 3–5 slots, one
      pre-registered experiment, trial flags; `engage/<date>.md` for each day.
- [ ] **Per slot, Produce** (station 2). Script (`hookscore` ≥50, `beats` clean,
      humanizer ≥70) → film source in git → render (engine A or B) → package.
- [ ] **Per slot, QA** (station 3). `safezone.py overlay` read for both files, `check` not FAIL; `spec_check.py` green including the provenance
      check; `qa.md` with `VERDICT: APPROVED`. Max 2 rounds, then `NEEDS_INPUT`.
- [ ] **CP2** (operator). Approve the batch in `review/`. First 2 weeks: per post.
- [ ] **Publish** (cron, station 4). Containers created ≤24 h before each slot. Every
      approved slot has an `ig_media_id` or sits in `MANUAL_HANDOFF` with a package.
- [ ] **Token refresh** ran (`refresh_token.py`).
- [ ] **Sunday, Learn** (station 7). `score.py`, then `reports/<week>.md`; accept or
      reject the strategy deltas; `lessons.yaml` and `CHANGELOG.md` updated.

## Every day

- [ ] **Measure** (cron, station 6). Snapshots at 24 h / 72 h / 7 d, account daily,
      GA4 by UTM.
- [ ] **Listen** (station 5). Webhook events triaged; replies, link answers,
      mention replies and DM replies drafted; operator sends until the matching
      `auto_reply.*` grant is on. Lead-shaped DMs logged as conversions.
- [ ] **Engagement round** (operator, 20 min). Open `engage/<date>.md`: for each of the
      10 lines post the given comment on the given post at the given time; tick it.

## Rules

1. Nothing goes on screen that is not in `product.md`. Re-measure before reuse.
2. 9:16 is the master; every slot ships `video.mp4` (reel) and `video-story.mp4` (story), both inside Meta's safe box (top 14 %, bottom 35 %, sides 6 %; reel also inside the 4:5 feed crop). Other ratios by relayout, never crop.
3. Film sources live in git under `clients/<name>/films/`. A render from a scratchpad
   does not count as done.
4. One variable per experiment. Pre-register it in `calendar.yaml` before the render.
5. Client red lines apply to every asset (Rosa: no competitor data, no scraped cams,
   attribution where required).
6. All autonomy flags in `grants.yaml` stay `false` until the operator flips them, one
   stream at a time. `emergency_stop: true` halts publishing and replies at once.
7. No generative video or images. `is_ai_generated` never set. Final mux strips
   metadata; QA fails any file with provenance or AI fields. Every text passes
   `/ig-human`.
8. Official APIs only. Comments on other accounts are posted by the operator from the
   daily round, never by code.
