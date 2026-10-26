# QA · 2026-w44-09 · 2026-10-26T18:57:59+00:00

## Operator notes

Add our Rosa app particles animation to the empty bottom areas that only show a dark background color. Use the exact animation from the Rosa app - particles rising up and disappearing as they rise.

## Changes

I couldn't run the typecheck because the permission prompt blocked `npx tsc`, so the edit is untested. I also haven't checked any frames.

```
cd engines/remotion && npx tsc --noEmit -p .
```

- `film-2026-w44-09.tsx`: copied the Rosa app's rising, fading particles from `film-2026-w44-10.tsx` unchanged (the Rosa web app's particle code).
- `film-2026-w44-09.tsx`: they fill the bottom of the frame on the black opening card (0 to 1.6 s) and on the dark map section (4.0 to 10.0 s), not over the footage.
- `film-2026-w44-09.tsx`: imported `random` from `remotion`.

## Safe zones

- reel: VERDICT: PASS (worst band 0.09x; text or UI in a band shows as > 0.6x)
- story: VERDICT: PASS (worst band 0.09x; text or UI in a band shows as > 0.6x)

VERDICT: APPROVED
