# Tachyon operator dashboard, run `dash-01`: three directions

Creative director, 2026-10-24. Task layer: `dashboard/BRIEF.md`, which overrides
`~/Projects/oneshot/agents/creative-director/base.md` where they conflict; the Oneshot `dashboard/BRIEF.md` §5
hard rules hold where this brief is silent. Product UI for one operator, so base.md's archetype, photo and
sampled-colour rules do not apply. What does apply from base.md: three directions that differ in structure, the
divergence written down, nothing decided by habit.

Everything below is sized against `dashboard/data.json` generated 2026-10-24 18:22 UTC. No number in this file
is invented; where the data has no value, the empty state is written out.

## 0. What I looked at, and what is wrong today

### 0.1 The current approvals page (`dashboard/ref/tachyon-review-today.png`, 1440×900, and `spine/review/app.py`)

1. **The page is read-me-the-database.** Column heads are `slot`, `state`, `ig_media_id`, `updated`. Row titles
   are slot ids (`2026-w43-01`). States are raw (`MEASURING`, `QUEUED`). Times are ISO strings 25 characters
   long (`2026-10-24T18:06:17+00:00`). The switchboard pills read `auto_reply.comments: off`, and the section
   is titled "Switchboard · grants.yaml". Six of the brief's "never" list on one screen.
2. **Type is 14 px system-ui**, meta 12 px, pills 11 px, `h1` 18 px. The brief asks for 15 px body and a 28 px
   title. The smallest text on the page is 11 px.
3. **The most destructive action is the most prominent.** EMERGENCY STOP (`#991b1b`, 152×29 px) is the only
   filled button on the page, 18 px to the right of two outline "turn on" buttons, and it posts with no
   confirmation (`do_POST → set_flag`, no second step). Approve, when it exists, is a green-tinted outline
   button of the same size as Reject.
4. **The hierarchy is upside down.** Switchboard first (y 93–178), approvals second (y 214), the post list
   third. The brief's first question, "what needs me right now", is answered by a 13 px grey "Nothing waiting."
   at y 246.
5. **55 % of the viewport is empty.** Content ends at y≈400 of 900. `main` is capped at 1280 px so 136 px on the
   right is unused at 1440. Nothing says what happens next (the second reel posts in 12 h; first numbers in
   24 h). Both facts are in the data.
