# QA · 2026-w47-02 · 2026-11-10T11:37:12+00:00

## Operator notes

Voice over has a weird echo. Remove the voice over completely.
On the closing titles - remove the "Its free." completely.
Show period instead of height on the charts

## Changes

I made one of the three changes: "It's free." is gone from the closing card. The other two notes (voice-over and period charts) are not done.

**Changes:**
- `film/index.html`: removed the "It's free." line. The button and "link in bio" now come in at the same spacing as before. I checked a still at 14 s and the card looks right.

**Not done:**
- **Voice-over removal:** I can't do this inside the files I'm allowed to edit. The pipeline adds `vo.wav` to the video whenever `meta.json` has a `voiceover` entry with that file. Emptying the script only stops it being re-recorded; the old echoey take would still play. Removing it means deleting the `voiceover` entry from `meta.json` (or deleting `vo.wav`). I need your OK to edit outside the allowed scope.
- **Period on the charts:** not done. The 57 frames in `film/charts-week/` show the Height layer. `spine.capture` can't switch the layer to Period or move through the forecast hours, and the charts page has no URL setting for either. I wrote a Playwright script to do it (`/tmp/cw/shoot.py`), but running it needs your approval. Once approved, it would shoot 57 Period frames starting Wed 00:00 at 15,-75 into `film/charts-week/`. Also, the time ticker in the film is timed to the voice-over, so it may need retiming once the voice-over is gone.

I didn't touch the caption or the voice-over script, and I left the test still at `clients/rosa/posts/2026-w47-02/.still.png`.

## Safe zones

- reel: VERDICT: FAIL (worst band 1.13x; text or UI in a band shows as > 0.6x)
- story: VERDICT: FAIL (worst band 1.15x; text or UI in a band shows as > 0.6x)
- reel spec: VERDICT: PASS
- story spec: VERDICT: PASS

VERDICT: NEEDS_REVISION
