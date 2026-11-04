# QA · 2026-w45-10 · 2026-10-31T11:21:58+00:00

## Operator notes

You keep planning the video to fit instagram cuts. STOP IT. Use the whole screen.
The closing barrel video/imageis shown too often. Replace it with a fresh video

## Changes

I made the changes, but I couldn't check them: `npx tsc --noEmit -p .` and `npx remotion still …` were both blocked waiting for approval. The type check hasn't run and I haven't looked at any frames.

- **Whole screen:** the phone is now positioned against the full 1080×1920 frame, not the safe box (centre y 960, grows up to about 1.46× and nearly fills the frame height). Only the text still keeps to the safe box.
- **Whole screen:** the six particle bands now run from the top of the frame to the bottom (y 110–1810).
- **Whole screen:** the stream that flows to the pin now starts anywhere on the left edge, top to bottom, not just inside the safe box.
- **Whole screen:** the pin moved to the bottom-right corner of the frame (930, 1760).
- **Whole screen:** the blue background glow now covers the whole frame.
- **Closing barrel clip:** the end card now uses `footage/283533_large.mp4` (a Pixabay "wave breaking" clip no other film uses) instead of `310248_large.mp4` (used in 17 films).
- **Closing barrel clip:** I copied `283533_large.mp4` from `clients/rosa/assets/footage/` into `engines/remotion/public/footage/`, since the film can only load clips from there. That's a file outside the film source.

To check it, approve or run these from `engines/remotion`:
```
npx tsc --noEmit -p .
npx remotion still src/index.ts film-2026-w45-10 /home/shahar/Projects/tachyon/clients/rosa/posts/2026-w45-10/.still.png --frame=N
```
Frames worth checking: around 200 (phone after the spin, at its biggest, under the text in the top-right) and around 300 (new end clip, which starts 2 s into the source).

## Safe zones

- reel: VERDICT: WARN (worst band 0.45x; text or UI in a band shows as > 0.6x)
- story: VERDICT: WARN (worst band 0.46x; text or UI in a band shows as > 0.6x)
- reel spec: VERDICT: PASS
- story spec: VERDICT: PASS

VERDICT: APPROVED
