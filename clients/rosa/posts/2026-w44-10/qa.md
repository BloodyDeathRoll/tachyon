# QA · 2026-w44-10 · 2026-10-26T18:55:11+00:00

## Operator notes

Add the particles animation we use in the Rosa app loading screen on the parts were the bottom is just an empty dark color. Keep the exact animation we use in the app itself, particles rising up and fading away as they rise

## Changes

I added the Rosa loading-screen particles to the dark panel in `film-2026-w44-10.tsx`. I couldn't run `npx tsc --noEmit -p .` or check a frame, because both commands were blocked waiting for approval, so the change is not type-checked or seen on screen.

- **Particles:** a `Particles` layer copied line for line from `film-2026-w44-12.tsx`. That is a port of `rosa/web/src/components/particles.ts` with the app's loading-screen settings: two-tone palette, density 1.4, strength 0.3, a 460 px band at the bottom, screen blend. I compared it to the app source and it matches: specks rise up and fade as they climb.
- **Where they show:** only while the dark panel is up (from `T.rows - 0.2` to `T.end - 0.2`), fading in and out with it, behind the phone and text.
- **Import:** added `random` from `remotion`.

To finish checking, run these in `engines/remotion` (frame 210 is 7 s in, on the dark panel):
```
npx tsc --noEmit -p .
npx remotion still src/index.ts film-2026-w44-10 /tmp/x.png --frame=210
```

## Safe zones

- reel: VERDICT: WARN (worst band 0.26x; text or UI in a band shows as > 0.6x)
- story: VERDICT: WARN (worst band 0.26x; text or UI in a band shows as > 0.6x)

VERDICT: APPROVED
