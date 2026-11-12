---
name: higgs-hook
description: Write a batch of 3 higgs-hook reel scripts for Rosa (weird funny Higgsfield/Seedance opener, two-line joke, the standard app section, callback closer with the lockup), each with stills and Seedance prompts for 9:16 and 16:9, in Notion, then render them once the operator drops the clips. Use when the user says "higgs-hook", "higgs scripts", "new higgs batch", or "render <slug>".
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
3. Each script's folder is its slug (the character: `samurai`, `diver`, …), never a date or a number.
   A slug already in `clients/rosa/higgs-hook/` is taken: pick another character.
4. Notion is the source of truth for every script. For each script add one row to the client's
   Notion database "higgs-hook scripts" (step 8). The repo holds only what the render stitches:
   `clients/rosa/higgs-hook/<slug>/script.json` in the exact shape of
   `.claude/skills/higgs-hook/example.script.json` (title, slug, joke, joke_lines, lock),
   then the operator's clips. Script changes go to the Notion row first, then into `script.json`.
5. Append to `used.yaml` (`characters`, `spots`, `jokes`).
6. Run `.venv/bin/python -m spine.higgs check rosa <slug> both` for each: every issue
   except "missing clip" must be fixed before you hand over.
7. Pass the joke and the caption through `/ig-human`. Caption via `/ig-caption`.
8. Notion row. Find the database (any client, not only Rosa):
   - The client's page: search the Projects database (`collection://3fafdf78-8e46-803d-954e-000b8758c92c`,
     under Dashboard) by business name; if absent, the Clients database
     (`collection://409fdf78-8e46-8014-a9b7-000b7c43607b`). If in neither, add a page to Clients
     (`Name` = the business name).
   - Inside that page, the database titled "higgs-hook scripts". If missing, create it there with
     `notion-create-database` and the same schema as Rosa's: `Title` TITLE, `Status`
     STATUS(`Example`, `Written`, `Clips in`, `Rendered`, `Posted`), `Batch` SELECT, `Done`
     CHECKBOX, and RICH_TEXT `Character`, `Spot A`, `Spot B`, `Joke`, `Hook`, `Closer`,
     `End line`, `Button`, `VO`, `Repo path`.
   - Rosa's: Projects / Rosa, data source `1aebfc99-cf27-4049-be26-1c4a23df1d4d`.

   `notion-create-pages` with that data source as parent. Properties: `Title`, `Status`
   `Written`, `Batch` (add the option first with `notion-update-data-source` if it is new),
   `Character`, `Spot A`, `Spot B`, `Joke`, `Closer` (scene 5 in one line), `Button`
   "Find my wave", `Repo path` (the script folder), `Done` `__NO__`. Leave `Hook`, `End line`,
   `VO` empty (retired). Content: the sections below, in the shape of the model row
   "Samurai paddle-out" (https://app.notion.com/p/409fdf788e46814cbd80e9ebaf91e636): read it first.
9. Reply with the 3 script folders, the 3 titles and the link to the client's Notion database.
   Nothing else.

### The idea

- Scene 1 stops the scroll on frame 1: a character with no business at a surf break, doing a
  surf thing completely straight-faced. Physical, visual, readable with the sound off. Weird
  enough to need a second look, never gross or mean. New character every script.
- The joke sits on scene 1 from 2 s: two short lines, line 2 is the punch (blue). At most 16
  characters a line (`spine.higgs check` refuses longer).
- Between the clips, the app section is the same in every film (the template): "Location is
  everything." with the home screen · the phone flips into a spot page, "16 days forecast." ·
  "No ads, no paywall." · the globe, "+4,500 spots and growing." Nothing to write for it.
- Scene 5 is a callback: same character, a payoff to scene 1 that is funny on its own, any
  place. The joke continues; it does not repeat. It has one key moment (the peak of the action,
  about 1.5–3 s in): the lockup (app icon, rosa.surf, "Find my wave") rises then, in the top
  third, so keep the action out of the top third on 9:16.
- No voice-over, no hook card, no music, no end line. Never "comment for the link".

### Notion row sections

Intro + **Idea.** · `## Scene 1 still` (3:4, 2K, one still for both scene 1 clips) ·
`## Scene 5 still 16:9` (reference: the scene 1 still) · `## Scene 5 still 9:16` (references:
the scene 1 still and the scene 5 still 16:9) · `## Scene 1 (0–5 s)` (beats, Seedance 9:16,
Seedance 16:9) · `## Joke (on scene 1, from 2 s)` (line 1 white, line 2 blue) ·
`## App section (the same in every film)` (copy the model row) · `## Scene 5 (last 5 s)`
(beats, Seedance 9:16, Seedance 16:9) · `## Closing` (the key moment per format) ·
`## Caption` · `## Files to drop` (`s1-9x16.mp4`, `s1-16x9.mp4`, `s5-9x16.mp4`, `s5-16x9.mp4`
into `clients/rosa/higgs-hook/<slug>/`).

### Stills and Seedance prompts (learned on the Samurai)

- Scene 5 stills are made from the scene 1 still as reference, so the character is identical.
  A video's still must match its shape: a 16:9 still fed to a 9:16 video renders rotated.
- Stills: full body, plain light-grey background, "a real photograph, real skin and fabric
  texture, 35 mm film, slight grain, not CGI". Only that scene's props. A still that looks
  like a 3D render carries the look into the video.
- Sizes as a comparison to the body ("one and a half times his height", "the size of a large
  dog"), never feet or metres.
- One hold per prop. Two holds that conflict ("under the arm" and "dragging") shrink the prop.
- A character among people: "a real man in a real costume, lit by the same light as the people
  around him, same white balance, depth of field, colour, grain and sharpness; not CGI".
- Groups of props: "touching", "short rope", "no floor showing between them", "inside the
  middle half of the frame". Otherwise they drift apart.
- 9:16 cannot hold a wide line of things: frame the main subject, then pan to the rest
  ("0–1.5 s on X, 1.5–4 s a slow pan along the rope to Y, 4–5 s holds on Y"). The 9:16 scene 5
  still shows only the main subject, the line leading out of frame.
- Every prompt is complete and pasteable as is: "Image-to-video, 5 seconds." · subject and
  wardrobe (same words as the still) · beats with timing · Setting · Camera (ratio, lens,
  height, move, framing from this scene's own setting) · "Natural light, real and documentary,
  deadpan, no one reacts." · Sound (concrete, "no music, no speech") · "No text, no logos, no
  watermark." Nothing for the operator to add by hand.
- A fix that changes the action, a size or a contact is a regeneration, not an edit (Higgsfield's
  own rule for Seedance 2.5 Edit).

## Render ("render <slug>", e.g. "render diver")

1. Ask: vertical, horizontal or both (unless the operator said).
2. Read the Notion row; `script.json` must match its joke lines. Notion wins.
3. Watch each scene 5 clip and set `lock` in `script.json`: the seconds into the clip of its key
   moment, per format (`{"9x16": 2.4, "16x9": 1.8}`); the takes differ.
4. `.venv/bin/python -m spine.higgs check rosa <slug> <format>`; report missing clips.
5. `.venv/bin/python -m spine.higgs render rosa <slug> <format>` (Remotion `HiggsFilm`,
   clip sound only).
6. Read `out/check.txt`. Look at full-size frames of every text beat and the lockup
   (`ffmpeg -ss <t> -i out/video.mp4 -frames:v 1 x.png`), never only a contact sheet: check no
   letter is cut and the lockup clears the action.
7. Reply with the `out/` paths. The operator uploads them.
