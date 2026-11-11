# QA · 2026-w47-12 · 2026-11-11T09:25:18+00:00

## Operator notes

0:00-0:05 is way too monotonic - nothing happens.
Instead of a static charts image, make it a video, and change between height, period, energy and wind. Keep the indicator of what we see (text) on the bottom right

## Changes

I checked stills from 0.8 s to 5.5 s. Nothing rendered or committed.

- **New captures:** shot the live Charts page (`/charts` at 15,-75, dark theme, same Wed 00:00 timeline) in the Period, Energy and Wind layers, frames 4–28 each, into `film/chart-per/`, `film/chart-energy/` and `film/chart-wind/`.
- **0–4.6 s:** the chart now cycles Height → Period → Energy → Wind, about 1.15 s each, still playing through the week. Each change wipes in from the top with a zoom punch and a light flash.
- **Back to Height:** Height returns as the chart folds into the phone (4.6 s), so the rest of the film is unchanged.
- **Layer label:** the current layer's name and its app colour sit bottom right, at the bottom edge of the safe box. It changes with each layer and leaves as Wind ends.

The Height frames were captured on 2026-11-10 and the new layers on 2026-11-11. They show the same forecast times, so the fields can differ slightly between layers.

## Safe zones

- reel: VERDICT: FAIL (worst band 1.02x; text or UI in a band shows as > 0.6x)
- story: VERDICT: FAIL (worst band 0.99x; text or UI in a band shows as > 0.6x)
- reel spec: VERDICT: PASS
- story spec: VERDICT: PASS

VERDICT: NEEDS_REVISION
