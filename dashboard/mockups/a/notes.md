# Direction A · Inbox — designer notes (run dash-01)

File: `dashboard/mockups/a/index.html`, one self-contained page, `data.json` embedded verbatim in
`<script id="data" type="application/json">`. Font: `@font-face` to `../../fonts/manrope-latin-wght-normal.woff2`.
Media: `../../../clients/rosa/posts/<slot>/cover.jpg` and `video.mp4` by relative path, not copied.
Routes: `#overview #approve #calendar #posts #today #learn #settings`; `?view=<name>` and `<html data-view>`
are honoured on load (used to shoot Approve); `<html data-preview="1">` turns the sample switch on for a shot only.

The mockup's clock is `generated_at` (24 Oct 18:22 UTC), so "in 12 h" reads the same on every open.
Nothing is saved: Approve / Send back / Save caption / Change time / flags / Emergency stop change in-page
state and show the success state; a reload resets everything.

## Contrast (computed, WCAG 2.x relative luminance)

| Pair | Ratio | Use |
|---|---|---|
| teal `#0B6E6E` on white | 6.05:1 | accent text, pills' text on t5, focus ring |
| white on teal `#0B6E6E` | 6.05:1 | Approve button, sidebar badge |
| teal on ground `#F5F7FB` | 5.64:1 | nav current item text sits on t5, not the ground |
| teal on t5 `#EEF5F5` | 5.48:1 | "Waiting for you" pill, current nav item |
| teal on t4 `#DAE9E9` | 4.85:1 | today's column letter in the week strip (13 px bold, AA) |
| t1 `#489292` on white | 3.62:1 | chart line only (graphics, 3:1 rule) |
| green `#1A7F37` on `#EDF7F0` | 4.63:1 | Live pills |
| red `#C0182B` on `#FCEBED` | 5.36:1 | Send back |
| amber `#8A4B00` on `#FFF4D6` | 6.21:1 | warnings, overrides, preview banner |
| ink2 `#4B5563` on `#EEF0F3` | 6.62:1 | Scheduled pill |
| ink3 `#6B7280` on white | 4.83:1 | 13 px meta |
| ink3 on ground | 4.51:1 | 13 px meta on the ground (passes AA by 0.01; nothing smaller than 13 px uses it) |
| link blue `#1F4BFF` on white | 5.99:1 | ↗ links |

## Round 1 — Overview, 1440 and 390

Shot beside `ref/oneshot-overview.png`, Logip (`15-38-48`) and FinGuard (`15-43-09`).

What is concretely worse:
- The 17 px summary sentence and the 20 px "Nothing needs you." card say the same two facts twice within
  100 px of each other (y 85 and y 226). Oneshot's sentence carries the count and the list carries the items;
  mine repeats. Change: the sentence becomes the 100,000-foot line (1 live · 1 scheduled · 0 in production ·
  publishing on), the card keeps the two next times.
- Live card: the 2 × 2 metric grid in a 336 px rail wraps "Sends / reach" and "Saves / reach" onto two lines,
  the dash lands one line below its label. Change: one column, five rows with hairlines (Ancestry rows), 14 px.
- Week strip: empty cells are 6 px dots in 40 px cells, so the strip is 90 % air; the live/scheduled dots are
  16 px and the scheduled ring reads as a radio button. Change: 18 px dots, empty cells an 8 px ring in rule
  colour, slot labels 13 px/600, today column t5 ground kept.
- Sidebar footer wraps "Data Sat 24 Oct 18:22 UTC · live" onto three lines (13 px in a 200 px column): drop
  the weekday from the freshness stamp everywhere (`Data 24 Oct 18:22 UTC · live`, as the brief writes it).
- 390: the Coming-up card's three actions stack as three 48 px rows (y 1460–1700), 240 px of buttons for one
  card. Change: 32 px pills in a wrapping row, lead word on its own line, Send back at the end of the row.
- Chrome console: the `<link rel="preload" crossorigin>` is refused from `file://` (CORS); the `@font-face`
  itself loads. Drop the preload.
- Honest-data note: the concept writes "first numbers 25 Oct 18:07"; `next_window_at` is `18:06:50`, so the
  page prints 18:06. Kept the data's minute.
- Approve was not shot this round (default route is Overview); round 2 shoots both.

## Round 2 — Overview + Approve (preview on), 1440 and 390

Shot beside `ref/oneshot-overview.png`, `ref/oneshot-sites.png` (the one filled button per card) and
Logip (`15-38-48`, the task list + right rail).

