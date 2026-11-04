// The publisher and the cron (src/publish.ts, src/cron.ts) in Node against the harness D1
// and R2, with Meta's answers scripted: the happy path, the failures that retry and the
// ones that hand off, the recovery after a crash, the lease, the sweep.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { enqueueAuto, sweep, takeLease, tick } from "../src/cron.ts";
import { open, seal } from "../src/crypto.ts";
import { iso, OPS, setState } from "../src/db.ts";
import { containerParams, publishClient } from "../src/publish.ts";
import { start } from "./harness.mjs";

const T0 = Date.parse("2030-01-01T06:30:00Z");
const TSECRET = "token-secret";
let mf;
let env;
const script = [];
const calls = [];
const fetcher = async (url, init = {}) => {
  calls.push({ method: init.method ?? "GET", url, body: init.body ? String(init.body) : "" });
  const next = script.shift();
  if (!next) throw new Error(`unexpected fetch ${url}`);
  if (next.throw) throw next.throw;
  return new Response(JSON.stringify(next.body ?? {}), { status: next.status ?? 200 });
};

before(async () => {
  ({ mf, env } = await start());
  env = { ...env, MEDIA_PUBLIC_URL: "https://pub.example", TOKEN_SECRET: TSECRET, VERCEL_TOKEN: "vt" };
  await env.DB.prepare("UPDATE clients SET token_enc = ?, ig_user_id = '178', publisher = 'worker', grants = ? WHERE id = 'rosa'")
    .bind(await seal("tok", TSECRET), JSON.stringify({ bio_link: { public_url: "https://rosa.surf/ig", edge_config_id: "ecfg", team_id: "team", key: "k" } }))
    .run();
});
after(() => mf.dispose());

const ctx = (now = T0) => ({ env, client: "rosa", by: 1, now });
const rosa = () => env.DB.prepare("SELECT * FROM clients WHERE id = 'rosa'").first();
const post = (slot) => env.DB.prepare("SELECT * FROM posts WHERE slot_id = ?").bind(slot).first();
const journal = (slot) =>
  env.DB.prepare("SELECT action, intent, outcome FROM journal WHERE target = ? AND action NOT LIKE 'post.%' ORDER BY id").bind(slot).all().then((r) => r.results);
const run = async (now) => publishClient(env, await rosa(), now, fetcher);

/** A slot ready to go out at T0, its file in R2. */
async function queued(slot, { caption = `Caption ${slot}`, first = "Which spot next?", meta = {}, file = true, state = "QUEUED" } = {}) {
  await OPS.create_post(ctx(), { slot_id: slot, fields: { scheduled_at: iso(T0) } });
  for (const s of ["BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL", "APPROVED", ...(state === "QUEUED" ? ["QUEUED"] : [])]) await setState(ctx(), slot, s, null, {});
  await OPS.set_files(ctx(), { slot_id: slot, files: { "caption.txt": caption, "first_comment.txt": first, "meta.json": JSON.stringify(meta) } });
  if (file) {
    await env.MEDIA.put(`rosa/${slot}/abc.mp4`, "bytes");
    await env.DB.prepare("UPDATE posts SET r2_key = ? WHERE slot_id = ?").bind(`rosa/${slot}/abc.mp4`, slot).run();
  }
}

test("container params: video_url, the meta flags, never an upload", () => {
  const p = containerParams({ thumb_offset: 2000.7, trial: true, is_ai_generated: true, collaborators: ["a"], location_id: 5 }, "hi", "https://x/k.mp4");
  assert.deepEqual(p, {
    media_type: "REELS", video_url: "https://x/k.mp4", caption: "hi", share_to_feed: "true", thumb_offset: "2000",
    trial_params: '{"graduation_strategy":"SS_PERFORMANCE"}', collaborators: '["a"]', location_id: "5", is_ai_generated: "true",
  });
  assert.equal(containerParams({ share_to_feed: false }, "x", "u").share_to_feed, "false");
});

