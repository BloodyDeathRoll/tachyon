# QA · 2026-w44-09 · 2026-10-29T08:05:13+00:00

## Operator notes

Change closing titles to fit what we did on W44 · 01 and others:
The texts under the Rosa logo should be white. The button should have a little space from the text above it, it's text should be white, the button should be a little glowing. The text on the bottom needs to be white

## Changes

I made the end-card edits, but I couldn't check them. The permission system blocked both `npx tsc --noEmit -p .` and `npx remotion still`, so nothing is typechecked and I haven't looked at any frame. Approve those two commands, or run them yourself, before this goes out.

- Line under the Rosa logo: white (`#fff`).
- Button: `marginTop: 36` for space above it, white text, and the same pulsing blue glow as W44 · 01.
- "free · link in bio" at the bottom: white.

All changes are in `engines/remotion/src/films/film-2026-w44-09.tsx:149-152`.

## Safe zones

- reel: VERDICT: PASS (worst band 0.09x; text or UI in a band shows as > 0.6x)
- story: VERDICT: PASS (worst band 0.09x; text or UI in a band shows as > 0.6x)

VERDICT: APPROVED
