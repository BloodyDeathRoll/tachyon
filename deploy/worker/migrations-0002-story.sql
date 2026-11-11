-- PR #63: the story cut in R2. schema.sql is CREATE TABLE IF NOT EXISTS, so an existing D1 needs these once:
--   npx wrangler d1 execute tachyon --remote --file migrations-0002-story.sql
-- Applied to the live D1 on 2026-11-11.
ALTER TABLE posts ADD COLUMN story_key TEXT;
ALTER TABLE posts ADD COLUMN story_sha TEXT;
