# higgs-hook — plan

A second way to make Rosa reels, next to the automatic system, not instead of it.
Claude writes a batch of 3 scripts on demand; the operator generates the two
Higgsfield clips per script; Claude builds the rest and renders; the operator uploads the
finished video into the automatic system (dashboard upload), where it goes through QA,
approval and publish like any other slot.

## 1. The video (15–20 s)

| # | Time | What | Source | Audio |
|---|------|------|--------|-------|
| 1 | 0–5 s | Weird, funny scene. A character who has no business at a surf break does a surf thing, deadpan. | Higgsfield, Seedance, image-to-video | Native SFX only (board on sand, waves). No music, no VO. |
| 2 | 2.5–5 s | One-line joke on top of scene 1 ("Preparing for a fight?"). | Claude (text overlay) | Scene 1 SFX continues |
| 3 | 5–7 s | Rosa hook: one feature or advantage, said plainly ("Find every spot that's pumping around you right now"). | Claude (kinetic text) | Music in, VO starts |
| 4 | 7–15 s | Rosa screens: the feature the hook names, in the real app (example: spot A, map out, map in on spot B, forecast, swipe, scroll; or a Surf/Swim mode switch). | Claude (Remotion, real app captures) | Music + VO |
| 5 | 15–20 s | Callback: same character, a funny payoff to scene 1, any place (examples: airport queue, board in a travel bag, still dragging; a flat sea, the surfer swims across on half his snapped board). End card on top: logo, `rosa.surf`, `@rosa_surf_forecast`, a line, a button. | Higgsfield + Claude (end card) | Clip SFX low, music, VO tag |

Scene 1 has to stop the scroll on frame 1: the character is already in shot, the oddness reads
without sound, nothing is explained.

## 2. Formats

- Vertical 9:16 (reel + story file, as every slot) and horizontal 16:9.
- Picked at render time: `vertical`, `horizontal` or `both`.
- Scenes 1 and 5 get a separate Seedance prompt per format (composed for the frame, not
  cropped). So 4 clips per script, 12 per batch.

## 3. Higgsfield (operator)

Per script:
1. Character reference still (Higgsfield image model, prompt in the script doc). Reused for
   scenes 1 and 5 so the character stays the same.
2. Seedance image-to-video from that still: `s1-9x16`, `s1-16x9`, `s5-9x16`, `s5-16x9`.
   Native audio on.
3. Drop the files in `~/Projects/tachyon/clients/rosa/higgs-hook/<batch>/<nn>/` with those
   names (`.mp4`). Then tell Claude "render <batch>".

Model: Seedance (operator choice). Fallback if the SFX comes out weak: Veo 3.

## 4. Script doc (one per script)

`clients/rosa/higgs-hook/<batch>/<nn>-<slug>.md` (main checkout), plus `index.md` for the
batch. Each doc:

- **Idea** in one line, character, spot A, spot B.
- **Character still prompt.**
- **Scene 1** — action, camera, lighting, sound; Seedance prompt 9:16 and 16:9.
- **Scene 2** — overlay text, timing.
- **Scene 3** — hook line (screen text) and VO line.
- **Scene 4** — screen shot list (which spot, which gesture, how long), VO lines.
- **Scene 5** — callback action; Seedance prompt 9:16 and 16:9; end card line and button text.
- **Caption** (via `/ig-caption`).
- **Checks** — hook score, `/ig-human` score, spots/characters not used before.

Prompt shape for Seedance: subject and wardrobe, action beat by beat, setting, camera
(lens, move, framing for the format), light, mood, sound cues, "no text, no logos".

## 5. Writing rules

- Every batch: 3 different characters, 3 different settings for the joke, 3 different
  hooks (feature or advantage from `clients/rosa/product.md`, numbers measured there).
- Spots: from the live Rosa spot index; spot B more local than spot A. No spot repeats
  until the log runs dry (no Uluwatu loops).
- End-card line and button: new each time; never "try for free"; never "comment for the
  link" (decision 13). Ideas in the register of "Check your spot", "See it pumping", "Find
  your next wave".
- Voice: `clients/rosa/brand.md` (words we never say, no competitors, no accuracy claims).
- VO: one Dia take for the whole VO (`spine/voice.py`), music ducked under it, as the
  automatic system does.
- Log every used character, spot, hook and end-card line in
  `clients/rosa/higgs-hook/used.yaml`; read it before writing.

## 6. Build (Claude)

1. `skills/higgs-hook/SKILL.md`: "/higgs-hook" writes a batch of 3 script docs + `index.md`,
   reading `used.yaml`, `product.md`, `brand.md` and the spot index.
2. Remotion composition `HiggsHook` in `engines/remotion/src/`: takes the script JSON
   (clip paths, overlay text, hook line, screen sequence, end card), lays out 9:16 and 16:9
   (`formats.ts`, safe boxes per decision 14).
3. Screens: real app captures of spots A and B (`spine/capture.py`), animated map
   pan/zoom, forecast, swipe and scroll in Remotion.
4. End card: animated logo, `rosa.surf`, `@rosa_surf_forecast`, line, button.
5. Audio: scene 1/5 native SFX + music bed + Dia VO, mixed as in `spine/tracks.py`.
6. Render command per script: `vertical | horizontal | both`; output into the usual post
   files (`video.mp4`, `video-story.mp4`, `video-16x9.mp4`).
7. Upload into the system through the dashboard; `spec_check` QA runs as for every slot.
   `is_ai_generated` in `meta.json` is the operator's call per post.

## 7. Open

- Seedance clip length options and native-audio setting on Higgsfield: confirm on the first
  run.
- Dashboard upload with a 16:9 file next to the vertical: confirm on the first run.
