# Cloudflare conversion — plan (not started)

Written 2026-10-29. Nothing here is built. Execute later, phase by phase.

## Goal

Two users, several machines, zero cost (Claude and Higgsfield subscriptions aside), no Vercel growth.
State, schedule and dashboard go online on Cloudflare free. Media and heavy processing stay local.

## Account

- A new, third Cloudflare account for Tachyon. Not the personal `einhanamer` account (Rosa `user-api`, current `wrangler login`), not the OneShot account.
- The operator creates it; Claude asks for a scoped API token only when a deploy is needed, and never runs `wrangler deploy` on the host login.
- Pattern to copy: Rosa `~/Projects/rosa/deploy/user-api/` (TypeScript Worker + D1, `wrangler.toml`, `schema.sql`, tests).

## Split

| Online (Cloudflare) | Local (each machine) |
|---|---|
| D1: all tables in `spine/db.py` + new tables below | Media: `posts/<slot>/*.mp4`, `*.wav`, footage, assets |
| Worker: dashboard + JSON API | Worker loop `spine/worker.py` (new) |
| Cron Triggers: API-only jobs | Render (Remotion, ffmpeg), VO, whisper caption pass |
| R2: covers, small previews, media relay | `claude -p` jobs: `week auto` plan/produce, `revise` |
| Cloudflare Access: login for the two users | Publish upload (`Graph.upload` sends local bytes) |
| Secrets: Meta token, app secret | |

Stays as is: bio link redirect on Vercel (`spine/publisher/links.py`), code in git.

## What moves where

- `clients/<c>/tachyon.db` (292K) → D1, one database, `client` column already on `posts`; add it to the other tables.
- `posts/<slot>/meta.json`, `caption.txt` → D1 (`posts` columns or a `post_files` table). These are shared state today but live on disk.
- `.env.local` token keys (`TACHYON_ROSA_TOKEN`, `_DATA_EXPIRES`, `META_APP_*`) → Worker secrets + a `tokens` row the Worker hands to authenticated local workers. `auth.py exchange` writes there.
- `.publish.lock` (`flock`) → `leases` table.
- Autonomy flags and `emergency_stop` (written to `grants.yaml` by `C.set_flag`) → D1 row; the rest of `grants.yaml` stays in git.
- `cover.jpg` + a ~480p preview → R2 (small; full video never stored online).
- Client markdown (`brand.md`, `strategy.md`, …) → stays in git.

## New tables

- `leases(name PK, holder, until)` — one runner per job. Claim: `UPDATE … WHERE until<now OR holder=me`; rowcount 1 = run.
- `jobs(id, kind, client, slot_id, state, holder, until, payload, result, by, created_at)` — queue for local work: `render`, `publish`, `revise`, `media_request`, `caption`.
- `media(slot_id, host, path, sha, size)` — which machine holds which file.
- `users(email, name)` and a `by` column on journal and every state change.
- `version` integer on `posts` — optimistic lock; a stale save is refused.

## Job routing

- Cron Trigger every 10 min: due slots → `jobs(kind=publish)`. Only a machine listed in `media` for that slot may claim it.
- Cron Trigger hourly: insights + pickup metadata (Graph API only, runs in the Worker).
- Cron Trigger daily: audience, token health check, `week auto` → enqueues a local `plan` job (needs `claude`).
- Local worker: polls `GET /api/jobs/next?host=…`, heartbeats the lease, posts result. Started by cron or systemd on each machine.
- Machine with the file offline → job waits; dashboard shows "waiting for <host>".

## Media on request

1. User B clicks "Get video" → `jobs(kind=media_request, to=<host>)`.
2. Owner's worker uploads the file to R2 under a short-lived key.
3. B's worker downloads, checks `sha`, adds B's host to `media`, deletes the R2 object.
R2 stays far under 10 GB because relay objects are deleted after pickup.

## Publish safety (must land before multi-machine publish)

- Before creating a container: check the journal intent and Instagram (`/me/media` recent, caption match) for an existing post of this slot. A dead worker's retry must not post twice.
- Keep `spine/publisher/spec_check.py` gates on the local worker before upload.

## Dashboard

- Today: `spine/review/app.py`, 2,337 lines, Python `ThreadingHTTPServer`, ~15 GET and ~20 POST routes.
- Target: Worker serving the same pages, reading D1, writing jobs instead of running subprocesses.
- Phase 0 decides the language: Python Workers (Pyodide) to reuse rendering code, or a JS/TS port.
- Video player: R2 preview online; full file only on the machine that has it (link to local `http://127.0.0.1:<port>`).
- Uploads (`/new/upload`, `/audience/upload`): file goes to the uploader's local worker; only metadata goes online.

## Local code changes

- `spine/db.py`: talk to D1 through the Worker API (or D1 REST) instead of `sqlite3.connect`. One module, all callers keep their methods.
- `spine/publisher/publish.py`: `publish_lock` → lease; token from Worker; idempotency check above.
- `spine/publisher/auth.py`: read/write token via Worker, not `.env.local`.
- `spine/worker.py` (new): job loop, lease heartbeat, media relay.
- `spine/measure/insights.py`, `spine/audience.py`, `spine/pickup.py`: logic ported into the Worker's cron (API-only), local versions retired.
- crontab: replace the four jobs with one worker entry.
- Setup script per machine: ffmpeg, Node + Remotion, venv + faster_whisper, `claude` CLI, worker service token.

## Phases

0. **Spike** (1 session): operator creates the Tachyon account; D1 + R2 + Access; Python Worker vs TS decision; measure D1 latency from home.
1. **D1 behind `spine/db.py`**: schema + `client` columns + new tables; migrate `tachyon.db`; tests pass unchanged; desktop still the only runner.
2. **Leases + jobs + worker**: replace `flock` and crontab; still one machine. Run a week.
3. **Publish idempotency** check. Test with a killed worker mid-upload (dry-run).
4. **Token + secrets online**.
5. **API-only crons into the Worker** (insights, audience, pickup metadata).
6. **Dashboard on Worker** behind Access; R2 covers/previews; old local dashboard kept read-only until parity.
7. **Second machine + second user**: setup script, `media` table, media requests.
8. **Retire**: local `tachyon.db`, `.publish.lock`, old crontab, `.env.local` token keys.

Each phase = one PR, GitHub agent review on the final commit, operator OK before merge.

## Free-plan limits

Workers 100k requests/day; D1 5M row reads + 100k row writes/day, 5 GB (Rosa `deploy/user-api/README.md`);
R2 10 GB. Tachyon's load (one client, a cron every 10 min, two users) sits far below all of them.

## Open decisions

- Dashboard language: Python Workers or a TS port (TS matches Rosa `user-api`).
- Local workers reach D1 via Worker API (recommended: one auth path, Access service token) or D1 REST API (Cloudflare API token on each machine).
- Media sync: on request only (above), or Syncthing between the two machines as well.
- Laptop zip `~/tachyon-laptop-2026-10-28.zip` holds the real token: delete or rotate once the token lives online.
