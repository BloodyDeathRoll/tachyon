# QA · 2026-w45-12 · 2026-10-31T11:31:11+00:00

## Operator notes

Stop taking into consideration how Instagram cuts the video, and US THE WHOLE SCREEN instead of showing a 1/9 size mobile

## Changes

The phone now fills the whole frame, but nothing is checked yet: the `tsc` check and the `remotion still` render both need approval in this session, so I couldn't run either or look at any frames.

Changes, all in `engines/remotion/src/films/film-2026-w45-12.tsx`:
- The film is centred on the middle of the frame (`width/2, height/2`) instead of the middle of the safe box.
- The phone's scale goes from 0.6→0.74 to 1.5→2.05, so the app is about 860×1800 px across the full screen. The zoom at the end is cut from ×8 to ×4 to match.
- The phone starts lower (y offset 300 instead of 60) so it sits under the hook, then rises to the centre.
- The hook text is now drawn on top of the phone.
- Shards fly further (distance 500–1200 instead of 220–700) and are bigger (size 10–34 instead of 6–22).
- The snap ring grows to 2200 px instead of 1040.
- The background gradient is wider and uses the frame height instead of a fixed 1920.

Not changed:
- **Text placement:** all text stays inside SAFE. The app strips now reach past it, which the operator asked for but the rules forbid for UI elements.
- **Voice-over:** the message is the same, so I left the script alone.

To check it, approve and run:
```
npx tsc --noEmit -p .
npx remotion still src/index.ts film-2026-w45-12 /home/shahar/Projects/tachyon/clients/rosa/posts/2026-w45-12/.still.png --frame=90
```

Risk: the burst layers (moved up to 125 px × 2.05) may get cut off at the top and bottom edges. Checking stills at frames 60, 90 and 180 would show it.

## Safe zones

- reel: VERDICT: FAIL (worst band 0.61x; text or UI in a band shows as > 0.6x)
- story: VERDICT: FAIL (worst band 0.62x; text or UI in a band shows as > 0.6x)
- reel spec: VERDICT: PASS
- story spec: VERDICT: PASS

VERDICT: NEEDS_REVISION
