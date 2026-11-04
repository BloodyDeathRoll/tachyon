// Measuring and pickup (src/insights.ts, src/pickup.ts) in Node against the harness D1 and
// R2, Meta's answers scripted: what is due when, the per-minute cap, the account rows,
// linking a reel posted by hand, importing one, and the cron minute that runs them.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { tick } from "../src/cron.ts";
import { seal } from "../src/crypto.ts";
import { iso, OPS, setState } from "../src/db.ts";
import { derived, due, hourKey, PER_MINUTE, step } from "../src/insights.ts";
import { newSlotId, pickup, title, when } from "../src/pickup.ts";
import { start } from "./harness.mjs";

const T0 = Date.parse("2030-03-10T10:17:00Z"); // minute 17: the pickup minute
const TSECRET = "token-secret";
let mf;
let env;
const script = [];
const calls = [];
const fetcher = async (url, init = {}) => {
  calls.push({ method: init.method ?? "GET", url });
  const next = script.shift();
  if (!next) throw new Error(`unexpected fetch ${url}`);
  if (next.bytes) return new Response(next.bytes, { status: 200 });
  return new Response(JSON.stringify(next.body ?? {}), { status: next.status ?? 200 });
};
const insight = (name, value) => ({ name, values: [{ value }] });
const mediaAnswers = (views, reach) => [
  { body: { data: [insight("views", views), insight("reach", reach), insight("likes", 2), insight("shares", 1)] } },
  { status: 400, body: { error: { code: 100, message: "not supported" } } },
  { status: 400, body: { error: { code: 100, message: "not supported" } } },
  { status: 400, body: { error: { code: 100, message: "not supported" } } },
];

before(async () => {
  ({ mf, env } = await start());
  env = { ...env, MEDIA_PUBLIC_URL: "https://pub.example", TOKEN_SECRET: TSECRET };
  await env.DB.prepare("UPDATE clients SET token_enc = ?, ig_user_id = '178', publisher = 'worker' WHERE id = 'rosa'").bind(await seal("tok", TSECRET)).run();
});
after(() => mf.dispose());

const ctx = (now = T0) => ({ env, client: "rosa", by: 1, now });
const rosa = () => env.DB.prepare("SELECT * FROM clients WHERE id = 'rosa'").first();
const post = (slot) => env.DB.prepare("SELECT * FROM posts WHERE slot_id = ?").bind(slot).first();
const snaps = (slot) => env.DB.prepare("SELECT window, metrics FROM metric_snapshots WHERE post_id IS ? ORDER BY id").bind(slot).all().then((r) => r.results);

/** A reel live since `publishedAt`, in MEASURING. */
async function live(slot, mediaId, publishedAt, caption = `Caption ${slot}`) {
  await OPS.create_post(ctx(), { slot_id: slot, fields: {} });
  for (const s of ["BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL", "APPROVED", "QUEUED", "PUBLISHING"]) await setState(ctx(), slot, s, null, {});
  await setState(ctx(), slot, "PUBLISHED", null, { ig_media_id: mediaId, permalink: `https://instagram.com/reel/${mediaId}`, published_at: publishedAt });
  await setState(ctx(), slot, "MEASURING", null, {});
  await OPS.set_files(ctx(), { slot_id: slot, files: { "caption.txt": caption + "\n", "meta.json": JSON.stringify({ duration_s: 20 }) } });
}

test("derived ratios and the hour key", () => {
  const d = derived({ reach: 100, shares: 5, likes: 10, saved: 2, comments: 1, follows: null, ig_reels_avg_watch_time: 5000 }, 20);
  assert.deepEqual(d, { sends_per_reach: 0.05, likes_per_reach: 0.1, saves_per_reach: 0.02, follows_per_reach: 0, comments_per_reach: 0.01, hold: 0.25 });
  assert.equal(derived({ reach: 0 }, null).sends_per_reach, null);
  assert.equal(hourKey(T0), "h:2030-03-10T10");
  assert.equal(when("2030-03-10T09:00:00+0000"), "2030-03-10T09:00:00+00:00");
  assert.equal(title("Short one. More here"), "Short one");
  assert.equal(title("x".repeat(70) + " and then some words here"), "x".repeat(64));
});

