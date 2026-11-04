# QA · 2026-w45-01 · 2026-10-31T10:40:32+00:00

## Operator notes

Good up until 0:07, when the phone flips. Instead of showing another app screen, it shows a google login, which we NEVER want to show. We are not a google app and we hate google in general, its in the app out of necessity and we definitely DO NOT want to show any GOOGLE related material.
the screen also stops at a weird angle, when it whould have left the scene completely or stayed in a decent size for users to understand what is shown. The video background behind it is rotated, and we can see the cut from the angle on the bottom right corner.
Redo everything from 0:07

## Changes

I rebuilt everything from 0:07 in `engines/remotion/src/films/film-2026-w45-01.tsx`, but none of it is checked yet. `npx tsc --noEmit -p .`, `remotion still` and ffmpeg were all blocked at the permission prompt, so it isn't type-checked and I haven't looked at a single frame.

- **Google login:** the phone now flips to the Uluwatu forecast screen (`spot-uluwatu.png`). The sign-in screen (`spots.png`) is no longer used.
- **Phone angle:** the shrink to the corner and its tilt are gone. The phone stays upright at full size in the centre, then drops fully out of frame before the end card.
- **Background:** the second clip (218670) is removed, so the wave clip (310248) now runs the whole 15 s. I couldn't view a frame of 218670, so this assumes it was the rotated one.
- **Bottom-right cut:** the end-card bars no longer slant; that angle may have been the visible cut.
- **New labels after the flip** (the original Free / 3,500+ spots / 16 days labels before 0:07 stay as they were):
  - "Epic.", green, wired to the Epic badge on the forecast screen.
  - "4 updates a day.", white, wired to the day strip. The number comes from `product.md` ("4 runs a day").
- **Grid:** the background grid now stays up until the end card, so those connector lines show.

`meta.json`'s "angle" text still describes the old corner shrink with `spots.png`. I didn't change it.

To finish the check, approve these two commands or run them yourself:
```
npx tsc --noEmit -p .
npx remotion still src/index.ts film-2026-w45-01 /home/shahar/Projects/tachyon/clients/rosa/posts/2026-w45-01/.still.png --frame=270
```

## Safe zones

- reel: VERDICT: WARN (worst band 0.41x; text or UI in a band shows as > 0.6x)
- story: VERDICT: WARN (worst band 0.41x; text or UI in a band shows as > 0.6x)
- reel spec: VERDICT: PASS
- story spec: VERDICT: PASS

VERDICT: APPROVED
