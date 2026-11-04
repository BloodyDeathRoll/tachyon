// The dashboard pages (src/pages/) over HTTP with the `s` cookie, against the harness D1 and
// R2: membership, the overview, the video page and its POSTs (slot picking as
// tests/test_dashboard.py pins it), the player route. The two actions that call Meta (link
// by hand, remove) run `pages()` in Node with a scripted fetcher, as publish.test.mjs does.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { seal } from "../src/crypto.ts";
import { iso, OPS, setState } from "../src/db.ts";
import { pages } from "../src/pages/index.ts";
import { DEFAULT_SLOTS, nextFree } from "../src/pages/schedule.ts";
import { mint } from "../src/session.ts";
import { NOW, SECRET, start } from "./harness.mjs";

let mf;
let env;
const script = [];
const calls = [];
const fetcher = async (url, init = {}) => {
  calls.push({ method: init.method ?? "GET", url });
  const next = script.shift();
  if (!next) throw new Error(`unexpected fetch ${url}`);
  return new Response(JSON.stringify(next.body ?? {}), { status: next.status ?? 200 });
};

before(async () => {
  ({ mf, env } = await start());
  env = { ...env, TOKEN_SECRET: "token-secret" };
  await env.DB.prepare("UPDATE clients SET token_enc = ?, ig_user_id = '178', ig_username = 'rosa.surf' WHERE id = 'rosa'").bind(await seal("tok", "token-secret")).run();
});
after(() => mf.dispose());

const tokenFor = (id) => mint({ sub: String(id), exp: NOW + 3600_000, ep: 0 }, SECRET);
const ctx = () => ({ env, client: "rosa", by: 1, now: Date.now() });
const post = (slot) => env.DB.prepare("SELECT * FROM posts WHERE slot_id = ?").bind(slot).first();
const file = async (slot, name) => (await env.DB.prepare("SELECT text FROM post_files WHERE slot_id = ? AND name = ?").bind(slot, name).first())?.text;
const meta = async (slot) => JSON.parse((await file(slot, "meta.json")) ?? "{}");

/** GET or a form POST as a signed-in browser; `as: null` for no cookie. */
async function call(method, path, { as = 1, form, headers = {} } = {}) {
  if (as !== null) headers.Cookie = `s=${await tokenFor(as)}`;
  let body;
  if (form) {
    body = new URLSearchParams(form).toString();
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }
  const res = await mf.dispatchFetch(`http://t${path}`, { method, headers, body, redirect: "manual" });
  return { status: res.status, text: await res.text(), headers: res.headers };
}

/** A slot waiting for approval, with a caption and meta. */
async function waiting(slot, { scheduled_at = null, title = `Video ${slot}`, meta: m = {}, file: withFile = false, state = "NEEDS_APPROVAL" } = {}) {
  await OPS.create_post(ctx(), { slot_id: slot, fields: scheduled_at ? { scheduled_at } : {} });
  const chain = ["BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL"];
  for (const s of chain.slice(0, chain.indexOf(state) + 1)) await setState(ctx(), slot, s, null, {});
  await OPS.set_files(ctx(), { slot_id: slot, files: { "caption.txt": `Caption of ${slot}\n`, "meta.json": JSON.stringify({ title, ...m }) } });
  if (withFile) {
    await env.MEDIA.put(`rosa/${slot}/v.mp4`, "not really mp4");
    await env.MEDIA.put(`rosa/${slot}/c.jpg`, "jpg");
    await env.DB.prepare("UPDATE posts SET r2_key = ?, cover_key = ? WHERE slot_id = ?").bind(`rosa/${slot}/v.mp4`, `rosa/${slot}/c.jpg`, slot).run();
  }
}

/** pages() in Node for the Meta-backed actions: the same D1, a scripted fetcher. */
async function node(method, path, form) {
  const user = await env.DB.prepare("SELECT * FROM users WHERE id = 1").first();
  const req = new Request(`http://t${path}`, { method, body: form ? new URLSearchParams(form) : undefined });
  const res = await pages(req, env, { waitUntil() {} }, user, new URL(req.url), Date.now(), fetcher);
  return { status: res.status, text: await res.text(), headers: res.headers };
}

