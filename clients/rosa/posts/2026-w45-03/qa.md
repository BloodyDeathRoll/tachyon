# QA · 2026-w45-03 · 2026-10-31T10:43:59+00:00

## Operator notes

First "GOOD." should be white text on a green pill background, like on the app.
I do not like the rounded square behind the logo & text on 0:11-0:12. Adds nothing besides confusion.
Also, there is a lot of open non allocated space on the bottom throughout - add our Rosa particles animation from the rosa app login - particles rising from the bottom and fading out as they rise

## Changes

I made all three changes, but haven't checked them. Both `npx tsc --noEmit -p .` and `npx remotion still` were blocked because they need approval, and this session can't ask for it. So the film is not type-checked and I haven't looked at any frames.

- **"Good." pill:** the first "Good." is now white text on a green pill (`C.good`), like the "Epic" badge in the app.
- **End card:** removed the two spinning rounded squares behind the logo and text at about 0:10.5–0:11.2.
- **Particles:** copied the Rosa login particles exactly from `film-2026-w44-11.tsx` (screen-blended, rising from a 1150 px band at the bottom). They run for the whole film, just above the dot grid.

The particles' blue and teal colours, screen-blended over this film's bright blue background, may be hard to see. Please check a frame before rendering.

## Safe zones

- reel: VERDICT: PASS (worst band 0.08x; text or UI in a band shows as > 0.6x)
- story: VERDICT: PASS (worst band 0.08x; text or UI in a band shows as > 0.6x)
- reel spec: VERDICT: PASS
- story spec: VERDICT: PASS

VERDICT: APPROVED
