# Direction B · Planner — designer notes (run dash-01)

File: `dashboard/mockups/b/index.html`, one self-contained page. Template kept in the session scratchpad; `data.json`
is pasted in verbatim at build time into `<script id="data" type="application/json">`. Shots are scratch under
`shots/` (gitignored): `shots/` = Overview at 1440 and 390, `shots/approve/` = `?view=approve` (real empty state),
`shots/approve-sample/` = `?view=approve&sample=1`. The query strings need a URL, so the Approve shots ran against
`python3 -m http.server 8971` from the worktree root; the Overview shots ran from `file://`.

Relative times ("in 12 h", "24 h numbers in 23 h") are measured from `generated_at` (24 Oct 18:22 UTC), not from
the viewer's clock, so the page says the same thing whenever it is opened against this `data.json`.

## Look log

### Round 1 — Overview + Approve, first build

Beside: `ref/oneshot-overview.png`, Mondly `15-36-41` (schedule row with the filled Now card), Sypher `15-36-13`
(stat strip), Oneshot sites (cover bleeding to the card edge).

Overview 1440 (`shots/desktop-00.png`):
- The board is the problem the concept predicted. Row 1 is 212 px tall and holds one 136-wide chip and six
  32 px dashed boxes pinned to the top; 80 % of the row is white. The 32 px empties read as text inputs, not as
  slots. Mondly's schedule reads because every card has the same footprint.
- The eye lands on the word "Running" (32 px, the largest glyphs on the page) in the fourth band cell, which is
  the least useful fact. Oneshot puts the bold count in a 16 px sentence; here the 0 is grey and 32 px and
  loses to a status word.
- Band context lines wrap to 3 lines in cells 1 and 2 ("Favorites · Sun 25 Oct 06:30 UTC · in 12 h"); the band
  is 150 px tall where Sypher's stat strip is ~90.
- Chip meta wraps: "06:30 UTC · in 12 h" breaks "h" onto a third line at 136 px; "18:06 UTC · 18:30 slot" wraps
  too. Chip covers are 96 px tall and crop the phone through the middle.
- Account chart: axis labels "0" and "1" at 12 px, the note "Line draws from 3 days" sits 6 px under the top
  edge and collides with the "1"; one point at Sat 0 is right but the chart is 110 px tall for one dot.
- Sidebar, title row, freshness and the three lower cards are at the Oneshot sizes (28 px title, 18 px card
  heads, 15 px body) and hold up.

Overview 390 (`shots/mobile-00/01.png`):
- The day list is honest but long: 2805 px, of which five past days × two dashed slots = ~1100 px of nothing.
- Band at 2×2: "Needs you" context wraps to 4 lines at 15 px; the band is 760 px tall on a phone.

Approve 1440 (`shots/approve/desktop-00.png`, `shots/approve-sample/desktop-00.png`):
- Bug: in the sample, Favorites appears in both "Waiting" and "This week" (the sample post is a fresh object so
  `includes` misses it).
- The "… more" marker label (13 px) is drawn on the rule at the right edge, over the words "period a" of the
  caption's second line. It must never cover text.
- The right column is 364 px (808 − 56 padding − 360 video − 28 gap). The QA lines wrap 3–4 times each and the
  count line "590 characters · Instagram shows 125 before … more" pushes Save caption onto its own row.
- The lifecycle nodes (23andMe) work at a glance: QUEUED shows four filled, Published outlined; the sample's
  NEEDS_APPROVAL shows QA as the ring.
- Keys line (J K move · A approve · R send back) also renders at 390 where there is no keyboard.

Changes for round 2: full-height dashed empty cells sized to the chip (concept §1.5 says 32 px; deviating, see
Conflicts); chips 112 px cover with the phone crop at 15 %, meta on one line each; band numerals 40 px,
"Publishing" demoted to an 18 px word with a green dot, context 14 px on one or two lines; chart 1 point without
a fake "1" axis label and the note at the bottom; 390 day list collapses past empty days into one line; Approve
list 288 → card 840 → right column 408; "… more" label in a 72 px right gutter of the caption box; Save caption
in the Caption heading row; sample dedupe by slot id; keys line hidden at 390.

