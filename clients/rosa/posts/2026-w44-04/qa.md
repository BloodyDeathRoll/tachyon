# QA · 2026-w44-04 · 2026-10-26T18:51:30+00:00

## Operator notes

Add the particles animation we use in the Rosa app loading screen. Keep the exact animation we use in the app itself, particles rising up and fading away as they rise

## Changes

I added the Rosa loading-screen particles to the film, but I couldn't type-check it or look at a frame. Both `npx tsc` and `npx remotion still` were blocked by permission settings.

- **Particles added** in `engines/remotion/src/films/film-2026-w44-04.tsx`: the app's splash animation, with specks rising up off the bottom of the screen and fading as they climb. They run for the whole film, behind the phone and text.
- **Same animation as the app:** I checked the colours, density 1.4 and alpha 0.3 against `~/Projects/rosa/web/src/main.tsx` (`splashParticles`). The code is copied from the version already in film-2026-w44-07.
- **Import added:** `random` from `remotion`.

To finish the check, approve the commands or run them yourself:
```
cd engines/remotion && npx tsc --noEmit -p . && npx remotion still src/index.ts film-2026-w44-04 /tmp/x.png --frame=150
```

## Safe zones

- reel: VERDICT: PASS (worst band 0.00x; text or UI in a band shows as > 0.6x)
- story: VERDICT: PASS (worst band 0.00x; text or UI in a band shows as > 0.6x)

VERDICT: APPROVED
