# QA · 2026-w44-06 · 2026-10-26T18:45:43+00:00

## Operator notes

The particles animation is not correct. Keep the exact animation we use in the app itself, particles rising up and fading away as they rise

## Changes

I replaced the reel's particles with a port of the app's own particle code, but I haven't type-checked it or looked at a frame. The permission settings blocked both `npx tsc` and `npx remotion still`.

- `engines/remotion/src/films/film-2026-w44-06.tsx`: removed my earlier made-up particles (110 drifting, twinkling dots).
- Same file: added a port of the app's bottom effect (rosa/web `particles.ts`, `BottomGlow.tsx` and the dark-theme glow in `styles.css`). The specks now rise up out of the blue/green glow and fade as they climb, as in the app.
- Same file: the number of specks follows the app's density rule, which gives 14 for the bottom band (y 1280–1920).
- Same file: brightness is 0.35 instead of the app's 0.08 so the specks show on video. Reel 2026-w44-03 uses the same value.

Decision for you: with only 14 specks at that brightness, the bottom may look sparse on video.

To finish the check, approve or run these:
```
cd engines/remotion && npx tsc --noEmit -p .
npx remotion still src/index.ts film-2026-w44-06 /tmp/x.png --frame=150
```

## Safe zones

- reel: VERDICT: PASS (worst band 0.03x; text or UI in a band shows as > 0.6x)
- story: VERDICT: PASS (worst band 0.03x; text or UI in a band shows as > 0.6x)

VERDICT: APPROVED
