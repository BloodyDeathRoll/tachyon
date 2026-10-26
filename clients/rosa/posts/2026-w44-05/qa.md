# QA · 2026-w44-05 · 2026-10-26T18:51:23+00:00

## Operator notes

Add the particles animation we use in the Rosa app loading screen. Keep the exact animation we use in the app itself, particles rising up and fading away as they rise

## Changes

I added the Rosa loading-screen particles to the reel, but I couldn't check it: the type-check and the frame still both need approval, so neither ran.

- `engines/remotion/src/films/film-2026-w44-05.tsx`: added the app's loading-screen particles, copied from the version already in `film-2026-w44-14.tsx`. I checked that version against the app's own code (`rosa/web` `particles.ts`, the settings in `main.tsx` and the 460px bottom band in `index.html`). The specks rise from the bottom and fade as they climb, as in the app.
- Same file: the particles run the full 12s, behind the phone, cards and text, so the safe box is unaffected. Only the particles are added, not the app's blue/green glow under them.
- Same file: imported `random` from `remotion`.

To check, run in `engines/remotion`:
```
npx tsc --noEmit -p .
npx remotion still src/index.ts film-2026-w44-05 /tmp/x.png --frame=60
```

## Safe zones

- reel: VERDICT: PASS (worst band 0.01x; text or UI in a band shows as > 0.6x)
- story: VERDICT: PASS (worst band 0.01x; text or UI in a band shows as > 0.6x)

VERDICT: APPROVED
