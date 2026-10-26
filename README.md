# Tachyon

Acts as a client's VP of Marketing on social: plans the week, produces short vertical
videos, publishes and schedules, listens and replies, measures, learns weekly. One Claude
brain running skills, thin Python spine, one folder per client. Instagram first.

- `docs/PLAN.md` — consolidated plan: decisions, stations, Rosa first run, build order
- `docs/PLAYBOOK.md` — the repeatable checklist per client
- `docs/RESEARCH-2026-10-24.md` — research digest with verification marks
- `docs/history/` — plan v1, plan v2, and their comparison
- Figma: Workflows file, frame `tachyon-workflow` (page `workflows`)

## Run

```
python3 -m pytest -q            # spine + review tests
python3 -m spine.review.app     # review/ page on http://127.0.0.1:8765
```

Layout: `spine/` (db, state machine, review page, publisher adapters, listen webhook),
`skills/` (ours per station; `vendor/` third-party with SOURCE.md), `tools/` and `data/`
(the ig-* Python tools and hook/slop/rubric data), `clients/<name>/` (one folder per client;
`tachyon.db` is created there on first use). Dependencies: Python >= 3.12, PyYAML, pytest.
