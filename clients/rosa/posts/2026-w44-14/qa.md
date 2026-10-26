# QA · 2026-w44-14 · 2026-10-26T18:50:21+00:00

## Operator notes

Add the particles animation we use in the Rosa app loading screen. Keep the exact animation we use in the app itself, particles rising up and fading away as they rise

## Changes

I added the loading-screen particles to `film-2026-w44-14.tsx`, but I couldn't check them: both `npx tsc --noEmit -p .` and the `remotion still` frame check were blocked by the permission prompt. Nothing has been typechecked or looked at.

Changes:
- `engines/remotion/src/films/film-2026-w44-14.tsx`: added a `Particles` layer copied from the Rosa app's loading screen. It uses the loading screen's particle code and settings (`main.tsx` `splashParticles`: density 1.4, strength 0.3, the two-tone blue/teal colours, 460 px band at the bottom, screen blend), scaled ×2.5 to the 1080×1920 frame. Specks rise off the bottom and fade as they climb.
- Same file: the particles run the whole 12 s, above the footage and below the text and phone.
- Same file: added `random` to the `remotion` import.

I left out the loading screen's coloured glow behind the particles, because the note asked only for the particles.

Once you allow the commands, run these in `engines/remotion`:
```
npx tsc --noEmit -p .
npx remotion still src/index.ts film-2026-w44-14 /tmp/x.png --frame=90
```

## Safe zones

- reel: VERDICT: PASS (worst band 0.15x; text or UI in a band shows as > 0.6x)
- story: VERDICT: PASS (worst band 0.15x; text or UI in a band shows as > 0.6x)

VERDICT: APPROVED
