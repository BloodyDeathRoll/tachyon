# QA · 2026-w44-11 · 2026-10-30T21:13:00+00:00

## Operator notes

You are showing repeated swipe movement, but you do not actually swipe de days. Show a single swipe movement, and ease out swipe the days

## Changes

I made the edit, but it's unverified: running `npx tsc --noEmit -p .` and `npx remotion still` both returned "This command requires approval", so I haven't type-checked it or looked at any frames.

Changes in `engines/remotion/src/films/film-2026-w44-11.tsx`:
- The three finger flicks are now one flick at 3.9 s.
- The day strip itself now scrolls left two days, easing out over 2.2 s, so Tue ends where Today was.
- Mon, Tue and Wed light up and their bars grow in as the strip scrolls past them.
- I removed the sliding selection ring, since the days now move instead of the ring.
- The Tue ring follows the scrolled position of the Tue column.
- "Watch it build." now comes in at 4.8 s instead of being tied to the second flick.
- I updated the header comment to describe the new motion.

Risk: the capture ends at Sat, so after the scroll the right ~115 px of the day strip shows empty background. Check that in a still once the commands are approved.

## Safe zones

- reel: VERDICT: PASS (worst band 0.05x; text or UI in a band shows as > 0.6x)
- story: VERDICT: PASS (worst band 0.05x; text or UI in a band shows as > 0.6x)
- reel spec: VERDICT: PASS
- story spec: VERDICT: PASS

VERDICT: APPROVED
