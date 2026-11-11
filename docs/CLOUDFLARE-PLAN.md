# Cloudflare conversion — plan (not started)

Written 2026-10-29, revised 2026-11-04 (operator decisions below). Built so far: the
Worker skeleton in `deploy/worker/` (schema, sign-in, members, jobs, R2 upload; tests run
locally, nothing deployed, see its README). Everything else is executed later, phase by phase.

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
| Who publishes | The Worker, from R2. It hands Instagram a public R2 URL (`video_url`; or the Worker's `/v/<key>`, see open decisions); Instagram's servers download the file ("We cURL your image using the passed in URL so it must be on a public server", content-publishing guide). The key is a random string; the object is deleted once the post is published. No PC needs to be on. Reverses PLAN §3's "no video_url"; the resumable upload is retired. |
| Login | Google sign-in, copied from Rosa `deploy/user-api` (GIS code client, stateless HMAC session). Invite-only: a Google account signs in only if its email has a `users` row. An admin adds users by email. The first admin is seeded by hand in phase 0 (`wrangler d1 execute`). |
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

- `users(id PK, google_sub UNIQUE, email UNIQUE, name, admin, session_epoch, created_at)`. `id` is internal, so an invited user can be given memberships at once; `google_sub` is null until their first sign-in. That sign-in binds `google_sub` to the row by email only if the Google ID token has `email_verified` true (as Rosa `deploy/user-api/src/google.ts` requires). After the bind, sign-in matches on `google_sub` only, so a later email change keeps the account.
- `memberships(user, client)` — a member manages the client. Every page and route checks it.
- `clients(id, name, ig_user_id, page_id, token_enc, token_expires, ig_username, schedule, autonomy JSON, emergency_stop, publisher, created_by)`. `publisher` is `local` or `worker`: `local` for clients migrated from a folder, `worker` for clients created in the dashboard (they have no crontab entry). The Worker's cron publishes only for `worker` clients that have a `token_enc`.
- `client_files(client, name, text, version, updated_by, updated_at)` — the brand markdown.
- `hosts(id, user, name, clients JSON, caps JSON, last_seen)` — a PC: which clients it holds assets for, what it can do (`render`, `voice`, `claude`). Registered by `spine/worker.py` on start. `last_seen` is written at most every 5 min, so the dashboard shows a host as online if it was seen in the last 10 min.
- `jobs(id, kind, client, slot_id, state, holder, until, payload, result, by, created_at)` — local work: `plan`, `produce`, `revise`, `formats`, `voice`, `upload`, `spec`. A host may claim a job only if its `clients` list has the job's client.
- `leases(name PK, holder, until, cursor)` — one publisher per client inside the Worker. D1 has no locks: a lease is taken by one conditional `UPDATE leases SET holder=?, until=? WHERE name=? AND until < now` (row inserted once per client), and is held only if the result's `meta.changes` is 1. Job claims use the same pattern on `jobs`.
- `media(slot_id, host, path, sha, size)` — which PC holds which file. For "the file is on <host>" in the dashboard, and for the upload job.
- `by` column on journal and every state change; `version` integer on `posts` (optimistic lock: a stale save is refused); `r2_key` on `posts` (the video's R2 key while it is uploaded).

## Jobs and routing

- Needs a PC: Generate New, Revise, Generate other formats, voice-over, `week auto` plan and produce. The dashboard writes a `jobs` row; a host for that client picks it up. No host online → the job waits; the dashboard shows "waiting for a PC with <client>'s files" and the hosts' last-seen times.
- Needs no PC (Worker only): approve, hold, reschedule, pause, emergency stop, publish now, remove a live post, caption and first-comment edits, AI label, replies, music pick (metadata), insights, audience, pickup, Connect Instagram, members and clients.
- `spine/worker.py`: on start registers the host (user from the stored session, clients from the folders under `clients/` that have `assets/`); polls `GET /api/jobs/next?host=…` every 60 s (the poll also sets `hosts.last_seen`, written at most every 5 min); heartbeats a claimed job every 60 s while it runs; runs the job with the existing `spine` code; posts the result. Started by systemd user service or cron on each PC. Each job runs under that PC's `claude` login, so the creator's Claude account pays for the creator's clients.
- Host sessions: the same session token as the browser, as in Rosa `deploy/user-api` (`SESSION_TTL_MS` 180 days; a token is dead once the user's `session_epoch` changes). The epoch is bumped on sign-out everywhere and when an admin removes the user. Removing one membership does not bump it; the per-call membership check below covers that. Every `/api/jobs/*` and `/api/media/*` call re-reads the `users` and `memberships` rows, so removing a member stops their PC at once. A lapsed or revoked token: `spine/worker.py` stops and asks for `spine.worker login` again.
- `week auto`: the Worker's cron enqueues one `plan` job per client on the client's prep day; the produce jobs follow from the plan on the same host.

## Video lifecycle

1. Rendered locally; `spec_check` passes; the host records it in `media`.
2. On approval the host runs an `upload` job: `video.mp4` and `cover.jpg` go to R2 under `<client>/<slot>/<random 32 hex>.mp4`. The bucket is public-read; the key is unguessable (operator 2026-11-04). Public-read holds only if `r2.dev` passes the phase 0 test; otherwise the bucket is private and the Worker serves the file (open decisions). Upload path: the PC sends the file to the Worker (`PUT /api/media/<slot>`), and the Worker streams the request body into `R2.put` without buffering or reading it, with `httpMetadata.contentType` `video/mp4`. It writes only for a member of the slot's client and only while the slot is unpublished, then sets `r2_key`. The PC sends `Content-Length`: R2 accepts a stream only when "its length must be known: for example, a request body with a `Content-Length` header" (R2 Workers API reference, read 2026-11-04).
3. The Worker's cron (every minute): due slot in QUEUED → create the REELS container with `video_url` = the R2 URL and the same parameters as today (`share_to_feed`, `thumb_offset`, `trial_params`, `collaborators`, `location_id`, `is_ai_generated`). Container id saved on the post.
4. Later minutes: poll `status_code`; FINISHED → `media_publish`; PUBLISHED with `ig_media_id`, permalink, `published_at`; first comment posted (best-effort: a crash between PUBLISHED and the comment loses the comment, and the dashboard shows "first comment not posted" with a button to post it); then MEASURING. Up to 5 polls, as today.
5. The R2 video object is deleted the minute the post is PUBLISHED (`media_publish` returned an `ig_media_id`), not at FINISHED: a publish that fails after FINISHED (quota, Graph error, container EXPIRED) is retried with a new container, and that container fetches the file again. Also deleted when a slot is deleted or its video replaced, and by a daily sweep of any object that no unpublished post names in `r2_key`, once the object's `uploaded` time (from `list()`) is more than a day old (the grace covers an upload that lands before its row). Every delete also clears the post's `r2_key`, so the sweep and the player never point at a missing file. Any unpublished post keeps its file, in any state (QUEUED, HELD, PAUSED, FAILED), so a re-approval needs no new upload. Age alone never deletes a video: a slot far in the future keeps its file. The cover stays for the calendar.
6. After publish the dashboard's player is the Instagram permalink. The local file stays on the creator's PC (`media` says where).
7. Other formats (16:9, 1:1) are never uploaded: the creator posts them by hand from their PC.

In flight at any time: at most the approved-but-unpublished videos, ~22 MB each. A week of 14 is ~300 MB of the 10 GB. FAILED and HELD posts keep their files too, so the dashboard warns when the bucket passes 5 GB.

## Publish safety (must land before the Worker publishes)

- Creating a container publishes nothing. An invocation that died between container create and saving the container id leaves an orphan container, which is harmless (it expires after 24 h). The next minute creates a new one. The double-post risk is only around `media_publish`.
- Before `media_publish` the cron sets the post to PUBLISHING. A PUBLISHING post with a container id and no `ig_media_id` is never sent to `media_publish` again blindly: the Worker first reads the container's `status_code`. `PUBLISHED` ("The container's media object has been published", IG Container reference, read 2026-11-04): it is on Instagram, so it is never published again. The Worker looks in `/{ig_user_id}/media` (as `spine/pickup.py` does today) for media whose `timestamp` is after the PUBLISHING time and whose caption matches. Exactly one: record its `ig_media_id` and permalink. None or several: mark the slot FAILED "published, link it by hand", without a retry. `FINISHED`: the publish did not happen, call `media_publish`. `IN_PROGRESS`: wait for the next minute, never publish; 5 minutes after the PUBLISHING time, FAILED "stuck in Instagram". `EXPIRED` or `ERROR`: a new container.
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
- Uploads (`/new/upload`, `/audience/upload`): an uploaded video goes to R2 the same way as an approved one and a `media` row names no host; an audience export is text and goes to D1. This is the one case where a video sits in the public bucket before approval: the file comes from a browser, so there is no PC to keep it on. Accepted: the key is unguessable, and the object is deleted with the slot. `spec_check` needs ffprobe, so the Worker writes a `spec` job: a host for that client downloads the file through `GET /api/media/<slot>` (the bucket may be private) and runs `spec_check`. The slot cannot be approved until that job passes.

## Local code changes

- `spine/db.py`: talk to D1 through the Worker API instead of `sqlite3.connect`. One module, all callers keep their methods. Auth: the host's session token (the same Google session, saved on the PC by `spine.worker login`). Every call is a Worker request and may be a D1 write, so a job's writes are batched: one request per state change, not per row.
- `spine/clients.py`: `load_grants` reads the `clients` row; `client_dir` unchanged; a `pull(client)` writes `client_files` to disk before a generation.
- `spine/publisher/publish.py`: `publish_slot` ported to the Worker (`video_url`, no `Graph.upload`); the Python keeps `spec_check` and the R2 upload. `auth.py` retired.
- `spine/worker.py` (new): host registration, job loop, lease heartbeat, R2 upload.
- `spine/measure/insights.py`, `spine/audience.py`, `spine/pickup.py`: logic ported into the Worker's cron (Graph API only); Python versions retired.
- crontab: the four jobs replaced by the one worker service.
- Setup script per PC: ffmpeg, Node + Remotion, venv + faster_whisper + Dia, `claude` CLI, `spine.worker login`, and a client's `assets/` folder copied from a creator (by hand, a zip).

## Phases

0. **Spike** (1 session): operator creates the account; Worker skeleton in TS with D1, R2, the cron and Google sign-in copied from Rosa; measure D1 latency and one publish step's CPU time (to set N, below); one test REELS container with `video_url` on `r2.dev` and one on a Worker route that answers `Range` requests (`R2.get` with `range`), to settle the `video_url` host (open decisions).
1. **D1 behind `spine/db.py`**: schema with `client` columns, `users`, `memberships`, `clients`, `jobs`, `leases`, `hosts`, `media`; migrate `tachyon.db`; tests pass unchanged; this desktop still the only runner.
2. **`spine/worker.py`**: jobs and leases replace the generation crontab entries; the publish entry stays until the phase 4 cutover; the dashboard's Generate New, Revise and formats write jobs. Still one PC. Run a week.
3. **Connect Instagram**: Facebook Login in the dashboard, tokens per client in D1, weekly refresh in the cron (only for `publisher = worker` clients; `auth.py` keeps refreshing the `local` ones). Rosa is connected again through Connect in this phase, so its token reaches `clients.token_enc` the same way as any new client's. The local publisher keeps the `.env.local` keys until phase 4 takes over; `auth.py` and the keys are retired in phase 9. Comes before phase 4 because the Worker needs the tokens in D1 to publish. The full Worker dashboard is phase 6, so this phase adds only the Worker routes it needs: a Connect page behind sign-in, the Facebook Login callback and the Page pick.
4. **Worker publishes from R2**: upload job, `video_url` container, one-minute cron, delete on PUBLISHED plus the daily sweep, idempotency check. The local dashboard's approve writes the `upload` job (the Worker dashboard comes in phase 6). Cutover per client: an `upload` job is enqueued for every approved slot that has no `r2_key`; the Worker skips a due slot with no `r2_key` until it has one, never marking it FAILED. A slot still without `r2_key` 10 minutes past `scheduled_at` is flagged on the dashboard: "waiting for upload on <host>". Then the local publisher's crontab entry is removed, then the client's `publisher` is set to `worker`, so the two never both publish. It is done right after a publish, so no slot falls due in the gap; one that does goes out late, at the Worker's next minute. Rollback is the reverse order: `publisher` is set back to `local` first, then the crontab entry is restored. Dry-run first (the cron logs the container it would create and calls nothing); then three kill tests: between container create and poll, after PUBLISHING is set and before `media_publish`, and after `media_publish` returned and before `ig_media_id` is saved. Plus one run where the container still reads `IN_PROGRESS` at the next minute.
5. **API-only crons into the Worker**: insights, audience, pickup.
6. **Dashboard on the Worker**: all pages, phone layout, manifest; the local dashboard kept read-only until parity.
7. **Clients and members from the dashboard**: `client_files`, `clients` rows, `pull(client)`; the Rosa folder's markdown migrated.
8. **Second PC, second user**: setup script, host registration, assets seeded by hand, a Rosa job run from the second PC.
9. **Retire**: local `tachyon.db`, `.publish.lock`, old crontab, `.env.local` token keys, `auth.py`, the laptop zip (below).

Each phase = one PR, GitHub agent review on the final commit, operator OK before merge.

## Free-plan limits

From Rosa `deploy/user-api/README.md`: Workers Free 100k requests/day; D1 Free 5M row reads + 100k row writes/day, 5 GB; R2 10 GB.
From developers.cloudflare.com/workers/platform/limits (read 2026-11-04): Workers Free 10 ms CPU time per invocation, 50 subrequests per request, 5 Cron Triggers per account, 100 MB request body on a Free-plan domain. A subrequest is "any request a Worker makes using the Fetch API or to Cloudflare services like R2, KV, or D1", so D1 and R2 binding calls count.
From developers.cloudflare.com/r2/buckets/public-buckets (read 2026-11-04): "Public access through `r2.dev` subdomains is rate-limited and should only be used for development purposes." A custom domain on the bucket needs a zone in the same Cloudflare account.

What that means here:
- Requests/day (100k): the cron is 1,440. Each PC polls every 60 s: 1,440 per PC. Phone and desktop dashboard use: assume under 2,000 per user. `spine/db.py` calls from running jobs: assume under 500 per job, a few dozen jobs a week. Two PCs and two users come to about 10,000.
- D1 writes/day (100k): `hosts.last_seen` at most every 5 min is 288 per PC; job heartbeats are 60 per running hour. Posts, journal and insights rows, job writes included, add a few thousand.
- CPU (10 ms): the Worker never processes video bytes. Instagram fetches from R2, and the upload is a streamed `R2.put`. So the CPU budget is API calls and HTML only. If the Worker serves `video_url` itself (open decisions), each Instagram fetch is a Worker request, and the response must stream the R2 object body (`new Response(obj.body)`) without buffering it. A 22 MB upload from a PC to the Worker fits the 100 MB body limit.
- Subrequests (50 per invocation): Graph calls, D1 queries and R2 calls share one budget. Each cron minute works through a queue (publish steps first, then insights, audience, pickup, the daily R2 sweep, which runs when the `leases` row `sweep` says its last run was over 24 h ago) across all clients. It stops at 40 subrequests or N publish steps, whichever comes first. Work left over runs the next minute. A Worker cannot time itself ("`Date.now()` returns the time of the last I/O. It does not advance during code execution", Workers security model, read 2026-11-04), so N is a fixed count. The phase 0 spike sets it from the CPU time the dashboard reports for one client's publish step (token decryption, HMAC, Graph JSON parsing). The sweep is one `list()`, one D1 query for the `r2_key` of every unpublished post (no bound parameters: D1 allows 100 per query), and one batched `delete()`: list and delete take up to 1,000 keys (R2 Workers API reference), so about 3 subrequests a day. Past 1,000 objects the sweep saves the `list()` cursor in the `sweep` row and goes on from it the next minute.

## Open decisions

- `video_url` host: `r2.dev` is rate-limited and for development only (quote above), and a custom domain needs a zone, which the "no domain bought" decision rules out. Option: the Worker serves the object itself at `tachyon.<account>.workers.dev/v/<key>`, streaming it from a private bucket and answering `Range` requests. Test Instagram's fetch on `r2.dev` in the phase 0 spike, and decide then.

- Phone notifications for "needs approval" and "failed": web push from the Worker. Nice to have, a later run (operator 2026-11-04).
- The two users' Claude accounts: a client's generation is billed to whichever member's PC holds its assets. Fine for Rosa (one creator); revisit if a client gets two creators.
- Laptop zip `~/tachyon-laptop-2026-10-28.zip` holds the real token: delete or rotate once the token lives online.
