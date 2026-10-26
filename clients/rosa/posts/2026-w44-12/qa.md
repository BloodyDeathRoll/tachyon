# QA · 2026-w44-12 · 2026-10-26T18:52:01+00:00

## Operator notes

Add the particles animation we use in the Rosa app loading screen. Keep the exact animation we use in the app itself, particles rising up and fading away as they rise

## Changes

I made one change, but I couldn't check it: the shell refused to run `npx tsc --noEmit -p .` and `remotion still`, so the code is not typechecked and no frame is checked.

- `film-2026-w44-12.tsx`: added the particles from the Rosa app loading screen, ported 1:1 from `rosa/web/src/components/particles.ts` with the splash settings from `main.tsx` (two-tone palette, density 1.4, alpha 0.3) on the splash's 460 px bottom band. Specks rise off the bottom and fade as they climb.
- It runs for the whole film, behind the text.
- The particle code is identical to what w44-11 and w44-13 use (`random` import, `<Particles>` component and its placement).

To finish the check, run in `engines/remotion`:
```
npx tsc --noEmit -p .
npx remotion still src/index.ts film-2026-w44-12 /tmp/x.png --frame=150
```

## Safe zones

- reel: VERDICT: PASS (worst band 0.04x; text or UI in a band shows as > 0.6x)
- story: VERDICT: PASS (worst band 0.04x; text or UI in a band shows as > 0.6x)

VERDICT: APPROVED
