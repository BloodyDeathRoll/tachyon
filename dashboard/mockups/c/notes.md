# Direction C · Studio — designer notes (run `dash-01`)

File: `dashboard/mockups/c/index.html`, one self-contained page, 110,584 bytes total, **93,550 bytes before
`data.json`** (limit 300 KB). `data.json` (generated 2026-10-24 18:22 UTC) is embedded verbatim in
`<script id="data" type="application/json">`; every number on the page is read from it, and "now" for all
relative times ("in 12 h") is `generated_at`, not the browser clock, so the mockup says the same thing every time
it is opened. Font via `@font-face` → `../../fonts/manrope-latin-wght-normal.woff2`. Cover and video are the real
files at `../../../clients/rosa/posts/<slot>/cover.jpg|video.mp4`, referenced, not copied.

Routes: `#overview #approve #calendar #posts #today #learn #settings`; `?view=<id>` on load does the same (for
the shoot tool), and `?view=approve&sample=1` opens Approve with the "preview with a sample waiting post" switch
already on. Default (no params, or any hash) is always the real data: nothing waits.

Shots in `shots/` (gitignored): `shots/` = Overview, `shots/approve` = Approve with the sample switch on,
`shots/approve-real` = Approve as it really is today, `shots/calendar`, `shots/posts`. The Approve/Calendar/Posts
shots were taken over `python3 -m http.server` from the repo root because `shoot.mjs` cannot pass a query string to
a `file://` target.

## Rounds

Compared each round against `ref/oneshot-overview.png`, `ref/oneshot-sites.png`, Models (R.) `15-46-57`,
Nodus `15-42-53`, Shopeers `15-38-04`, NexaFlow `15-41-49`, and `ref/tachyon-review-today.png`.

### Round 1 — Overview + Approve, first build
What the sheets showed, concretely worse than the references:
- Overview, 1440: the wall card (768 wide) held two 221×393 tiles and **208 px of nothing** on the right (29 % of
  the card). Oneshot and Shopeers never leave a card a third empty.
- Approve, 1440: the "… more" marker label (12 px) sat *on top of* the caption line at the cut, colliding with
  the word "and"; the rule under the line was fine, the label was not.
- Approve, 1440: the first-comment UTM link wrapped to 5 lines with the ↗ in the middle of line 3.
- Approve, 1440: the video (360×640) ended at y 855 while the right column ran to y 1900, leaving a 360×1000 blank
  under the video for the whole second screen.
- Approve, 390: the card started at y ≈ 1380 CSS px. Above it: title, client pill, data line, keys line, switch,
  the 4-line empty-state sentence, "Waiting 0 / No post is waiting", "This week 2", the strip. The video was two
  screens down.
- Rail legend wrapped "No post" onto its own line (304 px inner, four items at 13 px).
- Published 18:06:50 showed as "18:07" because I rounded; the brief says 18:06.
Changed for round 2: a dashed 9:16 "next reel" slot fills the third column with the one true sentence about it
("Week 44's reels appear here after Monday's plan"); caption box gets a 72 px right gutter and the "… more" chip
lives in that gutter on the rule, with a 2 px tick at the exact character; link text truncates with an ellipsis;
video becomes `position:sticky` so it rides along the caption/QA column; on 390 the client pill, keys line and the
empty "Waiting" group are hidden; legend becomes a 2×2 grid; times floor by default and ceil only for "arrives"
times (so published reads 18:06 and first numbers 18:07, both as the brief writes them); `?sample=1` added so the
waiting card can be shot.

### Round 2 — look at the result
- Approve with the sample post, 1440: **the right column overflowed the card** by ~300 px (caption, title row and
  verdicts cut at the viewport). Cause: the first-comment link's `white-space:nowrap` span inside a flex `<p>`
  with `min-width:auto` made the inner grid track grow past the card. Round 1 had hidden it because the link
  wrapped. Also: Send back was missing for a waiting post (I had only given it to Scheduled).
- Approve, 390: the two groups stacked vertically (Waiting mini, then This week mini), so the card was still
  770 CSS px down. The preview note was 3 lines at 15 px.
- Overview, 1440: the dashed slot's 14 px text read as the heaviest thing in the third column; otherwise the wall
  now fills the card. The 40 px "0" in Needs you at weight 300 read as the letter O.