Overview: the round-1 fixes landed (one-column metric rows, 18 px dots, one-line stamp, pill row at 390).
Still worse than the references:
- "Live since Sat 24 Oct 18:06 UTC" wraps to two lines in the 196 px text column of the Live card; the
  stamp is today, so "Live since 18:06 UTC today" is shorter and plainer.
- Empty week cells are 8 px rings and the scheduled post is an 18 px ring: two ring sizes read as one family.
  Empty cells become flat 6 px dots in `#D5D9E2`; only Scheduled keeps the ring.

Approve (card for Favorites, 1152 wide): the card is 1,600 px tall, so at 1440×900 **Approve and Send back
sit on the second screen** (y ≈ 1,660). The reference Oneshot card has its filled button in the first 420 px.
The video (360×640) ends at y 940 and leaves ~700 px of white under it while the right column keeps going.
Changes:
- The video column is `position: sticky; top: 88px`, so it travels with the caption and QA list.
- The action row is sticky to the bottom of the viewport inside the card (white ground, hairline on top), so
  Approve is always on screen while the card is; it settles into the card's padding at the end.
- The preview banner is two lines at 1152 (y 170–235); cut to one line, the switch label already says what it is.
- First-comment link printed `rosa.surf//?utm…` (my linkify stripped the path and re-added a slash). Now
  prints the host and the campaign: `rosa.surf · utm_campaign 2026-w43-02 ↗`.
- The QA spec row printed "1080×1920", which `data.json` does not carry (`qa.spec` is the word PASS). Now
  "Spec checks: pass"; the dimensions line under the video reads "15 s · 9:16 · html-playwright v0". Data gap
  (concept §6.4) stands.
- The 2 px teal outline on the only card reads as a permanent selected state; it now appears when there are
  two or more cards or after the first J/K press.
- 390: the caption shows all 590 characters (11 lines) although §1.6 asks for the first 125 + "… more" with a
  tap to expand. Now collapsed to ~4 lines under the cut with a fade and a "Show all · 590 characters" pill;
  focus or the pill expands it. The 3-line head sentence drops its second sentence under 640 px.

## Round 3 — Overview + Approve, 1440 and 390

Shot beside `ref/oneshot-overview.png`, Logip (`15-38-48`, stat strip with dividers) and Sypher (`15-36-13`).

Approve 1440: the sticky action row works; Approve sits at y 850 on the first screen with the video,
title and caption above it. The sticky video follows the right column (second screen: video top at 88,
QA list beside it). Worse than the references:
- **390: the sticky video rides over the title, meta and caption** (mobile-01: "Fav…", "Posts", "Trial: n"
  are covered). `position: sticky` was left on in the single-column layout. Off under 640 px (and the
  column is centred, so nothing to stick to anyway).
- The first-comment link printed `rosa.surf ↗` without the campaign: `linkify` ran on the escaped string,
  so `&amp;` broke `URLSearchParams`. Parse the raw URL, then escape.
- "From rosa-favorites-9x16.mp4" lost "· cover at 9.5 s": the QA line says "Cover: frame at 9.5 s" and my
  pattern wanted "Cover at". Loosened.
- 390: "590 characters · Instagram shows 125 before … more" wraps to two lines; under 640 it reads
  "590 characters · 125 before the cut".

Overview 1440: first screen is right (card → Coming up → hand work on the left, week → live on the right).
Second screen (desktop-01) is **800 px of empty ground on the left** while the rail runs Account, Health,
Converting to y 1,760. The concept named this risk. Change: Health becomes a full-width strip under both
columns (Logip's dividers, 6 cells: Publishes · QA catches · Emergency stop · Cost per reel · Token expiry ·
GA4), Converting folds into it as the GA4 cell. The rail keeps This week, Live, Account; the page shortens by
~500 px and the left column no longer ends 1,000 px before the right.
- 1024: `shoot.mjs` has no viewport flag (it hard-codes 1440 and 390), so a 6-line Playwright script in the
  scratchpad shoots 1024×768 of both files once per round from here on.

## Round 4 — Calendar + Posts built, 1440 and 390

Shot beside Sypher (`15-36-13`, the 32 px-row table), Mondly (`15-36-41`, the schedule row) and
`ref/oneshot-sites.png`.