test("next_free skips taken slots and has no lead", () => {
  const at = Date.parse("2026-10-25T06:10:00Z");
  assert.equal(nextFree(new Set(), {}, at), "2026-10-25T06:30:00+00:00"); // 20 min ahead is still ahead
  assert.equal(nextFree(new Set(["2026-10-25T06:30:00+00:00"]), {}, at), "2026-10-25T18:30:00+00:00");
  assert.equal(nextFree(new Set(), {}, Date.parse("2026-10-25T06:30:00Z")), "2026-10-25T18:30:00+00:00"); // exactly now has passed
  assert.equal(nextFree(new Set(), { slots: ["23:00", "01:00"] }, at), "2026-10-25T23:00:00+00:00");
});

test("a non-member gets 403; /app sends a member to the first client", async () => {
  assert.equal((await call("GET", "/rosa", { as: 2 })).status, 403);
  assert.equal((await call("GET", "/rosa", { as: null })).status, 401);
  const r = await call("GET", "/app");
  assert.equal(r.status, 302);
  assert.equal(new URL(r.headers.get("Location")).pathname, "/rosa");
  assert.equal((await call("GET", "/app", { as: 2 })).status, 200); // no clients: a note
  assert.equal((await call("GET", "/rosa/nothing")).status, 404);
});

test("the overview lists a video under its state; the filter is a link", async () => {
  await waiting("a1", { title: "Reef hop", file: true });
  await waiting("p1", { title: "Already out" });
  for (const s of ["APPROVED", "QUEUED", "PUBLISHING"]) await setState(ctx(), "p1", s, null, {});
  await setState(ctx(), "p1", "PUBLISHED", null, { ig_media_id: "m1", permalink: "https://instagram.com/reel/m1", published_at: iso(Date.now() - 3600_000) });
  await setState(ctx(), "p1", "MEASURING", null, {});
  const r = await call("GET", "/rosa");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("Content-Security-Policy"), /script-src 'unsafe-inline'/);
  assert.match(r.text, /Reef hop/);
  assert.match(r.text, /Needs approval/);
  assert.match(r.text, /1 to approve/);
  assert.match(r.text, /\/m\/rosa\/a1\/cover/);
  assert.match(r.text, /Already out/);
  const live = await call("GET", "/rosa?f=live");
  assert.doesNotMatch(live.text, /Reef hop/);
  assert.match(live.text, /Already out/);
  assert.doesNotMatch(r.text, /Acme/); // alice is no member of acme: the switcher lists rosa alone
});

test("the video page: the caption, the R2 player until publish, the permalink after", async () => {
  const r = await call("GET", "/rosa/v/a1");
  assert.equal(r.status, 200);
  assert.match(r.text, /Caption of a1/);
  assert.match(r.text, /src='\/m\/rosa\/a1\/video'/);
  assert.match(r.text, /value=approve/);
  assert.match(r.text, /Save text/);
  assert.match(r.text, /<time datetime="/); // the preview slot, in the browser's zone
  const live = await call("GET", "/rosa/v/p1");
  assert.match(live.text, /https:\/\/instagram\.com\/reel\/m1/);
  assert.doesNotMatch(live.text, /\/m\/rosa\/p1\/video/);
  assert.doesNotMatch(live.text, /Save text/);
  assert.match(live.text, /Remove from Instagram/);
  assert.equal((await call("GET", "/rosa/v/nope")).status, 404);
  // a video still on a PC says so
  await waiting("h1");
  await env.DB.prepare("INSERT INTO media (client, slot_id, host, path) VALUES ('rosa', 'h1', 'pc-a', '/x/video.mp4')").run();
  assert.match((await call("GET", "/rosa/v/h1")).text, /on pc-a/);
  assert.match((await call("GET", "/rosa/v/h1/qa")).text, /qa\.md\) is on pc-a/);
});