Changed for round 3: `.acol > * {min-width:0}` and the link rendered as a flex row with a truncating span; Send
back added at the head of the QA list (right-aligned, so it is never in Approve's row, as the concept asks); at
390 the two groups sit side by side in one horizontal strip (72×128 tiles); preview note 13 px, one line; slot
text 13 px; the "0" at weight 600.

### Round 3 — look at the result
- Approve, 390: the sticky video now **sat over the caption** when scrolling (sticky in a single column is wrong).
- Approve, 390: the caption was fully expanded (591 characters, 24 lines); concepts.md §1.6 asks for a collapse to
  the first 125 characters with a tap to expand, and Save caption only once the text changes.
- Approve, 390: the counter line "591 characters · Instagram shows 125 before …" wrapped to two lines under a
  label that already says the same.
- Posts, 390: `document.scrollWidth` was 1087 although the table was inside an `overflow-x:auto` wrapper; Chrome's
  mobile viewport grows with the table's paint overflow. `contain:paint` on the wrapper fixes it (verified: 390).
- Interaction test (Playwright): R → Send back popup, empty note refused, note sent → "Sent back with your note";
  A → 2 s undo toast → "Scheduled" + "Approved just now" line; J/K move; ? lists keys; Esc closes; Change time saves;
  caption edit enables Save, marker moves; Post popup from tile and from a table row (Enter); sort toggles; week
  ‹ › shows week 44 "No plan yet" and week 42 "Nothing was posted"; Emergency stop popup → Health "On" → Resume;
  flag-on popup → switch On. 0 console errors at 1440, 1024, 390.
Changed for round 4: sticky off below 1024; collapsed caption with a fade and "Show the whole caption" at 390 (focus
also expands); Save caption hidden at 390 until the text differs; counter shortened at 390.

### Round 4 — Calendar + Posts built, then one more pass on everything
Calendar and Posts first look:
- Posts, 1440: **no cover thumbs** (the `.cov` span had no display); the name column wrapped "Free, and why · all
  your breaks on one screen" into 6 lines, making one row 72 px and the other 160 px.
- Posts, 1440, after a first fix with min-widths: the table ran to ~1250 px and scrolled inside a 1152 card, so
  Skip rate, Hold and Open were off to the right at the brief's primary width.
- Calendar, 1440: clean; the Showreel chip reads "18:30 slot, went out 18:06" (concepts.md §6.6 decided: show both).
- Calendar, 390: seven days × two 40 px slots = 1,400 px of mostly dashed boxes.
- Overview, 390: "Needs you" (question a) was the fifth card down, at y ≈ 1,300.
Changed: thumbs `display:block`; name column min 190 px with the angle on one truncated line (full text in the
title attribute); state column words only, the second line moved to the cell's title; "Published (UTC)" one line
("24 Oct 18:06"); ratio headers break after "/" with `<wbr>`; cell padding 8 px; the table spans the card's full
1152 px (negative margins) and fits with no scroll at 1440 (screenshot checked); at 390 it scrolls inside the card
and the page stays 390. Calendar at 390: days with no post collapse to one 44 px line "Mon 19 Oct · no post"; only
Sat and Sun open. Overview at 390: the wall and rail become `display:contents` and the Needs-you card gets
`order:-1`, so it is the first card under the account sentence.

## Measurements (final)
- Sidebar 240, content 1152 at 1440. Wall 768 (card padding 28 → 712 inner, three 221×393 tiles, gap 24), rail 360.
- Page title 28/700; account sentence 17/26 ink2; card titles 18/700; body 15; tile metric rows 15, 7 px vertical
  padding; secondary 13 ink3; nothing below 12 px (the "… more" chip and chart axis labels).
- Approve: mini column 288 (tiles 96×171), open card 840, video 360×640 (300×533 under 1280, 240×427 at 390), caption
  16/1.6 with the 125-character tick and rule; Approve 44 px × 160 coral fill; Change time 36 px outline; Send back
  36 px red-on-red-bg at the QA head; sticky bottom bar at 390 is 72 px + safe area with Send back 112 wide and
  Approve 48 px filling the rest.
- Popups: 600 px, radius 20, padding 28, title 22/700, over `rgba(255,255,255,.8)`; bottom sheet under 640 with the
  footer sticky and the primary 48 px full width. Native `<dialog>` so focus is trapped; focus returns to the opener.
- Charts: inline SVG only. "Followers, by day" draws the one real `account_daily` point (24 Oct, 0) with a 0–1 axis,
  a labelled dot, hover/focus tooltip, and the note "One day of data so far; the line draws from the third day."
  Learn's slot chart is the designed empty state: two dashed bars labelled 06:30 (0 reels) and 18:30 (1 reel). No
  sparklines anywhere (no post has ≥ 3 points); Posts says so in one line.

## Contrast (computed, WCAG 2.x)
- Coral `#D1434F` on white **4.54:1**, white on coral **4.54:1** → AA for normal text; used only as a fill with
  white 13–15 px/700 text (Approve button, active window chip, Waiting badge, "Waiting for you" pill, the preview
  switch). Coral on the ground `#F5F7FB` 4.23:1 → never text there; only the 2–3 px outline/bar and the week dot
  (graphics, ≥ 3:1).
- **Coral is never text.** Current nav item is ink on t5 with a 3 px coral bar; focus ring is a 2 px coral outline.
- ink3 `#6B7280` on white 4.83, on ground 4.51; ink2 on grey-bg 6.62; amber 6.21; green 4.63; red on red-bg 5.36;
  blue links 5.99; ink on t5 (today row, nav) ≥ 15.
- Coral vs destructive red `#C0182B`: 1.36:1, i.e. close. Policed as the concept asks: Reject/Send back is red text
  on `#FCEBED` and never filled; Approve (filled coral) is bottom-left of the card, Send back is at the QA head two
  blocks above; at 390 the bar holds both but Send back is the pale one. Emergency stop is the only filled red.

## Keyboard, motion, honesty
- Everything reachable by Tab; `:focus-visible` 2 px coral ring (checked with Tab in Playwright: `outline solid
  rgb(209,67,79)`). J/K/A/R/?/Esc on Approve; keys ignored while a field has focus or a popup is open; A on a
  non-waiting reel says why nothing happened.
- `prefers-reduced-motion`: all transitions and smooth scroll off. No count-ups (the only numbers are 0, 1, 2, 4).
- Writes are in-memory (`MOCK`) and show the toast "Saved in the mockup only. The dashboard server records this for
  real."; a reload resets everything, including the sample switch.
- Every number traces to `data.json`: counts from `posts[]`, QA catches = Σ `qa.warns`, publishes 1 of 1 from
  `published_at`, follower/view/reach zeros from `account_latest`, times from `scheduled_at` / `published_at` /
  `metrics.next_window_at`, 72 h and 7 d arrivals = published + 72 h / + 168 h (the measure job's windows), Rosa's
  ids from `grants`, last activity from `journal_recent[0].ts`.

## Left out, on purpose
- Account tiles (one sentence instead), the journal feed, raw flag names, ISO timestamps, a search box, a date range,
  drag-to-reschedule (time field only), sparklines before 3 points, sample *numbers* (the one allowed toggle is the
  sample *waiting post*; charts stay real and empty).
- Today, Learn and Settings are designed states only: Today and Learn carry the §1.5 copy; Settings has the real
  switchboard, Emergency stop/Resume with their popups, ids with Copy, "token expiry not reported", last activity,
  and links to the plan, playbook and strategy.

## Conflicts with the concept / data gaps
1. **Tile size.** Concept: 240×427 and "three tiles fit the 768 wall". Three 240 tiles need 768 with zero padding;
   inside a 28 px-padded card they are 221×393. I kept the card (the locked product language) and let the tile shrink.
2. **Third tile.** With two reels the concept's wall is two tiles and blank. I added a dashed 9:16 slot with the
   Plan-runs-Monday sentence (the Calendar empty-state fact). Remove it if it reads as decoration.
3. **Spec line.** `data.json` reduces the QA spec line to `qa.spec: "PASS"`, so the checklist's first row is
   "Spec check: passed", not "1080×1920 · 30 fps · 30.1 s · 23.0 MB". The card's "1080×1920" under the video is the
   format every reel is rendered at, not a per-file measurement; `data.py` should carry the spec line's text.
4. **Caption checks.** No `caption_checks` field; "Reads human · 87.5/100" and "Caption lint: ready" are parsed from
   the prose of a QA line (only w43-02 has them); w43-01 shows "not scored for this reel".
5. **Skip rate** has no source in `_derived` (DATA.md lists sends, likes, saves, follows, comments per reach and
   hold). The column exists with a dash and the title "Skip rate is not in the data yet".
6. **Source file name** (`rosa-showreel-v14-30s-blues-9x16.mp4`) is shown as 13 px ink3 "Source: …" because the
   concept lists it; it is the one file-name-like string on the page. Drop it if the brief's "no file paths" is read
   strictly.
7. **"After week 45"** in What wins is the concept's arithmetic (3 reels a side at 2 reels a week), not a data field.
8. **Caption editable for Scheduled** posts as well as Waiting ones (a save before 06:30 is plausible); the concept
   only shows it on the waiting card. Easy to restrict.
9. Token expiry, cost per reel and operator minutes: not in `data.json`; Health says "Not reported yet" / "None
   recorded yet" rather than drawing anything.
