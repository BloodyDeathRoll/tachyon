# BRIEF — Tachyon operator dashboard (run `dash-01`)

Shahar, 2026-10-24: *"Now work out a decent dashboard cause the approvals screen looks awful. Use
our Oneshot dashboard for reference - we do not need a hosted dashboard, but we DO need it to be
planned properly and executed with perfect UI/UX. Use the Oneshot agents & flows if you need to and
generate a proper dashboard for Tachyon."*

This file is the task layer for three agents run in sequence: creative director → designer →
critic, then a human gate. It follows `~/Projects/oneshot/dashboard/BRIEF.md` and its two
follow-up briefs; where this file is silent, those hold. It is a PRODUCT UI for one operator.

## 0. Rules above all (Shahar, verbatim, from the Oneshot runs; they apply here unchanged)

> "Show info we can act on, or that betters our 100,000 foot view. We do NOT need info that
> contributes nothing."

> "MAKE THIS READABLE AND USABLE FOR HUMANS." Plain words, large readable type, no terminal text,
> no internal jargon: no raw state names (`NEEDS_APPROVAL`), no slot ids as titles, no file paths.

> "STAY CONCISE." Every screen answers its question in five seconds. Nothing decorative.

## 1. Who and what

One user: the operator (Shahar). Several clients over time; today one, Rosa (@rosasurfapp,
first reel published 2026-10-24 18:06 UTC, second queued for 2026-10-25 06:30 UTC). He opens the
dashboard to answer, in this order:

a. **What needs me right now?** Posts waiting for approval (CP2), failed publishes, replies and
   DMs drafted and waiting to be sent, today's engagement round (10 comments to post by hand),
   weekly report waiting for a verdict, tokens about to expire.
b. **What is live and what is scheduled?** This week's slots on a calendar, each with its state.
c. **How does each reel perform?** At 24 h / 72 h / 7 d: views, reach, sends/reach, saves/reach,
   follows/reach, skip rate, hold. Which hook, length, pillar, CTA, engine, slot time won.
d. **Is it converting?** GA4 sessions and events per UTM campaign (= per slot), favorites added,
   installs. Today: not wired; designed empty state.
e. **Is the machine healthy?** Publish failures, QA catches, operator minutes per approved post,
   cost per asset, token expiry, emergency stop.

## 2. Data: real only

`python -m dashboard.data` writes `dashboard/data.json` from `clients/<name>/tachyon.db`,
`posts/<slot>/*`, `grants.yaml`, `calendar.yaml`, `engage/`, `reports/`, `strategy.md`. Field list
in `dashboard/DATA.md`. Never invent a number. Today the data is thin on purpose:

- Rosa: 2 posts. `2026-w43-01` (showreel, 30 s) is live, measuring; first insights land at
  24 h. `2026-w43-02` (favorites, 15 s) is queued for 06:30 UTC. Nothing waits for approval.
- Account: 0 followers, 1 media. No metrics yet, no GA4, no comments, no engagement file for
  today, no calendar.yaml, no weekly report, no experiments.