test("what is due: the windows after publish, one hourly row per hour, the account rows", async () => {
  const day = 24 * 3600_000;
  await live("a", "m-a", iso(T0 - 25 * 3600_000)); // 24h due, 72h not
  await live("b", "m-b", iso(T0 - 8 * day)); // all three due
  await live("c", "m-c", iso(T0 - 40 * day)); // all due, too old for hourly
  const work = await due(ctx(), T0);
  assert.deepEqual(
    work.map((w) => (w.kind === "media" ? `${w.slot}:${w.window}` : w.kind === "hourly" ? `${w.slot}:h` : w.kind)),
    ["a:24h", "a:h", "b:24h", "b:72h", "b:7d", "b:h", "c:24h", "c:72h", "c:7d", "account", "account7d"],
  );
});

test("a minute does at most PER_MINUTE media snapshots, then the account rows; the 7d snapshot analyzes", async () => {
  for (let i = 0; i < PER_MINUTE; i++) script.push(...mediaAnswers(10 + i, 100));
  script.push(
    { body: { data: [insight("views", 500), insight("reach", 400)] } },
    { body: { followers_count: 1200, media_count: 30 } },
    { body: { data: [insight("views", 100), insight("reach", 90)] } },
    { body: { followers_count: 1200 } },
  );
  const log = await step(env, await rosa(), "tok", T0, fetcher);
  assert.equal(log.length, PER_MINUTE + 2);
  assert.deepEqual(log.slice(-2), ["account", "account7d"]);
  assert.equal(script.length, 0);
  const a = await snaps("a");
  assert.deepEqual(a.map((s) => s.window), ["24h", "h:2030-03-10T10"]);
  const m = JSON.parse(a[0].metrics);
  assert.equal(m.views, 10);
  assert.equal(m.reels_skip_rate, null);
  assert.equal(m._derived.hold, undefined); // no avg watch time in the answers
  const daily = await env.DB.prepare("SELECT metrics FROM metric_snapshots WHERE window = 'daily'").first();
  assert.equal(JSON.parse(daily.metrics).date, "2030-03-10");
  assert.equal(JSON.parse(daily.metrics).followers_count, 1200);
  const rolling = await env.DB.prepare("SELECT metrics FROM metric_snapshots WHERE window = '7d' AND post_id IS NULL").first();
  assert.equal(JSON.parse(rolling.metrics).as_of, iso(T0));
  // the next minute carries on with what is left (9 media items were due), and the account rows are done for the hour
  const left = await due(ctx(), T0 + 60_000);
  assert.equal(left.filter((w) => w.kind === "media" || w.kind === "hourly").length, 9 - PER_MINUTE);
  assert.equal(left.filter((w) => w.kind === "account" || w.kind === "account7d").length, 0);
  for (let i = 0; i < 9 - PER_MINUTE; i++) script.push(...mediaAnswers(1, 1));
  await step(env, await rosa(), "tok", T0 + 60_000, fetcher);
  assert.equal(script.length, 0);
  assert.equal((await post("b")).state, "ANALYZED"); // its 7d snapshot landed
  assert.equal((await post("a")).state, "MEASURING");
  assert.deepEqual(await due(ctx(), T0 + 120_000), []);
});

test("a missing permalink is filled in from the media", async () => {
  await env.DB.prepare("UPDATE posts SET permalink = NULL WHERE slot_id = 'a'").run();
  script.push({ body: { id: "m-a", permalink: "https://instagram.com/reel/m-a2" } });
  const log = await step(env, await rosa(), "tok", T0 + 120_000, fetcher);
  assert.deepEqual(log, ["permalinks: a"]);
  assert.equal((await post("a")).permalink, "https://instagram.com/reel/m-a2");
});

