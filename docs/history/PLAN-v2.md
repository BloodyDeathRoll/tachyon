# Tachyon — plan v2 (draft, 2026-10-24, from fresh research)

A process that acts as a client's VP of Marketing on social: it plans, produces short vertical
videos, publishes and schedules, listens and replies, measures, and changes next week's plan from
the numbers. One Claude brain running versioned skills, a thin deterministic Python/TypeScript
spine, one folder per client. Built from `docs/RESEARCH-2026-10-24.md`; v1 was not consulted while
drafting. Differences are listed in `docs/PLAN-v2-vs-v1.md`.

## 0. Principles

1. **Code does what must be the same every time** (state, scheduling, publishing, metric math,
   spec checks). **Claude does judgement** (strategy, scripts, replies, diagnosis). Claude may only
   *call* the spine tools, never re-implement them. (media-pipeline split; ChatGPT brief §10.)
2. **Nothing on screen or in a caption that is not in `product.md`**; unknown numbers come back as
   `{{number}}` and block QA. (instagram-agent-skill rule.)
3. **Official APIs only.** No browser automation, no private API, no cold DMs. Where the API has
   no path (commenting on other accounts), the system drafts and a human posts.
4. **Every post is a durable record with a state**, idempotent publish, and a provenance line for
   every asset. (ChatGPT brief §5–6.)
5. **Heuristic scores are floors, not predictions.** Winners are decided by the account's own
   numbers against its own trailing median, with sample-size guards. (hookscore AUC 0.56;
   media-pipeline floor + SD rule.)
6. **Human gate by default; autonomy is a per-client, per-stream grant** that can be revoked with
   one switch (emergency stop).

## 1. Platform access decision

Use the **Instagram API with Facebook Login for Business** (professional account linked to a
Facebook Page), not Instagram Login. Reasons, all verified today:

| Needed for | Instagram Login | Facebook Login |
|---|---|---|
| Licensed music on API-published Reels (`audio_configuration`, Audio API) | no | yes |
| AI disclosure flag `is_ai_generated` | no (media reference) | yes |
| Competitor baselines without scraping (Business Discovery `view_count`) | no | yes |
| Hashtag `top_media` research (30 tags / 7 days) | no | yes |
| Product tags, collab posts, paid-partnership label | partial | yes |

Standard Access is enough for an account we hold a role on; no App Review for v1. Cost of the
decision: one Facebook Page per client (can be unpublished) and `graph.facebook.com` tokens
(Page-scoped, long-lived, refreshed by a weekly job).

Scopes: `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`,
`instagram_manage_messages`, `instagram_manage_insights`, `pages_show_list`,
`pages_read_engagement`, plus `instagram_manage_contents` if we want media delete.

Vendor seam, optional: a `publisher/` adapter interface with two implementations, `graph.py`
(default) and `zernio.py` (2 accounts free; Reels, comment replies, analytics, MCP) for a client
that refuses a Meta app or for channel 2+. Postiz is not the fallback: its agent cannot read
comments or analytics.

## 2. The cycle

```
0 Intake (once) ── CP1 strategy ── 1 Plan (weekly) ── 2 Produce (per slot) ── 3 QA ── CP2 approve
                                        ▲                                                   │
                                        │                                      4 Schedule+Publish (queue)
                                        │                                                   │
                       7 Learn (weekly) ◄── 6 Measure (24 h / 72 h / 7 d) ◄── 5 Listen (webhooks, daily)
```

Content item states (code-enforced): `IDEA → BRIEFED → SCRIPTED → RENDERED → QA → NEEDS_APPROVAL →
APPROVED → QUEUED → PUBLISHING → PUBLISHED → MEASURING → ANALYZED`, plus `REJECTED`, `FAILED`,
`NEEDS_INPUT`, `MANUAL_HANDOFF`. Publishing is idempotent on `(client, slot_id)`.

## 3. Stations

### 0 · Intake — once per client, one Claude Code session
Skills: `intake` (ours), marketingskills `content-strategy` + `marketing-psychology`, Anthropic
marketing `competitive-brief`, instagram-agent-skill `ig-profile` (rubric.json, 100 points).
Outputs in `clients/<name>/`:
- `product.md` facts sheet, every number measured from the live app or git, with the date.
- `brand.md` = `voice.md` (from the skill repo's template: on-camera voice, words never said,
  positions, off-limits, proof it may use, keyword CTA) + visual identity + banned words.
