# Critique — run `dash-01`, three Overview + Approve mockups

Critic pass, 2026-10-25. Same checks in the same order for A, B, C: shot with `tools/shoot.mjs` at 1440 and 390
(`mockups/<x>/shots/critic-*`), 1024 with a scratch Playwright script, every number traced to `dashboard/data.json`,
keyboard and contrast measured in headless Chromium, not read from `notes.md`. Nothing in a mockup was edited.
Scores are evidence-bound; no taste calls outside dimension 4.

## 1. Score table

| Dimension (max) | A · Inbox (teal) | B · Planner (ocean) | C · Studio (coral) |
|---|---|---|---|
| Data honesty (25) | 23 | 20 | 20 |
| Shahar's questions (25) | 22 | 17 | 18 |
| Craft against references (25) | 18 | 14 | 15 |
| Charts and empty states (15) | 14 | 12 | 13 |
| Accessibility and speed (10) | 8 | 6 | 7 |
| **Total (100)** | **85** | **69** | **73** |

## 2. Hard fails (BRIEF §7), per mockup

Checked: invented number · raw state name or slot id as a title · ambiguous action · AA text contrast · chart library ·
Approve broken at 390. Clean for all three: no raw state name anywhere in `innerText` on 7 views × 3 widths (regex over
the 16 state names); slot ids appear only in 13 px meta lines, never as a heading (probe over h1–h4 and every element
≥ 15 px); no chart library, no external request at all; Approve works at 390 in all three (the sticky bar's Approve is
on screen in A and C on load, in B after one tap on the waiting row or one screen of scroll); every action is a labelled
verb (Approve · Send back · Save caption · Change time · Copy · Open on Instagram ↗).

Two rules are broken in all three, with the exact strings:

| | A | B | C |
|---|---|---|---|
| **Number with no path in `data.json`** | Today: "**0 of 10**" (`engage.total` is 0; the 10 is the brief's planned round size) | Approve (real view, both cards) and the side panel: "**1080×1920**" (`qa.spec` is the word `PASS`); band: "queue **every 10 min**"; panel: "Queues **within 10 min**" (cron interval, not in data) | Approve (real view, both cards): "**1080×1920**"; Overview "What wins": "**3 reels on each side** … after **week 45**" (threshold and its arithmetic, not in data; `notes.md` §7 admits it) |
| **Text contrast under AA (4.5:1)** | Nav count "0"/"2" on the current item: ink3 `#6B7280` 13 px/600 on t5 `#EEF5F5` = **4.38** | Selected approve row meta "Posts Sun 25 Oct 06:30": ink3 13 px on t5 `#EEF2F6` = **4.30**; 390 day list on today's row: "06:30"/"18:30" ink3 13 px/600 on t4 `#DBE4EC` = **3.76** | Nav count "0" on the current item: ink3 13 px on t5 `#FCF2F3` = **4.40**; Calendar today row "06:30"/"18:30" ink3 on t5 = **4.40** |

Both are small to fix (ink2 `#4B5563` on every tint is 5.9–6.9:1; carry the spec line in `data.py`), but the rule is
mechanical and the same for all three. "1080×1920" is true per `clients/rosa/posts/*/qa.md` line 3; it is a value the
page cannot source today. A's "9:16" under the video is the slot's format name, not a measurement, and is not counted.

## 3. Timed answers (where the eye lands, steps to each BRIEF §1 question)

"Step" = one eye movement or one scroll/tap from the loaded first screen at 1440×900. Measured positions are from the
DOM (`getBoundingClientRect`), the landing point from the shots (`critic-overview/desktop-00.png`, `mobile-00.png`).

| | A · Inbox | B · Planner | C · Studio |
|---|---|---|---|
| Eye lands first (1440) | the 40 px green check disc + "Nothing needs you." 20/700 at y 200; the 17 px summary sits 115 px above it saying the same thing | the three 40 px numerals **0 · 1 · 1** and "● Running" in the band (y 118); then the two cover chips on the board | the two 221×393 covers (the showreel's near-black one wins), then the coral **24 h** chip, the most saturated element on the page and inert today; "Needs you · 0" is third |
| (a) What needs me? | **1 step, < 2 s**: summary line y 85 + card y 158. Replies/engagement on the first screen (y 681); failed publishes and token in the Health strip, **1 scroll** (y 1300) | **1 step, < 2 s**: band cell "Needs you 0 · Nothing. Next up: Favorites, Sun 06:30 UTC". Failed publishes in the band ("1 of 1 went out"); replies/engagement head visible at y 880, text **1 scroll** | **2 steps, ~3 s**: eye leaves the covers for the rail card (y 118–286). Replies in Health ("Listener not deployed", y 757+); the engagement round is **not on the Overview** (Today only). At **1024 the card sits at y 2042, 2.7 screens down** |
| (b) Live and scheduled? | **first screen**: 7×2 dot strip (y 200–310) + Coming-up card with "Sun 25 Oct 06:30 UTC · in 12 h" | **first screen, strongest**: the board is 563 px of the page; the two chips carry cover, state pill and time | **first screen**: state pills on the covers + 7×2 dots in the rail (y 310–555) |
| (c) How does each reel perform? | **first screen**: Live card, five labelled dashes, "First numbers Sun 25 Oct 18:06 UTC · in 24 h" (y 470–850) | band says "First numbers Sun 18:06 UTC"; the six dashes are in "Live this week", **1 scroll** (y 839) | **first screen, best**: both tiles with four labelled dashes each, 24 h / 72 h / 7 d chips, "First numbers 25 Oct 18:07 UTC" |
| (d) Converting? | Health strip GA4 cell, **1 scroll** | last lines of the Health card, **1 scroll** (y 1384) | Converting card **first screen** (y 579–733) |
| (e) Machine healthy? | Health strip, 6 cells, **1 scroll** | Health card, **1 scroll** (head at y 839) | Health card **first screen** (head y 757; last rows below the fold) |
| Overview at 390 | (a) y 232 first screen; (b) strip y 1137; (c) Live y 1455; (d)(e) y 2319 | (a) band rows y 172–508 first screen; (b) day list from y 532; (c) y 970; (d)(e) y 1677 | (a) y 176 first screen (`order:-1`); (c) tiles from y 351; (b) dots y 1365; (d) 1813; (e) 1975 |
| Overview at 1024 | holds: rail drops under the queue, nothing cut | board columns 70 px: chips truncated mid-word ("Favorite", "Schedule", "Showree", "Live, mea", "18:30 slot") | tiles become 328×583 two-up, wall 1587 px tall; rail (Needs you, Health) pushed to y 2042 |
| **Approve (sample on), 1440** | **Approve on screen at load** (sticky bar, y 828–872) with video, title, pill, caption and the 125 cut; Send back beside it | Approve at **y 2016 of 2132: two screens down**; the video is not sticky, so screens 2–3 show a 360 px blank column left of the QA text; Send back beside Approve | Approve at **y 1985 of 2105: two screens down**, bottom-left beside "Change time"; **Send back is a 36 px pill at the QA head, y 1284, 700 px above it on a different screen**; the video is sticky |
| **Approve at 390** | Approve + Send back in a fixed 72 px bar **on load** (y 784–832); video at y 423 after switch, banner and the "1 of 1" pager; caption collapsed to 125 chars + "Show all · 590 characters" | **not on load** (y 1216): one tap on the waiting row opens a full-screen sheet with the bar (Approve y 772), or one screen of scroll reaches the inline card whose bar then sticks; two Approve buttons exist on the page | Approve + Send back in a fixed bar **on load** (y 784–832); video at y 515 under the tile strip; caption collapsed with "Show the whole caption" |
| What Approve / Send back / Save do | head sentence: "Approve queues it for its slot; Send back returns it to Script with your note."; Save caption under the box (but **hidden behind the sticky bar on load**, y ≈ 805); toast "Approving Favorites… Undo" then "Approved. Posts Sun 25 Oct 06:30 UTC." | no head sentence; Reject popup explains "returns to Script … nothing publishes until it comes back through QA"; Save caption in the Caption heading row; toast "Approved. Posts Sun 25 Oct 06:30 UTC. Undo" | keys line + "Approved · 2 s to undo" then "Approved. Posts Sun 25 Oct 06:30 UTC."; Save caption appears under the box; the coral Approve and pale-red Send back share the 390 bar (the concept said they would never sit in one row) |
| Keyboard path (Tab from top to Approve) | 14 stops, 7 of them inside the native `<video controls>` | 25 stops (sidebar, "Skip to content", list, 7 inside the video) | 17 stops, 7 inside the video |
| J / K / R / Esc / A | J/K move; R opens "Send back — Favorites" with focus in the note; Esc closes and focus returns; A approves with a 2 s undo | same; empty note refused; Esc returns focus to the row; A approves at once with Undo in the toast | same; empty note refused; Esc returns focus to the tile; A approves after a 2 s undo |

## 4. Data honesty — traced values

Twelve per mockup, read from the shots, traced to a path. ✓ = exact or a stated derivation; ✗ = no path.

**A**: "1 reel live, 1 scheduled, 0 in production" ✓ `totals`; "Sun 25 Oct 06:30 UTC · in 12 h" ✓ `posts[1].scheduled_at` − `generated_at` (12 h 08); "First numbers Sun 25 Oct 18:06 UTC · in 24 h" ✓ `metrics.next_window_at` 18:06:50 (floored; 23 h 44 rounded); "15 s" ✓ 15.07; "QA approved, 1 warning" ✓ `qa.warns.length`; "Live since 18:06 UTC today" ✓ `published_at`; "0 followers · 1 post" ✓ `account_latest`; "Publishes 1 of 1" ✓; "QA catches 4" ✓ 3 + 1; "Emergency stop Off" ✓ `grants`; "590 characters" ✓ (591 with the trailing newline, stripped); "Hook survives the cut · 70 characters" ✓ (first line is 70); "Reads human 87.5/100 · cover at 9.5 s · Spec checks: pass · 15.1 s" ✓ parsed from `qa.lines` / `length_s`; cut rule after "size," = character 125 ✓. ✗ "0 of 10" (Today).

**B**: band 0 / 1 / 1 ✓; "Went out 18:06 · 18:30 slot, early" ✓ (`published_at`, slot from `changelog_head`); "1 of 1 went out" ✓; "24 journal lines" ✓ `journal_recent.length`; "Waiting since Sat 24 Oct 18:14 UTC" ✓ `updated_at`; "Hook: existing-clip" ✓; "590 characters · 70 characters" ✓; "616 characters" (showreel panel) ✓; KPI table, six targets ✓ `kpis`; "06:30 and 18:30 UTC" ✓ `changelog_head`; "0 of 0" ✓ `engage`; lifecycle nodes ✓ `states.main`; cut after "size," / "Open it," ✓. ✗ "1080×1920" (×2), "queue every 10 min", "Queues within 10 min".

**C**: "@rosasurfapp · 0 followers · 1 post" ✓; "QA catches 4" ✓; "Publishes 1 of 1" ✓; "First numbers 25 Oct 18:07 UTC" ✓ (ceiling of 18:06:50; A and B print 18:06 — the two readings differ by one minute, both from the same field); "Arrives 27 Oct / 31 Oct 18:07" ✓ `published_at` + 72 h / 168 h (A derives the same days); "591 characters" ✓ (unstripped); "87.5/100" ✓; "since Sat 18:14 UTC" ✓; "24 Oct: 0 views · 0 reach · 0 link taps · 1 post" ✓ `account_daily`; Learn "06:30 · 0 reels / 18:30 · 1 reel" ✓ derived from `scheduled_at`; "Last activity Sat 24 Oct 18:14 UTC" ✓ `journal_recent[0]`; cut after "size," / "Open it," ✓. ✗ "1080×1920" (×2), "3 reels on each side … after week 45".

The "… more" marker: all three draw the rule after the 125th character of the data caption (`CUT = 125` in A and B,
literal 125 in C), verified on both captions in the shots: favorites cuts after "size,", showreel after "Open it,".

## 5. Craft against references — located gaps

References opened beside every sheet: `ref/oneshot-overview.png`, `ref/oneshot-sites.png`, Logip `15-38-48`, Shopeers
`15-38-04`, Sypher `15-36-13`, Mondly `15-36-41`. Shared measurements (all three): sidebar 240, content 1152, title
28/700 (26/24 at 390), card heads 18/700, body 15, meta 13, radius 20/12, one shadow, the Oneshot tokens verbatim.

**A** (18/25)
1. Screen 2 at 1440 (`desktop-01`): the queue column ends at y 240 and the rail runs to y 650 — **~450 px of empty ground** at the left before the Health strip at y 690. Oneshot's overview never leaves a column empty; the round-3 note said the strip closed this gap, the shot says it closed half of it.
2. "Nothing needs you." is printed twice, 17 px at y 85 and 20/700 at y 200, **115 px apart**; the round-1 note planned to make the sentence the 100,000-foot line, and it still opens with the same three words.
3. Posts rows are **90 px** (Sypher 33, Shopeers 38, Oneshot pitch rows carry a 160×100 thumb to earn 150): the State cell stacks a pill over a two-line secondary. 56 px with the secondary in the title attribute is enough.
4. Approve 1440 at load: the sticky action bar (y 800–900) **covers the counter and the Save caption pill** (clipped at y ≈ 805) — the quiet write is hidden under the primary until the user scrolls 60 px.
5. Sidebar footer wraps "Data 24 Oct 18:22 UTC ·" / "live" onto two lines at 1440 (round-1 said this was fixed by dropping the weekday; it still wraps at 13 px in 200 px).
6. Reject popup's "Send back" is a **filled** red 44 px button (`rgb(192,24,43)`), a second filled-red style beside Emergency stop; B and C keep red text on `#FCEBED` as §1.1 asks.

**B** (14/25)
1. The board is 563 px tall and **12 of 14 cells are empty dashed 144×224 boxes — 86 % of the largest element on the page**. Mondly's schedule reads because every card is full; the concept named this exact risk ("the eye goes to the empty space") and the build confirms it.
2. **1024** (`critic-1024/overview-00.png`): columns 70 px, chips cut mid-word in seven places ("Favorite", "Schedule", "06:30 · in", "Showree", "Live, mea", "Went out", "18:30 slot"). The concept's 1024 rule (drop the cover, keep title/state/time at 106 px) was not built.
3. Approve 1440: the video is **not sticky**, so `desktop-01/02` show a 360 × ~1200 px blank column left of the caption/QA text, and Approve / Send back sit on the third screen (y 2016). Oneshot's filled button is in the first 420 px of its card.
4. The Followers chart lives at the bottom of the Health card at **~60 px tall with one axis label ("0")** and a flat baseline; A's is 120 px with 0/5/10 and day letters, C's 120 px with 0/1 and a labelled point.
5. First-comment link prints "rosa.surf/?utm…" — the campaign id (the only thing the operator checks) is cut; A prints "rosa.surf · utm_campaign 2026-w43-02 ↗", C the full URL in a truncating span.
6. The band's biggest glyphs are a **40 px grey "0"** and two 40 px "1"s — the zero-as-hero the brief's §0 and concept A warn against. Shopeers' KPI cards earn 26 px numerals with deltas; here there is nothing to compare yet.
7. Stamp reads "Data Sat 24 Oct 18:22 UTC" with no "· live" (brief §3: "Data 24 Oct 21:22 UTC · live").

**C** (15/25)
1. **1024** (`critic-1024/overview-00/01.png`): the wall becomes two 328×583 tiles per row, the dashed placeholder gets its own row, the wall card is 1587 px tall and the rail (Needs you, week, Converting, Health) lands at y 2042. Question (a) is 2.7 screens down at the brief's "holds" width. The concept's 1024 rule (rail as a 3-cell row under a 904 wall of 200×356 tiles) was not built.
2. The **coral "24 h" chip** is the most saturated object on the Overview (`desktop-00`, y 150) and toggles nothing today: all three windows show the same dashes. The accent should find Approve, not a filter.
3. A **dashed placeholder tile 221×393** ("Week 44's reels appear here after Monday's plan") takes the third column — one third of the wall is a note; Oneshot sites never pads a grid with a placeholder.
4. Approve 1440: **Approve (y 1985) and Send back (y 1284, a 36 px pill at the QA head) are 700 px apart on different screens**; the two decisions about one reel are not made in one place. At 390 they share the bar, so the separation rule the concept promised ("never in the same row") is only true at desktop.
5. Tiles are 221×393 against the concept's 240×427 (28 px card padding ate them); the Showreel cover at this size is a near-black block that pulls the eye before the rail (the concept's own risk, confirmed in the three-second test).
6. "What wins" is a 372×276 card holding three lines of text at 15 px; the Followers chart beside it has a **0–1 y axis** for a follower count (A's 0–10 is the same arbitrary-scale problem at a different size).

## 6. Charts and empty states

| | A (14) | B (12) | C (13) |
|---|---|---|---|
| Charts | 1 · Account 312×120: y 0/5/10, x M–S, point labelled "0", tooltip on hover **and** focus "Sat 24 Oct · 0 followers · 1 post", note "1 day of account numbers. A line is drawn from the third day (Mon 26 Oct)." | 1 · Followers 318×~60 in the Health card: x Mon–Sun, one "0", tooltip on hover and focus (aria-label) "Sat 24 Oct · 0 followers · 1 post"; plus Today's 24-h ruler SVG (06:00–22:00, 4-h labels, the two slots as named focusable ticks) | 2 · Followers 316×120: y 0/1, x "24 Oct", point labelled "0", tooltip on hover and focus "24 Oct · 0 followers"; Learn slot chart 508 wide: two dashed bars "06:30 · 0 reels / 18:30 · 1 reel", labelled, not focusable (nothing to show) |
| Empty states say what and when | Needs you (06:30 and 18:06), Live dashes + arrival, Hand work (listener; "week 44's plan on Monday"), Health cells, Posts dashes with the arrival time as title, Calendar next week, Learn (31 Oct → Sun 1 Nov), Approve empty = two read-only rows with the next times | band + board + "Live this week" dashes + Health + Learn (31 Oct → 1 Nov) + KPI table; Approve empty = list + read-only card; Posts note "Sparklines appear … once three measurements exist" | Needs you (06:30 and 18:07), tiles ("Instagram link appears when it posts"), placeholder tile, Converting, Health, Posts ("A dash is a number that has not arrived yet; hover it for the time"), Learn (31 Oct → 1 Nov); Approve empty = tile strip + showreel open read-only with the 24 h / 72 h / 7 d arrival table |
| Deductions | y axis 0–10 for an account at 0 (scale not from data) | chart 60 px tall with a single axis label; "Needs you" band cell lacks the first-numbers time (it is in the Live cell) | "What wins" threshold not from data; y axis 0–1 |

## 7. Accessibility and speed (measured)

| | A | B | C |
|---|---|---|---|
| Accent on white / white on accent | teal `#0B6E6E` **6.05** | ocean `#0F4C81` **8.86** | coral `#D1434F` **4.54** (AA by 0.04; only as fill with 13–15 px/700 white text) |
| Accent on ground / on t5 | 5.64 / 5.48 | 8.26 / 7.87 | 4.23 / 4.14 (never used as text there — verified: coral is fill only) |
| Status pills | green 4.63 · red 5.36 · amber 6.21 · grey 6.62 · link 5.99 (identical tokens in all three) | same | same |
| Accent vs destructive red `#C0182B` | 1.02 (teal is far in hue, close in luminance) | 1.44 | **1.36, same hue family**: at 390 the pale-red Send back sits beside the coral Approve |
| AA text failures found by the runtime scan | 1 pattern (4.38) | 2 patterns (4.30, **3.76**) | 2 patterns (4.40, 4.40) |
| Focus ring | 2 px teal on buttons; caption box gets a teal border + 2 px t4 ring on `:focus-within` | 2 px ocean on everything incl. the textarea itself; "Skip to content" link | 2 px coral on buttons; caption box border turns coral on `:focus-within` (1 px, no ring) |
| Tabs to Approve · video controls in the Tab order | 14 · yes (7 stops) | 25 · yes | 17 · yes |
| Esc closes, focus returns · empty note refused | ✓ · not re-tested by me (designer smoke test says yes) | ✓ · ✓ | ✓ · ✓ |
| `prefers-reduced-motion` | 0 elements with a transition or animation | 0 | 0 |
| Console errors, 7 views × 1440/1024/390 | 0 | 0 | 0 |
| `scrollWidth` = viewport, 7 views × 3 widths | ✓ | ✓ | ✓ |
| Bytes before `data.json` (limit 300 KB) | 92,932 | 98,681 | 93,600 |
| External requests · chart library | none · none | none · none | none · none |

## 8. Top 5 fixes per mockup

**A**
1. Approve 1440: move the 36 px Save-caption row above the verdict words or give the card 100 px bottom padding so the sticky bar (y 800–900) never covers it on load.
2. Overview screen 2: either let the Health strip start at y ≈ 860 (directly under Hand work) and put Account under it at full width, or move Account into the left column; target ≤ 100 px of empty ground on any screen.
3. Replace the 17 px summary with the count line only ("1 reel live · 1 scheduled · 0 in production · publishing on") and keep "Nothing needs you." once, in the card.
4. Posts rows 90 → 56 px: pill only in the State cell, secondary line as `title`; Calendar chips already use the short state word.
5. Nav counts and every ink3-on-tint label to ink2 (`#4B5563`, 6.8:1); drop "· live" to its own 12 px line or widen the footer so the stamp holds one line.

**B**
1. Approve 1440: make the video column `position: sticky; top: 88px` (as A and C do) and pin Approve / Send back in a bar at the viewport bottom while the card is on screen; today they are at y 2016.
2. 1024: build the concept's chip (no cover, title 13/700, state word, time) at 106 px; nothing may truncate mid-word. Verify with `critic-1024/overview-00.png` beside Mondly.
3. The board's empty cells: 1 px dashed at 50 % height or a lighter rule (`#EEF0F3`) so 12 empties stop outweighing 2 chips; and give the next week's board the §1.5 sentence once, not 14 cells.
4. Contrast: the selected row meta and the 390 slot labels to ink2 (5.9:1 on t4); band "0" from 40/600 ink3 to 28 px ink2 with "Nothing" as the lead word.
5. Print the campaign in the first-comment link ("rosa.surf · utm_campaign 2026-w43-02 ↗") and remove "1080×1920" and "every / within 10 min" until `data.py` carries the spec line and the cron interval.

**C**
1. 1024: build the concept's layout (rail as a 3-cell row under a 904 px wall of 200×356 tiles, four per row); today Needs you is at y 2042.
2. Approve 1440: bring Send back into the action row (red text on `#FCEBED`, 44 px, 24 px right of Approve) and pin the row to the viewport bottom while the card is on screen; keep the sticky video.
3. The 24 h / 72 h / 7 d chips: outline until a window has numbers (today all three are dashes), so the only coral fill on the Overview is a thing that needs Shahar.
4. Drop the dashed placeholder tile; let the wall be two tiles at 240×427 (reduce the wall card padding to 20 px, which the concept allows) and put "Week 44's reels appear after Monday's plan" as the card's 13 px footer line.
5. Remove "1080×1920" and the "3 reels / week 45" sentence until they have a data path; nav count and calendar slot labels to ink2; give the caption box the same 2 px ring on focus that buttons get (today only a 1 px border changes colour).

## 9. What each does best (facts)

- **A** puts the primary action on the first screen at both widths (Approve at y 828 of 900 at 1440, fixed bar at 390), answers (a) in one reading step, is the only one of the three with no layout defect at 1024, and has the fewest unsourced numbers (one string) and the fewest AA failures (one pattern).
- **B** has the strongest grid: the week board with today's column shaded and the next slot outlined reads at 3 s, the lifecycle nodes (Scripted → Measured) show where a post is without words, every empty state has a sentence, Approve carries a "Skip to content" link and the highest-contrast accent (8.86:1), and its Reject popup is the only one that states the consequence in full ("nothing publishes until it comes back through QA and you approve it").
- **C** answers (c), (d) and (e) on the first screen at 1440 (tiles with four labelled dashes and range chips, Converting and Health in the rail), is the only one with a performance surface per reel (the Post popup's 24 h / 72 h / 7 d arrival table, the Learn slot chart), orders the 390 Overview with Needs you first, and its Posts table is the tidiest (78 px rows, one-line cells, "After it posts" in the link column).

## 10. One sentence per mockup, for the pick

- **A**: the Approve button is on screen at load at 1440 and 390 and the page holds at 1024, at the cost of an Overview whose second screen is 450 px of empty ground on the left.
- **B**: the week board is 86 % empty cells with two reels, its Overview truncates text at 1024, and Approve sits two screens down at 1440 with the video scrolled away; everything else measures cleanest (contrast 8.86:1, focus rings everywhere, fullest copy).
- **C**: the reel tiles answer the performance questions on the first screen, but Needs you lands 2.7 screens down at 1024, the loudest colour on the Overview is an inert range chip, and Approve and Send back are 700 px apart at 1440.

## Evidence files (scratch, gitignored)

`mockups/<x>/shots/critic-overview/` (1440 + 390 sheets), `critic-approve/` (sample on), `critic-approve-real/`,
`critic-1024/` (overview-00/01, approve-00/01), `critic-posts/`, `critic-calendar/`, `critic-popups/` (reject, post);
`a/shots/critic-approve-shot.html` is the `sed` copy A needs for its preview route. Probe output: scratchpad
`audit.json`, `audit.log`, `audit2.log`, `text-*.txt`. `dashboard/side-by-side.png`: three Overviews over three
Approve screens (sample on), 1440, labelled.