test("approve: the next free slot, a planned slot kept, a passed or taken one refused", async () => {
  const r = await call("POST", "/rosa/v/a1/decide", { form: { action: "approve", notes: "" } });
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("Location"), "/rosa/v/a1");
  let row = await post("a1");
  assert.equal(row.state, "APPROVED");
  assert.ok(DEFAULT_SLOTS.includes(row.scheduled_at.slice(11, 16)), row.scheduled_at);
  assert.ok(Date.parse(row.scheduled_at) > Date.now());
  assert.equal((await env.DB.prepare("SELECT count(*) AS n FROM jobs WHERE kind = 'upload' AND slot_id = 'a1'").first()).n, 0); // the file is in R2 already
  assert.match((await call("GET", "/rosa")).text, /Scheduled/);
  // planned slot kept, however far
  await waiting("a2", { scheduled_at: "2099-01-05T18:30:00+00:00" });
  await call("POST", "/rosa/v/a2/decide", { form: { action: "approve" } });
  row = await post("a2");
  assert.equal(row.state, "APPROVED");
  assert.equal(row.scheduled_at, "2099-01-05T18:30:00+00:00");
  assert.equal((await env.DB.prepare("SELECT payload FROM jobs WHERE kind = 'upload' AND slot_id = 'a2'").first()).payload, null); // a host sends the file up
  // passed: refused, the operator reschedules
  await waiting("a3", { scheduled_at: "2020-01-01T06:30:00+00:00" });
  const passed = await call("POST", "/rosa/v/a3/decide", { form: { action: "approve" } });
  assert.equal(passed.status, 409);
  assert.match(passed.headers.get("Content-Type"), /text\/html/); // a page with the reason and a way back, not JSON
  assert.match(passed.text, /its slot has passed/);
  assert.match(passed.text, /href='\/rosa\/v\/a3'/);
  assert.equal((await post("a3")).state, "NEEDS_APPROVAL");
  // taken by a2
  await waiting("a4", { scheduled_at: "2099-01-05T18:30:00+00:00" });
  const taken = await call("POST", "/rosa/v/a4/decide", { form: { action: "approve" } });
  assert.equal(taken.status, 409);
  assert.match(taken.text, /its slot is taken/);
  // an unslotted video takes the slot the page showed
  await waiting("a5");
  const shown = /datetime="([^"]+)"/.exec((await call("GET", "/rosa/v/a5")).text)[1];
  await call("POST", "/rosa/v/a5/decide", { form: { action: "approve" } });
  assert.equal(Date.parse((await post("a5")).scheduled_at), Date.parse(shown));
});

test("reject needs a note and asks a PC for the re-render; revoke takes the approval back", async () => {
  await waiting("r1", { meta: { film: { engine: "html" } } });
  assert.equal((await call("POST", "/rosa/v/r1/decide", { form: { action: "reject", notes: " " } })).status, 400);
  assert.equal((await call("POST", "/rosa/v/r1/decide", { form: { action: "reject", notes: "faster please" } })).status, 303);
  assert.equal((await post("r1")).state, "REJECTED");
  const job = await env.DB.prepare("SELECT * FROM jobs WHERE kind = 'revise' AND slot_id = 'r1'").first();
  assert.deepEqual(JSON.parse(job.payload), { argv: ["spine.revise", "run", "rosa", "r1"], notes: "faster please" });
  assert.equal(job.by, 1);
  assert.match((await call("GET", "/rosa/v/r1")).text, /waiting for a PC/);
  assert.match((await call("GET", "/rosa")).text, /Re-rendering/); // queued counts: app.py wrote "running" on fork
  assert.equal((await call("POST", "/rosa/v/a1/decide", { form: { action: "revoke" } })).status, 303);
  assert.equal((await post("a1")).state, "NEEDS_APPROVAL");
  await call("POST", "/rosa/v/a1/decide", { form: { action: "approve" } });
});

test("the caption and first comment edit until PUBLISHING, then CAPTION_LOCKED", async () => {
  const r = await call("POST", "/rosa/v/a1/decide", { form: { action: "caption", caption: "new text\r\n\r\nline two " } });
  assert.equal(r.status, 303);
  assert.equal(await file("a1", "caption.txt"), "new text\n\nline two\n");
  assert.equal((await call("POST", "/rosa/v/a1/decide", { form: { action: "first_comment", first_comment: "Which spot next?" } })).status, 303);
  assert.equal(await file("a1", "first_comment.txt"), "Which spot next?\n");
  assert.equal((await call("POST", "/rosa/v/a1/decide", { form: { action: "caption", caption: "x".repeat(2201) } })).status, 400);
  await setState(ctx(), "a1", "QUEUED", null, {});
  await setState(ctx(), "a1", "PUBLISHING", null, {});
  const locked = await call("POST", "/rosa/v/a1/decide", { form: { action: "caption", caption: "x" } });
  assert.equal(locked.status, 409);
  assert.match(locked.text, /too late/);
  assert.equal((await call("POST", "/rosa/v/a1/decide", { form: { action: "revoke" } })).status, 409);
  assert.match((await call("GET", "/rosa/v/a1")).text, /Publishing…/);
});

