# QA · 2026-w47-10 · 2026-11-11T08:51:37+00:00

## Operator notes

VOICE OVER GETS CUT OUT AGAIN!
Redo the voice over. DO NOT - EVER - give me a voice over without reviewing it extensively and making sure it is NOT being cut out

## Changes

The voice-over is re-recorded and the new take is complete: "packing the car." is all there. The old take stopped at "packing the co-" because the voice model (Dia) ended the recording early. The music mix was not cutting it.

I checked the new take by transcribing every word with timings, looking at the volume at both ends (clean start, natural fade after "car", no click), and doing a test mix under the music. The take runs about 6.6 s and plays from 0.5 s to about 7.1 s of the 15 s video, so the end fade at about 13.8 s doesn't reach it. The final video was not rendered; the pipeline does that next.

Another session was editing `spine/voice.py` and `spine/tracks.py` at the same time as me. On top of my change it added up to 5 retries with fresh takes and a check that the voice ends before the fade-out. Those edits aren't mine and I didn't review them. The first take it makes is the same one I checked: the same script gave identical timings on every run.

- `meta.json`: the voice-over script now says "I always check Rosa" instead of "I just check Rosa", which kept being heard as "checked". The rest is unchanged, and the change makes the pipeline record it again.
- `vo.wav`: the new, checked take.
- `spine/voice.py`: a `[S1]` speaker tag at the end of the text stops Dia ending early. This is the cause of the cut.
- `spine/voice.py`: every take is now transcribed and rejected if the last words are missing. A rejected take never replaces the current `vo.wav`.
- `spine/voice.py`: the end trim now keeps the last word's fade and drops a 5 ms click Dia left after it.
- `tools/vo_check.py` (new): the transcript check, with a built-in self-test.

## Safe zones

- reel: VERDICT: WARN (worst band 0.45x; text or UI in a band shows as > 0.6x)
- story: VERDICT: WARN (worst band 0.46x; text or UI in a band shows as > 0.6x)
- reel spec: VERDICT: PASS
- story spec: VERDICT: PASS

VERDICT: APPROVED
