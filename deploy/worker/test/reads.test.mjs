// D1's free tier allows 5M rows read a day. This seeds a client the size of Rosa's (50 posts,
// ~8k metric rows, most of them hourly) and counts the rows each cron minute and each page reads.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { tick } from "../src/cron.ts";
import { seal } from "../src/crypto.ts";
import { clientRow } from "../src/db.ts";
import { renderInsights } from "../src/pages/insights.ts";
import { renderOverview } from "../src/pages/overview.ts";
import { renderVideo } from "../src/pages/video.ts";
import { start } from "./harness.mjs";

let mf, env, read = 0;
const NOW = Math.floor(Date.now() / 300_000) * 300_000 + 3 * 60_000; // :x3 or :x8 - a quiet minute; NOW + 2 min measures
const iso = (t) => new Date(t).toISOString();
const hourKey = (t) => "h:" + iso(t).slice(0, 13);

function counting(db) {
  const stmt = (s, q) => {
  const add = (r) => { const n = r?.meta?.rows_read ?? 0; read += n; if (n > 50 && process.env.READS_LOG) console.log(n, q.slice(0, 140)); return r; };
  return {
    bind: (...a) => stmt(s.bind(...a), q),
    all: async () => add(await s.all()),
    run: async () => add(await s.run()),
    raw: (...a) => s.raw(...a),
    first: async (col) => { const r = add(await s.all()); const row = r.results[0]; return row === undefined ? null : col ? row[col] ?? null : row; },
    __s: s,
  }; };
  return { prepare: (q) => stmt(db.prepare(q), q), batch: async (ss) => (await db.batch(ss.map((x) => x.__s ?? x))).map((r) => { read += r?.meta?.rows_read ?? 0; return r; }), exec: (q) => db.exec(q) };
}

before(async () => {
  ({ mf, env } = await start());
  const DB = env.DB;
  await DB.prepare("UPDATE clients SET token_enc = ?, ig_user_id = '178', publisher = 'worker', grants = '{}' WHERE id = 'rosa'").bind(await seal("tok", "ts")).run();
  const stmts = [];
  for (let i = 0; i < 50; i++) {
    const pub = NOW - (i + 1) * 12 * 3600_000;
    stmts.push(DB.prepare("INSERT INTO posts (client, slot_id, state, ig_media_id, published_at, created_at, updated_at) VALUES ('rosa', ?, 'MEASURING', ?, ?, ?, ?)").bind(`p${i}`, `m${i}`, iso(pub), iso(pub), iso(pub)));
    for (const w of ["24h", "72h", "7d", "live"]) stmts.push(DB.prepare("INSERT INTO metric_snapshots (client, post_id, source, window, collected_at, metrics) VALUES ('rosa', ?, 'ig_media', ?, ?, '{\"views\":5}')").bind(`p${i}`, w, iso(NOW - 60_000)));
    for (let h = 0; h < 150; h++) stmts.push(DB.prepare("INSERT INTO metric_snapshots (client, post_id, source, window, collected_at, metrics) VALUES ('rosa', ?, 'ig_media', ?, ?, '{\"views\":5}')").bind(`p${i}`, hourKey(NOW - h * 3600_000), iso(NOW - h * 3600_000)));
  }
  stmts.push(DB.prepare("INSERT INTO metric_snapshots (client, post_id, source, window, collected_at, metrics) VALUES ('rosa', NULL, 'ig_account', 'daily', ?, ?)").bind(iso(NOW), JSON.stringify({ date: iso(NOW).slice(0, 10) })));
  stmts.push(DB.prepare("INSERT INTO metric_snapshots (client, post_id, source, window, collected_at, metrics) VALUES ('rosa', NULL, 'ig_account', '7d', ?, ?)").bind(iso(NOW), JSON.stringify({ as_of: iso(NOW) })));
  for (let h = 0; h < 150; h++) stmts.push(DB.prepare("INSERT INTO view_gains (client, hour, gain) VALUES ('rosa', ?, 50)").bind(hourKey(NOW - h * 3600_000).slice(2)));
  for (let i = 0; i < stmts.length; i += 500) await DB.batch(stmts.slice(i, i + 500));
  env = { ...env, DB: counting(DB), MEDIA_PUBLIC_URL: "https://pub.example", TOKEN_SECRET: "ts" };
});
after(() => mf.dispose());

async function rows(fn) { read = 0; await fn(); return read; }
const page = async () => {
  const c = { env, client: "rosa", by: 1, now: NOW };
  return { env, c, user: { id: 1, email: "alice@example.com", admin: 0 }, client: await clientRow(c), nav: [{ id: "rosa", name: "Rosa" }], now: NOW };
};

test("rows read: a cron minute and each page stay small on a Rosa-sized table", async () => {
  const total = (await env.DB.prepare("SELECT count(*) AS n FROM metric_snapshots").first()).n;
  assert.ok(total > 7000, String(total));
  const fetcher = async () => new Response("{}", { status: 200 });
  const sweep = await rows(() => tick(env, NOW - 60_000, fetcher)); // the day's first minute: the sweep (once a day) and the week check
  const r = {
    sweep,
    cron: await rows(() => tick(env, NOW, fetcher)),
    measuring: await rows(() => tick(env, NOW + 2 * 60_000, fetcher)),
    overview: await rows(async () => renderOverview(await page(), new URLSearchParams())),
    video: await rows(async () => renderVideo(await page(), "p3")),
    insights: await rows(async () => renderInsights(await page())),
  };
  console.log("rows read", JSON.stringify(r), "of", total);
  // 1440 cron minutes a day, one in INSIGHTS_EVERY (5) measuring: well under the 5M rows a day
  const day = r.cron * 1152 + r.measuring * 288 + r.sweep;
  console.log("cron rows a day", day);
  assert.ok(day < 150_000, `cron ${day} a day`);
  for (const k of ["overview", "video", "insights"]) assert.ok(r[k] < 1000, `${k} ${r[k]}`);
});

test("putSnapshot adds a video's rise to view_gains, once per snapshot", async () => {
  const { putSnapshot } = await import("../src/db.ts");
  const at = Date.parse("2031-01-01T10:20:00Z");
  const c = { env, client: "rosa", by: 1, now: at };
  await putSnapshot(c, "new1", "ig_media", "live", { views: 7 });   // from publish: 7
  await putSnapshot({ ...c, now: at + 60_000 }, "new1", "ig_media", "h:2031-01-01T10", { views: 10 });   // +3
  await putSnapshot({ ...c, now: at + 120_000 }, "new1", "ig_media", "live", { views: 9 });   // down: nothing
  await putSnapshot({ ...c, now: at + 180_000 }, null, "ig_account", "daily", { views: 999 });   // not a video
  const g = await env.DB.prepare("SELECT gain FROM view_gains WHERE client = 'rosa' AND hour = '2031-01-01T10'").first();
  assert.equal(g.gain, 10);
});
