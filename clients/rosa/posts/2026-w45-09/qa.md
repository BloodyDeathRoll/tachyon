# QA · 2026-w45-09 · 2026-10-31T15:20:18+00:00

## Operator notes

the mobile device you've selected has a camera on to the cuts off the design. Remove the camera black box.
The blue background screen isnt great. Replace with a new video.
There is a black dot after It's free. It should be white

## Changes

All three notes are fixed. Type-check (`tsc`) passes, and I looked at stills at 2 s, 4.1 s and 8 s.

- `lib.tsx`: `Phone` has a new `island` option, on by default, so other films keep the camera notch.
- `film-2026-w45-09.tsx`: the phone is shown without the camera black box (`island={false}`).
- `film-2026-w45-09.tsx`: the blue background is replaced with surf footage `footage/310248_large.mp4` from 1.6 s to 8.8 s.
- `film-2026-w45-09.tsx`: the dot after "It's free" is now white.

`310248_large.mp4` already appears in 16 other films, so it isn't fresh footage. The voice-over and caption are unchanged.

## Safe zones

- reel: VERDICT: WARN (worst band 0.50x; text or UI in a band shows as > 0.6x)
- story: VERDICT: WARN (worst band 0.50x; text or UI in a band shows as > 0.6x)
- reel spec: VERDICT: PASS
- story spec: VERDICT: PASS

VERDICT: APPROVED