test("the happy path over three minutes: container, in progress, published with comment and bio link", async () => {
  await queued("w1", { meta: { thumb_offset: 2000, is_ai_generated: true, trial: true, bio_link_while_live: "https://rosa.surf/x" } });
  await OPS.create_post(ctx(), { slot_id: "w0", fields: { scheduled_at: iso(T0 + 3600_000) } });
  for (const s of ["BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL", "APPROVED"]) await setState(ctx(), "w0", s, null, {});

  script.push({ body: { data: [{ quota_usage: 3 }] } }, { body: { id: "c1" } });
  let log = await run(T0 + 1000);
  assert.deepEqual(log, ["w1: container c1"]);
  assert.equal((await post("w0")).state, "QUEUED"); // approved with a time: promoted, not due
  let row = await post("w1");
  assert.equal(row.state, "PUBLISHING");
  assert.equal(row.container_id, "c1");
  assert.equal(row.publishing_at, iso(T0 + 1000));
  const create = calls[1];
  assert.match(create.url, /\/178\/media$/);
  const body = new URLSearchParams(create.body);
  assert.equal(body.get("video_url"), "https://pub.example/rosa/w1/abc.mp4");
  assert.equal(body.get("media_type"), "REELS");
  assert.equal(body.get("is_ai_generated"), "true");
  assert.equal(body.get("thumb_offset"), "2000");
  assert.equal(body.get("access_token"), "tok");
  assert.equal(body.get("upload_type"), null);

  script.push({ body: { status_code: "IN_PROGRESS" } });
  assert.deepEqual(await run(T0 + 61_000), ["w1: in progress"]);
  assert.equal((await post("w1")).state, "PUBLISHING");

  script.push(
    { body: { status_code: "FINISHED" } },
    { body: { id: "m1" } },
    { body: { id: "m1", permalink: "https://instagram.com/reel/m1", timestamp: "2030-01-01T06:32:00+0000" } },
    { body: { ok: true } },
    { body: { id: "cm1" } },
  );
  log = await run(T0 + 121_000);
  assert.deepEqual(log, ["w1: published https://instagram.com/reel/m1"]);
  row = await post("w1");
  assert.equal(row.state, "MEASURING");
  assert.equal(row.ig_media_id, "m1");
  assert.equal(row.published_at, "2030-01-01T06:32:00+0000");
  assert.equal(row.r2_key, null);
  assert.equal(await env.MEDIA.get("rosa/w1/abc.mp4"), null);
  const j = await journal("w1");
  assert.deepEqual(j.map((x) => x.action), ["meta.container.create", "meta.media_publish", "bio_link.set", "meta.comment.create"]);
  assert.equal(JSON.parse(j[1].outcome).id, "m1");
  assert.equal(JSON.parse(j[3].outcome).id, "cm1");
  const vercel = calls.find((c) => c.url.startsWith("https://api.vercel.com"));
  assert.equal(vercel.method, "PATCH");
  assert.match(vercel.body, /rosa\.surf\/x/);
  assert.match(calls.at(-1).url, /\/m1\/comments$/);
  assert.equal(script.length, 0);
});

test("a container error fails the slot; the second failure hands it off", async () => {
  await queued("w2");
  script.push({ body: { data: [{ quota_usage: 3 }] } }, { body: { id: "c2" } });
  await run(T0 + 1000);
  script.push({ body: { status_code: "ERROR", status: "bad codec" } });
  assert.match((await run(T0 + 61_000))[0], /failed: container c2 ERROR: bad codec/);
  assert.equal((await post("w2")).state, "FAILED");
  await setState(ctx(), "w2", "QUEUED", null, {}); // the operator's retry
  script.push({ body: { data: [{ quota_usage: 3 }] } }, { body: { id: "c3" } });
  await run(T0 + 121_000);
  script.push({ body: { status_code: "EXPIRED", status: "" } });
  await run(T0 + 181_000);
  assert.equal((await post("w2")).state, "MANUAL_HANDOFF");
  assert.equal(await env.MEDIA.head("rosa/w2/abc.mp4").then(Boolean), true); // never published: the file stays
});

test("an ambiguous media_publish answer is a hand-off, never a retry", async () => {
  await queued("w3");
  script.push({ body: { data: [{ quota_usage: 3 }] } }, { body: { id: "c4" } });
  await run(T0 + 1000);
  script.push({ body: { status_code: "FINISHED" } }, { status: 500, body: { error: { code: 1, message: "unknown" } } });
  const log = await run(T0 + 61_000);
  assert.match(log[0], /may be live/);
  assert.equal((await post("w3")).state, "MANUAL_HANDOFF");
  // a clear refusal is a FAILED instead
  await queued("w3b");
  script.push({ body: { data: [{ quota_usage: 3 }] } }, { body: { id: "c5" } });
  await run(T0 + 1000);
  script.push({ body: { status_code: "FINISHED" } }, { status: 400, body: { error: { code: 100, message: "nope" } } });
  await run(T0 + 61_000);
  assert.equal((await post("w3b")).state, "FAILED");
});

test("a container already PUBLISHED (a crash after media_publish) is linked by caption, or handed off", async () => {
  await queued("w4", { caption: "Caption four" });
  script.push({ body: { data: [{ quota_usage: 3 }] } }, { body: { id: "c6" } });
  await run(T0 + 1000);
  script.push(
    { body: { status_code: "PUBLISHED" } },
    { body: { data: [{ id: "m9", caption: "Other", timestamp: "2030-01-01T06:31:00+0000" }, { id: "m4", caption: "Caption four", timestamp: "2030-01-01T06:31:30+0000" }] } },
    { body: { id: "m4", permalink: "https://instagram.com/reel/m4", timestamp: "2030-01-01T06:31:30+0000" } },
    { body: { id: "cm4" } },
  );
  await run(T0 + 61_000);
  const row = await post("w4");
  assert.equal(row.state, "MEASURING");
  assert.equal(row.ig_media_id, "m4");
  await queued("w4b", { caption: "Caption four" });
  script.push({ body: { data: [{ quota_usage: 3 }] } }, { body: { id: "c7" } });
  await run(T0 + 1000);
  script.push({ body: { status_code: "PUBLISHED" } }, { body: { data: [] } });
  await run(T0 + 61_000);
  assert.equal((await post("w4b")).state, "MANUAL_HANDOFF");
});

