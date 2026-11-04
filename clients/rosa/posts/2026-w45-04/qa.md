# QA · 2026-w45-04 · 2026-11-04T06:13:44+00:00

## Operator notes

make the chart animation less pixelated

## Changes

I made the blocky look smaller, but it's still there. The blocks are baked into the app's own captures, not caused by the film.

- `engines/remotion/src/films/film-2026-w45-04.tsx:115`: changed the camera perspective from `1400` to `3000`. The near edge of the map is now magnified about half as much, so the swell grid blocks look smaller and the labels and arrows stay sharp (checked on stills at frames 60 and 125).

**Still open:**
- The swell grid in `captures/charts-week` is stair-stepped in the app itself, so the coastlines stay blocky. `spine.capture` has no zoom option, so I couldn't take a zoomed-out capture with finer blocks.
- I tried blurring the map too. It made the labels and arrows unreadable and left the coastline blocky, so I took it out.
- At frame 125 the "Fly over this week's swell." headline sits on top of the map labels. That isn't from this change: it already happened at frame 60 before my edit.

I didn't check the story composition or any frame after 125.

## Safe zones

- reel: VERDICT: FAIL (worst band 0.61x; text or UI in a band shows as > 0.6x)
- story: VERDICT: FAIL (worst band 0.61x; text or UI in a band shows as > 0.6x)
- reel spec: VERDICT: PASS
- story spec: VERDICT: PASS

VERDICT: NEEDS_REVISION
