# Cloudflare conversion — plan (not started)

Written 2026-10-29, revised 2026-11-04 (operator decisions below). Nothing here is built.
Execute later, phase by phase.

## Goal

Tachyon runs from any PC, with that PC's own Claude account, for any number of users and
clients. A phone can do everything that is not video generation: approve, publish, pause,
reschedule, edit text, connect an Instagram account, read insights. Zero cost beyond the
Claude and Higgsfield subscriptions: everything online stays inside Cloudflare's free tier.

Generation (plan, film, voice-over, render) is local. A finished video is uploaded to R2,
published from there by the Worker, and deleted from R2 as soon as it is published. The
creator's PC keeps the file.

## Decisions (operator, 2026-11-04)

| Question | Decision |
|---|---|
| Who publishes | The Worker, from R2. It pushes the bytes to Instagram with the same resumable upload the PC does today (`rupload.facebook.com`), so the file is never public. No PC needs to be on. |
| Login | Google sign-in, copied from Rosa `deploy/user-api` (GIS code client, stateless HMAC session). |
| Who generates | A PC that holds the client's assets. "Any authorised PC" was wanted, but mirroring every client's footage in R2 would not stay in the free tier, so a client's generation runs only on PCs seeded with its `assets/` folder. |
| Clients | Created from the dashboard; brand text (`brand.md`, `strategy.md`, …) and the former `grants.yaml` fields live online. |
| Instagram connection | A Connect button: Facebook Login in the dashboard, Page pick, token stored per client. No more token pasting. |
| Access | A user is a member of a client or not; a member does everything for it. An `admin` flag on the user adds and removes members and clients. |
| Address | `tachyon.<account>.workers.dev`. No domain bought. |
| Assets | Stay on the creator's PC. Never uploaded. |

## Account

- A new, third Cloudflare account for Tachyon. Not the personal `einhanamer` account (Rosa `user-api`, current `wrangler login`), not the OneShot account.
- The operator creates it; Claude asks for a scoped API token only when a deploy is needed, and never runs `wrangler deploy` on the host login.
- Pattern to copy: Rosa `~/Projects/rosa/deploy/user-api/` (TypeScript Worker + D1, `wrangler.toml`, `schema.sql`, tests, Google sign-in).
- The Worker is TypeScript. Python Workers (Pyodide) would let `spine/review/app.py` run as is, but the dashboard's HTML is string building and the free plan's CPU budget per request is small; a port is the safer bet and matches Rosa.

## Split

| Online (Cloudflare) | Local (each PC) |
|---|---|
| D1: every table in `spine/db.py` plus the new ones below, all with a `client` column | Media: `posts/<slot>/*.mp4`, `*.wav`, footage, music, captures |
| Worker: dashboard (phone and desktop) + JSON API + publisher | `spine/worker.py` (new): job loop under the user's own Claude login |
| One Cron Trigger, every minute, dispatching by the minute | Render (Remotion, ffmpeg), Dia voice-over, whisper caption pass |
| R2: `cover.jpg` always; `video.mp4` from upload until published | `claude -p` jobs: `week auto` plan and produce, `revise`, `formats` |
| Google sign-in, users, memberships | Spec check (`spine/publisher/spec_check.py`) before upload |
| Per-client Meta tokens, app secret, HMAC keys | |

Stays as is: bio link redirect on Vercel (`spine/publisher/links.py`), code in git.

## What moves where

- `clients/<c>/tachyon.db` → D1, one database for all clients; `client` column added to every table.
- `posts/<slot>/meta.json`, `caption.txt`, `first_comment.txt` → D1 (`posts` columns or a `post_files` table). Shared state that lives on disk today.
- `clients/<c>/*.md` (brand, strategy, audience, product, profile, funnel, swipe) → `client_files` rows. A PC writes them back to `clients/<c>/` before every generation, so the prompts and `spine/week.py` keep reading files.
- `grants.yaml` → a `clients` row (ig_user_id, page_id, display name, autonomy flags, emergency stop, schedule). `C.load_grants` reads the row.
- `.env.local` token keys (`TACHYON_<C>_TOKEN`, `_DATA_EXPIRES`, `META_APP_*`) → `clients.token_enc` (encrypted with a Worker secret) and Worker secrets. `auth.py` is retired; the Connect flow replaces it.
- `.publish.lock` (`flock`) → the publisher runs only inside the Worker's cron, one invocation at a time per client (a `leases` row).
- `cover.jpg` → R2, kept (small: 1.9 MB for 19 posts). `video.mp4` → R2 on approval, deleted on publish.
- `clients/<c>/assets/` (Rosa: 396 MB) → nowhere. Stays on the PCs that generate for that client.