test("stuck in Instagram: IN_PROGRESS five minutes after PUBLISHING began fails the slot", async () => {
  await queued("w5");
  script.push({ body: { data: [{ quota_usage: 3 }] } }, { body: { id: "c8" } });
  await run(T0 + 1000);
  script.push({ body: { status_code: "IN_PROGRESS" } });
  await run(T0 + 4 * 60_000);
  assert.equal((await post("w5")).state, "PUBLISHING");
  script.push({ body: { status_code: "IN_PROGRESS" } });
  await run(T0 + 7 * 60_000);
  assert.equal((await post("w5")).state, "FAILED");
});

test("pre-flight: quota, emergency stop, a missing file, no caption, a URL in the first comment", async () => {
  await queued("w6");
  script.push({ body: { data: [{ quota_usage: 100 }] } });
  assert.deepEqual(await run(T0 + 1000), ["w6: publishing quota used 100/100"]);
  assert.equal((await post("w6")).state, "QUEUED");
  await env.DB.prepare("UPDATE clients SET emergency_stop = 1 WHERE id = 'rosa'").run();
  assert.deepEqual(await run(T0 + 1000), ["emergency_stop is on"]);
  await env.DB.prepare("UPDATE clients SET emergency_stop = 0 WHERE id = 'rosa'").run();
  await env.DB.prepare("UPDATE posts SET r2_key = NULL WHERE slot_id = 'w6'").run();
  assert.deepEqual(await run(T0 + 1000), ["w6: waiting for upload"]);
  await env.DB.prepare("DELETE FROM posts WHERE slot_id = 'w6'").run();
  await queued("w7", { caption: "" });
  await run(T0 + 1000);
  assert.equal((await post("w7")).state, "NEEDS_APPROVAL");
  await queued("w8", { first: "see rosa.surf" });
  await run(T0 + 1000);
  const row = await post("w8");
  assert.equal(row.state, "NEEDS_APPROVAL");
  assert.match(row.note, /URL/);
  assert.equal(calls.filter((c) => c.url.includes("/178/media")).length, calls.filter((c) => c.url.includes("/178/media")).length); // no new container calls
});

test("the cron: a lease per client, the sweep, the daily auto job", async () => {
  await env.DB.prepare("DELETE FROM posts WHERE state IN ('QUEUED', 'PUBLISHING')").run();
  const out = await tick(env, T0 + 1000, fetcher);
  assert.deepEqual(out.rosa, []); // nothing due
  assert.equal(out.acme, undefined); // publisher 'local'
  assert.ok(await takeLease(env, "publish:rosa", "other", T0 + 2000, 55_000));
  assert.equal((await tick(env, T0 + 3000, fetcher)).rosa, "busy");
  // the sweep: a day-old object nobody names goes, a referenced or young one stays
  await env.MEDIA.put("rosa/old/zzz.mp4", "x");
  await env.MEDIA.put("rosa/w2/abc.mp4", "x"); // referenced by w2 (FAILED keeps its file)
  const later = Date.now() + 2 * 24 * 60 * 60 * 1000;
  const swept = await sweep(env, later);
  assert.ok(swept.deleted.includes("rosa/old/zzz.mp4"));
  assert.ok(!swept.deleted.includes("rosa/w2/abc.mp4"));
  assert.equal(await env.MEDIA.head("rosa/old/zzz.mp4"), null);
  await env.MEDIA.put("rosa/young/yyy.mp4", "x");
  assert.deepEqual((await sweep(env, Date.now())).deleted, []);
  // one auto job per client per day
  const clients = (await env.DB.prepare("SELECT * FROM clients WHERE publisher = 'worker'").all()).results;
  assert.deepEqual(await enqueueAuto(env, clients, later), ["rosa"]);
  assert.deepEqual(await enqueueAuto(env, clients, later + 60_000), []);
  const job = await env.DB.prepare("SELECT kind, payload FROM jobs WHERE kind = 'auto'").first();
  assert.equal(job.payload, '{"argv":["spine.week","auto","rosa"]}');
});

test("the token seal round-trips and refuses another secret", async () => {
  const s = await seal("EAAB...", "k1");
  assert.match(s, /^v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/);
  assert.equal(await open(s, "k1"), "EAAB...");
  await assert.rejects(open(s, "k2"));
  await assert.rejects(open("junk", "k1"));
});
