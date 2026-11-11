# QA · 2026-w47-08 · 2026-11-11T11:06:45+00:00

## Operator notes

Change the opening hook from "offshore can't save a flat day" to "Epic in Santa Teresa".
Change the spot to Santa Teresa

## Changes

Both notes are done: the hook now types "Epic in Santa Teresa", and the phone shows the live Santa Teresa spot page instead of Pipeline. I checked stills at 2.2s, 5s and 8s; the hook text and the bars, Epic pill and burst all line up with the new page. No video rendered, nothing committed.

- `film/index.html`: hook lines changed to "Epic in / Santa / Teresa", with the typing timing adjusted to fit.
- `engines/remotion/public/captures/spot-santa-teresa-w47-full.png`: new full-page dark capture of `/spot/santa-teresa`, taken today. The app rates Santa Teresa Epic today, so "= Epic" in the film matches the screen.
- `film/spot-santa-teresa-w47-full.png`: copy of that capture; `film/spot-pipeline-w47-full.png` deleted.
- `film/index.html`: screen slices, bar positions, bar colours and the Epic pill position re-measured from the new capture (Size is blue on this page).
- `meta.json`: title, hook and description now say Santa Teresa.
- `brief.md`: title, hook and description updated the same way.
- `caption.txt`: first line changed to "Epic in Santa Teresa." The rest of the caption is unchanged and still talks about offshore wind and flat days, and the tag is still `#offshore`.

The hook has no full stop because the note didn't have one; the old hook did. I didn't check the story variant, and `cover.jpg` still shows the old cut until the next render.

## Safe zones

- reel: VERDICT: FAIL (worst band 0.87x; text or UI in a band shows as > 0.6x)
- story: VERDICT: FAIL (worst band 0.88x; text or UI in a band shows as > 0.6x)
- reel spec: VERDICT: PASS
- story spec: VERDICT: PASS

VERDICT: NEEDS_REVISION