test("pickup links a slot waiting with the same caption and imports a new reel with its cover", async () => {
  await OPS.create_post(ctx(), { slot_id: "w", fields: {} });
  for (const s of ["BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL"]) await setState(ctx(), "w", s, null, {});
  await OPS.set_files(ctx(), { slot_id: "w", files: { "caption.txt": "Posted By Hand  today\n" } });
  assert.equal(await newSlotId(ctx(), "2030-03-10T09:00:00+00:00"), "2030-w10-01"); // a Sunday, the last day of ISO week 10
  script.push(
    { body: { data: [
      { id: "m-new", caption: "A fresh one. Second sentence.", timestamp: "2030-03-10T09:30:00+0000", permalink: "https://instagram.com/reel/m-new", media_product_type: "REELS", thumbnail_url: "https://cdn/thumb.jpg" },
      { id: "m-hand", caption: "posted by hand today", timestamp: "2030-03-10T09:00:00+0000", permalink: "https://instagram.com/reel/m-hand", media_product_type: "REELS" },
      { id: "m-a", caption: "Caption a", timestamp: "2030-03-09T09:00:00+0000", permalink: "x", media_product_type: "REELS" }, // linked already
      { id: "m-old", caption: "old", timestamp: "2029-01-01T09:00:00+0000", permalink: "x", media_product_type: "REELS" }, // before the oldest linked one
      { id: "m-img", caption: "a photo", timestamp: "2030-03-10T09:40:00+0000", permalink: "x", media_product_type: "FEED" },
    ] } },
    { bytes: new Uint8Array([255, 216, 255]) },
  );
  const out = await pickup(env, await rosa(), "tok", T0, fetcher);
  assert.deepEqual(out, [
    { media: "m-hand", slot_id: "w", linked: true },
    { media: "m-new", slot_id: "2030-w10-01", linked: false },
  ]);
  const w = await post("w");
  assert.equal(w.state, "MEASURING");
  assert.equal(w.ig_media_id, "m-hand");
  assert.equal(w.published_at, "2030-03-10T09:00:00+00:00");
  const n = await post("2030-w10-01");
  assert.equal(n.state, "MEASURING");
  assert.equal(n.engine, "instagram");
  assert.equal(n.angle, "A fresh one");
  assert.match(n.cover_key, /^rosa\/2030-w10-01\/[0-9a-f]{32}\.jpg$/);
  assert.equal((await env.MEDIA.head(n.cover_key)).size, 3);
  const f = await OPS.files(ctx(), { slot_id: "2030-w10-01" });
  assert.equal(f["caption.txt"], "A fresh one. Second sentence.\n");
  assert.equal(JSON.parse(f["meta.json"]).plan, "pickup");
  const j = await env.DB.prepare("SELECT action FROM journal WHERE target = 'w' ORDER BY id").all().then((r) => r.results.map((x) => x.action));
  assert.ok(j.includes("meta.link_by_hand"));
  // the same list again: nothing new
  script.push({ body: { data: [{ id: "m-new", caption: "A fresh one.", timestamp: "2030-03-10T09:30:00+0000", media_product_type: "REELS" }] } });
  assert.deepEqual(await pickup(env, await rosa(), "tok", T0 + 1000, fetcher), []);
});

test("the cron minute runs pickup at :17 and insights otherwise, after the publish step", async () => {
  script.push({ body: { data: [] } });
  let out = await tick(env, T0, fetcher);
  assert.deepEqual(out.rosa, []); // nothing due to publish, nothing new to pick up
  assert.match(calls.at(-1).url, /\/178\/media\?/);
  script.push(...mediaAnswers(1, 1), ...mediaAnswers(1, 1)); // :18, insights: the two reels pickup made want this hour's row
  out = await tick(env, T0 + 60_000, fetcher);
  assert.deepEqual(out.rosa, ["insights w hourly", "insights 2030-w10-01 hourly"]);
  out = await tick(env, T0 + 60_000, fetcher);
  assert.deepEqual(out.rosa, []); // nothing more due this hour
  await env.DB.prepare("DELETE FROM metric_snapshots WHERE window = 'daily'").run();
  script.push({ body: { data: [] } }, { body: { followers_count: 1 } });
  out = await tick(env, T0 + 60_000, fetcher);
  assert.deepEqual(out.rosa, ["insights account"]);
});
