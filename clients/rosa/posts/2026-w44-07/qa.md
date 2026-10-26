# QA · 2026-w44-07 · 2026-10-26T19:03:29+00:00

## Operator notes

Add the particles animation we use in the Rosa app loading screen. Keep the exact animation we use in the app itself, particles rising up and fading away as they rise

## Changes

Added the Rosa loading-screen particles to w44-07, but I couldn't run the typecheck or render a frame because permission to run `npx` was denied. Nothing is verified yet.

Changes, all in `engines/remotion/src/films/film-2026-w44-07.tsx`:
- Imported `random` from `remotion`.
- Added a `Particles` layer, copied from the one in film w44-14. I checked it against the app's own code (`rosa/web` `particles.ts`, the splash settings in `main.tsx`, and the 460 px bottom band in `index.html`): specks rise from the bottom and fade as they climb.
- Placed `<Particles>` behind the phone and all text, across the bottom 1150 px of the frame, running the whole film.

To check it, from `engines/remotion`:
```
npx tsc --noEmit -p .
npx remotion still src/index.ts film-2026-w44-07 /tmp/x.png --frame=200
```

## Safe zones

- reel: VERDICT: WARN (worst band 0.26x; text or UI in a band shows as > 0.6x)
- story: VERDICT: WARN (worst band 0.26x; text or UI in a band shows as > 0.6x)

VERDICT: APPROVED