6. **The approval card, when one exists** (`app.py` lines 94–111): video 270 px wide (so 480 px tall), caption
   in a 90 px monospace `textarea` (a 617-character caption scrolls; no marker for Instagram's cut), QA as a
   12 px `<pre>` capped at 220 px, `meta.json` dumped as a JSON string, one `note` input shared by Approve and
   Reject with the placeholder "note (required to reject)". No keyboard. At 390 the `270px 1fr` grid overflows
   (270 + 20 + a 90 px textarea minimum in a 342 px content box).
7. **No link to the live reel** although `permalink` is in the data, no cover, no caption, no "first numbers at".

### 0.2 The brief's §1 questions against today's `data.json`

| Question | What the data holds today | Gap the design must carry |
|---|---|---|
| a. What needs me | `needs_you: []`, `listen.comments_waiting: null`, `engage.file: false`, `reports: []` | Token expiry is not in `data.json` at all (DATA.md has no field). Report as a data gap; design the slot. |
| b. Live and scheduled | 2 posts with `scheduled_at` / `published_at`; `calendar: null` | A week strip can be drawn from posts alone; cells with no post and no calendar say so. |
| c. Performance | `metrics.by_window: {}`, `next_window_at: 2026-10-25T18:06:50Z` for w43-01, `null` for w43-02 | Every metric column is an empty state with a time. |
| d. Converting | `ga4.sessions_by_campaign: null`, `conversions: []` | One sentence, from `ga4.note`. |
| e. Healthy | `costs: []`, `journal_recent` 24 rows, 0 posts in `FAILED`, `emergency_stop: false`, `qa.warns` 3 + 1 | Publish failures 0 of 1 and QA catches 4 are derivable. Operator minutes and cost are not recorded. |

### 0.3 The data today, as the page will say it

- Rosa (`@rosasurfapp`). Saturday 24 Oct, ISO week 43 (Mon 19 – Sun 25).
- **Showreel** (`2026-w43-01`): 30 s, pillar "Free, and why", angle "showreel: what Rosa is". Published Sat 24 Oct
  18:06 UTC (the slot was 18:30; it went out 24 min early because the operator approved in chat and the queue ran).
  State `MEASURING` → "Live, measuring". First numbers 25 Oct 18:07 UTC. Permalink exists. QA: 9 lines, 3 warns, 2
  operator overrides (stale spot count; Pixabay footage). Caption 617 characters; the hook line is 78.
- **Favorites** (`2026-w43-02`): 15 s, same pillar, angle "favorites: all your breaks on one screen". `QUEUED` →
  "Scheduled, Sun 25 Oct 06:30 UTC" (in 12 h at generation time). QA: 8 lines, 1 warn, no overrides. Caption 591
  characters; the hook line is 71. QA line 5 carries the only lint/humanizer verdict in the data: "ig-human 87.5,
  caption lint READY".
- Account: 0 followers, 1 post, 0 views. Engine `html-playwright v0` on both; `trial: false`; no experiment.
- Nothing in production (`in_production: 0`). Journal: 24 lines, the last at 18:14:42.

### 0.4 References

All 13 PNGs in `dashboard/ref/`, the three Oneshot shots, and today's page were opened.

| File | Product | Good at (take) | Does not fit Tachyon (leave) |
|---|---|---|---|
| `…09-25 15-38-36` | 23andMe | Reached nodes filled, unreached grey outline, joined by a line. The post lifecycle drawn this way. | Nothing. |
| `…09-25 15-40-32` | Ancestry Compare | One row per measure, a value per column, chevron per row. The 24 h / 72 h / 7 d table. | The donuts. |
| `…09-27 15-36-13`, `15-44-34` | Sypher | Tabs that filter a table (All · Unpaid · Paid); a stat with a thin segmented bar under it; 12-row table with 32 px rows. | The 11 px labels. |
| `…09-27 15-36-41` | Mondly | One highlighted card in a row (the "Now" card, filled); a 48 px numeral with a 13 px grey label beside it. | Avatars. |
| `…09-27 15-38-04` | Shopeers | Four KPI cards, title 14 px + numeral 24 px + context 11 px, 16 px radius; the day-of-week bar chart with one filled bar. | The AI assistant orb. |
| `…09-27 15-38-28` | Nexus | Tints of one hue as the only colour in charts. | Nothing structural. |
| `…09-27 15-38-48` | Logip | Stat strip with dividers instead of cards; a task list with status dots; right rail of activity 280 px. | The greeting. |
| `…09-27 15-41-49` | NexaFlow | One solid accent block holding three figures in white; small "Pending approvals 2" card with a link line. | The donut. |
| `…09-27 15-42-53` | Nodus | One 64 px numeral with the period under it; range chips 1D 1W 1M. | The dark filter pills. |
| `…09-27 15-43-09` | FinGuard | "Secure your account further by: [pill] [pill]": a sentence then labelled actions. History rows with a status pill and a type pill. | The statement card. |
| `…09-27 15-45-44` | Dasbor | A To-Do column with checkboxes at the right of the page. The engagement round is exactly this. | The gradient ground. |
| `…09-27 15-46-57` | Models (R.) | Table rows with a status dot, a sparkline column, and a right-hand "signal map" card (name · dot · value · bar). | 12 px type. |
| `oneshot-overview.png` | Oneshot, built | 28 px title; summary sentence with the count in bold; "Sites to pitch 5" list with 160×100 thumbs, one filled button per row (180×36), ghost Hand off; sidebar 240 with a filled badge on Needs you and ink3 counts. | The sidebar footer still says `main 8b31101 · 475 ledger lines · test mode`. Do not inherit it. |
| `oneshot-sites.png` | Oneshot, built | 3-up cards 368 wide, thumb 16:10 bleeding to the card edge, 48 px score numeral beside PASS/FAIL words, a 6-point sparkline with hover tooltip. | Pill wrap into three rows under each card. |
| `oneshot-decisions.png` | Oneshot, built | Section title + grey count chip + one-line explanation; two-column cards; "Show the full reason" as an underlined text link. | Nothing. |

## 1. Shared by all three directions

### 1.1 Action grammar: four kinds, four looks, plus one quiet write

| Kind | Tachyon actions | Look | Behaviour |
|---|---|---|---|
| **Opens a website** | Open on Instagram ↗, Open rosa.surf ↗, the UTM link, Plan ↗, Playbook ↗ | `#1F4BFF` text, weight 600, ↗ icon 12 px, no fill. Blue is used for nothing else. | New tab. Nothing changes. |
| **Copies text** | Copy (reply, DM, engagement comment, first comment, UTM link) | Outline pill: white, 1.5 px `#E5E8EF`, ink text 15/700, 36 px tall, copy icon left. On click: check icon + "Copied" 1.6 s, polite live region. | Clipboard only. |
| **Changes the record (primary)** | Approve · Save · Accept · Mark sent · Resume publishing | The one filled accent button in its container, 44 px (48 px at 390), white text. One per card or popup, never two. | A state transition or a journal line. Toast 4 s: "Approved. Posts Sun 25 Oct 06:30 UTC." |
| **Changes the record (quiet)** | Save caption · Reschedule · tick an engagement line · turn a flag on or off | Outline pill, ink text, 36 px; a tick appears in the pill for 1.6 s after the write. Flags are 44×24 switches with the word On / Off beside them. | A journal line; no toast. Stays secondary so Approve is never confused with Save. |
| **Destructive** | Reject (with note) · Emergency stop · Turn auto-reply on | Reject: `#C0182B` text on `#FCEBED`, 44 px, never filled. Emergency stop: filled `#C0182B`, white, 48 px, alone in its card. Turning a flag on is a confirm popup because it lets the machine post without you. | Always a popup first. |

Each container shows only the actions its state allows (`spine/state.py` TRANSITIONS). A post in `QUEUED` offers
Reject and Reschedule, not Approve. A post in `MEASURING` offers Open on Instagram ↗ only.

### 1.2 The popup

One component for every popup on the page.
- Centred, 600 px wide, radius 20, padding 28, over `rgba(255,255,255,.8)`. Title 22/700, subtitle 15 ink2.
  Close is a 40 px ×. Esc, veil click, × close it. Focus is trapped and returns to the opener.
- Footer: right-aligned, [Cancel] outline then the one primary. Destructive primaries are red per §1.1.
- Below 640 px it is a bottom sheet: full width, 16 px gutter, radius 20 top only, the primary 48 px full width,
  the footer sticky.
- In a static mockup every primary is enabled and the write shows a 4 s toast "Saved in the mockup only. The
  dashboard server records this for real."

The popups that exist (every direction uses this set; the direction decides where they open from):

| Popup | Title | Body | Primary |
|---|---|---|---|
| Reject | "Send back — Favorites" | "Tell Claude what to change." Textarea, required, 3 rows. The post returns to Script with your note. | **Send back** (red) |
| Reschedule | "Change the time — Favorites" | Date + time (UTC) field, default the current slot; the two house slots 06:30 and 18:30 as chips; a line "Containers are made 24 h before the slot, so a time under 24 h away publishes on the next cron run." | **Save time** (accent) |
| Post | "Showreel · 30 s" | The approval card's right column (§1.4 items 2–9) read-only, plus the 24 h / 72 h / 7 d table. | none; Open on Instagram ↗ |
| Emergency stop | "Stop everything for Rosa?" | "The queue halts. Nothing publishes until you resume. The favorites reel scheduled for Sun 06:30 UTC will wait." | **Stop publishing** (red) |
| Resume | "Resume publishing for Rosa?" | "The queue runs again on the next cron tick (every 10 min)." | **Resume** (accent) |
| Flag on | "Let Claude reply to comments on its own?" | What it does, and "You can turn it off here any time." | **Turn on** (accent) |
| Delta | "Strategy change — cadence" | The diff rendered as "was / proposed", the reason line. | **Accept** (accent) / Reject (red text) |
| Preview numbers | "Preview with sample numbers" | "These numbers are made up so the charts can be judged. The real view is empty until 25 Oct 18:07 UTC." | **Show sample** (outline) |

### 1.3 State translations (`spine/state.py`, all 16)

Colour roles: **accent** (waiting on you: accent fill or accent text on its t5 tint), **green** `#1A7F37` on `#EDF7F0`
(live), **red** `#C0182B` on `#FCEBED` (failed), **amber** `#8A4B00` on `#FFF4D6` (6.2:1; overrides and warns),
**grey fill** ink2 `#4B5563` on `#EEF0F3` (6.6:1; scheduled, done), **grey outline** ink3 text, 1 px `#E5E8EF`
(in production).

| State | Plain words (pill) | Second line where there is room | Role |
|---|---|---|---|
| IDEA | In production: idea | | grey outline |
| BRIEFED | In production: briefed | | grey outline |
| SCRIPTED | In production: scripted | "Revision 1 of 2" when `qa_rounds` > 0 | grey outline |
| RENDERED | In production: rendered | | grey outline |
| QA | In QA | | grey outline |
| NEEDS_APPROVAL | **Waiting for you** | "since Fri 17:40" from `updated_at` | accent |
| APPROVED | Approved | "Queues within 10 min" | grey fill |
| QUEUED | Scheduled | "Sun 25 Oct 06:30 UTC · in 12 h" | grey fill |
| PUBLISHING | Publishing now | "Started 06:30:04" | grey fill |
| PUBLISHED | Live | "First numbers 25 Oct 18:07 UTC" | green |
| MEASURING | Live, measuring | "24 h numbers in 23 h" or "72 h numbers Tue" | green |
| ANALYZED | Measured | "7-day numbers in" | grey fill |
| REJECTED | Sent back with your note | the note, 1 line | grey fill |
| FAILED | Publish failed, retrying | the error in words, 1 line | red |
| NEEDS_INPUT | QA stuck after 2 rounds, needs your call | | accent |
| MANUAL_HANDOFF | Post it by hand, then paste the id | | red |

Slot ids (`2026-w43-01`) appear only as a 13 px ink3 secondary label at the end of a meta line, never as a title.
The title of a post is its angle before the colon, capitalised: "Showreel", "Favorites".

### 1.4 The approval card, every direction

The card holds, in this order (data path in brackets):

1. **Video**, 9:16, `<video controls preload="metadata" poster=cover_url>`, 360×640 at 1440 (`media_url`,
   `cover_url`). Below it, 13 px ink3: "30 s · 1080×1920 · html-playwright v0" (`length_s`, `qa.spec`, `engine`).
2. **Title row**: "Showreel" 22/700 · pill "Waiting for you" · "Posts Sun 25 Oct 06:30 UTC" with the pencil that
   opens Reschedule (`scheduled_at`). Second line 15 ink2: "Free, and why · showreel: what Rosa is · link in bio +
   first comment" (`pillar`, `angle`, `cta`). Third line 13 ink3: "Trial: no · Experiment: none · 2026-w43-01"
   (`trial`, `experiment_id`, `slot_id`). When `trial` is true the pill reads "Trial reel" in grey fill; when
   `experiment_id` is set, "Experiment: hook A/B" links to Learn.
3. **Caption**, editable, 16 px / 1.6, min-height 8 lines, auto-growing (`caption`). A 1 px `#E5E8EF` rule is drawn
   after character 125 with the label "… more" in 13 px ink3 on the rule, right-aligned. It moves as you type. Under
   the box, left: "617 characters · Instagram shows 125 before … more"; right: **Save caption** (quiet write).
   Verdicts as words under the counter, 15 px, each with a dot:
   - "Hook survives the cut" (green) when the first line ≤ 125 characters, else "Cut mid-sentence after '…'" (amber)
     with the three words before the cut. Today: showreel hook 78 characters, favorites 71; both green.
   - "Reads human · 87.5/100" (green ≥ 70, amber 55–69, red < 55) and "Caption lint: ready" (green) when present.
     Today only w43-02 has them, inside a QA line; w43-01 has none → "Not scored" in ink3. **Data gap:** `meta.json`
     has no humanizer or lint field; `data.py` should parse them into `posts[].caption_checks`.
4. **First comment** (`first_comment`): a soft box `#F5F7FB` radius 12, 15 px, with the UTM link as blue ↗ and
   a Copy pill. Label: "First comment, posted right after the reel".
5. **QA as a checklist** (`qa.lines`): one row per line, 15 px, 8 px gap. Green check when the line ends in PASS;
   amber triangle when it contains WARN or STALE; grey dot otherwise (notes such as "Cover at 7 s"). Head: "QA ·
   approved with 3 warnings" from `qa.verdict` + `len(warns)`, or "QA · approved, clean" when `warns` is empty. The
   spec line first: "Spec: 1080×1920 · 30 fps · 30.1 s · 23.0 MB · metadata stripped". **Data gap:** `data.json`
   reduces `qa.md`'s spec line to `qa.spec: "PASS"`; `data.py` should carry the line's text so the card can show it.
6. **Your overrides** (`operator_overrides`): amber facts, one per line, each prefixed with the date: "24 Oct · Stale
   spot count 2,741 on screen (live 3,056): posted as-is". Omitted when empty (favorites).
7. **Source**: "From rosa-showreel-v14-30s-blues-9x16.mp4 · cover at 7 s" (`source_asset`, `thumb_offset`/1000).
8. **Actions**, bottom of the right column, 24 px above the card edge: **Approve** (filled accent, 44 px, 160 px
   wide) · Reject (red on red-bg, 44 px) · and at the far right Open on Instagram ↗ when `permalink` exists.
9. **Keyboard**: J next card, K previous (the focused card gets the 2 px accent outline and scrolls to top); A opens
   nothing, it approves the focused card after a 2 s undo toast ("Approved · Undo"); R opens Reject for the focused
   card; Esc closes; ? shows this list. Keys are listed once at the top of the view in 13 px ink3: "J K move · A
   approve · R reject".

Only `NEEDS_APPROVAL` posts get the full card. Approve is never shown for any other state.

### 1.5 Empty states, exact copy for today

| Where | Copy |
|---|---|
| Overview, Needs you | "**Nothing needs you.** The favorites reel posts Sun 25 Oct 06:30 UTC. First numbers for the showreel arrive 25 Oct 18:07 UTC." |
| Approve | "**No post is waiting for approval.** The next one appears here when QA passes it. Both of this week's reels are already approved: Showreel is live, Favorites posts Sun 06:30 UTC." plus two compact read-only rows linking to the Post popup. |
| Calendar, next week | "No plan for week 44 yet. Plan runs Monday and fills this week." (`calendar: null`) |
| Calendar, an empty cell this week | nothing; a 1 px dashed `#E5E8EF` rounded rectangle 32 px tall, no text. |
| Posts, metric cells | "—" in ink3 with the title attribute "First numbers 25 Oct 18:07 UTC". The Post popup table: a row per window, "Arrives 25 Oct 18:07 UTC / 27 Oct 18:07 UTC / 31 Oct 18:07 UTC". |
| Posts, sparkline column | hidden until ≥ 3 points exist for any post (brief §3.4). |
| Today, Replies | "No replies drafted. Comment and DM alerts start once the listener is deployed; Claude drafts replies every morning after that." (`listen.note`) |
| Today, Engagement | "No engagement round for Sat 24 Oct. Plan writes one each day it runs; the first comes with week 44's plan on Monday." (`engage.file: false`) |
| Learn | "No weekly report yet. Learn runs on Sundays once a full week of numbers exists; the showreel's 7-day numbers land 31 Oct, so the earliest report is Sun 1 Nov." (`reports: []`; the Sunday is PLAN §3.7) |
| Learn, experiments | "No experiment this week. Both reels are existing clips; the first pre-registered test comes with week 44's plan." |
| Overview, Converting | "Sessions per reel appear once GA4 is connected; the UTM links are already live (campaign 2026-w43-01 and -02)." (`ga4.note`) |
| Overview, Account | "0 followers · 1 post · account numbers start tomorrow" (`account_latest`). Never five zero tiles. |
| Health, costs | "No cost recorded yet. Render and model costs appear per reel once `costs` is written." |
| Health, token | "Token expiry is not reported yet" in ink3 (not in `data.json`; §6). |

### 1.6 Approve at 390 px

Shared mechanics; each direction's §"At 390" says how you get there.
- The sidebar becomes a 56 px top bar: logo, view name, a menu button opening the seven views as a sheet with their
  badges. Gutter 16 px. `scrollWidth` = 390.
- One card per screen. The video is 9:16 at 240×427, centred, with the cover as poster; a tap plays inline. Under
  it the title row, then the caption (collapsed to the first 125 characters + "… more" marker; a tap expands), then
  the verdict words, then QA as a `<details>` "QA · approved with 3 warnings" collapsed, overrides visible, first
  comment collapsed.
- A sticky bottom bar 72 px: Reject (red-bg, 44 px, 112 px wide) left, **Approve** (filled, 48 px, fills the rest).
  Safe-area inset respected.
- Next and previous: a "1 of 1" label at the top with ‹ › 44 px buttons; swipe left/right moves card. J/K/A/R still
  work with a keyboard attached.
- Save caption appears only while the caption has focus, as a 36 px pill under the box.

### 1.7 Left out by all three, on purpose

The journal as a feed (24 rows of `post.state` tell the operator nothing he can act on); account zeros as tiles;
raw flag names; file paths; ISO timestamps (times are "Sun 25 Oct 06:30 UTC", relative "in 12 h" beside them);
a search box; a global date range; chart libraries; sparklines before three points exist.

## 2. Direction A: "Inbox"

**The idea:** the whole app is one queue. Everything that waits on Shahar is a card in one list, newest deadline
first; the Overview is the top of that queue with the week and the live reel folded under it; every other view is
a filter on the same cards.

**References, what it takes**
- **Logip** `15-38-48`: the task list with status dots and a right rail; here the rail is "This week" and "Live".
- **FinGuard** `15-43-09`: sentence-then-pills for the actions in each card ("Before it posts: [Save caption]
  [Change time]").
- **Dasbor** `15-45-44`: the Today checklist, which becomes the engagement round inside the queue.
- **Oneshot overview**: the summary sentence with the bold count, the one filled button per row.

**Accent: teal `#0B6E6E`.** White on it 6.05:1; it on white 6.05:1; on the ground 5.64:1. Tints: t1 `#489292`
(chart lines; 3.6:1 on white, graphics only), t2 `#85B6B6` (chart fills), t3 `#B6D4D4` (selected-row bar), t4
`#DAE9E9` (sidebar current item), t5 `#EEF5F5` (pill ground; accent text on it 5.48:1). Why teal here: the Inbox puts
Approve (filled accent) 12 px from Reject (red) on every card, and a blue accent would sit beside the blue links on
the same row; teal is the one candidate far from both red and link-blue. Risk: teal near the green "Live" pill;
mitigated because green appears only in pills with a green ground and teal only as a fill, a bar or a badge.

### Overview at 1440 (sidebar 240, content 1152)

```
┌ sidebar 240 ──┬──────────────────────── content 1152 ────────────────────────────────────────┐
│ ■ Tachyon     │ Overview        Rosa ▾            ● Data 24 Oct 18:22 UTC · live             │
│ Overview ◀    │ Nothing needs you. Favorites posts Sun 06:30 UTC; showreel numbers 18:07 UTC. │ 17 px
│ Approve   0   │ ┌ queue 768 ────────────────────────────────┐ ┌ rail 360 ────────────────────┐│
│ Calendar      │ │ Needs you (0)                              │ │ This week · Mon 19 – Sun 25  ││
│ Posts     2   │ │ ┌ empty ─────────────────────────────────┐ │ │ M  T  W  T  F  S  S          ││
│ Today     0   │ │ │ ✓ Nothing needs you.          40 px ✓  │ │ │ ·  ·  ·  ·  ·  ▣  ▢   06:30 ││
│ Learn         │ │ │ Favorites posts Sun 25 Oct 06:30 UTC.   │ │ │ ·  ·  ·  ·  ·  ●  ·   18:30 ││
│ Settings      │ │ │ First numbers for Showreel 25 Oct 18:07.│ │ │ ● Live  ▢ Scheduled          ││
│               │ │ └────────────────────────────────────────┘ │ │ Next week: no plan yet.      ││
│               │ │                                            │ ├──────────────────────────────┤│
│               │ │ Coming up (1)                              │ │ Live (1)                     ││
│               │ │ ┌ card ──────────────────────────────────┐ │ │ ┌ cover 96×171 ┐ Showreel   ││
│               │ │ │ ┌cover┐ Favorites · 15 s   Scheduled    │ │ │ │              │ 30 s      ││
│               │ │ │ │96×  │ Sun 25 Oct 06:30 UTC · in 12 h  │ │ │ │              │ Live since ││
│               │ │ │ │171  │ Free, and why · favorites: all… │ │ │ └──────────────┘ 18:06 UTC  ││
│               │ │ │ └─────┘ QA approved, 1 warning          │ │ │ Views  —   Reach  —         ││
│               │ │ │ Before it posts: [Save caption] [Change │ │ │ Sends/reach — Saves/reach — ││
│               │ │ │ time]                  Send back        │ │ │ First numbers 25 Oct 18:07  ││
│               │ │ └────────────────────────────────────────┘ │ │ Open on Instagram ↗         ││
│               │ │                                            │ ├──────────────────────────────┤│
│               │ │ Today's hand work (0)                      │ │ Health                       ││
│               │ │ No replies drafted (listener not deployed).│ │ Publishes 1 of 1 · QA catches││
│               │ │ No engagement round for Sat 24 Oct.        │ │ 4 · Stop: off · Cost: none   ││
│               │ └────────────────────────────────────────────┘ └──────────────────────────────┘│
└───────────────┴──────────────────────────────────────────────────────────────────────────────┘
```

- The queue column lists three groups with counts: **Needs you**, **Coming up** (scheduled posts, which have quiet
  writes but no primary), **Today's hand work** (replies + engagement). Empty groups keep the heading and one line.
- The "Nothing needs you" card is 96 px tall with a 40 px green check disc; it is the biggest thing above the fold
  and it carries the two next times. When `needs_you` has items, this card is replaced by the approval cards (§1.4)
  at full width of the queue column, 768 px: video 300×533 left, 412 px right column.
- The rail is 360 px: the week strip as 7×2 dots (16 px, state colour, today's column with a t4 ground), the live
  reel with its metric slots as dashes, and a one-line health strip.

### Overview at 1024 (rail 72, content 904)

The queue is 904 wide and the right rail becomes two cards under it: "This week" (strip full width, 14 cells of
108 px) then "Live" as a row (cover 64×114, title, five metric slots). Health stays one line.

### Approve at 1440

```
│ Approve   0   │ Approve                            J K move · A approve · R reject            │
│               │ No post is waiting for approval. Both of this week's reels are approved:      │
│               │ ┌ row ─────────────────────────────────────────────────────────────────────┐ │
│               │ │ ▌cover 48×85  Showreel · 30 s   Live, measuring   Open on Instagram ↗     │ │
│               │ │ ▌cover 48×85  Favorites · 15 s  Scheduled Sun 06:30 UTC   [Change time]  │ │
│               │ └──────────────────────────────────────────────────────────────────────────┘ │
│  with a waiting post:                                                                        │
│               │ ┌ card 1152 ───────────────────────────────────────────────────────────────┐ │
│               │ │ ┌ video 360×640 ┐  Favorites           ● Waiting for you   Sun 06:30 ✎   │ │
│               │ │ │               │  Free, and why · favorites: all your breaks … · link… │ │
│               │ │ │               │  Trial: no · Experiment: none · 2026-w43-02           │ │
│               │ │ │               │  ┌ caption 16 px, 125-marker rule "… more" ─────────┐ │ │
│               │ │ │               │  │ All your spots on one screen. Free, worldwide. …  │ │ │
│               │ │ │               │  └───────────────────────────────────────────────────┘ │ │
│               │ │ │               │  591 characters · 125 before … more    [Save caption] │ │
│               │ │ │               │  ● Hook survives the cut  ● Reads human 87.5  ● Lint ok│ │
│               │ │ │               │  First comment …  Copy                                 │ │
│               │ │ │               │  QA · approved with 1 warning   (8 rows, check/▲/·)   │ │
│               │ │ └───────────────┘  From rosa-favorites-9x16.mp4 · cover at 9.5 s         │ │
│               │ │  30 s · 1080×1920   [ Approve ]  [ Send back ]           Open ↗ (if live)│ │
│               │ └──────────────────────────────────────────────────────────────────────────┘ │
```

Cards stack vertically, 24 px apart, oldest `updated_at` first. The focused card has a 2 px accent outline.

### Approve at 390

Cards become a horizontal pager (§1.6). The top bar reads "Approve · 1 of 1". The sticky bottom bar holds Send back
and Approve. The empty state is the two compact rows, full width.

### Sidebar order

Overview · Approve (badge) · Calendar · Posts (count) · Today (count) · Learn · Settings. The brief's order, kept.

### The other views, shorter

- **Calendar**: the rail strip grown to 7 columns × 2 rows of 120×72 chips, each chip cover 32×57 + title + state
  dot; a click opens the Post popup; week ‹ › at the top; next week shows the §1.5 line across all 14 cells.
- **Posts**: a Sypher table, 48 px rows: cover 32×57 · title + pillar · state pill · published · 7 metric columns
  as "—" today · Open ↗. Sort arrows on every head. Row click opens the Post popup.
- **Today**: two cards side by side, 564 px each; both the §1.5 empty lines today. With data: Replies rows
  (avatar-less: handle · the comment · the drafted reply · Copy · Mark sent) and the engagement round as a Dasbor
  checklist (account · post ↗ · planned 14:10 UTC · the comment · Copy · ☐).
- **Learn**: the weekly report as rendered sections with 18 px heads; experiments table; lessons list; deltas each as
  a card with Accept (filled) / Reject (red text). Today: the three §1.5 lines.
- **Settings**: a card per block: Switchboard (three switches with words: "Claude replies to comments: Off"),
  Emergency stop alone in a red-bordered card, Account ids as "Page 1450505061475499 · Instagram 17841452024696422"
  with Copy, Token "expiry not reported yet", Cron "last run 18:14:42 UTC" from `journal_recent[0].ts`, links Plan ↗
  and Playbook ↗.

### Actions and popups in A

Every primary lives on a queue card. Reject, Reschedule, Emergency stop, Flag on open the §1.2 popup from where
they are clicked. The Post popup opens from Calendar chips, Posts rows and the rail's live reel. Learn's Accept is a
primary inside each delta card.

### Left out on purpose

- Big charts on the Overview. The week is 14 dots and the live reel is five labelled slots; charts live in Posts and
  Learn.
- A hero number. There is none worth 64 px today, and a zero at 64 px is the thing the brief forbids.
- A separate "scheduled" view; Coming up is a group in the queue.

**Risk:** when nothing waits (most days once auto-approve is on), the Overview is a check mark and two sentences
above the fold. The designer should make the Coming up card and the rail carry the eye instead, and the critic
should time question (b) on the rail strip.

## 3. Direction B: "Planner"

**The idea:** the week is the spine. The Overview is a 7-day × 2-slot board filling the screen; every post is a chip
in its cell; what needs you is a band above the board; approving, rescheduling and reading numbers all happen in a
side panel that opens from a cell.

**References, what it takes**
- **Mondly** `15-36-41`: the schedule row with one filled "Now" card; here today's column has a t4 ground and the
  next slot to fire has the accent outline.
- **23andMe** `15-38-36`: the lifecycle drawn as filled and outlined nodes, used in the side panel: Scripted ○ QA ○
  Approved ● Queued ● Published ○ Measured ○.
- **Sypher** `15-36-13`: the stat with a thin segmented bar; the band above the board is four stats with dividers.
- **Oneshot sites**: the cover bleeding to the card edge with radius 20 at the top.

**Accent: deep ocean blue `#0F4C81`.** White on it 8.86:1; it on white 8.86:1; on the ground 8.26:1. Tints: t1
`#4B79A0` (chart lines, 4.6:1 on white), t2 `#87A6C0` (chart fills), t3 `#B7C9D9` (next-slot outline), t4 `#DBE4EC`
(today's column), t5 `#EEF2F6` (pill ground; accent text on it 7.87:1). Why here: a calendar's chips are coloured
by state, so the accent must be far from green (live), red (failed) and grey (scheduled); ocean blue is the only
candidate that is. The collision is with link blue `#1F4BFF`; the rule in B is **accent as fill only, never as text
on white** (buttons, badges, the today column, pill grounds), so "blue text = a website opens" stays true. The
designer should place a link and an accent button in one row in round 1 and check they do not read as one family.

### Overview at 1440 (content 1152)

```
┌ sidebar 240 ──┬──────────────────────── content 1152 ─────────────────────────────────────────┐
│ ■ Tachyon     │ Week 43 · 19–25 Oct   ‹ ›  Today     Rosa ▾    ● Data 24 Oct 18:22 UTC · live  │
│ Overview ◀    │ ┌ band ───────────────────────────────────────────────────────────────────────┐ │
│ Calendar      │ │ Needs you 0 │ Scheduled 1 · Sun 06:30 │ Live 1 · numbers 25 Oct 18:07 │ Stop off│
│ Approve   0   │ └─────────────────────────────────────────────────────────────────────────────┘ │
│ Posts     2   │ ┌ board: 7 columns × 148, 2 rows × 220 ───────────────────────────────────────┐ │
│ Today     0   │ │        Mon 19   Tue 20   Wed 21   Thu 22   Fri 23   Sat 24 ▒   Sun 25       │ │
│ Learn         │ │ 06:30  ┌ ─ ─ ┐  ┌ ─ ─ ┐  ┌ ─ ─ ┐  ┌ ─ ─ ┐  ┌ ─ ─ ┐  ┌ ─ ─ ┐   ┌ chip ──────┐│ │
│ Settings      │ │        │     │  │     │  │     │  │     │  │     │  │     │   │ cover 60×107││ │
│               │ │        └ ─ ─ ┘  └ ─ ─ ┘  └ ─ ─ ┘  └ ─ ─ ┘  └ ─ ─ ┘  └ ─ ─ ┘   │ Favorites 15s││ │
│               │ │                                                                │ Scheduled    ││ │
│               │ │                                                                │ in 12 h     ││ │
│               │ │                                                                └─ t3 outline ┘│ │
│               │ │ 18:30  ┌ ─ ─ ┐  ┌ ─ ─ ┐  ┌ ─ ─ ┐  ┌ ─ ─ ┐  ┌ ─ ─ ┐  ┌ chip ─────┐ ┌ ─ ─ ┐    │ │
│               │ │        │     │  │     │  │     │  │     │  │     │  │ cover     │ │     │    │ │
│               │ │        └ ─ ─ ┘  └ ─ ─ ┘  └ ─ ─ ┘  └ ─ ─ ┘  └ ─ ─ ┘  │ Showreel  │ └ ─ ─ ┘    │ │
│               │ │                                                      │ ● Live    │            │ │
│               │ │                                                      │ 18:06 UTC │            │ │
│               │ └──────────────────────────────────────────────────────└───────────┘────────────┘ │
│               │ ┌ below the board, two cards 564 ──────────────┐ ┌───────────────────────────────┐│
│               │ │ Live this week (1)                            │ │ Today's hand work             ││
│               │ │ Showreel · views — · reach — · sends/reach —  │ │ No replies drafted (listener  ││
│               │ │ First numbers 25 Oct 18:07 UTC   Open ↗       │ │ not deployed). No round today.││
│               │ └───────────────────────────────────────────────┘ └───────────────────────────────┘│
└───────────────┴───────────────────────────────────────────────────────────────────────────────────┘
```

- Board: 7 columns of 148 px (1152 − 7×6 gaps − 48 row-label column ≈ 148), 2 rows of 220 px. Today's column has
  a t4 ground the full height. The next slot to fire (Sun 06:30) carries a 2 px t3 outline. A chip is 136×196: cover
  60×107 top-left, title 15/700, length, state pill, a relative time.
- A chip's actual time is shown when it differs from the slot: the showreel chip reads "18:06 UTC" under "Live",
  because it published 24 min before its 18:30 slot.
- Empty cells are dashed; next week's board (›) shows the §1.5 "No plan for week 44 yet" line across the board.
- The band is one card with four cells and dividers (Sypher). "Needs you 0" is a cell, not a hero.
- A click on a chip opens the **side panel**: 480 px, slides in from the right over a `rgba(255,255,255,.8)` veil
  on the content area only (the board stays visible behind), radius 20 on its left corners. The panel is the approval
  card's right column (§1.4 items 2–9) with the video 240×427 at the top and the lifecycle nodes under the title. For
  a `NEEDS_APPROVAL` chip the panel has Approve / Send back pinned at its bottom. For `QUEUED`: Change time / Send
  back. For `MEASURING`: the 24 h / 72 h / 7 d table (Ancestry rows) and Open ↗.

### Overview at 1024 (content 904)

Columns 118 px; chips drop the cover and keep title, state, time (136 → 106 px wide, 120 tall). Rows 160 px. The
two cards below stack full width. The side panel is 440 px.

### Approve at 1440

The Approve view is the same board filtered to `NEEDS_APPROVAL` plus a list: left, a 320 px column of waiting
chips as rows (cover 48×85, title, slot time, "since Fri 17:40"); right, the full §1.4 card for the selected one,
video 360×640. J/K move the selection in the list. Empty today: the column shows "No post is waiting" and the
right side shows the two approved reels as read-only cards with their slot times, because in B the question is
always "what is on the board".

```
│ Approve   0   │ Approve                                        J K move · A approve · R reject │
│               │ ┌ list 320 ───────────────┐ ┌ card 808 ─────────────────────────────────────┐ │
│               │ │ Waiting (0)             │ │ ┌ video 360×640 ┐  title · pills · caption …   │ │
│               │ │ No post is waiting.     │ │ │               │  QA checklist · overrides     │ │
│               │ │ This week                │ │ │               │  [ Approve ] [ Send back ]   │ │
│               │ │ ▌ Showreel  Sat 18:06 ● │ │ └───────────────┘                               │ │
│               │ │   Favorites Sun 06:30 ▢ │ └───────────────────────────────────────────────┘ │
```

### Approve at 390

The board becomes a vertical day list (today first): each day a row with its two slots as chips 100 % wide. Tapping
a waiting chip opens the card as a full-screen sheet (§1.6) with "‹ Week" at the top and the sticky Approve bar.
The Approve view at 390 is the list of waiting chips; tapping opens the same sheet.

### Sidebar order

Overview · Calendar · Approve (badge) · Posts · Today · Learn · Settings. Calendar moves up one place because the
Overview *is* a calendar and the two are neighbours; a brief deviation, raised in §6.

### The other views, shorter

- **Calendar**: the same board, 4 weeks tall with a month scroller; the Overview board is its current week. Chips
  carry pillar and hook id as a 13 px line ("Free, and why · existing-clip").
- **Posts**: a table like A's, but grouped by week with a 40 px group head ("Week 43 · 2 reels"). The Post popup is
  the side panel, not a centred popup, so the whole app has one detail surface.
- **Today**: the engagement round laid on a 24-hour ruler (planned times as ticks, 06–22 UTC) above the checklist;
  replies as a list beside it. Today both are the §1.5 lines with the ruler drawn empty.
- **Learn**: the report with a week scroller matching the board; deltas as side-panel items with Accept / Reject.
- **Settings**: as A, plus "Slots: 06:30 and 18:30 UTC" shown as facts from `strategy.md` (read-only until a field
  exists).

### Actions and popups in B

Approve, Send back, Change time all live in the side panel. Reject and Reschedule open as §1.2 popups above the
panel (600 px centred). Emergency stop and Flag on are popups from Settings. The side panel replaces the Post popup
everywhere in B.

### Left out on purpose

- Cards for each post on the Overview; the chips are the cards.
- Metrics on chips; numbers live in the panel and in Posts.
- Drag to reschedule (brief: not required); Change time is a field.
- A greeting or summary sentence; the band is the summary.

**Risk:** with two posts a week the board is 12 dashed cells and 2 chips, and the eye goes to the empty space.
The designer must make the two chips and the today column carry the page (cover size, outline weight) and show it
with the real 2, not with a full week.

## 4. Direction C: "Studio"

**The idea:** reels are the page. Each reel is a 9:16 cover tile with its numbers under it; the Overview is the
tile wall with the account line above and approvals as a right rail; Approve is the same wall filtered, with the
selected tile opened large beside it.

**References, what it takes**
- **Models (R.)** `15-46-57`: the row with status dot + sparkline + values, and the right "signal map" card (name ·
  dot · value · bar) for "which hook / length / slot wins" once there are ≥ 3 samples.
- **Nodus** `15-42-53`: the one numeral with the period under it and range chips; here the chips are 24 h · 72 h ·
  7 d over a tile's numbers.
- **Shopeers** `15-38-04`: the day-of-week bar chart with one filled bar, for slot-time performance in Learn.
- **NexaFlow** `15-41-49`: the small "Pending approvals 2" card; it is the approvals rail head.
- **Oneshot sites**: the cover-bleeds-to-edge card with the numeral + verdict words under it.

**Accent: coral `#D1434F`.** White on it 4.54:1 (AA at 15 px; the designer must not go lighter); it on white
4.54:1; on the ground 4.23:1, so **never as text on the ground**. Tints: t1 `#DC727B` (chart line, graphics only),
t2 `#E8A1A7`, t3 `#F1C7CA`, t4 `#F8E3E5`, t5 `#FCF2F3`. Coral text on t5 is 4.14:1, which fails; a darker text shade
(`#B0333E`, 6.2:1) is 1.01:1 from the destructive red `#C0182B`, i.e. the same colour. So in C the accent is **fill
only, white text, 15/700**: the Approve button, the active range chip, the rail badge, the selected tile's 2 px
outline. "Waiting for you" pills in C are coral fill with white text, not tint + text. Why coral here at all: the
tiles are Rosa's covers, navy and cyan and green; coral is the one candidate that no cover contains, so the Approve
button and the badge are found in under a second against the wall. The cost is the red collision; Reject in C is
red text on red-bg, never filled, and the two never sit in the same row (Approve bottom-left, Send back under the
QA list). The critic should test this on the Approve screen first.

### Overview at 1440 (content 1152)

```
┌ sidebar 240 ──┬──────────────────────── content 1152 ─────────────────────────────────────────┐
│ ■ Tachyon     │ Overview                                 Rosa ▾   ● Data 24 Oct 18:22 UTC · live│
│ Overview ◀    │ @rosasurfapp · 0 followers · 1 post · account numbers start tomorrow     17 px │
│ Posts     2   │ ┌ wall 768 ────────────────────────────────────┐ ┌ rail 360 ───────────────────┐│
│ Approve   0   │ │ This week                     [24 h] 72 h 7 d │ │ Needs you                 0 ││
│ Calendar      │ │ ┌ tile 240 ───────┐ ┌ tile 240 ───────┐      │ │ Nothing waits. Next: the   ││
│ Today     0   │ │ │ cover 240×427   │ │ cover 240×427   │      │ │ favorites reel posts Sun    ││
│ Learn         │ │ │ ● Live  18:06   │ │ ▢ Scheduled     │      │ │ 06:30 UTC; showreel numbers ││
│ Settings      │ │ │                 │ │ Sun 06:30 UTC   │      │ │ 25 Oct 18:07 UTC.           ││
│               │ │ │                 │ │                 │      │ ├─────────────────────────────┤│
│               │ │ └─────────────────┘ └─────────────────┘      │ │ This week  M T W T F S S    ││
│               │ │ Showreel · 30 s     Favorites · 15 s          │ │            · · · · · ● ▢   ││
│               │ │ Views       —       Views       —             │ │ Next week: no plan yet.     ││
│               │ │ Reach       —       Reach       —             │ ├─────────────────────────────┤│
│               │ │ Sends/reach —       Sends/reach —             │ │ Converting                  ││
│               │ │ Hold        —       Hold        —             │ │ Sessions per reel appear    ││
│               │ │ First numbers       Posts in 12 h             │ │ once GA4 is connected; the  ││
│               │ │ 25 Oct 18:07 UTC                               │ │ UTM links are live.         ││
│               │ │ Open on Instagram ↗                            │ ├─────────────────────────────┤│
│               │ └───────────────────────────────────────────────┘ │ Health                      ││
│               │ ┌ what wins 1152 ─────────────────────────────────│ Publishes 1 of 1 · QA       ││
│               │ │ Hook · length · pillar · CTA · engine · slot:   │ catches 4 · Stop off · Cost ││
│               │ │ needs 3 reels on each side; first read-out after│ none recorded · Token not   ││
│               │ │ week 45.                                        │ reported                    ││
│               │ └─────────────────────────────────────────────────└─────────────────────────────┘│
└───────────────┴───────────────────────────────────────────────────────────────────────────────────┘
```

- Tiles are 240×427 covers with radius 12, the state pill over the cover's bottom-left on a white 90 % pill, and
  under each tile a 4-row name/value list in 15 px with dashes today and the arrival time as the last row. Three tiles
  fit the 768 wall; with more reels the wall wraps to rows and older weeks collapse under "Earlier (n)".
- The range chips 24 h · 72 h · 7 d sit at the wall head; today all three show the same dashes; the active chip is
  coral fill.
- The "what wins" card (Models' signal map) is the §1.5 line until `score.py` has ≥ 3 samples a side.
- The rail is 360 px: Needs you (the NexaFlow card, 0 in 40 px ink3 light, with the two next times), the week as
  7×2 dots, Converting, Health.

### Overview at 1024 (content 904)

A 904 content minus a 360 rail leaves a 520 wall, which holds only two 240 tiles with no room to grow. So at 1024
the rail drops under the wall as a 3-cell row (Needs you · week dots · Health), and the wall is 904 wide with four
200×356 tiles per row. "What wins" stays a line.

### Approve at 1440

```
│ Approve   0   │ Approve                                        J K move · A approve · R reject  │
│               │ ┌ tiles 288 ──────────┐ ┌ open 840 ─────────────────────────────────────────┐ │
│               │ │ Waiting (0)         │ │ ┌ video 360×640 ┐  Favorites  ▢ Scheduled Sun 06:30 │ │
│               │ │ No post is waiting. │ │ │               │  pillar · angle · CTA · trial · exp │ │
│               │ │ This week           │ │ │               │  caption with 125 marker · verdicts │ │
│               │ │ ┌ 120×213 ┐ Showreel│ │ │               │  first comment · Copy               │ │
│               │ │ │         │ ● Live  │ │ │               │  QA · approved with 1 warning        │ │
│               │ │ └─────────┘         │ │ │               │  (checklist)                         │ │
│               │ │ ┌ 120×213 ┐ Favor…  │ │ └───────────────┘  From rosa-favorites-9x16.mp4        │ │
│               │ │ │ selected│ ▢ Sched │ │  [ Approve ]* [ Change time ]      Send back           │ │
│               │ │ └─────────┘         │ └───────────────────────────────────────────────────────┘ │
```

Left, a 288 px column of small tiles 120×213 (waiting first, then this week); the selected one has the 2 px coral
outline. Right, the full §1.4 card. J/K move the selection; A approves the selected tile when it is waiting (the
Approve button is absent otherwise; *today it is absent for both). The empty state is the small-tile column with
"No post is waiting" and the showreel opened on the right, read-only, with its metric table.

### Approve at 390

The tile column becomes a horizontal strip of 72×128 tiles under the top bar (scrolls sideways inside its own
box; the page does not). Tapping a tile loads the card below it (§1.6 layout). The sticky bar holds Send back and
Approve only when the shown tile is waiting; otherwise it holds Open on Instagram ↗ or Change time.

### Sidebar order

Overview · Posts (count) · Approve (badge) · Calendar · Today · Learn · Settings. Posts moves up because in C the
tiles and the table are the two readings of the same wall; a brief deviation, raised in §6.

### The other views, shorter

- **Posts**: the Models table with a sparkline column reserved (hidden until 3 points): cover 32×57 · title · pillar
  · state dot + words · published · 7 metric columns · Open ↗. A tile/table toggle at the head (the wall is the tile
  reading of the same list). Row click opens the Post popup with the Ancestry window table and the 24 h · 72 h · 7 d
  chips.
- **Calendar**: a Mondly schedule row per day, 7 rows × 2 slots, chips with cover 40×71; no board, because C's
  spatial element is the wall, not the week.
- **Today**: two columns like A, with the reply rows showing the reel's cover 32×57 so the operator sees which reel
  the comment is under.
- **Learn**: the report; the Shopeers slot-time bar chart (06:30 vs 18:30, one filled bar) and the Models signal
  map once samples exist; experiments table with "directional only" as a grey pill; deltas with Accept / Reject.
- **Settings**: as A.

### Actions and popups in C

Approve and Send back live only in the open card (Approve view) and never on tiles. Tiles are links to the Post
popup (Overview) or select (Approve). Reject, Reschedule, Emergency stop, Flag on are §1.2 popups. Copy pills
appear in the first comment and in Today.

### Left out on purpose

- Approve buttons on the Overview; the rail says what waits and links to Approve.
- A calendar board; the week is 14 dots in the rail.
- Account tiles; one 17 px sentence under the title.
- Captions on tiles.

**Risk:** the wall shows two tiles of dashes for the next 24 hours, and the showreel cover is near-black at
240×427; a dark 9:16 block may pull the eye from the rail. The critic should time question (a) on this direction
first. Also the accent: coral at AA is one step from the destructive red; if the gate finds Approve and Send back
too close, C switches to ocean blue with B's fill-only rule and keeps its structure.

## 5. Divergence

| View | A · Inbox | B · Planner | C · Studio |
|---|---|---|---|
| Organising idea | one queue of things that wait, with the week and the live reel in a rail | the 7×2 week board; everything opens from a cell into a side panel | a wall of 9:16 cover tiles with numbers; approvals in a rail |
| Overview, first element | "Nothing needs you" card, 96 px, with the two next times | band of four stats, then the board with today's column shaded | account sentence, then two 240×427 covers |
| Where "needs you" lives | it is the list (Needs you · Coming up · Hand work) | a cell of the band + a t3-outlined chip | a 360 px rail card with a 40 px count |
| The week | 7×2 dots in the rail | the page itself, 148×220 cells | 7×2 dots in the rail |
| The live reel | rail card, cover 96×171, five metric slots | chip on the board + a "Live this week" row | a 240×427 tile with four metric rows and range chips |
| Approve layout | full-width stacked cards, video 360 left | 320 list + 808 card; the board filtered | 288 small-tile column + 840 card |
| Approve empty state | two compact 48×85 rows | list "No post is waiting" + this week's chips | small tiles + the showreel opened read-only |
| Detail surface | centred Post popup | right side panel 480, everywhere | centred Post popup with range chips |
| Calendar view | board, 1 week | board, 4 weeks (the Overview is week 1) | day rows, Mondly schedule style |
| Posts view | Sypher table | table grouped by week | Models table with tile/table toggle |
| Today view | two cards, Dasbor checklist | 24-hour ruler over the checklist | two cards with cover thumbs on reply rows |
| Learn view | sections + delta cards | week scroller tied to the board | slot-time bar chart + signal map |
| Sidebar order | brief order | Calendar second | Posts second |
| Accent | teal `#0B6E6E`, fill and tint-text | ocean `#0F4C81`, fill only | coral `#D1434F`, fill only, white text |
| Approve at 390 | horizontal card pager | day list → full-screen sheet | tile strip → card below |
| Fastest for | clearing the queue | seeing the week and moving a slot | judging reels by their numbers |

No two rows share an Overview first element, an Approve layout or a detail surface.

## 6. Risks and open questions for the gate

1. **Accent.** Each candidate collides with one reserved colour: teal with status green, ocean blue with link blue
   `#1F4BFF`, coral with destructive red `#C0182B` (coral's AA text shade is 1.01:1 from the red, the same colour).
   The directions manage it with fill-only rules, but the pick is Shahar's. Recommendation if asked: ocean blue,
   because it has the most headroom (8.86:1, text and fill both allowed) and the link collision is the easiest to
   police (↗ icon on every link). If ocean blue is locked, A and C keep their structures and take B's palette.
2. **Sidebar order.** The brief fixes Overview · Approve · Calendar · Posts · Today · Learn · Settings. B and C move
   Calendar and Posts up one place for structural reasons. Confirm or revert at the gate.
3. **Token expiry is not in `data.json`.** The brief's question (a) and (e) both name it. `data.py` needs a field
   (`clients[].token.{expires_at, refreshed_at}` from the refresh job) or the Health strip says "not reported".
4. **Humanizer and lint verdicts** exist only as prose inside a QA line for w43-02 and not at all for w43-01.
   `package` should write `humanizer_score` and `lint` into `meta.json`; `data.py` should expose
   `posts[].caption_checks`. Until then the card shows "Not scored".
5. **Operator minutes and cost** (`costs: []`, no minutes field) are in the brief's health list but have no source.
   The Health strip carries the two empty lines; nothing is drawn.
6. **The 18:06 publish against an 18:30 slot.** The data shows `scheduled_at` 18:06:17, i.e. the slot was moved to
   "now" when the operator approved in chat. The board shows actual times; the designer should decide whether the
   chip also shows the house slot it belongs to ("18:30 slot · went out 18:06").
7. **Reject semantics.** `REJECTED → SCRIPTED` means a rejected post returns to Script with the note; the popup is
   named "Send back" for that reason. Confirm the word; "Reject" stays as the keyboard letter R.
8. **A approves after a 2 s undo toast** rather than opening a confirm. Confirm Shahar wants one key = one approval.
9. **The 125-character marker** assumes Instagram's cut at 125 characters (brief §3.2). Instagram also cuts at
   the second line on some clients; the designer may add a second, fainter rule at the first `\n\n` if asked.
10. **Thin data.** Every mockup must open on the real two posts. The one "preview with sample numbers" toggle per
    mockup (brief §2) must be labelled in the view head and must reset on reload.
