# QA · 2026-w44-02 · 2026-10-29T07:30:57+00:00

## Operator notes

Closing titles - same concepts as in W44 · 03:
"The swell map. Free, worldwide" needs to be white
The button needs to be a little further down, with white text and a little glowing, and link in bio should be white as well

## Changes

I changed the end card in `src/films/film-2026-w44-02.tsx` to match W44-03. I couldn't type-check it or render a frame: approval was denied for both `npx tsc --noEmit -p .` and `npx remotion still`.

- "The swell map. Free, worldwide." is now white.
- The button sits 36px further down (`marginTop: 36`), as in W44-03.
- The button text is now white (it was dark `#02131c`).
- The button now has a soft pulsing blue glow, the same as W44-03.
- "link in bio" is now white.

I haven't confirmed the moved button still fits inside the safe box. To check, approve these and look at the end-card frame (frame 330 is my pick):
```
npx tsc --noEmit -p .
npx remotion still src/index.ts film-2026-w44-02 /home/shahar/Projects/tachyon/clients/rosa/posts/2026-w44-02/.still.png --frame=330
```

## Safe zones

- reel: VERDICT: PASS (worst band 0.02x; text or UI in a band shows as > 0.6x)
- story: VERDICT: PASS (worst band 0.02x; text or UI in a band shows as > 0.6x)

VERDICT: APPROVED