test("publish now moves the slot to now and queues it; pause and resume", async () => {
  await waiting("n1");
  assert.equal((await call("POST", "/rosa/v/n1/decide", { form: { action: "publish_now" } })).status, 409); // approve it first
  assert.equal((await call("POST", "/rosa/v/a2/decide", { form: { action: "publish_now" } })).status, 303);
  let row = await post("a2");
  assert.equal(row.state, "QUEUED");
  assert.ok(Date.parse(row.scheduled_at) <= Date.now());
  assert.match((await call("GET", "/rosa/v/a2")).text, /Publishing…/); // due: the cron's within the minute
  await env.DB.prepare("UPDATE posts SET scheduled_at = '2099-01-05T06:30:00+00:00' WHERE slot_id = 'a2'").run();
  assert.equal((await call("POST", "/rosa/v/a2/decide", { form: { action: "pause" } })).status, 303);
  assert.equal((await post("a2")).state, "PAUSED");
  assert.match((await call("GET", "/rosa/v/a2")).text, /On hold/);
  assert.equal((await call("POST", "/rosa/v/a2/decide", { form: { action: "resume" } })).status, 303);
  row = await post("a2");
  assert.equal(row.state, "QUEUED");
  assert.equal(row.scheduled_at, "2099-01-05T06:30:00+00:00"); // not late: the slot stands
  assert.equal((await call("POST", "/rosa/v/a2/decide", { form: { action: "resume" } })).status, 409);
  // a custom time in the browser's zone (tz = minutes behind UTC, as getTimezoneOffset gives it)
  assert.equal((await call("POST", "/rosa/v/a2/decide", { form: { action: "custom", at: "2031-05-04T09:17", tz: "-120" } })).status, 303);
  assert.equal((await post("a2")).scheduled_at, "2031-05-04T07:17:00+00:00");
  assert.equal((await call("POST", "/rosa/v/a2/decide", { form: { action: "custom", at: "2001-01-01T00:00", tz: "0" } })).status, 400);
  assert.equal((await call("POST", "/rosa/v/n1/decide", { form: { action: "custom", at: "2031-05-04T07:17", tz: "0" } })).status, 409); // a2 holds it
});