Calendar 1440: a 7 × 2 board, 148 px columns, 92 px cells, today's column on t5, the two chips in the
right places (Sat 18:30 Live, Sun 06:30 Scheduled), empty cells as 32 px dashed rounded rects. Worse than
Mondly's row: in a 148 px cell the chip's "Live, measuring" wraps to two lines and "18:30 slot · went out
18:06" truncates to "18:30 slot · w…". Change: chips use the short state word ("Live", "Scheduled") and the
third line is "went out 18:06" only (the row already says 18:30). The head sentence is two lines; cut to
"Showreel went out Sat 18:06 UTC · Favorites posts Sun 06:30 UTC". Under the board a second, compact
"Next week" card carries the §1.5 line so question (b) has one more answer than two chips.
- **390: the board is broken.** The grid turns one-column and lays out in source order: seven day headers,
  then fourteen cells (mobile-00). Restructure: each day is a wrapper (`display: contents` on desktop, so the
  cells still land in the 7-column grid by explicit row/column; a block on mobile), so a day reads
  header → 06:30 → 18:30. Empty cells on mobile carry their slot in words ("06:30 · nothing planned").

Posts 1440: twelve columns at 1152, 72 px rows, dashes with the arrival time as a title. Worse than Sypher:
the Reel column is 130 px, so "Showreel 30 s" wraps onto two lines and the pillar line onto three; the
Published column wraps the time under the date. Change: Reel column 26 % and nowrap on the title, nowrap on
Published; the 13 px pillar line keeps the angle after the colon only. The empty link cell for Favorites
printed its slot id; it is now empty (the id lives in the popup). The head sentence is three lines; cut to
one and a half.
- 390: the table scrolls inside its card (page width stays 390), but the Reel cell wraps six lines. Nowrap on
  the title and a 220 px minimum on the first column.

## Round 5 — final, all views, 1440 · 1024 · 390

Shot beside `ref/oneshot-overview.png`, `ref/oneshot-sites.png` and Sypher (`15-36-13`).

Fixed this round:
- Posts headers: the auto-wrap made "Sends / reach" three lines; the heads now break once, by hand
  ("Sends /" ⏎ "reach"), 13 px / 16 px, and the table fits 1152 with the Open ↗ column visible.
- Posts at 390 and 1024: the page was 1,049 / 1,277 px wide although the table sat in an `overflow-x: auto`
  box. Cause: the visually-hidden `<span class="sr">Link</span>` in the last header is `position: absolute`
  with no positioned ancestor, so its static position inside the wide table escaped the scroll box and
  widened the document. `.scroll` is now `position: relative`. Every view measures `scrollWidth` 390 at 390.
- Calendar at 1024 (89 px columns): chips drop the 32 px cover and the title is 13 px; the "Today" pill wraps
  under "Sat 24" instead of colliding with "Sun 25".
- Edit-caption popup: the modal's generic `textarea{background:#fff}` painted over the caption mirror, so the
  box looked empty. Scoped override; the popup now shows the same cut-marker box as the Approve card.
- "0 post waiting" → plural handled.

Smoke test (Playwright, headless Chromium, run once at the end): R opens "Send back — Favorites"; an empty
note blocks submit; a note sends it back and the card becomes the grey "Sent back with your note" state with
the toast; A shows "Approving… Undo" for 2 s then the green "Approved. Posts Sun 25 Oct 06:30 UTC" state;
Save caption and Copy show their 1.6 s tick; the pencil opens "Change the time — Favorites"; Esc closes and
focus returns; the Post popup's window table reads "Arrives Sun 25 Oct 18:06 UTC / Tue 27 Oct / Sat 31 Oct";
the account chart's one point shows "Sat 24 Oct · 0 followers · 1 post" on hover and on focus; Emergency
stop confirms, then Settings offers Resume; sorting Reel toggles asc/desc; under `prefers-reduced-motion`
every transition is 0 s; Tab reaches the preview switch and the 2 px teal ring is on it. Console: 0 errors
at 1440, 1024 and 390 on all seven routes.

## Measurements (final, 1440×900 unless stated)

- Sidebar 240, content 1152, page title 28/700, body 15, meta 13, cards radius 20 / inner 12, one shadow.
- Overview: summary 17/26 at y 85; "Nothing needs you." 20/700 with a 40 px green disc at y 200; Coming-up
  card 96×171 cover, title 18/700, one filled-accent-free row of 36 px pills; rail 360 with the week strip
  (7 × 2 cells 40 px, dots 18 px, today column on t5), the Live card (cover 96×171, five 14 px metric rows
  with hairlines), the Account chart (312×120 SVG, y 0–10, one point); Health strip 6 cells, value 24/700.
  Page 1,480 px tall (was 1,760 in round 2).
