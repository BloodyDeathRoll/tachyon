# Tachyon — plan (consolidated, 2026-10-24)

Tachyon acts as a client's VP of Marketing on social. It plans the week, produces short
vertical videos, publishes and schedules, listens and replies, measures, and changes next
week's plan from the numbers. One Claude brain running versioned skills, a thin Python
spine, one folder per client. Instagram first.

History: `history/PLAN-v1.md` (first plan), `history/PLAN-v2.md` (fresh-research plan),
`history/PLAN-v2-vs-v1.md` (what each missed), `RESEARCH-2026-10-24.md` (sources, each
fact marked verified / agent-reported / unverified).

## Decisions

| # | Topic | Decision | Date |
|---|---|---|---|
| 1 | Publishing | Instagram API direct. **Facebook Login for Business**: professional account linked to a Facebook Page (page may stay unpublished). Unlocks the Audio API, Business Discovery, hashtag search. Standard Access, no App Review for our own accounts. | 2026-10-24 |
| 2 | Render engine | **Both, compared.** Engine A: HTML + Playwright frame capture + ffmpeg (ours, made the Rosa reels). Engine B: Remotion (free ≤3 people, local library). Same brief to both, operator picks the default; the other stays as fallback. | 2026-10-24 |
| 3 | Runtime | PC only. Cloud scheduled tasks for LLM-only stations only if the PC proves unreliable. | 2026-10-24 |
| 4 | Music | Both: original audio baked in, or a Sound Collection track attached at publish via the Audio API. Audio type is a tracked feature in Learn. | 2026-10-24 |
| 5 | Engagement on other accounts | **Assisted daily round.** The system names the account, the post, the time and the comment; the operator posts. No private API, ever. | 2026-10-24 |
| 6 | Vendor seam (Zernio) | Later. `publisher/` has an adapter interface from day one, one implementation (Graph API). | 2026-10-24 |
| 7 | AI label | **Never shown.** No generative video or image models anywhere in the pipeline; `is_ai_generated` never set; final mux strips all metadata; QA fails any file carrying C2PA, SynthID or IPTC AI fields. Text goes through `/ig-human`. | 2026-10-24 |
| 8 | Approval | Weekly batch page; per-post for the first 2 weeks of each client. | 2026-10-24 |
| 9 | Channels | Instagram only in phase 1. Then YouTube Shorts (direct API, cheap), then TikTok after its posting audit. Postiz dropped: its agent reads neither comments nor analytics. | 2026-10-24 |
| 10 | Brain | Claude via `claude -p` and Claude Code sessions, skills in `skills/`. No local LLMs. | 2026-10-24 |
| 11 | Old code | `~/Projects/tachion-old` mined for prompts and patterns only (§6). | 2026-10-24 |
| 12 | Assumed | English only. No paid ads. No generative AI media. | 2026-10-24 |
| 13 | CTA | **"Comment for the link" is never allowed**, for any client. Links travel by link in bio and the URL spoken and on screen (URLs are not clickable in Instagram comments, operator 2026-10-24; no link comments). Links travel by link in bio, the URL spoken and on screen, or a spot share link. A question in the comments gets an answer with the link; nothing is withheld to farm comments. | 2026-10-24 |
| 14 | Safe zones and formats | **Every reel ships in two files: reel and story.** Both 1080×1920. Meta's spec (verified 2026-10-25): top 14 %, bottom 35 %, 6 % each side free of text, logos and anything that matters. The reel also survives the 4:5 feed crop (centre 1080×1350). Reel-safe box x 65–1015, y 285–1248; story-safe box x 65–1015, y 269–1248 (`tools/safezone.py box`). Film templates take `?variant=reel\|story` and lay out inside the box; QA runs `safezone.py overlay` and `check`; FAIL blocks. The 2026-10-04 clips violate this (operator saw cards cut off in the feed, 2026-10-24) and are not reused. | 2026-10-25 |
| 15 | Film bar and music | The 2026-10-04 reels (3D phone, Pixabay footage, every feature, real music) are the quality bar; their sources are recovered from the session transcripts into `clients/rosa/films/` and new films start from them. Music: a licensed Pixabay track baked in (as the originals), or a Sound Collection track attached at publish through the Audio API (`audio_configuration`; verified working with our token 2026-10-25). Synthesised beds only as a fallback. | 2026-10-25 |
| 16 | On-screen type | **Only our messages, large and readable.** No on-screen text under 34 px at 1080×1920 (films use 38 px, `lib.tsx` `MIN_TYPE`), no small-caps eyebrow labels, no data attribution or "Footage: Pixabay" in the video. Attribution lives in the caption, on every post. App UI inside the phone mockup is exempt. | 2026-10-25 |