## New tables

- `users(id PK = Google sub, email, name, admin, created_at)`.
- `memberships(user, client)` — a member manages the client. Every page and route checks it.
- `clients(id, name, ig_user_id, page_id, token_enc, token_expires, ig_username, schedule, autonomy JSON, emergency_stop, created_by)`.
- `client_files(client, name, text, version, updated_by, updated_at)` — the brand markdown.
- `hosts(id, user, name, clients JSON, caps JSON, last_seen)` — a PC: which clients it holds assets for, what it can do (`render`, `voice`, `claude`). Registered by `spine/worker.py` on start.
- `jobs(id, kind, client, slot_id, state, holder, until, payload, result, by, created_at)` — local work: `plan`, `produce`, `revise`, `formats`, `voice`, `upload`. A host may claim a job only if its `clients` list has the job's client.
- `leases(name PK, holder, until)` — one publisher per client inside the Worker.
- `media(slot_id, host, path, sha, size)` — which PC holds which file. For "the file is on <host>" in the dashboard, and for the upload job.
- `by` column on journal and every state change; `version` integer on `posts` (optimistic lock: a stale save is refused).

## Jobs and routing

- Needs a PC: Generate New, Revise, Generate other formats, voice-over, `week auto` plan and produce. The dashboard writes a `jobs` row; a host for that client picks it up. No host online → the job waits; the dashboard shows "waiting for a PC with <client>'s files" and the hosts' last-seen times.
- Needs no PC (Worker only): approve, hold, reschedule, pause, emergency stop, publish now, remove a live post, caption and first-comment edits, AI label, replies, music pick (metadata), insights, audience, pickup, Connect Instagram, members and clients.
- `spine/worker.py`: on start registers the host (user from the stored session, clients from the folders under `clients/` that have `assets/`); polls `GET /api/jobs/next?host=…`; heartbeats the lease; runs the job with the existing `spine` code; posts the result. Started by systemd user service or cron on each PC. Each job runs under that PC's `claude` login, so the creator's Claude account pays for the creator's clients.
- `week auto`: the Worker's cron enqueues one `plan` job per client on the client's prep day; the produce jobs follow from the plan on the same host.

## Video lifecycle

1. Rendered locally; `spec_check` passes; the host records it in `media`.
2. On approval the host runs an `upload` job: `video.mp4` and `cover.jpg` go to R2 under `<client>/<slot>/`. The bucket is private.
3. The Worker's cron (every minute): due slot in QUEUED → create the REELS container with `upload_type=resumable` and the same parameters as today (`share_to_feed`, `thumb_offset`, `trial_params`, `collaborators`, `location_id`, `is_ai_generated`), then stream the R2 object to `rupload.facebook.com/ig-api-upload/<container>` (`Graph.upload` ported). Container id saved on the post. Instagram's other way, `video_url`, makes Instagram's servers download the file from a public URL ("We cURL your image using the passed in URL so it must be on a public server", content-publishing guide); not used.
4. Later minutes: poll `status_code`; FINISHED → `media_publish`; PUBLISHED with `ig_media_id`, permalink, `published_at`; first comment posted; then MEASURING. Up to 5 polls, as today.
5. The R2 video object is deleted the minute the post is PUBLISHED, and also when a slot is deleted or its video replaced. The cover stays for the calendar.
6. After publish the dashboard's player is the Instagram permalink. The local file stays on the creator's PC (`media` says where).
7. Other formats (16:9, 1:1) are never uploaded: the creator posts them by hand from their PC.

In flight at any time: at most the approved-but-unpublished videos, ~22 MB each. A week of 14 is ~300 MB of the 10 GB.

## Publish safety (must land before the Worker publishes)

- Before creating a container: check the journal intent and Instagram (`/me/media` recent, caption match) for an existing post of this slot. A cron invocation that died after container create must not post twice on the next minute.
- `publish_lock` becomes the `leases` row; a second cron invocation for the same client exits.
- `spec_check` stays local, before upload; the Worker never publishes an object that no host checked.

## Instagram connection

- Dashboard: Connect → Facebook Login dialog (the Meta app, `META_APP_ID`), callback on the Worker exchanges the code for a long-lived user token, lists the Pages, the member picks one, the Worker stores the Page token encrypted on the `clients` row with its expiry. The weekly refresh moves into the cron.
- While the Meta app is in development mode only people with a role on the app (admin, developer, tester) can connect. The main developer account is blocked until 2026-11-21; Tachyon runs on app `1497581085764373`. Members who will connect clients get added as testers until the app goes live.

