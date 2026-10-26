# QA · 2026-w44-02 · 2026-10-26T19:01:27+00:00

## Operator notes

Add our Rosa app particles animation to the empty bottom areas that only show a dark background color. Use the exact animation from the Rosa app - particles rising up and disappearing as they rise.

## Changes

I added the Rosa particles to `engines/remotion/src/films/film-2026-w44-02.tsx`, but I couldn't check it: permission was refused for both `npx tsc --noEmit -p .` and the still render.

- I copied the particle code exactly from `film-2026-w44-03.tsx` (`RosaParticles`, `speck`, `PALETTE`, `SPECKS`, `BAND`) and imported `random` from remotion.
- The particles sit in the bottom band (y 1280–1920), behind the phone. They fade in and out with the dark panel, from `T.phone + 0.2` to `T.end - 0.2`.

To check it, run:
```
cd engines/remotion && npx tsc --noEmit -p . && npx remotion still src/index.ts film-2026-w44-02 /tmp/x.png --frame=180
```

## Safe zones

- reel: VERDICT: PASS (worst band 0.02x; text or UI in a band shows as > 0.6x)
- story: VERDICT: PASS (worst band 0.02x; text or UI in a band shows as > 0.6x)

VERDICT: APPROVED
