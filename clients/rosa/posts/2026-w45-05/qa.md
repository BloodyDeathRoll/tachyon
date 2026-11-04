# QA · 2026-w45-05 · 2026-10-31T11:01:57+00:00

## Operator notes

0:08-0:11 - when you present the mobile with the app, it needs to be MUCH bigger. This is the only time we see the app in this video.
And the scrolling should NOT scroll the bottom nav, that always stays in place

## Changes

I made the edits, but I couldn't check them: the permission layer blocked both `npx tsc --noEmit -p .` and `npx remotion still`. The film hasn't been type-checked and I haven't looked at any frames.

Changes in `engines/remotion/src/films/film-2026-w45-05.tsx`:
- The phone in the 0:08–0:11 section is about 1.7× wider and 1.7× taller (scale 0.62 → 1.03). It now fills the right side of the safe box, top to bottom.
- "ONE" / "LOOK." and size / period / wind are now stacked in a column to the left of the phone so the bigger phone fits.
- The screen now uses `spot-uluwatu-full.png`. The bottom nav band is cut out of the scrolling page, and the nav pill is pinned to the bottom of the screen, using the method from `film-2026-w44-04`.
- The header comment now names the new capture.

To finish, approve these two commands, or run them yourself:
```
npx tsc --noEmit -p .
npx remotion still src/index.ts film-2026-w45-05 /home/shahar/Projects/tachyon/clients/rosa/posts/2026-w45-05/.still.png --frame=600
```

Risks: "LOOK." at 150 px may not fit its roughly 460 px column. The 3D sway may also push the phone's right edge a few pixels past the safe box. The cut and nav positions were measured for w44-04, and I haven't checked them on this film.

## Safe zones

- reel: VERDICT: PASS (worst band 0.12x; text or UI in a band shows as > 0.6x)
- story: VERDICT: PASS (worst band 0.12x; text or UI in a band shows as > 0.6x)
- reel spec: VERDICT: PASS
- story spec: VERDICT: PASS

VERDICT: APPROVED
