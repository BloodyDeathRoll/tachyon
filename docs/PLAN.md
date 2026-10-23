# Tachyon — plan (v1, 2026-10-24)

Tachyon runs the marketing funnel of a target product: short-video-first content per
channel, scheduled publishing, performance tracking, and a weekly learning loop that
changes the next plan. One Claude brain, a thin Python spine, one folder per client.

## Decisions (2026-10-24, with the operator)

| Topic | Decision |
|---|---|
| Publishing | Instagram Graph API direct (Instagram Login, Business/Creator account, no Facebook Page). Postiz later for channel 2+. |
| Approval | Weekly batch approval page. Per-post approval for the first 2 weeks of each client. |
| Runtime | PC only for now (renders need Playwright + ffmpeg anyway). Move the cron to a VM if volume justifies it. |
| Channels, phase 1 | Instagram only. TikTok + YouTube Shorts after the loop has run a few weeks. |
| Brain | Claude (Fable/Opus) via `claude -p` + Claude Code sessions. No local LLMs. |
| Old code | `~/Projects/tachion-old` mined for prompts and patterns only (see §5). New code here. |
| Assumed | English only. No paid AI video generation. No paid ads. |

## 1. Shape

A cycle. Stations 0–6, two human checkpoints, memory in the middle, a return arrow
from Learn back to Calendar. Purple = an LLM runs it, yellow = plain code.

```
0 Intake (once per client) ─ CP1 strategy ─ 1 Calendar (4 weeks)
        │                                        │
        └──────── 6 Learn (weekly) ◄── 5 Measure (daily) ◄── 4 Listen (daily)
                                                 ▲
2 Factory (per slot): script → render → package → QA ─ CP2 weekly batch ─ 3 Publish (cron)
```

## 2. Stations

### 0 · Intake — once per client, one Claude Code session
Inputs: the product (repo, live app, docs), operator answers, account grants.
Outputs in `clients/<name>/`:
- `product.md` — facts sheet. Every number measured from the real app or git; it is
  what the Factory is allowed to put on screen.
- `brand.md` — mission, archetype, voice as "X but never Y", visual identity (colors,
  fonts, logo paths), banned words.
- `audience.md` — personas, trigger states, verbatim pains, language pack.
- `strategy.md` — the insight (tension), the play, positioning, KPIs, kill criteria,
  content pillars, posting cadence.
- `funnel.md` — conversion events (what counts as lead / sale), UTM scheme, link in bio,
  landing pages, analytics source.
- `grants.json` — standing grants: Instagram token + ig_user_id, GA4 property, Blob
  bucket; `auto_publish: false` until the operator flips it.
Runtime: `Claude Code · intake session` using the tachion-old prompts 1, 3, 4, 5, 6 and
the propose-don't-interrogate intake prompt.

### CP1 · Strategy approval — manual
Operator reads `strategy.md` + `funnel.md`, edits or approves. Nothing downstream runs
before this.

### 1 · Calendar — every 4 weeks (and after every Learn)
`claude -p · calendar.prompt` → `clients/<name>/calendar.yaml`
- 3–5 reels per week, each slot: date, pillar, hook formula, format, CTA, experiment id.
- One pre-registered A/B per week, one variable (hook / length / cover / CTA).
- Hooks from the hooks library (26 formulas from instagram-agent-skill + what won here).

### 2 · Factory — per calendar slot
Four units, run in order, all outputs under `clients/<name>/posts/<slot-id>/`.
1. **Script & beats** — `claude -p · script.prompt`: 0–3 s hook, timed beats, on-screen
   text, CTA, caption draft. Every claim cites a line in `product.md`.
2. **Render** — `python · render.py + ffmpeg · no LLM`: the HTML motion-film pipeline
   (one page, `render(t)`, seeded RNG, Playwright at 120–240 fps, `tmix` → 60 fps, real
   app captures, Pixabay stock + music). 9:16 master; 1:1 and 16:9 by relayout switch
   (`?ar=`), never by crop. Film sources live in `clients/<name>/films/` in git.