## 1. Principles

1. **Code does what must be identical every time** (state, queue, publishing, metric
   math, spec checks). **Claude does judgement** (strategy, scripts, films, replies,
   diagnosis). Claude calls spine tools; it never re-implements them.
2. **Nothing on screen or in a caption that is not in `product.md`.** Unknown numbers
   come back as `{{number}}` and block QA.
3. **Official APIs only.** Where the API has no path (commenting on other accounts), the
   system prepares, the human posts.
4. **Every post is a durable record with a state**, idempotent on `(client, slot_id)`,
   with a provenance line for every asset.
5. **Heuristic scores are floors, not predictions.** Winners are decided by the account's
   own numbers against its own trailing median, with sample-size guards.
6. **Human gate by default; autonomy is a per-client, per-stream grant** in
   `grants.yaml`, revocable with one switch (`emergency_stop`).
7. **No AI watermark, by construction** (decision 7).

## 2. Shape

```
0 Intake (once) ── CP1 strategy ── 1 Plan (weekly) ── 2 Produce (per slot) ── 3 QA ── CP2 approve
                                        ▲                                                   │
                                        │                                      4 Publish (queue, cron)
                                        │                                                   │
                       7 Learn (weekly) ◄── 6 Measure (24 h / 72 h / 7 d) ◄── 5 Listen (webhooks, daily)
```

Content item states, enforced in `state.py`:
`IDEA → BRIEFED → SCRIPTED → RENDERED → QA → NEEDS_APPROVAL → APPROVED → QUEUED →
PUBLISHING → PUBLISHED → MEASURING → ANALYZED`, plus `REJECTED`, `FAILED`, `NEEDS_INPUT`,
`MANUAL_HANDOFF`.

## 3. Stations

### 0 · Intake — once per client, one Claude Code session
Skills: `intake` (ours, propose-don't-interrogate, from tachion-old prompts 1, 3, 4, 5,
6), marketingskills `content-strategy` + `marketing-psychology`, marketing plugin
`competitive-brief`, `/ig-profile` (12-part rubric, 100 points).
Outputs in `clients/<name>/`:
- `product.md` facts sheet; every number measured from the live app or git, dated.
- `brand.md` = voice (the skill repo's `voice.md` template: on-camera voice, words never
  said, positions, off-limits, proof it may use, the CTA forms allowed) + visual identity + banned
  words. Also copied to `~/.claude/instagram/voice.md` so the `ig-*` skills read it.
- `audience.md` personas, trigger states, verbatim pains, language pack.
- `strategy.md` tension, play, positioning, pillars, cadence, KPIs, kill criteria.
- `funnel.md` conversion events, UTM scheme, link in bio, landing pages.
- `competitors.yaml` 6–12 professional accounts within ~10× our size. Business Discovery
  reads their median views → `swipe.md` (`/ig-viral` logic, no scraping).
- `profile.md` name field, bio, pinned three, highlights, link: scored, rewritten,
  applied by hand.
- `grants.yaml` page id, ig_user_id, token ref, GA4 property, Blob bucket; autonomy flags
  all `false`; `emergency_stop: false`.
- `assets/` client footage, logos, fonts, each with `provenance.yaml` (source, licence,
  allowed use, date, "no generative model" attestation).

