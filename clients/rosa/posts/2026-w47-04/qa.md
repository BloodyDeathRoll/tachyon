# QA · 2026-w47-04 · 2026-11-10T11:42:35+00:00

## Operator notes

remove the "It's free." from the closing titles

## Changes

I removed "It's free." from the closing titles. A still at 16s shows the end card without it and nothing out of place.

- `film/index.html:76` — deleted the "It's free." title (`#e2`).
- `film/index.html:389` — deleted its `pop($("e2"), …)` animation call.

I didn't check whether the voice-over still says "It's free".

## Safe zones

- reel: VERDICT: WARN (worst band 0.53x; text or UI in a band shows as > 0.6x)
- story: VERDICT: WARN (worst band 0.54x; text or UI in a band shows as > 0.6x)
- reel spec: VERDICT: PASS
- story spec: VERDICT: PASS

VERDICT: APPROVED