3. **Package** — `claude -p · package.prompt`: final caption, 5–10 hashtags, cover
   frame pick, alt text, UTM link, `meta.json`. Reel spec check: MP4 H.264/AAC, 9:16,
   ≤300 MB, 3 s–15 min, moov atom first.
4. **QA** — `claude -p · qa.prompt`: vision pass on sampled frames (legibility, clipped
   text, brand colors), every on-screen number re-verified against the live app, brand
   review against `brand.md`, AI-label decision (`is_ai_generated`), legal red lines.
   Verdict line `VERDICT: APPROVED | NEEDS_REVISION`; max 2 revision rounds.
Output: `video.mp4`, `cover.jpg`, `caption.txt`, `meta.json`, `qa.md`.

### CP2 · Weekly batch approval — manual
`review/` page lists the week's packages (video, caption, cover, QA verdict). Operator
approves, edits caption, or rejects with a note (goes back to Script). First 2 weeks of a
client: every post individually; after that: the weekly batch.

### 3 · Publisher — cron on the PC, `cron -> publish.py (python) · no LLM`
- Upload `video.mp4` to a public URL (Vercel Blob), `POST /{ig_id}/media`
  (`media_type=REELS`, `video_url`, `caption`, `cover_url`/`thumb_offset`),
  poll `status_code` until `FINISHED`, `POST /{ig_id}/media_publish`.
- Store `ig_media_id`, permalink, publish time in `tachyon.db`.
- Respect `content_publishing_limit` (100 / 24 h). Retry with backoff; on failure
  write a manual-post package and notify the operator.
- Fallback mode for any client without API access: the same package, posted by hand.

### 4 · Listen — daily, `claude -p · replies.prompt`
Three inbound streams, all via the Graph API (scopes `instagram_business_manage_comments`,
`instagram_business_manage_messages`):
- **Comments** on our posts: read, draft a reply in brand voice, hide spam.
- **Mentions and tags**: read, draft a reply or a thank-you comment.
- **DMs** (Messaging API): read inbound, draft a reply. Meta allows replies within 24 h of
  the user's last message; no cold outbound DMs.
Operator sends the drafts (first weeks); `grants.json` can later allow auto-reply per
stream. Drafting logic adapted from instagram-agent-skill `ig-reply`, `ig-comment`,
`ig-dm` (those skills draft text only; they have no API).
Not done, by design: commenting on other accounts' posts or cold DMs. The official API
does not offer them, and private-API automation risks the account.
Themes, objections and verbatim language are appended to `audience.md`; lead-shaped DMs
("where do I download", "do you cover X") are logged as conversions in `tachyon.db`.

### 5 · Measure — daily, `python · insights.py + ga4.py · no LLM`
- Per post from the Graph API: reach, plays, likes, comments, saves, shares, follows,
  profile visits, link clicks, 3 s hold if exposed.
- From GA4, by UTM: sessions, and the client's conversion events (for Rosa:
  `app_install`, `favorite_add`, `push_optin_start`, `share`).
- Written to `tachyon.db` (`posts`, `metrics_daily`, `experiments`). Scorecard per post,
  hook, pillar, format: value vs the client's trailing median (outlier multiple).

### 6 · Learn — weekly, `claude -p · diagnose.prompt`
- Winners and losers vs median, A/B verdicts, non-follower reach share, saves/reach.
- Updates: hooks library, `strategy.md` deltas (pillars, cadence, CTA), next
  `calendar.yaml` brief. Routes each fix to the station that owns it.
- Writes `clients/<name>/reports/<week>.md` and the client dashboard page.
→ back to 1 · Calendar.

## 3. Memory and layout