So every view has a real empty state that says what will appear and when ("First numbers for
this reel arrive 25 Oct 18:07 UTC"). A mockup may only use fixtures produced by `data.py`. The
designer may add **one** clearly labelled "preview with sample numbers" toggle per mockup so the
charts can be judged, but the default view is the real data.

## 3. Views

Sidebar, in this order, with counts where they mean something:

1. **Overview**: the answers to §1 a–e on one screen. "Needs you" first and biggest. Then this
   week's calendar strip (7 days, slots as chips with state). Then live reels with their latest
   numbers. Then health.
2. **Approve** (badge = waiting count). **This is the screen that is "awful" today.** Per post,
   one card: the video big (9:16, playable, poster = cover), the caption editable with a marker
   where Instagram cuts it ("… more" at 125 characters) and the humanizer/lint verdicts as
   plain words, the first comment, the QA report as a checklist of green/amber lines (not a code
   block), operator overrides shown as amber facts, slot time editable, trial flag, experiment,
   engine. Actions: **Approve** (filled accent), **Reject** (needs a note, popup), **Save
   caption**. Keyboard: J/K move, A approve, R reject. Must work at 390 px too (approving from
   a phone is a real case).
3. **Calendar**: the week as 7 columns × the two slots (06:30 and 18:30 UTC), each cell a post
   chip (state colour, pillar, hook id) or empty. Click = the post. Drag to reschedule is not
   required; a time field in the post popup is.
4. **Posts**: one row per post: cover thumb, pillar + angle, state, published, views, reach,
   sends/reach, saves/reach, follows/reach, skip rate, hold, link to the reel. Sort by any
   column. A post popup with all three windows and the derived ratios; small inline SVG
   sparklines where ≥3 points exist.
5. **Today**: the two daily human jobs side by side: **Replies to send** (drafted comment and DM
   replies with Copy, "Mark sent") and **Engagement round** (10 rows: account · post link ·
   planned time · the comment · Copy · tick). Today both are empty: say why and when they fill.
6. **Learn**: the weekly report rendered (not markdown source), experiments table with verdicts
   and "directional only" marks, lessons list, strategy deltas with Accept / Reject.
7. **Settings**: per client: the switchboard (`auto_reply.comments`, `auto_reply.dm`,
   `auto_approve_pillars`), **Emergency stop** (big, red, confirm popup), token expiry and
   refresh, Page/IG ids, cron status, links to the plan and playbook.

Top bar: client selector (Rosa today), data freshness ("Data 24 Oct 21:22 UTC · live"), and a
search box is NOT needed.

## 4. Look

- **Base: the Oneshot product language**, verbatim from
  `~/Projects/oneshot/dashboard/mockups/soft-cards/src/index.html` (picked by Shahar, locked):
  Manrope (file in `dashboard/fonts/`), ground `#F5F7FB`, white cards radius 20 with the soft
  shadow, inner radius 12, 240 px white sidebar, 28 px page title, 15 px body, tabular figures,
  `--ink #0B1220 / #4B5563 / #6B7280`, rule `#E5E8EF`, green `#1A7F37` on `#EDF7F0`, red
  `#C0182B` on `#FCEBED`, popups as a centred 600 px card over a white 80 % veil, one action
  grammar (link = blue text with ↗; copy = outline pill; changes the record = the one filled
  accent button; destructive = red).
- **Lead accent is open.** Oneshot's purple belongs to Oneshot. Each direction proposes one
  accent with five tints; Shahar locks one at the gate. Candidates to consider: a deep ocean
  blue, a teal, a warm coral. Green and red stay for status only.
- References: `~/Projects/oneshot/dashboard/ref/*.png` (13 product dashboards) and the Oneshot
  dashboard itself, live at `http://127.0.0.1:8970/` (run `node dashboard/server.mjs --sync 0`
  in `~/Projects/oneshot`) or its shots in `dashboard/ref/oneshot-*.png` (local only, not in
  git). Stripe's dashboard for calm tables. Later.com / Buffer / Metricool for how a social
  calendar and a reel card are usually drawn; take only what beats them.
- Targets 1440 and 1920 full width (sidebar + fluid content); 1024 holds; **Approve** also at
  390.

## 5. Hard rules (Oneshot §5, kept)

- Charts are inline SVG from `data.json`; labels or axes on every chart; value on hover and on
  focus; designed empty state. No chart library.
- One type family, self-hosted, tabular figures everywhere a number appears.
- Cards white, radius 12–20, no borders beyond hairlines, one soft shadow. No gradients as
  decoration, no cream, no editorial serif, no all-caps labels over headings, no 01/02/03.
- AA contrast, full keyboard use, visible focus ring, reduced motion honoured. Numbers count up
  once; nothing loops.
- Under 300 KB before data. `data.json` loads once; the live server can push updates (SSE) but a
  static open from `file://` must still render everything.
- No jargon: state names are translated ("Waiting for you", "Scheduled", "Live, measuring",
  "Failed, needs a hand"). Slot ids appear only as a quiet secondary label.

## 6. Architecture the design must fit (not up for debate)

- Python stdlib server (`spine/review/app.py` becomes `dashboard/server.py`): serves one HTML
  template with `data.json` injected, streams media from `posts/<slot>/`, accepts exactly these
  writes: approve / reject with note / save caption / reschedule, flags and emergency stop,
  engage tick, reply "mark sent", manual-handoff media id, learn verdicts. Every write is a
  state-machine transition or a journal line; nothing else. No Node in production; Node is
  allowed for the look loop (Playwright shoots) only.
- One self-contained HTML (CSS + JS inline, font inline or in `dashboard/fonts/`), hash routes
  per view, client-side render from the JSON. Same file works from `file://`.

## 7. Agents and outputs

- **Creative director** → `dashboard/concepts.md`: three directions that differ in **structure
  and hierarchy**, not skin: e.g. (A) approvals-first "inbox" where the whole app is a queue;
  (B) calendar-first "planner" where the week is the spine and everything hangs off a slot;
  (C) performance-first "studio" where reels are tiles with their numbers and approvals are a
  rail. For each: the idea in one sentence; what it takes from which reference; palette (accent
  + 5 tints) and why; the Overview and the Approve screen as grid sketches at 1440 and 390; how
  every action and popup works; what it leaves out on purpose. Open the real `data.json` and
  design for the thin data of today.
- **Designer** → `dashboard/mockups/{a,b,c}/index.html` + `notes.md`: one self-contained file per
  direction with `data.json` embedded, Overview + Approve + Calendar + Posts working (hash
  routes), popups working without saving, the real showreel cover at
  `clients/rosa/posts/2026-w43-01/cover.jpg` referenced by relative path (not copied into git).
  Look loop: `node ~/Projects/oneshot/tools/shoot.mjs <file> --out dashboard/mockups/<x>/shots`
  at 1440 and 390, open the sheets beside 2–3 named references and the Oneshot overview, write
  what is concretely worse (sizes, gaps, hierarchy, chart quality), revise. At least 3 rounds
  on Overview + Approve before the other views, 1 more after. A round with no visible change
  fails. Shots are scratch (gitignored).
- **Critic** → `dashboard/critique.md` + `dashboard/side-by-side.png`: per variant /100: data
  honesty 25 (every number traced to `data.json`), Shahar's questions 25 (time to each §1
  answer, where the eye lands first, on Overview and on Approve), craft against references 25
  (located gaps with numbers), charts and empty states 15, accessibility and speed 10. Hard
  fails: an invented number; a raw state name or slot id as a title; an action ambiguous about
  what it does; contrast under AA; a chart library; Approve broken at 390.

## 8. Gate

Stop after the critic. Show Shahar the three Overviews and the three Approve screens side by
side at 1440, plus the critic table. He picks a direction and an accent. Only then: the picked
mockup becomes `dashboard/template.html`, `dashboard/server.py` replaces `spine/review/app.py`,
the remaining views are built in the same look with the same loop and a final critic pass.
