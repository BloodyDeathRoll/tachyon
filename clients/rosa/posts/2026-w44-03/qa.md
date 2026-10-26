# QA · 2026-w44-03 · 2026-10-26T18:43:49+00:00

## Operator notes

Add our Rosa particle animation to the empty bottom of the screen

## Changes

I made the change, but it is unchecked. Permission settings blocked `npx tsc --noEmit -p .` and I didn't look at a single frame.

- **Film change:** `engines/remotion/src/films/film-2026-w44-03.tsx` has a new `RosaParticles` layer. It is Rosa's real bottom effect, copied from `~/Projects/rosa/web/src/components/particles.ts` and `BottomGlow.tsx` (dark theme): a blue/green glow with specks drifting up. It covers the band from y 1280 to 1920, below the safe box, sits behind the phone and all text, and runs for the whole film.
- **Brightness:** I raised it to 0.35 from the app's 0.08 so it shows up on video.

Approve the command (or run `npx tsc --noEmit -p .` in `engines/remotion`) and I'll check a frame next.

## Safe zones

- reel: VERDICT: PASS (worst band 0.01x; text or UI in a band shows as > 0.6x)
- story: VERDICT: PASS (worst band 0.01x; text or UI in a band shows as > 0.6x)

VERDICT: APPROVED