```
tachyon/
  spine/          publish.py, insights.py, ga4.py, render.py, review/ (approval page), db.py
  prompts/        intake/*, calendar.prompt, script.prompt, package.prompt, qa.prompt,
                  replies.prompt, diagnose.prompt
  hooks/          hooks library (formulas + per-client winners)
  clients/<name>/ product.md brand.md audience.md strategy.md funnel.md grants.json
                  calendar.yaml films/ posts/<slot>/ reports/ tachyon.db
  docs/           PLAN.md PLAYBOOK.md
```

## 4. External services

| Service | Used for | Notes |
|---|---|---|
| Instagram Graph API (Instagram Login) | publish Reels, insights, comments, mentions, DMs | scopes `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_insights`, `instagram_business_manage_comments`, `instagram_business_manage_messages`. App in dev mode works for accounts with a role; App Review only for other people's accounts. |
| Vercel Blob | public `video_url` for the API | the API fetches the file, it does not accept uploads |
| GA4 Data API | conversions by UTM | Rosa property already tracks the events above |
| Pixabay | stock footage and music | Playwright with `channel:'chrome'` to get past Cloudflare |
| Playwright + ffmpeg | render | PC |

## 5. Reused from tachion-old (prompts and patterns, not code)

- Prompts: Brand DNA (1), Audience Researcher (3), Competitive Scanner (4), Strategist (5),
  Insight Hunter (6), Concept Director (8), Experiment Designer (15), Diagnostician (18),
  the Quality Floor block, the intake prompt in `web/app.py` lines 196–280.
- Patterns: checkpoint as control flow with resume; standing grants per client
  (`policy/__init__.py`); reviewer `VERDICT:` line; visual-spec JSON with a stable seed
  label; one markdown file per station per campaign.
- Dropped: Ollama/Groq/Mistral routing, HTMX dashboard, 19 agents as 19 calls,
  SQLAlchemy text-blob models, ComfyUI Wan workflows (never ran).

## 6. Rosa — first run

- Product: rosa.surf, free 15-day surf forecast, 2290 spots, refreshed 4×/day, rating
  formula public, installable PWA, push swell alerts, embeddable widget, live cams.
  GA4 `G-NKQNM6YLQ1`, events already wired. 50 signed-in users on 2026-09-17.
- Account: new Instagram Business account (handle to pick), bio link
  `https://rosa.surf/?utm_source=instagram&utm_medium=social&utm_campaign=<slot>`.
- Launch content, already rendered in `~/Videos/rosa/`:
  `rosa-favorites-9x16.mp4` (15 s), `rosa-swim-9x16.mp4` (15 s),
  `rosa-showreel-v14-30s-blues-9x16.mp4` (30 s) — post-ready;
  `rosa promo.mp4` is 1920×1080 and needs a 9:16 relayout, not a crop.
- **Film sources are lost** (scratchpad wiped twice). First Factory task: rebuild
  `reel13.html` + scripts by replaying the session jsonl, commit under
  `clients/rosa/films/`. Numbers on screen (spot count, load time, bundle size) are
  as of 2026-10-04 and must be re-measured before reuse.
- Pillars: swell animation map (`/charts`), "why this rating" transparency, free vs
  Surfline, spot spotlights (Israel, California, Hawaii, Portugal, Brazil), swell-alert
  moments, the widget for surf shops and schools.
- Conversions: `app_install`, `favorite_add` (sign-in = lead), `push_optin_start`.
- Not built in Rosa yet and would help: per-spot share cards, shareable `/charts` state.

## 7. Build order

1. Spine skeleton: `db.py`, `clients/rosa/` from Intake, `review/` page.
2. Publisher + Measure against the real Instagram account (post one existing clip).
3. Factory: recover film sources, `render.py` with `?ar=` and `?theme=` switches,
   script/package/qa prompts.
4. Calendar + Learn, first 4-week run for Rosa.
5. Listen. Then Postiz for TikTok/Shorts.
