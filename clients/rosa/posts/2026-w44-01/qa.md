# QA · 2026-w44-01 · 2026-10-26T19:02:44+00:00

## Operator notes

Add our Rosa app particles animation to the empty bottom areas that only show a dark background color. Use the exact animation from the Rosa app - particles rising up and disappearing as they rise.

## Changes

I made the edit, but I couldn't run any checks: the `npx` commands for `tsc` and `remotion still` need permission, and that permission wasn't granted.

```
npx tsc --noEmit -p .
```

The films for 2026-w44-02 to w44-14 already use the same particles code, based on the app's `BottomGlow.tsx` + `particles.ts`. I copied it from film-2026-w44-02 as is.

- Added the Rosa particles (copied from film-2026-w44-02) to `film-2026-w44-01.tsx`: specks rise and fade over a two-tone glow in the bottom band (y 1280–1920).
- They show only while the dark background is on screen, from 2.2 s to 9.0 s, fading in and out with it.
- Added `random` to the `remotion` import in the same file.

## Safe zones

- reel: VERDICT: WARN (worst band 0.26x; text or UI in a band shows as > 0.6x)
- story: VERDICT: WARN (worst band 0.26x; text or UI in a band shows as > 0.6x)

VERDICT: APPROVED
