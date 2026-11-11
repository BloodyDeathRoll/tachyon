# QA · 2026-w47-01 · 2026-11-10T11:36:23+00:00

## Operator notes

keep the stock video running in the background instead of freezing it as a photo on 00:02. Keep it running throughout the video - stitch similar clips if its too short.
In the end: "Know why it's Good" - a bit smaller font so you can keep regular spacing between the words. And drop the "It's free." completely

## Changes

I made all three changes in `clients/rosa/posts/2026-w47-01/film/index.html` and checked stills at 4 s, 8.5 s and 16.9 s.

- **Footage:** the flash, the freeze at 1.25 s and the shrink into a tilted photo are gone. The stock clip now plays full screen behind everything for all 17 s, slightly dimmed under the phone and lightly blurred behind the end card.
- **Clip length:** I couldn't measure the clip because the tool needed approval, so I didn't stitch in any other clips. Instead, if the clip is too short to run 17 s from 6.25 s, the page starts it earlier, and if it is shorter than 17 s it plays slower to fit.
- **End line:** "Know why it's Good" is now 82px (was 94px) with normal letter spacing, on one line.
- **"It's free.":** removed completely, and "Install it" now appears a little sooner to close the gap.

Not checked: the story variant, and whether the footage moves smoothly between frames, since I only looked at single frames and didn't render the video. The extra stills `.still4.png`, `.still8.png` and `.still16.png` are still in the post folder.

## Safe zones

- reel: VERDICT: FAIL (worst band 0.77x; text or UI in a band shows as > 0.6x)
- story: VERDICT: FAIL (worst band 0.78x; text or UI in a band shows as > 0.6x)
- reel spec: VERDICT: PASS
- story spec: VERDICT: PASS

VERDICT: NEEDS_REVISION