test("the AI label and the replies override live in meta.json", async () => {
  await waiting("l1");
  assert.equal((await call("POST", "/rosa/v/l1/ailabel", { form: { value: "1" } })).status, 303);
  assert.equal((await meta("l1")).is_ai_generated, true);
  assert.match((await call("GET", "/rosa/v/l1")).text, /toggle on'[^>]*aria-label='AI label'/);
  await call("POST", "/rosa/v/l1/ailabel", { form: { value: "0" } });
  assert.equal((await meta("l1")).is_ai_generated, false);
  assert.equal((await meta("l1")).title, "Video l1"); // the rest of meta.json stays
  assert.equal((await call("POST", "/rosa/v/a1/ailabel", { form: { value: "1" } })).status, 409); // PUBLISHING
  assert.equal((await call("POST", "/rosa/v/l1/replies", { form: { comments: "1" } })).status, 400); // custom first
  await call("POST", "/rosa/v/l1/replies", { form: { custom: "1" } });
  await call("POST", "/rosa/v/l1/replies", { form: { comments: "1" } });
  assert.deepEqual((await meta("l1")).replies, { custom: true, comments: true, dm: false });
});

test("Generate New, the formats and the caption writer are jobs with the argv a host allows", async () => {
  await waiting("g1");
  const r = await call("POST", "/rosa/v/g1/decide", { form: { action: "generate", prompt: "lead with the swell map", engine: "remotion" } });
  assert.equal(r.status, 303);
  assert.equal((await post("g1")).state, "SCRIPTED");
  const job = await env.DB.prepare("SELECT * FROM jobs WHERE kind = 'produce' AND slot_id = 'g1'").first();
  assert.deepEqual(JSON.parse(job.payload), { argv: ["spine.manual", "produce", "rosa", "g1"], prompt: "lead with the swell map", engine: "remotion" });
  assert.equal(job.by, 1);
  assert.equal(job.state, "queued");
  const m = await meta("g1");
  assert.equal(m.engine_choice, "remotion");
  assert.equal(m.source, "prompt");
  assert.equal((await call("POST", "/rosa/v/g1/decide", { form: { action: "generate" } })).status, 409); // already being made
  assert.match((await call("GET", "/rosa")).text, /In production/);
  assert.equal((await call("POST", "/rosa/v/g1/delete")).status, 409); // a job is open for it
  // a failed job shows its error and offers a re-run
  await env.DB.prepare("UPDATE jobs SET state = 'failed', result = ?, holder = 'pc-a' WHERE id = ?").bind(JSON.stringify("exit 1: boom"), job.id).run();
  await setState(ctx(), "g1", "RENDERED", null, {});
  await setState(ctx(), "g1", "QA", null, {});
  await setState(ctx(), "g1", "NEEDS_APPROVAL", null, {});
  const page = await call("GET", "/rosa/v/g1");
  assert.match(page.text, /Making it failed/);
  assert.match(page.text, /boom/);
  assert.match(page.text, /value=retry/);
  await call("POST", "/rosa/v/g1/decide", { form: { action: "retry" } });
  assert.equal((await env.DB.prepare("SELECT count(*) AS n FROM jobs WHERE kind = 'produce' AND slot_id = 'g1' AND state = 'queued'").first()).n, 1);
  await env.DB.prepare("UPDATE jobs SET state = 'done' WHERE slot_id = 'g1'").run();
  await call("POST", "/rosa/v/g1/formats", { form: { r: "4x5" } });
  const f = await env.DB.prepare("SELECT payload FROM jobs WHERE kind = 'formats' AND slot_id = 'g1'").first();
  assert.deepEqual(JSON.parse(f.payload), { argv: ["spine.formats", "make", "rosa", "g1", "4x5"] });
  await OPS.set_files(ctx(), { slot_id: "g1", files: { "caption.txt": "" } });
  await env.DB.prepare("INSERT INTO media (client, slot_id, host, path) VALUES ('rosa', 'g1', 'pc-a', '/x')").run();
  await call("POST", "/rosa/v/g1/decide", { form: { action: "gencaption" } });
  const c = await env.DB.prepare("SELECT payload FROM jobs WHERE kind = 'caption' AND slot_id = 'g1'").first();
  assert.deepEqual(JSON.parse(c.payload), { argv: ["spine.caption", "write", "rosa", "g1"] });
  assert.match((await call("GET", "/rosa/v/g1")).text, /Writing the post text/);
  // Prepare next week: one plan job, asked twice
  await call("POST", "/rosa/week", { form: { week: "2031-W10", instructions: "airy", engine: "html" } });
  await call("POST", "/rosa/week", { form: { week: "2031-W10", instructions: "airy", engine: "html" } });
  const plans = (await env.DB.prepare("SELECT payload, by FROM jobs WHERE kind = 'plan'").all()).results;
  assert.equal(plans.length, 1);
  assert.deepEqual(JSON.parse(plans[0].payload), { argv: ["spine.week", "prepare", "rosa", "2031-W10"], instructions: "airy", engine: "html" });
});

test("delete drops the R2 objects and the rows; a live video cannot be deleted", async () => {
  await waiting("d1", { file: true });
  const r = await call("POST", "/rosa/v/d1/delete");
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("Location"), "/rosa");
  assert.equal(await post("d1"), null);
  assert.equal(await file("d1", "caption.txt"), undefined);
  assert.equal(await env.MEDIA.head("rosa/d1/v.mp4"), null);
  assert.equal(await env.MEDIA.head("rosa/d1/c.jpg"), null);
  assert.equal((await call("POST", "/rosa/v/p1/delete")).status, 409);
  assert.equal((await call("POST", "/rosa/v/zzz/delete")).status, 404);
});

test("remove live: the Graph DELETE, journaled, REMOVED; already gone counts as removed", async () => {
  script.push({ body: { success: true } });
  let r = await node("POST", "/rosa/v/p1/remove", {});
  assert.equal(r.status, 303);
  assert.equal(calls.at(-1).method, "DELETE");
  assert.match(calls.at(-1).url, /\/m1\?access_token=tok$/);
  assert.equal((await post("p1")).state, "REMOVED");
  const j = await env.DB.prepare("SELECT intent, outcome, by FROM journal WHERE target = 'p1' AND action = 'meta.media.delete'").first();
  assert.deepEqual([JSON.parse(j.intent), JSON.parse(j.outcome), j.by], [{ media: "m1" }, { success: true }, 1]);
  // taken down by hand in the app: Meta answers 100/33 to the delete and to a lookup
  await waiting("p2");
  for (const s of ["APPROVED", "QUEUED", "PUBLISHING"]) await setState(ctx(), "p2", s, null, {});
  await setState(ctx(), "p2", "PUBLISHED", null, { ig_media_id: "m2", published_at: iso(Date.now()) });
  const gone = { status: 400, body: { error: { code: 100, error_subcode: 33, message: "does not exist" } } };
  script.push(gone, gone);
  r = await node("POST", "/rosa/v/p2/remove", {});
  assert.equal(r.status, 303);
  assert.equal((await post("p2")).state, "REMOVED");
  // a refusal that is not "gone" leaves it live
  await waiting("p3");
  for (const s of ["APPROVED", "QUEUED", "PUBLISHING"]) await setState(ctx(), "p3", s, null, {});
  await setState(ctx(), "p3", "PUBLISHED", null, { ig_media_id: "m3", published_at: iso(Date.now()) });
  script.push({ status: 400, body: { error: { code: 10, message: "no permission" } } }, { body: { id: "m3" } });
  r = await node("POST", "/rosa/v/p3/remove", {});
  assert.equal(r.status, 409);
  assert.equal((await post("p3")).state, "PUBLISHED");
  assert.equal((await node("POST", "/rosa/v/n1/remove", {})).status, 409); // not live
  assert.equal(script.length, 0);
});