### CP1 · Strategy approval — operator
Reads `strategy.md`, `funnel.md`, `profile.md`. Nothing runs before this.

### 1 · Plan — weekly, Monday, `claude -p plan`
Skills: `/ig-plan` (mix: proof 1, teach 1–2, opinion 1, story 1/2 wk, offer 1/2 wk; never
two of a kind back to back), marketingskills `social`, marketing plugin `campaign-plan`.
Reads `strategy.md`, `swipe.md`, `lessons.yaml`, `log.md` (no theme repeat in 14 days),
this week's product facts.
Writes:
- `calendar.yaml`: 3–5 reel slots (cadence data: largest gain is going from 1–2 to 3–5 a
  week), each with date, time, pillar, angle, hook formula id from `hooks.json`, length
  target, CTA, audio type, `experiment_id` or null, `trial: true|false`.
- One pre-registered experiment per week, one variable (hook formula, 15–30 s vs
  30–60 s, cover, CTA), with hypothesis, primary metric, guardrail metric, window, and a
  `directional_only` flag when the sample is under threshold.
- `engage/<date>.md`, the daily round (decision 5): 10 targets a day (5 reach / 3 peers /
  2 buyers) from `competitors.yaml` and hashtag `top_media`. Per target: account, the
  specific post (permalink), **when to post the comment** (the target's usual posting
  hour plus 10–40 min, from Business Discovery timestamps), two drafted comments
  (`/ig-comment`'s nine types, humanized), and the reason this account. Operator
  completes it in a 20-minute window and ticks each line; ticks are logged so Learn can
  see which accounts reply back.

### 2 · Produce — per slot: `claude -p script` → render → `claude -p package`
1. **Script** (`/ig-reel` + ours). Three hooks from `hooks.json`, different formulas;
   `hookscore.py` ranks them, reject <50; spoken script and separate on-screen text (≤6
   words a card, inside the safe box of decision 14: reel y 285–1248, story y 269–1248, x 65–1015); `beats.py
   --target N` until clean; `/ig-human` (`humanize.py` + `detect.py`, ≥70, no check <55),
   then `avoid-ai-writing` as a second opinion. Every claim cites a line of `product.md`.
2. **Film** (Claude as motion designer). The brief that produced the Rosa reels is the
   model: one prompt, Claude writes the whole film. Film source lives in
   `clients/<name>/films/<slug>/` in git, driven by the script JSON, with `?ar=` /
   `?theme=` and `?variant=reel|story` switches (9:16 master; the story variant may use the taller box and a sticker-friendly end card; 1:1 and 16:9 by relayout, never crop). Inputs: real
   app captures via Playwright, client footage from `assets/`, code animation, voice-over
   via ElevenLabs when the script calls for it, SFX/music from `assets/` or none. No
   generative video or images (decision 7).
3. **Render** (no LLM). Engine A: `render.py`, deterministic frame capture with a
   virtual clock (Playwright, 120–240 fps, `tmix` → 60 fps), ffmpeg mux. Engine B:
   Remotion `renderMedia()`. Both end in the same ffmpeg pass: H.264 yuv420p 1080×1920
   30 or 60 fps, AAC 48 kHz, moov first, `-map_metadata -1`, ≤300 MB, 15–60 s, captions
   burned in. Two outputs per slot: `video.mp4` (reel) and `video-story.mp4` (story). Engine comparison (decision 2): same showreel brief to both, operator
   judges, result recorded in `CHANGELOG.md`.
4. **Package** (`/ig-caption`). `caption.py`-linted caption (the ask, not a second hook;
   ≤5 hashtags; search terms in prose; no link), cover frame or `thumb_offset`, UTM link
   for the bio, `meta.json` (hook id, formula, length, pillar, CTA, audio type,
   experiment id, engine).

### 3 · QA — `claude -p qa` with vision, plus `spec_check.py`
Machine: dimensions, duration, fps, codec, loudness, blank or duplicate frames, both
files present, `safezone.py check` not FAIL (edge density in the unsafe bands, decision 14), no watermark or third-party logo (originality rules), provenance present
for every asset, **exiftool + c2patool report zero provenance or AI fields**.
Claude: reads `safezone.py overlay` sheets for reel and story (nothing that matters in the tinted bands), every number re-measured against the live app, brand review (marketing plugin
`brand-review`), client red lines (Rosa: no competitor data, no scraped cams,
attribution), humanizer score. `VERDICT: APPROVED | NEEDS_REVISION`, max 2 rounds, then
`NEEDS_INPUT`.

### CP2 · Approval — operator, `review/` page
Shows video, caption, cover, QA report, slot, experiment, trial flag. Approve, edit
caption, or reject with a note. First 2 weeks per client: every post; then the weekly
batch. `grants.yaml` can later auto-approve a named pillar after N clean weeks.

### 4 · Publish — `publish.py` from a queue, cron every 10 min
- Upload video and cover to Vercel Blob. Create the container **≤24 h before the slot**
  (containers expire) with `caption`, `cover_url` or `thumb_offset`, `share_to_feed`,
  `audio_configuration` when the slot uses a Sound Collection track (Audio API trending
  or search), `trial_params {graduation_strategy: SS_PERFORMANCE}` when `trial: true`,
  `collaborators` for partner posts. Never `is_ai_generated`.
- Poll `status_code` once a minute up to 5 min; `media_publish` at the slot; store
  `ig_media_id`, permalink, timestamps. A first comment is optional and never carries a URL (comments are not clickable); text only.
  Then `links.py` points the client's fixed bio redirect (Rosa `rosa.surf/ig`, Vercel Edge Config) at
  this reel's landing page + UTM, so the single bio link is always the newest reel's and nobody edits the profile
  (`POST /{media}/comments`) when the slot asks for one. Read `content_publishing_limit` first
  (100 / 24 h).
- Retry with backoff; on failure the item goes to `MANUAL_HANDOFF` with a ready-to-post
  package and a notification. Published only when Meta returns the id.
- Weekly `refresh_token.py`. `emergency_stop` halts the queue. Every write to Meta is
  appended to `journal` (intent before, outcome after).

### 5 · Listen — webhooks + daily `claude -p replies`
`listen/` is a small Vercel function subscribed to `comments`, `mentions`, `messages`,
`story_insights`. Daily, Claude triages with `/ig-reply`'s buckets (lead /
substance / question / support / noise) and drafts:
- **Comments on our media**: reply in voice; concede the true part to critics; nothing
  to haters; hide abuse.
