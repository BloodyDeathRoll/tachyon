# Plan v2 vs plan v1 — what each missed (2026-10-24)

v1 = `docs/PLAN.md` (written earlier today with the user's four decisions). v2 = `docs/PLAN-v2.md`
(fresh research, v1 not consulted while drafting). Third column: the ChatGPT brief.

## 1. v1 missed, v2 has

| # | Item | Why it matters | Source |
|---|---|---|---|
| 1 | **Facebook Login instead of Instagram Login** | Instagram Login has no Audio API, no `is_ai_generated`, no Business Discovery, no hashtag search. v1 chose Instagram Login to avoid a Page; the Page costs little and can be unpublished. Standard Access still needs no App Review. | Meta docs, verified |
| 2 | **Licensed music via the Audio API** (`audio_configuration`, 2026-06-01) | v1 assumed Pixabay music baked in. Sound Collection tracks are now attachable at publish time (Meta surfaces only). | Meta changelog + Audio API doc |
| 3 | **Trial reels as the native A/B** (`trial_params`, `SS_PERFORMANCE`) | v1's A/B was sequential posts. Trial reels test on non-followers first and auto-graduate. | Meta changelog 2025-12-03 |
| 4 | **`reels_skip_rate` metric** | The hook grade v1 hoped for ("3 s hold if exposed") exists as a named metric. Retention curve still not in the API. | Insights reference |
| 5 | **`is_ai_generated` flag and originality rules** | v1 had the AI-label decision but not the 2026 rules (watermarks and reposts demoted, AI-persona labelling). | creators.instagram.com (A) |
| 6 | **Business Discovery for competitor baselines** | Outlier multiple vs each account's median without scraping or manual collection. | Meta docs |
| 7 | **Keyword comment → private reply funnel** | Officially supported, once per comment within 7 days. v1 listed DMs as reply-only; the keyword CTA from the skill repo now has an API path. | Private replies doc (A) |
| 8 | **Assisted engagement round on other accounts** | v1 ruled it out entirely. The compliant pattern (drafts + human posts, 10 accounts a day) delivers the user's ask. | Hypefury pattern, ig-plan / ig-comment |
| 9 | **Content state machine, idempotent publish, provenance per asset, emergency stop, product-level measures** | v1 had `auto_publish: false` and a QA verdict but no explicit states or idempotency key. | ChatGPT brief |
| 10 | **Scoring guards**: minimum-reach floor, ≥3 samples per side, SD gap, TTL on signals, advisory not blocking, forced exploration | v1's Learn station said "winners and losers vs median". | media-pipeline `fetch_insights.py` (read), bandit papers (A) |
| 11 | **Container timing**: create ≤24 h before the slot; containers expire | v1 did not mention expiry. | Content publishing doc |
| 12 | **Remotion as render engine** (free ≤3 people, frame-exact, captions package, official skills) | v1 kept the HTML/Playwright pipeline whose sources are lost. | Remotion licence FAQ, verified |
| 13 | **Vendored third-party skills with provenance**: marketingskills `social`/`copywriting`/`video`, Anthropic marketing plugin, avoid-ai-writing, remotion skills | v1 reused only the one skill repo and tachion-old prompts. | GitHub, verified |
| 14 | **Channel-2 facts**: TikTok unaudited apps post private only; YouTube `videos.insert` 100/day bucket with native `publishAt` | v1 said "Postiz later". Postiz cannot read comments or analytics. | TikTok / YouTube docs (A), Postiz docs verified |
| 15 | **Cadence and length priors** (3–5/week is the biggest marginal gain; 30–60 s slightly ahead of <30 s) | v1 had 3–5 reels/week by intuition only. | Buffer 2025, Socialinsider 2026 (A) |
| 16 | Cloud scheduled tasks as a runtime option for LLM-only stations | v1: PC only, VM later. | code.claude.com docs, verified |
| 17 | Zernio as the optional vendor seam (2 accounts free, Reels + comments + analytics + MCP) | v1: Postiz. | zernio.com pricing, verified |

## 2. v1 has, v2 lacked or under-specified

| # | Item | Action for the consolidated plan |
|---|---|---|
| 1 | **Reuse list from tachion-old** (prompts 1, 3, 4, 5, 6, 8, 15, 18; checkpoint-with-resume; grants pattern; dropped list) | Keep in v1 §5 as is. |
| 2 | **Film-source recovery plan** (replay the session jsonl; `?ar=` / `?theme=` switches) | Keep if the HTML engine is chosen; if Remotion, the recovery is a design reference only. |
| 3 | **Rosa specifics**: GA4 property id, 50 signed-in users, missing share cards / shareable `/charts` state, per-spot cards as a product ask | Keep v1 §6; v2 §6 adds Page, keyword CTAs, collab posts, trial eligibility. |
| 4 | **Figma frame** must stay consistent with the plan | Keep; redraw after consolidation (new stations: Listen via webhooks, Learn guards, engage round). |
| 5 | **Playbook** (`docs/PLAYBOOK.md`) week-0 / per-slot / weekly / daily checklists | Keep; add the daily engagement round, token refresh, trial-reel step, CHANGELOG. |
| 6 | **Decisions table** with dates | Keep the format; add the six v2 decisions. |
| 7 | Intake prompt style "propose, don't interrogate" | Keep. |

## 3. Decisions v2 would reopen

| v1 decision | v2 recommendation | Cost of switching |
|---|---|---|
| Instagram Login, no Page | Facebook Login for Business | Create one Page per client; different token host. Done before any code, so zero rework. |
| Postiz for channel 2+ | YouTube direct (cheap), TikTok direct after audit, Zernio only if a vendor is wanted | None yet. |
| HTML motion-film pipeline | Remotion | The lost sources must be rebuilt either way. |
| No commenting on other accounts | Assisted daily round | 20 operator minutes a day. |
| PC only | PC first, cloud tasks optional for plan / replies / learn | None. |

## 4. ChatGPT brief — kept vs dropped

Kept: state machine and exception states; idempotency; provenance and licence per asset;
product-level measures; experiment schema with guardrail and "directional only"; emergency stop;
per-scene replaceability (Remotion props make this natural); Anthropic marketing plugin.
Dropped: multi-tenant web app, 25-entity schema, React command center, "no engagement in MVP",
the 23 open questions (most already answered on 2026-10-24).

## 5. Still unverified (mark in the consolidated plan)

- Hashtag cap of 5 per post (skill repo claim, 2025-12-18).
- Trial-reel eligibility threshold (200 followers for professional accounts, third-party).
- Whether `trial_params` works under Instagram Login (changelog says both logins; the media
  reference lists no restriction; moot if Facebook Login is chosen).
- TikTok / YouTube quota details came from a sub-agent against official pages, not re-fetched.