- `audience.md` personas, trigger states, verbatim pains, language pack.
- `strategy.md` tension, play, positioning, pillars, cadence, KPIs, kill criteria.
- `funnel.md` conversion events, UTM scheme, link in bio, landing pages.
- `competitors.yaml` 6–12 professional accounts within ~10× our size (Business Discovery reads
  their median views → `swipe.md`, replacing manual collection).
- `profile.md` name field, bio, pinned three, highlights, link: scored, rewritten, applied by hand.
- `grants.yaml` tokens, ig_user_id, page_id, GA4 property, Blob bucket; per-stream autonomy
  flags all `false`; `emergency_stop: false`.
- `assets/` client footage, logos, fonts, each with `provenance.yaml` (source, licence, allowed
  use, date).

### CP1 · Strategy approval — operator
Reads `strategy.md`, `funnel.md`, `profile.md`. Nothing runs before this.

### 1 · Plan — weekly, Monday, `claude -p plan`
Skills: `ig-plan` logic (mix: proof 1, teach 1–2, opinion 1, story 1/2 wk, offer 1/2 wk; never two
of a kind back to back), marketingskills `social`, Anthropic `campaign-plan`.
Reads: `strategy.md`, `swipe.md`, `lessons.yaml` (station 7), `log.md` (no theme repeat in 14
days), this week's product facts (what shipped, what the data showed, a user quote).
Writes `calendar.yaml`: 3–5 reel slots (cadence data: largest gain going from 1–2 to 3–5 a
week), each with date/time, pillar, angle (not a topic), hook formula id from `hooks.json`,
length target, CTA, `experiment_id` or null, `trial: true|false`.
One pre-registered experiment per week, one variable (hook formula, length 15–30 vs 30–60 s,
cover, CTA), with hypothesis, primary metric, guardrail metric, evaluation window and a
"directional only" flag when n < threshold.
Also writes `engage.md`: the day's 10 accounts (5 reach / 3 peers / 2 buyers) from
`competitors.yaml` and hashtag `top_media`, with two drafted comments each (ig-comment's nine
types). Operator posts them in a 20-minute daily round. This is the compliant form of
"comment on other people's posts".

### 2 · Produce — per slot, `claude -p script` → `render` → `claude -p package`
1. **Script.** Three hooks from `hooks.json` (different formulas), `hookscore.py` ranks them
   (reject <50 outright), spoken script + separate on-screen text (≤6 words a card, inside the
   safe zone: y 230–1440, right 230 px clear), `beats.py --target N` until clean, `humanize.py`
   + `detect.py` ≥70 with no check <55, then `avoid-ai-writing` as a second opinion. Every
   claim cites a line of `product.md`.
2. **Render.** Deterministic, no LLM. Default engine: **Remotion** (free for ≤3 people, frame-exact,
   `@remotion/captions`, official skills), compositions per client in `clients/<name>/films/`
   in git; props = script JSON; 9:16 master, 1:1 and 16:9 by relayout props, never crop. Real
   app captures via Playwright; client footage from `assets/`; voice-over via ElevenLabs when
   the script calls for it; SFX/music from `assets/` or none (music can also be attached at
   publish time, see station 4). No generative video by default; if ever used, keep C2PA/
   SynthID metadata and set `is_ai_generated`. Output spec enforced by `ffprobe`: H.264
   yuv420p, 1080×1920, 30 fps, AAC 48 kHz, moov first, ≤300 MB, 15–60 s. Burned-in captions
   always.
   Open point for consolidation: the existing HTML + Playwright frame-capture pipeline (sources
   lost) can be the engine instead; Remotion is recommended because the films must live in git
   and be re-rendered from props by a cron job.
3. **Package.** `caption.py`-linted caption (Job A: the ask, not a second hook; ≤5 hashtags;
   search terms in prose; no link), cover frame or `thumb_offset`, UTM link for the bio,
   `meta.json` (hook id, formula, length, pillar, CTA, audio type, experiment id).

### 3 · QA — `claude -p qa`, vision on sampled frames + `spec_check.py`
Machine: dimensions, duration, fps, codec, loudness, blank/duplicate frames, text inside safe
zone, no watermark/third-party logo (originality rules), provenance present for every asset.
Claude: every number re-measured against the live app, brand review (Anthropic
`brand-review`), client red lines (for Rosa: no competitor data, no scraped cams, attribution),
humanizer score, `is_ai_generated` decision. `VERDICT: APPROVED | NEEDS_REVISION`, max 2 rounds,
then `NEEDS_INPUT`.