- **Questions that ask for the link or the spot**: answer in the thread with the link,
  within the day. Never a keyword funnel (decision 13).
- **Mentions**: reply via `/mentions` or a thank-you comment.
- **Inbound DMs**: reply inside the 24 h window; lead-shaped messages logged as
  conversions.
- **Questions with demand** (liked comments) are queued to Plan as formula #16.
Operator sends drafts until `grants.yaml` flips `auto_reply.comments`, then
`auto_reply.dm`. Never outbound to strangers. Themes and
verbatim language are appended to `audience.md`.

### 6 · Measure — `insights.py`, `ga4.py`, `discovery.py`, no LLM
- Per media at 24 h, 72 h, 7 d: `views, reach, likes, comments, shares, saved, reposts,
  follows, profile_visits, ig_reels_avg_watch_time, reels_skip_rate, total_interactions`.
  Derived: sends/reach, likes/reach, follows/reach, saves/reach, hold = avg watch /
  duration, outlier multiple = views / trailing-median views.
- Account daily: `views, reach, accounts_engaged, follows_and_unfollows,
  profile_links_taps`.
- GA4 by UTM: sessions and the client's conversion events.
- Competitors monthly via Business Discovery: median views per account → `swipe.md`
  with outlier multiples and formula ids.
- Engagement round: which targets replied or followed back, per account.
- Product measures: operator minutes per approved post, model and render cost per
  asset, publish failure rate, share of posts with complete 7-day metrics, QA catches.
