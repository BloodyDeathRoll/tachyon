## spec_check · 2026-w43-01

PASS · 1080x1920 30fps yuv420p · 30.1s · 23.0 MB · metadata stripped · no provenance/AI markers · provenance entry ok

## claude QA · vision pass on 6 cards + 10 frames, 2026-10-24

- "78 KB" whole app: product.md entry JS 63 KB + CSS 15 KB gzip = 78 KB. PASS
- "Updated 4x a day", "Seven days at a glance" (horizon is 16 days; understated, not wrong). PASS
- "2,741 spots worldwide, up from 40 in July": live count 3,056. STALE. Operator override 2026-10-24: post as-is; caption omits the count so the two never contradict. Re-render before reuse.
- "0.14 s from tap to forecast, on 4G": not in product.md, unmeasured. WARN, operator accepted.
- "Checked against ocean buoys": buoy ground truth exists only for the US and Portugal; soft claim, not an accuracy comparison. WARN, operator accepted.
- "Footage: Pixabay" ocean shots: brand draft bans stock surfer footage; Pixabay licence allows it. Operator override 2026-10-24. Originality risk is low (UI is the subject).
- Forecasts on screen: attribution line added to the caption (product.md rule). PASS
- No competitor named or alluded to. No AI label trigger: code render + stock footage, no generative output, markers clean. PASS
- Cover at 7 s (Epic 0.9–1.4 m card).

VERDICT: APPROVED with operator overrides recorded