### Round 2 — board as a grid, band re-weighted

Beside: Mondly `15-36-41`, Sypher `15-36-13`, `ref/oneshot-overview.png`.

What changed and what the sheet showed (`shots/desktop-00.png`, 1440):
- Empty cells now fill the row (1.5 px dashed, radius 12, 144×224). The board reads as Mondly's schedule: 14
  equal footprints, two filled. Row height 236 → the board is 590 px tall and the first screen is band + board,
  which is the direction's point. Today's column (t4) and the Favorites chip's t3 outline are the two things
  that break the grid, so the eye goes there first.
- Band: numerals 40 px; "Publishing" is an 18 px word with a 10 px green dot, so the grey 0 under "Needs you"
  and the two 1s are the heaviest glyphs. Context lines are one line each except the first (two).
- Chips: cover 118 px (phone crop at 12 %), meta "Went out 18:06" + "18:30 slot, early" on separate 13 px
  lines; no wraps.
- Still wrong: the "… more" rule is drawn through the middle of the *next* caption line
  (`shots/approve-sample/desktop-00.png`). Cause: the marker was an empty 0-width inline-block, whose
  offsetTop is the baseline, not the line top; adding one line-height landed one line too low.
- Still wrong at 390: the 2×2 band is 700 px tall; each cell wraps its context to three 13 px lines.
- Approve: list 288, card padding 24, column 408 px; the counter fits on one line; Save caption moved into the
  "Caption" heading row; the sample dedupe works (Waiting 1 · This week 1); keys hidden at 390.

### Round 3 — cut marker geometry, band at 390, side panel

Beside: 23andMe `15-38-36` (nodes), Ancestry `15-40-32` (window rows), `ref/oneshot-sites.png`.

- Cut marker: the mirror now holds a zero-width space in the marker span; its glyph box gives the line's top
  (minus half-leading) and the rule sits at that line's bottom, 1.5 px t1, from the cut to a 72 px right
  gutter where "… more" (13/700 ink2) lives. Verified on both captions: showreel cuts after "Open it," at
  character 125 (`shots/approve/desktop-00.png`), favorites after "size," (`shots/approve-sample/desktop-00.png`).
  The label never touches text now.
- Band at 390 is four rows (label + 13 px context left, 28 px figure right), 335 px tall instead of 700.
- Side panel (`shots/panel/desktop-00.png`): 480 px, radius 20 on the left, veil over the content area only, the
  board stays visible behind; video 240×427 centred; title row, lifecycle nodes, caption with the marker, first
  comment, QA checklist; Approve (filled, 160×44) and Send back (red on red-bg) pinned in a 76 px footer. At
  390 it is full-screen with the same footer sticky (`shots/panel/mobile-00.png`, 48 px Approve).
- Board rows trimmed to 222 px (cover 108) so the three lower cards start at y≈840 instead of 870.
- Left for round 4: the panel header repeats "Waiting since …" (kind line + second line under the title);
  Calendar and Posts still unseen.

### Round 4 — Calendar, Posts, Today, Learn, Settings, then the whole page again

Beside: Sypher `15-36-13` / `15-44-34` (table rows), Ancestry `15-40-32`, `ref/oneshot-sites.png`.

