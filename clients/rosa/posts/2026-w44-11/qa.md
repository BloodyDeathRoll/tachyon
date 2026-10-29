# QA · 2026-w44-11 · 2026-10-29T07:26:53+00:00

## Operator notes

Swap the final closing titles to be the same as on W44 · 03. Keep the wave backgound

## Changes

I swapped in the W44 · 03 closing titles, but nothing is checked yet. The type check (`npx tsc --noEmit -p .`) and the still render both stopped at a permission prompt, so neither ran. I haven't looked at a frame.

- **End card text:** "Free surf forecast, worldwide." is now "it's free." in white, as on W44 · 03.
- **Button:** "rosa.surf →" now has white text, the pulsing blue glow and the extra top spacing from W44 · 03.
- **Timing:** the logo, title, button, "link in bio" and Pixabay credit come in at the W44 · 03 timings, and "link in bio" is now white.
- **Background:** the wave footage and the rising particles behind the end card are unchanged.
- **Header comment:** updated in `src/films/film-2026-w44-11.tsx` to describe the new end card.

I didn't change the voice-over script in `meta.json`, because it never mentions the closing line.

To finish, allow and run these. Frame 360 is about 2 s into the end card.
```
npx tsc --noEmit -p .
npx remotion still src/index.ts film-2026-w44-11 /home/shahar/Projects/tachyon/clients/rosa/posts/2026-w44-11/.still.png --frame=360
```

Risk: the end-card layout is copied from W44 · 03 and should stay inside the safe box, but the story variant has had no frame check.

## Safe zones

- reel: VERDICT: PASS (worst band 0.03x; text or UI in a band shows as > 0.6x)
- story: VERDICT: PASS (worst band 0.03x; text or UI in a band shows as > 0.6x)

VERDICT: APPROVED
