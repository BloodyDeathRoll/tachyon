# Tachyon Worker

The online half of [docs/CLOUDFLARE-PLAN.md](../../docs/CLOUDFLARE-PLAN.md): a
TypeScript Cloudflare Worker with D1 (`DB`) and R2 (`MEDIA`). So far: Google sign-in
(invite-only), members per client, the job queue the PCs poll, video upload to R2, and
`spine/db.py`'s methods as ops on D1 (`src/db.ts`, phase 1). The routes are listed at
the top of `src/index.ts`.

A PC uses it once `~/.tachyon/worker.json` names it (`spine/remote.py`); until then the
local system runs as it is. `python -m spine.migrate_d1 <client>` writes the SQL that
moves a client's `tachyon.db` and files online (its docstring has the two commands).

## A PC as a host (phase 2)

A new PC: `deploy/setup-pc.sh <worker url>` does the steps below after installing the
venvs, Remotion and the service (its header says what it needs first). Run it again after a node upgrade: the service's PATH names node's folder. A client's
`assets/` folder comes from its creator as a zip, by hand; the rest is pulled.

1. `python -m spine.worker login https://tachyon.<account>.workers.dev`: opens nothing
   itself; sign in at `<that url>/login` in a browser, paste the token it shows.
2. `python -m spine.worker run`, or install `deploy/tachyon-worker.service` (its header
   has the commands). The host registers with the clients whose `clients/<c>/assets/` it
   holds and polls for jobs every minute.
3. With a Worker configured, the dashboard's Generate week, Generate New, Revise, other
   formats and caption buttons write `jobs` rows (`spine/jobs.py`) instead of forking; the
   host runs them. A job runs only its kind's command for its own client and slot
   (`spine/worker.py` `ARGV`). The crontab's `spine.week auto` and publish lines stay
   until phase 4's cron takes them over.

## Run without an account

```sh
npm install
npm test          # esbuild bundle, then node --test against Miniflare's local D1 and R2
npm run typecheck
```

`tests/test_remote_db.py` (repo root, pytest) starts `test/serve.mjs`, the same Worker
on a local port, and runs the Python `RemoteDB` against it; it skips without `node_modules`.

## Publishing from the Worker (phase 4 cutover, per client)

The cron (`src/cron.ts`, every minute) publishes for every `clients` row whose
`publisher` is `worker` and that has a token. Nothing publishes until both hold.

1. Set `MEDIA_PUBLIC_URL` in `wrangler.toml` to `https://<worker host>/ig` (the bucket stays
   private; the Worker serves waiting videos itself); secrets `TOKEN_SECRET`, `META_APP_SECRET`,
   `VERCEL_TOKEN` (`npx wrangler secret put ...`), `META_APP_ID` in `wrangler.toml`.
2. Connect the client: `<worker url>/connect/<client>` in a browser signed in at `/login`.
3. On the creator's PC the host loop runs (`spine.worker run`). Approving a video in the
   local dashboard enqueues an `upload` job: the host sends `video.mp4`, `cover.jpg` and
   the text files up. Every later change to the video's caption, comment or meta is sent
   again by the dashboard.
4. Right after a publish: remove the crontab's `spine.publisher.publish --queue`,
   `spine.measure.insights` and `spine.week auto` lines (the cron does all three for a
   `worker` client), then
   `npx wrangler d1 execute tachyon --remote --command "UPDATE clients SET publisher = 'worker' WHERE id = '<client>'"`.
   Rollback is the reverse order. The two never both publish.
5. First, a dry week with the kill tests in docs/CLOUDFLARE-PLAN.md phase 4.

## When the account exists

Only on the Tachyon account (not Rosa's, not OneShot's). Use a scoped API token
(`CLOUDFLARE_API_TOKEN`), never `wrangler login` on the host.

1. `npx wrangler d1 create tachyon` → put the id in `wrangler.toml`.
2. `npx wrangler r2 bucket create tachyon-media`.
3. `npm run db:remote` (the schema is idempotent).
4. `npx wrangler secret put SESSION_SECRET` (32+ random bytes),
   `npx wrangler secret put GOOGLE_CLIENT_SECRET`; set `GOOGLE_CLIENT_ID` in
   `wrangler.toml` from the Tachyon Google OAuth client.
5. Seed the first admin:
   An existing D1 from before PR #63 also needs `npx wrangler d1 execute tachyon --remote --file migrations-0002-story.sql`.
   `npx wrangler d1 execute tachyon --remote --command "INSERT INTO users (email, admin, created_at) VALUES ('you@example.com', 1, strftime('%s','now') * 1000)"`.
   Every later user, membership and client goes through `/api/admin/*` (`src/admin.ts`; the
   pages come with phase 6), with the admin's session token:
   `curl -H "Authorization: Bearer $T" -H "Content-Type: application/json" -d '{"email":"them@example.com"}' <url>/api/admin/users`.
6. `npm run deploy`.
7. A client's brand text lives online once migrated (`client_files`); a PC gets it back with
   `python -c "from spine import clients as C; print(C.pull('rosa'))"`, and the host loop
   does that before every job.
   No page edits that text online yet, and a job's `pull` overwrites a local edit of
   `brand.md` (and the other markdown). Send one edited file up with
   `python -c "from spine.db import DB; DB.for_client('clients/rosa').set_client_file('brand.md', open('clients/rosa/brand.md').read())"`.
   Never re-run `spine/migrate_d1.py` for that: it replaces every table's rows for the client.
