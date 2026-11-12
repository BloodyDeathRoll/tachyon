# higgs-hook — plan

A second way to make Rosa reels, next to the automatic system, not instead of it.
Claude writes a batch of 3 scripts on demand; the operator generates the two
Higgsfield clips per script; Claude builds the rest and renders; the operator uploads the
finished video into the automatic system (dashboard upload), where it goes through QA,
approval and publish like any other slot.

## 1. The video (about 25 s)

One Remotion template for every script (`engines/remotion/src/higgs/HiggsFilm.tsx`, built on
"Samurai paddle-out", 2026-11-09). Per script only the two clips, the joke and the lockup moment
change.

| # | Time | What | Source |
|---|------|------|--------|
| 1 | 0–5 s | Weird, funny scene: a character with no business at a surf break does a surf thing, deadpan. The joke on top from 2 s: two lines, left-aligned, line 2 blue, each word pops in. | Higgsfield (Seedance) + template |
| 2 | +0–10 s | App section, the same in every film: "Location is everything." with the home screen (swipe Topanga to Sunset Point) · the phone flips into the spot page, "16 days forecast." · "No ads, no paywall." · the globe, "+4,500 spots and growing." 16:9: phone left, text right. | Template (shared frames in `public/higgs/app`) |
| 3 | last 5 s | Callback: same character, a funny payoff. The app icon zooms in as the globe shrinks; at the clip's key moment it rises to the top third with `rosa.surf` and "Find my wave", clear of the action. | Higgsfield + template |

Sound: the clips' own only. No music, no voice-over, no hook card, no end line (operator,
2026-11-10). Scene 1 has to stop the scroll on frame 1.

## 2. Formats

- Vertical 9:16 (reel + story file, as every slot) and horizontal 16:9.
- Picked at render time: `vertical`, `horizontal` or `both`.
- Scenes 1 and 5 get a separate Seedance prompt per format (composed for the frame, not
  cropped). So 4 clips per script, 12 per batch.

## 3. Higgsfield (operator)

Per script, from its Notion row (the source of truth; prompts paste as they are):
1. Stills (Seedream 5.0 Pro, 2K): scene 1 still (3:4, used for both scene 1 clips), scene 5 still
   16:9 and scene 5 still 9:16, both made with the scene 1 still as reference. A video's still
   must match its shape (a 16:9 still in a 9:16 video renders rotated).
2. Seedance 2.5 image-to-video, 720p: `s1-9x16`, `s1-16x9`, `s5-9x16`, `s5-16x9`.
3. Drop the files in `~/Projects/tachyon/clients/rosa/higgs-hook/<slug>/` (the script's
   character: `samurai`, `diver`, …) with those names (`.mp4`). Then tell Claude "render <slug>".

## 4. Script (one per script)

The Notion row in "higgs-hook scripts", sections in the shape of "Samurai paddle-out": stills,
scene 1 (beats, two Seedance prompts), joke (two lines), app section (standard), scene 5 (beats,
two Seedance prompts), closing (the key moment per format), caption, files to drop. Prompt rules
in `.claude/skills/higgs-hook/SKILL.md`. The repo keeps only `script.json` (title, joke,
joke_lines, lock) for the render.

## 5. Writing rules

- Every batch: 3 different characters, 3 different settings for the joke.
- Spots: from the live Rosa spot index; spot B more local than spot A. No spot repeats
  until the log runs dry (no Uluwatu loops).
- Never "comment for the link" (decision 13).
- Voice: `clients/rosa/brand.md` (words we never say, no competitors, no accuracy claims).
- Log every used character, spot and joke in
  `clients/rosa/higgs-hook/used.yaml`; read it before writing.

## 6. Build (Claude)

1. `.claude/skills/higgs-hook/SKILL.md`: writes a batch (Notion rows + `script.json`) and renders.
2. `spine/higgs.py render <client> <slug> vertical|horizontal|both`: copies the clips to
   `engines/remotion/public/higgs/<slug>/`, renders `HiggsFilm`, `HiggsFilm-story`,
   `HiggsFilm-16x9` into `out/video.mp4`, `out/video-story.mp4`, `out/video-16x9.mp4`, keeps the
   clip sound only, runs `spec_check` on the vertical files.
3. Upload into the system through the dashboard; `spec_check` QA runs as for every slot.
   `is_ai_generated` in `meta.json` is the operator's call per post.

## 7. Open

- Seedance clip length options and native-audio setting on Higgsfield: confirm on the first
  run.
- Dashboard upload with a 16:9 file next to the vertical: confirm on the first run.
