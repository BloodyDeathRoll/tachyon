# QA · 2026-w44-07 · 2026-10-29T08:03:27+00:00

## Operator notes

Change closing titles:
Button text should be white, the button should be a little glowing like on W44 · 01, and the text on the bottom needs to be white

## Changes

I edited the end card, but I couldn't run the type check or render a still to look at it: both `npx tsc --noEmit -p .` and `npx remotion still` were blocked by approval prompts. Allow those two commands and I'll run them and check the frame.

- `film-2026-w44-07.tsx:146` — the button text is now white (`#fff`).
- `film-2026-w44-07.tsx:147` — the button now glows with a soft pulse, copied from the W44 · 01 end card.
- `film-2026-w44-07.tsx:148` — the "link in bio" text under the button is now white.

I took "the text on the bottom" to mean "link in bio". The footage credit is not drawn on screen at all.

## Safe zones

- reel: VERDICT: WARN (worst band 0.26x; text or UI in a band shows as > 0.6x)
- story: VERDICT: WARN (worst band 0.26x; text or UI in a band shows as > 0.6x)

VERDICT: APPROVED
