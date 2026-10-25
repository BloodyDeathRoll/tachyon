## spec_check · 2026-w43-03

PASS · 1080x1920 60fps yuv420p · 15.0s · 5.4 MB · metadata stripped · no provenance/AI markers · provenance entry ok
- safezone reel: PASS
- safezone story: PASS

## claude QA · vision pass on key frames (1.2 / 4.0 / 6.8 / 9.6 / 12.0 / 14.2 s), both variants, 2026-10-25

- Every number on screen traces to product.md or to the 2026-10-25 capture: 3,056 spots · 16 days · 4× a day (product.md); Uluwatu Epic 1.3–2.0 m, Best session 06:00 "Peak of the swell. Go early" (spot-uluwatu-full.png). PASS
- Rating explanation uses only "size, period and wind" and "wind can only polish" (product.md 'The rating'). No accuracy claim, no competitor. PASS
- Safe box: all text and the phone inside x 65–1015, y 285–1248 (reel) / 269–1248 (story); `safezone.py check` PASS for both files; overlays `safezone-reel.jpg`, `safezone-story.jpg`. PASS
- Real UI only: live app captures, Rosa mark, Inter. No stock footage, no generative output, metadata stripped, no provenance/AI markers. PASS
- Audio: original synthesised bed, −16 LUFS, ends with the end card. PASS
- Caption: ig-human 82.4, lint READY; attribution line present (forecast on screen); CTA link in bio + URL on the end card; no link in any comment. PASS
- Time-bound: the reel states today's Uluwatu rating. `meta.valid_until` 2026-10-25 23:59 UTC; if not published today, re-render (film takes a fresh capture). WARN
- Cover at 4.2 s (phone + "Epic 1.3–2.0 m" callout).

VERDICT: APPROVED
