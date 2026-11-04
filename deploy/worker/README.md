# Tachyon Worker

The online half of [docs/CLOUDFLARE-PLAN.md](../../docs/CLOUDFLARE-PLAN.md): a
TypeScript Cloudflare Worker with D1 (`DB`) and R2 (`MEDIA`). So far: Google sign-in
(invite-only), members per client, the job queue the PCs poll, video upload to R2, and
`spine/db.py`'s methods as ops on D1 (`src/db.ts`, phase 1). The routes are listed at
the top of `src/index.ts`.

A PC uses it once `~/.tachyon/worker.json` names it (`spine/remote.py`); until then the
local system runs as it is. `python -m spine.migrate_d1 <client>` writes the SQL that
moves a client's `tachyon.db` and files online (its docstring has the two commands).

## Run without an account

```sh
npm install
npm test          # esbuild bundle, then node --test against Miniflare's local D1 and R2
npm run typecheck
```

`tests/test_remote_db.py` (repo root, pytest) starts `test/serve.mjs`, the same Worker
on a local port, and runs the Python `RemoteDB` against it; it skips without `node_modules`.

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
   `npx wrangler d1 execute tachyon --remote --command "INSERT INTO users (email, admin, created_at) VALUES ('you@example.com', 1, strftime('%s','now') * 1000)"`.
6. `npm run deploy`.
