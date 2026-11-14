-- New-client setup (src/pages/setup.ts). schema.sql is CREATE TABLE IF NOT EXISTS, so an existing D1 needs this once,
-- before the Worker that reads the column is deployed:
--   npx wrangler d1 execute tachyon --remote --file migrations-0004-client-status.sql
-- Every client that exists stays active. client_intake comes with `npm run db:remote`.
ALTER TABLE clients ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
