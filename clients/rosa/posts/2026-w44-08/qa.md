# QA · 2026-w44-08 · 2026-10-26T18:51:20+00:00

## Operator notes

Add the particles animation we use in the Rosa app loading screen. Keep the exact animation we use in the app itself, particles rising up and fading away as they rise

## Changes

I added the loading-screen particles to w44-08, but nothing is verified: permission to run `npx` was denied, so I couldn't typecheck or check a frame.

- Imported `random` from `remotion` in `engines/remotion/src/films/film-2026-w44-08.tsx`.
- Added a `Particles` layer copied from the one in film w44-07, after checking it line by line against the app's own code (`rosa/web` `particles.ts`, the splash settings in `main.tsx`, the 460 px bottom band in `index.html`): specks rise from the bottom and fade as they climb.
- Placed `<Particles>` behind the phone and all text, across the bottom 1150 px of the frame, running the whole 13 s.

To check it, from `engines/remotion`:
```
npx tsc --noEmit -p .
npx remotion still src/index.ts film-2026-w44-08 /tmp/x.png --frame=180
```

## Safe zones

- reel: VERDICT: PASS (worst band 0.00x; text or UI in a band shows as > 0.6x)
- story: VERDICT: PASS (worst band 0.00x; text or UI in a band shows as > 0.6x)

VERDICT: APPROVED
