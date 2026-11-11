// The DB ops (src/db.ts) over HTTP against a local D1: the state machine, the
// version guard, the journal, snapshots and the follower import.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { OPS, setState } from "../src/db.ts";
import { mint } from "../src/session.ts";
import { NOW, SECRET, start } from "./harness.mjs";

let mf;
let env;
before(async () => ({ mf, env } = await start()));
after(() => mf.dispose());

async function op(name, args = {}, as = 1) {
  const token = await mint({ sub: String(as), exp: NOW + 3600_000, ep: 0 }, SECRET);
  const res = await mf.dispatchFetch(`http://t/api/db/rosa/${name}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const data = await res.json();
  return { status: res.status, ...data };
}

const walk = async (slot, ...states) => {
  for (const to of states) assert.equal((await op("set_state", { slot_id: slot, to })).status, 200, to);
};
const QUEUED = ["BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL", "APPROVED", "QUEUED"];

test("only a member reaches a client's ops; an unknown op is a 404", async () => {
  assert.equal((await op("posts", {}, 2)).status, 403);
  assert.equal((await op("dance")).status, 404);
  for (const inherited of ["constructor", "toString", "__proto__", "hasOwnProperty"]) assert.equal((await op(inherited)).status, 404, inherited);
  assert.equal((await op("posts", {}, 3)).status, 200); // admin
});

test("create, walk every main state, publish, measure", async () => {
  const made = await op("create_post", { slot_id: "w01-s1", fields: { pillar: "proof", trial: true } });
  assert.equal(made.status, 200);
  assert.equal(made.result.state, "IDEA");
  assert.equal(made.result.trial, 1);
  assert.match(made.result.created_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+00:00$/);
  assert.equal((await op("create_post", { slot_id: "w01-s1" })).status, 409);
  assert.equal((await op("create_post", { slot_id: "x", fields: { colour: "blue" } })).status, 400);
  await walk("w01-s1", ...QUEUED, "PUBLISHING");
  const pub = await op("set_state", { slot_id: "w01-s1", to: "PUBLISHED" });
  assert.equal(pub.status, 409);
  assert.equal(pub.error, "transition");
  assert.match(pub.detail, /ig_media_id/);
  assert.equal((await op("set_state", { slot_id: "w01-s1", to: "PUBLISHED", updates: { ig_media_id: "1789", permalink: "https://x" } })).status, 200);
  await walk("w01-s1", "MEASURING", "ANALYZED");
  const row = (await op("post", { slot_id: "w01-s1" })).result;
  assert.equal(row.state, "ANALYZED");
  assert.equal(row.version, 11);
  assert.equal((await op("post", { slot_id: "nope" })).status, 404);
  const journal = (await env.DB.prepare("SELECT action, target, by, json_extract(intent, '$.to') AS t FROM journal WHERE client = 'rosa' ORDER BY id").all()).results;
  assert.equal(journal.length, 12); // create + 11 transitions
  assert.deepEqual(journal[0], { action: "post.create", target: "w01-s1", by: 1, t: null });
  assert.deepEqual(journal[9], { action: "post.state", target: "w01-s1", by: 1, t: "PUBLISHED" });
});

test("illegal transition leaves the row alone; publishing is idempotent on the slot", async () => {
  await op("create_post", { slot_id: "s" });
  const r = await op("set_state", { slot_id: "s", to: "PUBLISHED" });
  assert.equal(r.status, 409);
  assert.equal((await op("post", { slot_id: "s" })).result.state, "IDEA");
  await walk("s", ...QUEUED, "PUBLISHING", "FAILED");
  await env.DB.prepare("UPDATE posts SET ig_media_id = '1790' WHERE slot_id = 's'").run();
  await walk("s", "QUEUED");
  const again = await op("set_state", { slot_id: "s", to: "PUBLISHING" });
  assert.equal(again.status, 409);
  assert.match(again.detail, /already published/);
  assert.equal((await op("fail_count", { slot_id: "s" })).result, 1);
  // an ig_media_id another post holds is a 409 exists, not a 500; the row is untouched
  await op("create_post", { slot_id: "dup" });
  await walk("dup", ...QUEUED, "PUBLISHING");
  const dup = await op("set_state", { slot_id: "dup", to: "PUBLISHED", updates: { ig_media_id: "1789" } });
  assert.equal(dup.status, 409);
  assert.equal(dup.error, "exists");
  assert.equal((await op("post", { slot_id: "dup" })).result.state, "PUBLISHING");
  // post.* journal rows are the ops' own: a member cannot fake a failure
  const forged = await op("journal", { action: "post.state", target: "s", intent: { to: "FAILED" } });
  assert.equal(forged.status, 400);
  assert.equal((await op("fail_count", { slot_id: "s" })).result, 1);
});

test("QA rounds count; a note is kept", async () => {
  await op("create_post", { slot_id: "q" });
  await walk("q", "BRIEFED", "SCRIPTED", "RENDERED", "QA", "SCRIPTED");
  assert.equal((await op("post", { slot_id: "q" })).result.qa_rounds, 1);
  await walk("q", "RENDERED", "QA", "NEEDS_APPROVAL");
  await op("set_state", { slot_id: "q", to: "REJECTED", note: "hook is a question" });
  assert.equal((await op("post", { slot_id: "q" })).result.note, "hook is a question");
});

test("a change between the read and the write is a 409 changed, nothing written", async () => {
  await op("create_post", { slot_id: "v" });
  // a DB whose batch() first lets another writer in (the row's version moves on)
  const racy = {
    prepare: (q) => env.DB.prepare(q),
    batch: async (stmts) => {
      await env.DB.prepare("UPDATE posts SET note = 'other', version = version + 1 WHERE slot_id = 'v'").run();
      return env.DB.batch(stmts);
    },
  };
  await assert.rejects(setState({ env: { DB: racy }, client: "rosa", by: 1, now: NOW }, "v", "BRIEFED", null, {}), (e) => e.status === 409 && e.message === "changed");
  const row = (await op("post", { slot_id: "v" })).result;
  assert.equal(row.state, "IDEA");
  assert.equal(row.version, 1);
  assert.equal((await env.DB.prepare("SELECT count(*) AS n FROM journal WHERE target = 'v'").first()).n, 1); // only post.create
  // the same race on a swap: neither row moves
  await op("create_post", { slot_id: "v2", fields: { scheduled_at: "2030-01-01T06:30:00+00:00" } });
  const racy2 = {
    prepare: (q) => env.DB.prepare(q),
    batch: async (stmts) => {
      await env.DB.prepare("UPDATE posts SET version = version + 1 WHERE slot_id = 'v'").run();
      return env.DB.batch(stmts);
    },
  };
  await assert.rejects(OPS.move({ env: { DB: racy2 }, client: "rosa", by: 1, now: NOW }, { slot_id: "v", at: "", swap_with: "v2" }), (e) => e.message === "changed");
  assert.equal((await op("post", { slot_id: "v2" })).result.scheduled_at, "2030-01-01T06:30:00+00:00");
  assert.equal((await op("post", { slot_id: "v" })).result.scheduled_at, null);
});

test("move and swap, journaled; live posts never move", async () => {
  await op("create_post", { slot_id: "m1", fields: { scheduled_at: "2030-01-01T06:30:00+00:00" } });
  await op("create_post", { slot_id: "m2", fields: { scheduled_at: "2030-01-01T18:30:00+00:00" } });
  assert.equal((await op("move", { slot_id: "m1", at: "", swap_with: "m2" })).status, 200);
  assert.equal((await op("post", { slot_id: "m1" })).result.scheduled_at, "2030-01-01T18:30:00+00:00");
  assert.equal((await op("post", { slot_id: "m2" })).result.scheduled_at, "2030-01-01T06:30:00+00:00");
  assert.equal((await op("move", { slot_id: "m1", at: "2030-02-02T06:30:00+00:00" })).status, 200);
  assert.equal((await op("post", { slot_id: "m1" })).result.scheduled_at, "2030-02-02T06:30:00+00:00");
  const live = await op("move", { slot_id: "w01-s1", at: "2030-01-01T06:30:00+00:00" });
  assert.equal(live.status, 400);
  assert.match(live.detail, /cannot move/);
  const times = (await op("scheduled_times", { states: ["IDEA"] })).result.map((r) => r.slot_id).filter((s) => s.startsWith("m")).sort();
  assert.deepEqual(times, ["m1", "m2"]);
  assert.equal((await op("set_scheduled", { slot_id: "m2", at: "2031-01-01T00:00:00+00:00" })).status, 200);
  const moves = (await env.DB.prepare("SELECT action FROM journal WHERE target IN ('m1', 'm2') AND action != 'post.create' ORDER BY id").all()).results.map((r) => r.action);
  assert.deepEqual(moves, ["post.move", "post.move", "post.scheduled_now"]);
});

test("snapshots upsert per window; the account 7d row is replaced", async () => {
  await op("add_snapshot", { post_id: "s", source: "ig_media", window: "24h", metrics: { views: 10 } });
  await op("add_snapshot", { post_id: "s", source: "ig_media", window: "24h", metrics: { views: 12 } });
  await op("add_snapshot", { post_id: "s", source: "ig_media", window: "72h", metrics: { views: 40 } });
  const snaps = (await op("snapshots", { post_id: "s" })).result;
  assert.deepEqual(snaps.map((s) => s.window), ["24h", "72h"]);
  assert.equal(snaps[0].metrics.views, 12);
  await op("add_snapshot", { post_id: null, source: "ig_account", window: "7d", metrics: { reach: 1 } });
  await op("add_snapshot", { post_id: null, source: "ig_account", window: "7d", metrics: { reach: 2 } });
  assert.equal((await op("snapshots", {})).result.filter((s) => s.window === "7d").length, 2); // NULL post_id rows are distinct
  await op("delete_snapshots", { post_id: null, source: "ig_account", window: "7d" });
  assert.equal((await op("snapshots", {})).result.filter((s) => s.window === "7d").length, 0);
});

test("journal outcome, permalink backfill, experiments, engage, costs, conversions", async () => {
  const j = (await op("journal", { action: "meta.container.create", target: "w01-s1", intent: { a: 1 } })).result;
  await op("journal_outcome", { id: j, outcome: { id: "c1" } });
  assert.equal((await env.DB.prepare("SELECT outcome FROM journal WHERE id = ?").bind(j).first()).outcome, '{"id":"c1"}');
  await op("journal_outcome", { id: j, outcome: { id: "c2" } }); // write-once: the first stays
  assert.equal((await env.DB.prepare("SELECT outcome FROM journal WHERE id = ?").bind(j).first()).outcome, '{"id":"c1"}');
  await env.DB.prepare("UPDATE posts SET permalink = NULL WHERE slot_id = 'w01-s1'").run();
  await op("set_permalink", { slot_id: "w01-s1", permalink: "https://p" });
  assert.equal((await op("post", { slot_id: "w01-s1" })).result.permalink, "https://p");
  await op("add_experiment", { id: "e1", week: "w01", variable: "hook", hypothesis: "h", primary_metric: "views", guardrail_metric: "reach", window_days: 7 });
  await op("decide_experiment", { id: "e1", verdict: "won", directional_only: true });
  assert.deepEqual(await env.DB.prepare("SELECT status, verdict, directional_only, min_samples FROM experiments WHERE id = 'e1'").first(), {
    status: "decided", verdict: "won", directional_only: 1, min_samples: 3,
  });
  const e = (await op("add_engage", { date: "2026-01-01", account: "@x", post_url: null, planned_at: null, comment: "hi" })).result;
  await op("tick_engage", { id: e });
  assert.equal((await env.DB.prepare("SELECT posted FROM engage_log WHERE id = ?").bind(e).first()).posted, 1);
  await op("add_cost", { kind: "render", amount: 1.5, unit: "min", post_id: "w01-s1" });
  await op("add_conversion", { source: "dm", event: "signup", occurred_at: "2026-01-01T00:00:00+00:00" });
  assert.equal((await env.DB.prepare("SELECT count(*) AS n FROM costs").first()).n, 1);
  assert.equal((await env.DB.prepare("SELECT count(*) AS n FROM conversions").first()).n, 1);
});

test("the clients row: grants in, columns out; the brand markdown with versions", async () => {
  assert.equal((await op("set_grants", { grants: { slots: ["06:30"], page_id: "x" }, emergency_stop: true })).status, 200);
  const row = (await op("client")).result;
  assert.deepEqual(row.grants, { slots: ["06:30"] }); // page_id is a column, not a grant
  assert.equal(row.emergency_stop, 1);
  assert.equal(row.page_id, null);
  assert.equal(row.token_enc, undefined);
  await op("set_grants", { grants: { slots: ["18:30"] } });
  assert.equal((await op("client")).result.emergency_stop, 1); // left alone when not given
  // every grants.yaml key that is a column stays out of the grants JSON
  await op("set_grants", { grants: { slots: ["06:30"], page_id: "p", ig_user_id: "u", ig_username: "n", emergency_stop: false, display_name: "R" } });
  assert.deepEqual((await op("client")).result.grants, { slots: ["06:30"] });
  // the stop is a boolean or nothing: "false" as a string is refused, not read as true
  assert.equal((await op("set_grants", { grants: {}, emergency_stop: "false" })).status, 400);
  assert.equal((await op("client")).result.emergency_stop, 1);
  assert.equal((await op("set_client_file", { name: "../brand.md", text: "x" })).status, 400);
  await op("set_client_file", { name: "brand.md", text: "# One" });
  await op("set_client_file", { name: "brand.md", text: "# Two" });
  const files = (await op("client_files")).result;
  assert.deepEqual(files.map((f) => [f.name, f.text, f.version, f.updated_by]), [["brand.md", "# Two", 2, 1]]);
});

test("follower import is one step and idempotent; dropped compares the newest two", async () => {
  const a = await op("import_followers", { taken_at: "2026-01-01T00:00:00+00:00", sha: "a", source: "a.zip", followers: ["ann", "bo", "cy"], following: ["zed"] });
  assert.equal(typeof a.result, "number");
  assert.equal((await op("import_followers", { taken_at: "2026-01-01T00:00:00+00:00", sha: "a", source: "a.zip", followers: ["ann"], following: null })).result, null);
  assert.equal((await env.DB.prepare("SELECT count(*) AS n FROM follower_members").first()).n, 4);
  const many = Array.from({ length: 120 }, (_, i) => `u${i}`);
  await op("import_followers", { taken_at: "2026-02-01T00:00:00+00:00", sha: "b", source: "b.zip", followers: ["ann", "cy", ...many], following: null });
  const d = (await op("follower_dropped")).result;
  assert.deepEqual(d, { snapshots: 2, since: "2026-01-01T00:00:00+00:00", at: "2026-02-01T00:00:00+00:00", followers: 122, dropped: ["bo"] });
  assert.equal((await env.DB.prepare("SELECT count(*) AS n FROM follower_members WHERE kind = 'follower'").first()).n, 125);
});
