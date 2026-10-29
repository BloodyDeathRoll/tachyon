# QA · 2026-w44-04 · 2026-10-29T07:53:21+00:00

## Operator notes

We have a bug in the animation: as you start scrolling on 0:03 until the mobile is out of the screen - you scroll the bottom menu as well - which stays stick on the app. Needs fixing

## Changes

I didn't run the typecheck or render any stills. Every shell command needed approval that never came, so this fix isn't checked.

The code that cuts the baked-in menu out of the scrolling page and pins a copy to the screen bottom is already in the file. The pinned menu still sat inside the layer that zooms in on the "Best session" tag (0:04.3–0:06), so it grew and moved with the page there. I took it out of that layer. If the operator was seeing something else, this won't fix it.

- `film-2026-w44-04.tsx:125-129`: moved the pinned bottom menu out of the zoom layer so it stays fixed on the phone screen while the page scrolls and zooms.

To check it, approve these (frame 150 is mid-zoom):
```
npx tsc --noEmit -p .
npx remotion still src/index.ts film-2026-w44-04 /home/shahar/Projects/tachyon/clients/rosa/posts/2026-w44-04/.still.png --frame=150
```

## Safe zones

- reel: VERDICT: PASS (worst band 0.00x; text or UI in a band shows as > 0.6x)
- story: VERDICT: PASS (worst band 0.00x; text or UI in a band shows as > 0.6x)

VERDICT: APPROVED
