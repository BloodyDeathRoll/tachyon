-- The snapshot indexes and view_gains (schema.sql) for a D1 created before them. Run once, before
-- deploying the code that reads view_gains: npx wrangler d1 execute tachyon --remote --file <this>
-- every read of this table goes through one of these: a scan reads every row, and D1's free
-- tier allows 5M rows read a day (a minute cron scanning ~8k rows four times ran it out)
CREATE INDEX IF NOT EXISTS snaps_post ON metric_snapshots(client, post_id, source, collected_at);
CREATE INDEX IF NOT EXISTS snaps_window ON metric_snapshots(client, source, window, post_id);   -- covering: the cron reads post_id only
CREATE INDEX IF NOT EXISTS snaps_time ON metric_snapshots(client, source, collected_at);
-- views gained per hour over all a client's videos: the overview chart reads ~50 rows here,
-- not every video's hourly history (~4k rows for 48 h). putSnapshot (src/db.ts) adds to it.
CREATE TABLE IF NOT EXISTS view_gains (
  client TEXT NOT NULL,
  hour   TEXT NOT NULL,                  -- UTC, YYYY-MM-DDTHH
  gain   INTEGER NOT NULL,
  PRIMARY KEY (client, hour)
);
-- fill it from the snapshots once (the same sums app.py's views_series made)
INSERT OR REPLACE INTO view_gains (client, hour, gain)
  SELECT client, substr(collected_at, 1, 13), sum(d) FROM (
    SELECT client, collected_at, coalesce(json_extract(metrics, '$.views'), 0)
      - coalesce(lag(coalesce(json_extract(metrics, '$.views'), 0)) OVER (PARTITION BY client, post_id ORDER BY collected_at), 0) AS d
    FROM metric_snapshots WHERE source = 'ig_media' AND post_id IS NOT NULL)
  WHERE d > 0 GROUP BY 1, 2;