- Store `tachyon.db`: `posts`, `metric_snapshots` (source, window, collected_at),
  `experiments`, `conversions`, `engage_log`, `costs`, `journal`.

### 7 · Learn — weekly, Sunday, `score.py` then `claude -p learn`
- `score.py` (adapted from media-pipeline `fetch_insights.py`): composite from ratios
  with weights renormalised over the metrics present; **minimum-reach floor** excludes
  small-sample posts; a feature (hook formula, length band, pillar, CTA, audio type,
  engine, slot time) gets a ±1 signal only with ≥3 samples on each side and a gap above
  one SD of the window; 14-day TTL on signals, 30-day on top subjects; signals are
  advisory.
- Experiment verdicts from the pre-registered metric; `directional_only` when under
  threshold. Trial reels: compare non-follower sends/reach and skip rate, graduate or
  kill.
- Claude writes `reports/<week>.md` (`/ig-audit` shape: top and bottom five, what the
  data says, STOP / DO MORE, hook problem vs profile problem; marketing plugin
  `performance-report` for the client-facing version) and proposes deltas to
  `strategy.md` (pillar mix, cadence, length, CTA, posting time, engagement targets) as
  a diff the operator accepts at CP1-lite. Accepted lessons go to `lessons.yaml` (read by
  Plan) and `CHANGELOG.md`.
- Hook selection in Plan uses the signals as a small bandit with forced exploration (one
  slot a week on an untested formula).

## 4. Layout

```
tachyon/
  skills/           versioned SKILL.md per station; third-party skills vendored with
                    SOURCE.md (repo, commit, licence, local changes)
    intake/ plan/ script/ film/ package/ qa/ replies/ learn/
    vendor/ ig-* (13, MIT) · marketingskills social copywriting content-strategy video
            marketing-psychology (MIT) · marketing plugin brand-review campaign-plan
            competitive-brief performance-report (Apache-2.0) · avoid-ai-writing (MIT)
            · remotion skills (engine B)
  spine/            db.py state.py publisher/{base,graph}.py insights.py ga4.py
                    discovery.py score.py spec_check.py refresh_token.py render.py
                    review/ listen/
  tools/            hookscore.py beats.py caption.py humanize.py detect.py swipe.py
  data/             hooks.json (26 formulas + ours) slop.json rubric.json
  clients/<name>/   product.md brand.md audience.md strategy.md funnel.md competitors.yaml
                    profile.md grants.yaml assets/ films/ calendar.yaml engage/ swipe.md
                    lessons.yaml log.md posts/<slot>/ reports/ CHANGELOG.md tachyon.db
  docs/             PLAN.md PLAYBOOK.md RESEARCH-*.md history/
```

## 5. External services

| Service | Used for | Notes |
|---|---|---|
| Instagram API, Facebook Login for Business | publish Reels, Audio API, trial reels, insights, comments, mentions, DMs, Business Discovery, hashtag search | scopes `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `instagram_manage_messages`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`. Page-scoped long-lived token, weekly refresh. Standard Access. |
| Vercel Blob + one function | public `video_url`; webhook endpoint | the API fetches the file |
| GA4 Data API | conversions by UTM | Rosa property already fires the events |
| ElevenLabs | voice-over when scripted | audio only; no label implications |
| Playwright + ffmpeg (+ Remotion for engine B) | render | PC |
| exiftool + c2patool | QA provenance check | PC |
| Later: YouTube Data API, TikTok Content Posting API | channel 2 and 3 | YouTube: 100 uploads/day bucket, native `publishAt`. TikTok: audit before public posts. Cross-platform music licence needed first; Sound Collection is Meta-only. |

## 6. Reused from tachion-old (prompts and patterns, not code)

- Prompts: Brand DNA (1), Audience Researcher (3), Competitive Scanner (4), Strategist
  (5), Insight Hunter (6), Concept Director (8), Experiment Designer (15), Diagnostician
  (18), the Quality Floor block, the intake prompt in `web/app.py` lines 196–280.
