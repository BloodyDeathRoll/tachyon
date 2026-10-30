---
name: higgs-hook
description: Write a batch of 3 higgs-hook reel scripts for Rosa (weird funny Higgsfield/Seedance opener, joke overlay, Rosa hook, real app screens, callback closer with end card), each with Seedance prompts for 9:16 and 16:9, then render them once the operator drops the clips. Use when the user says "higgs-hook", "higgs scripts", "new higgs batch", or "render <batch>".
---

# higgs-hook

Plan: `docs/HIGGS-HOOK.md`. A separate track from the automatic system; the operator uploads the
result through the dashboard (Calendar → Add new). Run from the main checkout `~/Projects/tachyon`.

## Write a batch ("higgs-hook", "new batch")

1. Read, in this order: `clients/rosa/higgs-hook/used.yaml` (may not exist yet),
   `clients/rosa/product.md`, `clients/rosa/brand.md`, `docs/HIGGS-HOOK.md`.
2. Spot list: `curl -s https://rosa-data-opal.vercel.app/data/index.json` (`spots.<slug>`:
   name, region, country, lat, lon, rating). Pick 3 pairs (spot A, spot B more local, near A or
   a dream trip from A). No spot in `used.yaml`. Spread countries across the batch.
3. Batch id: `YYYY-MM-DD` (today); a second batch the same day gets `-b`.
4. For each script `01`, `02`, `03` write `clients/rosa/higgs-hook/<batch>/<nn>/script.json`
   in the exact shape of `.claude/skills/higgs-hook/example.script.json`, and the doc
   `clients/rosa/higgs-hook/<batch>/<nn>-<slug>.md` (sections below). Then
   `clients/rosa/higgs-hook/<batch>/index.md`: one line per script (title, spots, idea).
5. Append to `used.yaml` (`characters`, `spots`, `hooks`, `jokes`, `end_lines`, `buttons`).
6. Run `.venv/bin/python -m spine.higgs check rosa <batch> <nn> both` for each: every issue
   except "missing clip" must be fixed before you hand over.
7. Pass every spoken or on-screen line through `/ig-human`. Caption via `/ig-caption`.
8. Reply with the batch path and the 3 titles. Nothing else.

### The idea

- Scene 1 stops the scroll on frame 1: a character with no business at a surf break, doing a
  surf thing completely straight-faced. Physical, visual, readable with the sound off. Weird
  enough to need a second look, never gross or mean. New character every script.
- The joke (scene 2) is one short line that reframes scene 1. Under 6 words if possible.
- The hook (scene 3) is one Rosa feature or advantage, from `product.md` only. Plain words,
  no numbers that are not in `product.md`.
- Scene 5 is a callback: same character, same props, later, on the way to spot B. The joke
  continues; it does not repeat.
- End card: a fresh line and button text each time. Never "try for free" or anything that
  implies paying later. Never "comment for the link". `rosa.surf` and `@rosa_surf_forecast` are
  added by the template.
- VO: 2–3 short lines, first person, the avid surfer from `brand.md`, starts when the hook card
  starts (5 s), about 10 s long. One take; never split.

### Script doc sections

`# <title>` then: **Idea** (one line) · **Character still** (prompt for a Higgsfield image model,
full body, neutral background light matching scene 1) · **Scene 1** (beat-by-beat action,
Seedance prompt 9:16, Seedance prompt 16:9) · **Scene 2** (joke) · **Scene 3** (hook, VO) ·
**Scene 4** (what the screens show, in words) · **Scene 5** (callback, Seedance prompt 9:16 and
16:9, end line, button) · **Caption** · **Files to drop** (`s1-9x16.mp4`, `s1-16x9.mp4`,
`s5-9x16.mp4`, `s5-16x9.mp4` into `clients/rosa/higgs-hook/<batch>/<nn>/`).

### Seedance prompts

One paragraph each, about 60–100 words, image-to-video from the character still, 5 seconds:
subject and wardrobe (same words as the still) · action beat by beat with timing ("0–2 s …,
2–5 s …") · setting and time of day · camera (lens, height, move; framed for the ratio: 9:16
keeps the action in the centre column, 16:9 uses the width) · light · mood: deadpan, real,
documentary · sound: the concrete sounds of the scene (sand, waves, wind, wheels on tiles)
and no music, no speech · "no text, no logos, no watermark".

### Screens (`script.json` `screens.steps`)

A real recording of the live app (`spine.higgs screens`), one key per step:
`go` (path), `wait` (s), `scroll` (px, page), `wheel` (px on the map: positive zooms out,
negative in), `swipe` (`left`/`right`, the forecast days), `tap` (CSS selector).
Recipe that works: `go /spot/<A>` → `scroll` → `tap button.accent-link` (map flies to A) →
`wheel` out → `go /spot/<B>` → `tap button.accent-link` (map flies in to B) → `go /spot/<B>` →
`swipe left` → `scroll`. Aim for 6–8 s; the template clamps to 4–10 s.

## Render ("render <batch>" or "render <batch> <nn>")

1. Ask: vertical, horizontal or both (unless the operator said).
2. `.venv/bin/python -m spine.higgs check rosa <batch> <nn> <format>`; report missing clips.
3. `.venv/bin/python -m spine.higgs render rosa <batch> <nn> <format>` (records the screens on
   the first run, makes the VO once, renders, mixes clip sound + music + VO).
4. Read `out/check.txt` and look at a frame from each scene
   (`ffmpeg -ss <t> -i out/video.mp4 -frames:v 1 x.jpg`) before handing over.
5. Reply with the `out/` paths. The operator uploads them.