- Approve (preview on): card 1152, video 360×640 sticky at top 88, right column 680; title 22/700, pill,
  "Posts Sun 25 Oct 06:30 UTC ✎"; caption 16/1.6 in a 1.5 px box with the cut rule at the 125th character and
  "… more" right-aligned on it; counter + Save caption 36 px; three verdict words 15/600; first comment in a
  ground box with Copy; QA checklist 15/22 with 18 px icons; Approve 160×44 filled teal, Send back 44 red on
  red-bg, both in a sticky white bar at the viewport bottom while the card is on screen (y 850 on load).
- Approve at 390: 56 px top bar, "1 of 1" pager with 44 px ‹ ›, video 240×427 centred, caption collapsed to
  236 px with a fade and "Show all · 590 characters", sticky 72 px bar: Send back 112×44, Approve 48 px full
  width. Page `scrollWidth` 390.
- Calendar: board 56 + 7 × 148 px columns, cells 92 px, chips 32×57 cover + 14/700 title + 12/700 state + 12
  line; empty cell = 32 px dashed rect; a "Next week" card under the board.
- Posts: 11 columns + link, Reel 22 % (min 200), rows 72 px, dashes carry the arrival time as `title`.
- Size: 109 KB total, 92 KB before the embedded `data.json` (limit 300 KB). No chart library, no external
  script, one font file by relative path.

## How to shoot a non-default route

`shoot.mjs` ignores `?view=` and `#hash` on a file path, so make a copy whose default route differs:
`sed 's/data-view="overview"/data-view="approve" data-preview="1"/' index.html > approve-shot.html`
(same folder, so the relative font and media paths still resolve). `data-preview="1"` turns the sample
switch on for the shot. The copies are not part of the deliverable and were deleted after the last round.
1024 shots: `shoot.mjs` has no viewport flag; a 6-line Playwright script in the scratchpad shot 1024×768.

## Left out, on purpose

- Sparklines in Posts and the Post popup: no reel has 3 points; the column is hidden and the popup says
  when each window arrives (brief §3.4, concept §1.5).
- Sample *numbers*: the one allowed preview switch is spent on the Approve card (nothing waits today), so
  no chart shows made-up values. The account chart draws the real single point.
- Today and Learn with data; Settings' Plan / Strategy links point at the repo files by relative path.
- Drag to reschedule (brief: not required). Swipe between Approve cards at 390: the ‹ › pager and J/K do it.
- A client switcher that does anything: one client exists; the select renders the list from `data.json`.
- The journal feed, account zero tiles, raw flag names, file paths, ISO timestamps (concept §1.7).

## Where the build differs from the concept, and why

1. **Health is a full-width strip, not a rail card** (concept §2 puts it in the rail). With two posts the queue
   column ended 1,000 px before the rail; the strip (Logip) closes that gap and gives question (e) one row.
   Converting is a cell of it ("GA4 sessions — not connected; UTM links are live"), not a separate card.
2. **"Edit caption" instead of "Save caption" on the Coming-up card.** The card shows no caption, so a Save
   button there would save nothing visible; Edit caption opens the Post popup with the editable cut-marker box
   and Save caption inside it. The quiet-write grammar (36 px outline pill, tick on save) is kept.
3. **The Approve action row is sticky** to the viewport bottom inside the card and the video is sticky in its
   column. The concept draws them at the card's end, which at 1440×900 is the second screen.
4. **First-numbers time is 18:06**, not the concept's 18:07: `next_window_at` is `2026-10-25T18:06:50Z` and the
   page prints the data's minute.
5. **Spec line**: `data.json` carries `qa.spec: "PASS"` only, so the card prints "Spec checks: pass · 15.1 s"
   and "15 s · 9:16 · html-playwright v0" under the video, not "1080×1920 · 30 fps · 23.0 MB" (concept §1.4
   item 5, data gap §6).
6. **Humanizer / lint** are parsed out of the QA prose for Favorites ("Reads human · 87.5/100", "Caption lint:
   ready"); Showreel has none and shows "not scored" in ink3, as §1.4 says. Data gap §6.4 stands.
7. The preview switch label says what it does in the view head and an amber one-line banner repeats that the
   actions change nothing; the concept's "Preview numbers" popup is not used because no numbers are previewed.

## Data gaps carried as empty states (for `data.py`)

Token expiry (not in `data.json`), cost per reel (`costs: []`), operator minutes (no field), humanizer and lint
as fields (`posts[].caption_checks`), the QA spec line's text, GA4 sessions, listener counts, calendar.yaml.
