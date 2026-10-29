# QA · 2026-w44-03 · 2026-10-29T07:09:22+00:00

## Operator notes

Remove "rosa.surf", keep "its free."

## Changes

I removed "rosa.surf" from the end-card line and kept "it's free." I couldn't run the type check or render the still to look at it, because both commands need approval in this session.

The orange end-card button still says "rosa.surf →" (`film-2026-w44-03.tsx:134`). I read the note as being about the "rosa.surf / it's free" text pair only. Tell me if the button should go too.

The voice-over script never says "rosa.surf", so `meta.json` is unchanged.

Changes:
- `engines/remotion/src/films/film-2026-w44-03.tsx:132`: the end-card text is now only "it's free."
- `engines/remotion/src/films/film-2026-w44-03.tsx:11`: updated the header comment to match.

## Safe zones

- reel: VERDICT: PASS (worst band 0.02x; text or UI in a band shows as > 0.6x)
- story: VERDICT: PASS (worst band 0.02x; text or UI in a band shows as > 0.6x)

VERDICT: APPROVED