test("link by hand: the recent unlinked reels, the best match, then PUBLISHED and MEASURING", async () => {
  await waiting("b1");
  await OPS.set_files(ctx(), { slot_id: "b1", files: { "caption.txt": "Morning glass at Shonan with the whole crew" } });
  const list = { body: { data: [
    { id: "m1", caption: "linked already", timestamp: "2030-01-01T06:31:00+0000", permalink: "https://instagram.com/reel/m1" },
    { id: "m9", caption: "Glass morning, whole crew at Shonan", timestamp: "2030-01-02T06:31:00+0000", permalink: "https://instagram.com/reel/m9", thumbnail_url: "https://cdn/t.jpg" },
    { id: "m8", caption: "Other", timestamp: "2030-01-03T06:31:00+0000", permalink: "https://instagram.com/reel/m8" },
  ] } };
  script.push(list);
  let r = await node("GET", "/rosa/v/b1/byhand");
  assert.equal(r.status, 200);
  assert.doesNotMatch(r.text, /value='m1'/); // p1's
  assert.match(r.text, /value='m9'/);
  assert.match(r.text, /value='m9'[\s\S]*Best match|Best match[\s\S]*value='m9'/);
  assert.match(calls.at(-1).url, /\/178\/media\?/);
  script.push(list);
  assert.equal((await node("POST", "/rosa/v/b1/byhand", { media: "m7" })).status, 400);
  script.push(list);
  r = await node("POST", "/rosa/v/b1/byhand", { media: "m9" });
  assert.equal(r.status, 303);
  const row = await post("b1");
  assert.equal(row.state, "MEASURING");
  assert.equal(row.ig_media_id, "m9");
  assert.equal(row.permalink, "https://instagram.com/reel/m9");
  assert.equal(row.published_at, "2030-01-02T06:31:00+00:00");
  assert.equal((await node("POST", "/rosa/v/b1/byhand", { media: "m9" })).status, 303); // a double click: nothing to do
  assert.match((await node("GET", "/rosa/v/b1/byhand")).text, /already published/);
  // Meta down: the page says so
  await waiting("b2");
  script.push({ status: 500, body: { error: { code: 1, message: "down" } } });
  assert.match((await node("GET", "/rosa/v/b2/byhand")).text, /Could not reach Instagram/);
  assert.equal(script.length, 0);
});

test("/m/<client>/<slot>/video streams for a member with the cookie, 401 without, and seeks", async () => {
  await waiting("v1", { file: true });
  const r = await call("GET", "/m/rosa/v1/video");
  assert.equal(r.status, 200);
  assert.equal(r.text, "not really mp4");
  assert.equal(r.headers.get("Content-Type"), "video/mp4");
  assert.equal(r.headers.get("Accept-Ranges"), "bytes");
  assert.equal((await call("GET", "/m/rosa/v1/video", { as: null })).status, 401);
  assert.equal((await call("GET", "/m/rosa/v1/video", { as: 2 })).status, 403);
  assert.equal((await call("GET", "/m/rosa/v1/cover")).text, "jpg");
  assert.equal((await call("PUT", "/m/rosa/v1/video")).status, 404); // GET only here; PUT is the API's
  const part = await call("GET", "/m/rosa/v1/video", { headers: { Range: "bytes=4-9" } });
  assert.equal(part.status, 206);
  assert.equal(part.text, "really");
  assert.equal(part.headers.get("Content-Range"), "bytes 4-9/14");
  assert.equal(part.headers.get("Content-Length"), "6");
});