### CP2 · Approval — operator, `review/` page
Shows video, caption, cover, QA report, slot, experiment, trial flag. Approve / edit caption /
reject with note. First 2 weeks per client: every post; then weekly batch. `grants.yaml` can
later auto-approve a named pillar after N clean weeks.

### 4 · Schedule + Publish — `publish.py` from a queue, cron every 10 min
- Upload `video.mp4` and cover to Vercel Blob; create the container **≤24 h before the slot**
  (containers expire), with `caption`, `cover_url`/`thumb_offset`, `share_to_feed`,
  `audio_configuration` when the slot asks for Sound Collection music (Audio API trending or
  search), `trial_params {graduation_strategy: SS_PERFORMANCE}` when `trial: true`,
  `is_ai_generated` when QA said so, `collaborators` for partner posts.
- Poll `status_code` once a minute ≤5 min; `media_publish` at the slot; store `ig_media_id`,
  permalink, timestamps. Read `content_publishing_limit` before each publish.
- Retry with backoff; on failure the item goes to `MANUAL_HANDOFF` with a ready-to-post package
  and a notification. Never mark published until Meta returns the id.
- Weekly `refresh_token.py`. `emergency_stop` halts the queue.

### 5 · Listen — webhooks + daily `claude -p replies`
`listen/` is a small HTTPS endpoint (Vercel function) subscribed to `comments`, `mentions`,
`messages`, `story_insights`. Daily, Claude triages into ig-reply's buckets (keyword / lead /
substance / question / support / noise) and drafts:
- **Comments on our media:** reply (match length, name once, answer the question, concede the
  true part to critics, nothing to haters, hide abuse).
- **Keyword comments:** one private reply within 7 days delivering the promised thing first,
  no gate (ig-dm rule). This is the officially supported comment-to-DM funnel.
- **Mentions:** reply via `/mentions` or a thank-you comment.
- **Inbound DMs:** reply inside the 24 h window; lead-shaped messages logged as conversions.
- **Questions with demand** (likes on the comment) are queued to station 1 as formula #16.
Operator sends drafts until `grants.yaml` flips `auto_reply.comments`, then
`auto_reply.keyword_dm`, then `auto_reply.dm`. Never outbound to strangers.

### 6 · Measure — `insights.py`, `ga4.py`, no LLM
- Per media at 24 h, 72 h, 7 d: `views, reach, likes, comments, shares, saved, reposts,
  follows, profile_visits, ig_reels_avg_watch_time, reels_skip_rate, total_interactions`.
  Derived: sends/reach, likes/reach, follows/reach, saves/reach, hold = avg watch / duration,
  outlier multiple = views / trailing-median views, non-follower share where exposed.
- Account daily: `views, reach, accounts_engaged, follows_and_unfollows, profile_links_taps`.
- GA4 by UTM: sessions and the client's conversion events (Rosa: `app_install`, `favorite_add`,
  `push_optin_start`, `share`).
- Competitors monthly via Business Discovery: median views per account → `swipe.md` with
  outlier multiples and formula ids (`swipe.py`).
- Product measures (ChatGPT brief): operator minutes per approved post, model + render cost
  per asset, publish failure rate, share of posts with complete 7-day metrics, QA catches.
- Store: `tachyon.db` tables `posts`, `metric_snapshots` (with source, window, collected_at),
  `experiments`, `conversions`, `costs`, `journal` (append-only log of every write to Meta).

### 7 · Learn — weekly, Sunday, `score.py` then `claude -p learn`
- `score.py` (adapted from media-pipeline `fetch_insights.py`): composite from ratios with
  weights renormalised over the metrics present; **minimum-reach floor** excludes small-sample
  posts; a feature (hook formula, length band, pillar, CTA, audio type, slot) gets a ±1 signal
  only with ≥3 samples on each side and a gap above one SD of the window; 14-day TTL on
  signals, 30-day on top subjects; diagnostics when the data is too thin; signals are advisory.
- Experiment verdicts from `experiments` with the pre-registered metric; `directional_only`
  when under threshold. Trial reels: compare non-follower sends/reach and skip rate, graduate
  or kill.
- Claude writes `reports/<week>.md` (ig-audit shape: top/bottom five, "what the data says",
  STOP / DO MORE, hook problem vs profile problem) and proposes deltas to `strategy.md`
  (pillar mix, cadence, length, CTA, posting time) as a diff the operator accepts at CP1-lite.
  Accepted lessons go to `lessons.yaml` (read by station 1) and `CHANGELOG.md`.
- Hook selection in station 1 uses the signals as a small bandit with forced exploration (one
  slot a week on an untested formula) to avoid the self-reinforcing-logs problem.