- Patterns: checkpoint as control flow with resume; standing grants per client; reviewer
  `VERDICT:` line; visual-spec JSON with a stable seed; one markdown file per station.
- Dropped: Ollama/Groq/Mistral routing, HTMX dashboard, 19 agents as 19 calls,
  SQLAlchemy text-blob models, ComfyUI Wan workflows.

## 7. Rosa — first run

- Product: rosa.surf, free surf forecast with no paywall, 16-day horizon (site copy says
  "15-day"), refreshed 4×/day, 3,056 spots in 55 countries (2026-10-24), rating
  explained as size · period · wind, installable PWA, push swell alerts, embeddable
  widget, 14 official cams. GA4 `G-NKQNM6YLQ1`, events wired. 33 real accounts on
  2026-10-23. Facts sheet: `clients/rosa/product.md`. Clips from 2026-10-04 carry old
  spot counts: re-measure before reuse.
- Accounts: Facebook Page "Rosa Surf" (unpublished is fine), Instagram professional
  account linked to it, Meta app with Facebook Login for Business, Standard Access, the
  scopes above. Handle to pick. Bio link
  `https://rosa.surf/?utm_source=instagram&utm_medium=social&utm_campaign=<slot>`.
- Launch content in `~/Videos/rosa/`: `rosa-favorites-9x16.mp4` (15 s),
  `rosa-swim-9x16.mp4` (15 s), `rosa-showreel-v14-30s-blues-9x16.mp4` (30 s) are the
  first three slots after a QA pass (numbers, metadata strip). `rosa promo.mp4` is 16:9
  and gets relaid out once a film source exists.
- **Film sources are lost.** Rebuild from the session jsonl under `~/.claude/projects/`
  as a design reference; commit under `clients/rosa/films/`. The same showreel brief is
  the engine-comparison brief.
- Pillars: "why this rating", swell map (`/charts`), free with no paywall (never name a
  competitor without a measurement), spot spotlights by region, swell-alert moments,
  widget for shops and schools.
- CTA forms: link in bio, URL on screen and spoken (no link comments: not clickable, operator 2026-10-24; first comment text-only, posted by `publish.py` right
  after `media_publish`), "rosa.surf" spoken and on the end card.
- Trial reels once the account is eligible (reported 200 followers, unverified); before
  that, experiments are sequential across weeks.
- Conversions: `app_install`, `favorite_add` (= lead), `push_optin_start`, `share`.
- Partner posts: `collaborators` with surf shops and schools that embed the widget.
- Not built in Rosa yet and would help: per-spot share cards, shareable `/charts` state.

## 8. Build order

1. Spine skeleton: `db.py`, `state.py`, `clients/rosa/` from an Intake session,
   `review/` page.
2. Meta app + Page + account. `publish.py` posts one existing clip (after QA strips
   metadata); `insights.py` pulls it at 24 h. Loop proven with no rendering.
3. Engine comparison: showreel brief to engine A and engine B; operator picks the
   default; record in `CHANGELOG.md`.
4. Produce + QA: first film in `clients/rosa/films/`, `script` / `film` / `package` /
   `qa` skills, `spec_check.py` with the provenance check.
5. `listen/` webhook + `replies` skill.
6. Plan + Learn: `calendar.yaml`, `engage/`, `score.py`, first 4-week run.
7. Business Discovery → `swipe.md`; monthly competitor refresh.
8. Channel 2: YouTube Shorts, then TikTok after audit, after a cross-platform music
   licence.

## 9. Unverified, to confirm in the build

- Hashtag cap of 5 per post (skill repo claim).
- Trial-reel eligibility threshold (200 followers, third-party).
- TikTok and YouTube quota details came from a sub-agent against official pages.
- Whether exiftool and c2patool catch every marker Meta reads; test by publishing a
  stripped file to a private test account and checking for the label.