What the first sheets showed and what changed:
- **Posts** at 1440 overflowed its card by ~170 px (Reel 300 + State 210 + Published 220 + 7 metric columns).
  Now 14 px rows, 8 px cell padding, Reel shows title + pillar only, State is the pill only (the second line
  moved to the cell's title), Published is "Sat 24 Oct 18:06" under a "Published (UTC)" head; all 12 columns
  fit in 1096 px with Open ↗ at the right (`shots/posts/desktop-00.png`). At 390 the table scrolls inside its
  card; the page does not (scrollWidth 390).
- **390 header gap**: every secondary view started ~330 px down the page. Cause: `body` is a grid with
  `min-height:100vh`; with two implicit rows the extra height was split between the 56 px top bar and `main`.
  Fixed with `grid-template-rows:auto minmax(0,1fr)`.
- **Calendar** at 390 drew 7 columns of 38 px with chips cut to "Fa" and "Sh". Now each week is the same day
  list as the Overview (today first, past empty days collapsed to one line), with "No plan for week 44 yet"
  per empty week (`shots/calendar/mobile-00.png`). At 1440 the chips carry the pillar and hook line, wrapping
  to two lines instead of ellipsising ("Free, and why · existing-clip").
- **Today**: the 24-hour ruler had a 1096-wide viewBox in a 508 px card, so its labels rendered at ~6 px.
  Now drawn at the card's width (508 / 342), 12 px labels every 4 h, the two house slots as 4 px t2 ticks
  labelled "06:30 reel" / "18:30 reel", each focusable with a name (`shots/today/desktop-00.png`).
- **Learn** showed GA4 event names (`app_install` + `push_optin_start`, `favorite_add`) from strategy.md's
  KPI table; translated to "App installs + push opt-ins" and "Favorites added (lead)".
- Side panel header now carries the state words only; the "Waiting since …" line lives under the title.
- Calendar card at 390 had a stray hairline above the first week (the hidden board was the first child).

Final Overview and Approve sheets (`shots/desktop-00.png`, `shots/approve-sample/desktop-00..02.png`) match
round 3 plus these fixes; nothing on them regressed.

## Measurements (final, 1440 unless stated)

- Sidebar 240; content 1152; title 28/700; body 15; card radius 20, inner 12; shadow and tokens verbatim
  from Oneshot soft-cards except the accent.
- Band: one card, 4 cells with 1 px dividers; label 14/600 ink2, numeral 40/600, context 14 ink3. 150 px tall.
- Board: 56 px row-label column + 7 × 144 px columns, 6 px gaps; 2 rows × 222 px; chips 144 wide: cover 108,
  title 15/700, pill 24, meta 13 ink3. Today's column t4 `#DBE4EC` with 12 px radius top and bottom; the next
  slot to fire has a 2 px t3 `#B7C9D9` outline. Empty cells 1.5 px dashed `#E5E8EF`, full cell height.
- Under the board: 3 × 368 cards (Live this week · Today's hand work · Health), 18 px heads.
- Account chart: 312 × 120 SVG, 7 day labels at 12 px, one point (Sat, 0) on the baseline, tooltip on
  hover/focus "Sat 24 Oct · 0 followers · 1 post"; the line and the max label appear only from 3 days.
- Approve: list 288 (rows 48×85 cover + 15/700 title + 13 meta + pill) · card 840, padding 24, video 360×640,
  right column 408. Caption 16/1.6 with a 72 px right gutter for "… more"; the cut rule is 1.5 px t1 from the
  125th character to the gutter, a vertical tick marks the character. Approve 160×44 filled accent, Send back
  red on red-bg 44 px, Open on Instagram ↗ at the far right.
- Side panel 480, radius 20 left, veil `rgba(255,255,255,.8)` over the content area only; video 240×427;
  footer 76 px with the same actions. Popups 600 wide, padding 28, title 22/700.
- 390: top bar 56; band as 4 rows (335 px); board as a day list, chips 100 % wide with a 40×71 cover; panel
  full-screen with a sticky 72 px bar (Send back 112 wide, Approve 48 tall filling the rest); popups as bottom
  sheets with 48 px buttons. scrollWidth 390 on all seven views.
- Hash routes `#overview #calendar #approve #posts #today #learn #settings`; `?view=` and `?sample=1` and
  `?open=<slot>` on load are for the shoot tool.
- Size: `index.html` 115 665 bytes; 98 724 bytes before `data.json` (limit 300 KB). No library.

## Contrast (computed, WCAG 2.x)

| Pair | Ratio |
|---|---|
| accent `#0F4C81` on white / white on accent (buttons, badge, "Waiting for you" pill) | 8.86:1 |
| accent on ground `#F5F7FB` (focus ring) | 8.26:1 |
| accent text on t5 `#EEF2F6` (current nav item, count chips) | 7.87:1 |
| t1 `#4B79A0` on white (cut rule, chart line — graphics) | 4.62:1 |
| ink3 `#6B7280` on white / on ground (13 px meta) | 4.83:1 / 4.51:1 |
| ink2 `#4B5563` on grey pill `#EEF0F3` ("Scheduled") | 6.62:1 |
| amber `#8A4B00` on `#FFF4D6` (overrides, sample bar) | 6.21:1 |
| green `#1A7F37` on `#EDF7F0` ("Live, measuring") | 4.63:1 |
| red `#C0182B` on `#FCEBED` (Send back) / white on red (Stop publishing) | 5.36:1 / 6.16:1 |
| link blue `#1F4BFF` on white | 5.99:1 |

Link blue and accent appear in one row on the Approve card (Approve button, Send back, Open on Instagram ↗)
and on the Live card (Open ↗ beside the accent nav); the accent is never text on white, the link always has
the ↗, and the two read as different families in the sheets.

## Checks run

Playwright over all seven views at 1440 and 390: no console errors; `document.body.innerText` contains none of
the raw state names (`NEEDS_APPROVAL`, `QUEUED`, `MEASURING`, …) nor `auto_reply`; the only flagged token is
the engine name `html-playwright v0`, which concepts §1.4 item 1 asks the card to show. Keyboard on Approve
(sample): J selects the next row, K the previous, R opens "Send back — Favorites" with a required note, A
approves with the 4 s "Approved. Posts Sun 25 Oct 06:30 UTC · Undo" toast and the row's pill becomes
"Approved"; Esc closes the panel; Tab is trapped inside the panel and the popups; focus returns to the
opener. `prefers-reduced-motion: reduce` disables the count-up and all transitions. Slot ids appear only in
the 13 px meta line of the card and panel.

## Left out, on purpose

- Metrics on chips, a greeting sentence, a hero number, the journal feed, account tiles (concept B §"Left out").
- Drag to reschedule; "Change time" is a field with the two house slots as chips.
- Sparklines (no post has 3 points); the Posts sparkline column is absent, not blank.
- Experiments and strategy-delta cards: only the §1.5 lines, since `experiments: []` and `lessons: null`.
- A real `thumb_offset` ("cover at 7 s"): not in `data.json`; the card shows `source_asset` and the engine only.
- The sidebar footer's build line from Oneshot; here it is client · handle · 2 reels · 24 journal lines · data time.

## Conflicts with the concept

1. **Empty cells are full-height, not 32 px.** Concepts §1.5 asks for a 32 px dashed rectangle; round 1 showed
   six 32 px boxes pinned to the top of 212 px rows reading as text inputs, with 80 % of the row white. Round
   2 made the dashed rectangle fill the cell so the board reads as a grid (Mondly). Blocking for nothing;
   flagged for the creative director to confirm or revert.
2. **Approve at 390 with a waiting post** renders the card inline under the list (sticky Approve bar) *and*
   tapping a row opens the full-screen sheet. Concept B says the view is the list and the card opens as a
   sheet; the inline card is a safety net so the approve action is never a tap away from being invisible.
3. **Band copy**: the fourth cell is "Publishing · Running" (18 px word with a green dot) rather than the
   concept's "Stop off"; a status word beat a flag name for plain-words reasons.
4. **Relative times from `generated_at`**, not the viewer's clock. A live server should pass the real now.

## Data gaps carried as empty states (for `data.py`)

Token expiry (not in `data.json`); humanizer/lint fields only inside a QA line for w43-02 (parsed by regex,
"not scored" for w43-01); `qa.spec` reduced to "PASS" so the card says "Spec check: passed" without the
numbers; `thumb_offset` absent; operator minutes and cost absent.