## 4. Layout

```
tachyon/
  skills/           versioned SKILL.md per station; vendored third-party skills with
                    SOURCE.md (repo, commit, licence, local changes)
    intake/ plan/ script/ package/ qa/ replies/ learn/
    vendor/ ig-reel ig-caption ig-human ig-viral ig-plan ig-audit ig-reply ig-comment ig-dm
            ig-profile (MIT) · marketingskills social copywriting content-strategy video (MIT)
            · anthropic-marketing brand-review campaign-plan competitive-brief
              performance-report (Apache-2.0) · avoid-ai-writing (MIT) · remotion skills
  spine/            db.py state.py publish.py (graph.py, zernio.py) insights.py ga4.py
                    discovery.py score.py spec_check.py refresh_token.py review/ listen/
  tools/            hookscore.py beats.py caption.py humanize.py detect.py swipe.py (vendored)
  data/             hooks.json (26 formulas + ours) slop.json rubric.json
  clients/<name>/   product.md brand.md audience.md strategy.md funnel.md competitors.yaml
                    profile.md grants.yaml assets/ films/ calendar.yaml engage.md swipe.md
                    lessons.yaml log.md posts/<slot>/ reports/ CHANGELOG.md tachyon.db
  docs/
```

## 5. Runtime

- **PC cron** for render, publish queue, insights (needs ffmpeg, Playwright, Remotion, tokens).
- **Claude Code scheduled tasks (cloud)** are an option for the LLM-only stations (plan, replies,
  learn): they clone the repo, run skills, can use connectors, and keep running with the laptop
  closed; hourly cadence minimum, usage billed to the subscription. Decide at consolidation;
  v2 default is PC for everything, cloud tasks when the PC proves unreliable.
- `listen/` webhook endpoint and Blob on Vercel (already in use for Rosa).

## 6. Rosa — first run

- Create: Facebook Page "Rosa Surf" (unpublished is fine), Instagram professional account,
  Meta app with Facebook Login for Business, Standard Access, the scopes above. Pick the
  handle. Bio link with UTM.
- Launch content: the three 9:16 clips in `~/Videos/rosa` go out in week 1 as the first three
  slots (numbers on screen re-measured first; spot count is 2,254 as of 2026-09-17, not the
  October figure, verify). `rosa promo.mp4` is 16:9 and is relaid out, not cropped, once a
  film source exists.
- Pillars: swell animation map, "why this rating" transparency, free 15 days vs paywall, spot
  spotlights by region, swell-alert moments, widget for shops and schools.
- Trial reels only once the account passes the eligibility threshold (reported 200 followers,
  unverified); until then experiments are sequential A/B across weeks.
- Keyword CTA candidates: `SWELL` (push-alert how-to), `SPOT` (spot page link), `WIDGET`.
- Conversions: `app_install`, `favorite_add` (= lead), `push_optin_start`, `share`.
- Partner posts: `collaborators` with surf shops and schools that embed the widget.

## 7. Build order

1. Spine skeleton: `db.py`, `state.py`, `clients/rosa/` from an Intake session, `review/`.
2. Meta app + Page + account; `publish.py` posts one existing clip; `insights.py` pulls it at
   24 h. Proves the loop end to end with no rendering.
3. `listen/` webhook + `replies` skill; keyword private reply.
4. Produce: Remotion project in `clients/rosa/films/`, first film rebuilt from the showreel
   design; `script` / `package` / `qa` skills; `spec_check.py`.
5. Plan + Learn: `calendar.yaml`, `score.py`, first 4-week run.
6. Business Discovery → `swipe.md`; `engage.md` daily round.
7. Channel 2: YouTube Shorts first (100 uploads/day, native `publishAt`, cheap), TikTok after
   its posting audit (unaudited apps post private only). Cross-platform music licence needed
   before this step (Sound Collection is Meta-only).

## 8. Decisions to confirm at consolidation

1. Facebook Login (Page) instead of Instagram Login. Recommended: yes.
2. Render engine: Remotion vs rebuilding the HTML/Playwright pipeline. Recommended: Remotion.
3. Cloud scheduled tasks for LLM-only stations, or PC for everything. Recommended: PC first.
4. Music: original audio only vs Sound Collection via Audio API. Recommended: allow both, log it
   as a feature for station 7.
5. Engagement on other accounts: assisted daily round (drafts, human posts) is the only
   compliant option. Confirm it is wanted.
6. Zernio adapter in v1 or later. Recommended: later.