## Dashboard

- Today: `spine/review/app.py`, Python `ThreadingHTTPServer`, ~15 GET and ~20 POST routes.
- Target: the Worker serves the same pages from D1, writing `jobs` rows where the Python ran subprocesses. Responsive at phone width, with a web-app manifest so it installs on a phone's home screen. The layout already fits a phone except the calendar grid, which needs a day-list view.
- Pages gate on membership: the client switcher lists only the user's clients; admins also see Members and Clients pages.
- Video player: the R2 object until publish, the Instagram permalink after; a video on a PC only shows "on <host>".
- Uploads (`/new/upload`, `/audience/upload`): an uploaded video goes to R2 the same way as an approved one and a `media` row names no host; an audience export is text and goes to D1.

## Local code changes

- `spine/db.py`: talk to D1 through the Worker API instead of `sqlite3.connect`. One module, all callers keep their methods. Auth: the host's session token (the same Google session, saved on the PC by `spine.worker login`).
- `spine/clients.py`: `load_grants` reads the `clients` row; `client_dir` unchanged; a `pull(client)` writes `client_files` to disk before a generation.
- `spine/publisher/publish.py` and `graph.py` (`Graph.upload`): `publish_slot` ported to the Worker, reading the file from R2; the Python keeps `spec_check` and the R2 upload. `auth.py` retired.
- `spine/worker.py` (new): host registration, job loop, lease heartbeat, R2 upload.
- `spine/measure/insights.py`, `spine/audience.py`, `spine/pickup.py`: logic ported into the Worker's cron (Graph API only); Python versions retired.
- crontab: the four jobs replaced by the one worker service.
- Setup script per PC: ffmpeg, Node + Remotion, venv + faster_whisper + Dia, `claude` CLI, `spine.worker login`, and a client's `assets/` folder copied from a creator (by hand, a zip).

## Phases

0. **Spike** (1 session): operator creates the account; Worker skeleton in TS with D1, R2, the cron and Google sign-in copied from Rosa; measure D1 latency from home.
1. **D1 behind `spine/db.py`**: schema with `client` columns, `users`, `memberships`, `clients`, `jobs`, `leases`, `hosts`, `media`; migrate `tachyon.db`; tests pass unchanged; this desktop still the only runner.
2. **`spine/worker.py`**: jobs and leases replace the crontab; the dashboard's Generate New, Revise and formats write jobs. Still one PC. Run a week.
3. **Worker publishes from R2**: upload job, resumable upload streamed from R2, one-minute cron, delete after publish, idempotency check. Dry-run first; then a test with the cron killed between container create and poll.
4. **Connect Instagram**: Facebook Login in the dashboard, tokens per client in D1, weekly refresh in the cron; `.env.local` keys and `auth.py` retired.
5. **API-only crons into the Worker**: insights, audience, pickup.
6. **Dashboard on the Worker**: all pages, phone layout, manifest; the local dashboard kept read-only until parity.
7. **Clients and members from the dashboard**: `client_files`, `clients` rows, `pull(client)`; the Rosa folder's markdown migrated.
8. **Second PC, second user**: setup script, host registration, assets seeded by hand, a Rosa job run from the second PC.
9. **Retire**: local `tachyon.db`, `.publish.lock`, old crontab, `.env.local` token keys, the laptop zip (below).

Each phase = one PR, GitHub agent review on the final commit, operator OK before merge.

## Free-plan limits

From Rosa `deploy/user-api/README.md`: Workers Free 100k requests/day; D1 Free 5M row reads + 100k row writes/day, 5 GB; R2 10 GB.
From developers.cloudflare.com/workers/platform/limits (read 2026-11-04): Workers Free 10 ms CPU time per invocation, 50 subrequests per request, 5 Cron Triggers per account, 100 MB request body on a Free-plan domain.

What that means here: the cron every minute is 1,440 requests/day and one trigger. Streaming a 22 MB object from R2 to Instagram is I/O, not CPU; the spike measures the CPU used. The hourly insights pass must chunk across minutes once a client passes ~45 live posts (one subrequest per post). A 22 MB upload from a PC to the Worker fits the 100 MB body limit.

## Open decisions

- Phone notifications for "needs approval" and "failed": web push from the Worker. Nice to have, a later run (operator 2026-11-04).
- The two users' Claude accounts: a client's generation is billed to whichever member's PC holds its assets. Fine for Rosa (one creator); revisit if a client gets two creators.
- Laptop zip `~/tachyon-laptop-2026-10-28.zip` holds the real token: delete or rotate once the token lives online.
