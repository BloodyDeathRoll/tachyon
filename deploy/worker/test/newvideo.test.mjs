// A new video from the calendar (src/pages/newvideo.ts) over HTTP with the `s` cookie: a
// prompt as a `produce` job on a booked slot, an upload into R2 with its `spec` job, and
// approve waiting for that job (src/pages/video.ts).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mint } from "../src/session.ts";
import { NOW, SECRET, start } from "./harness.mjs";

let mf;
let env;

before(async () => {
  ({ mf, env } = await start());
});
after(() => mf.dispose());

const tokenFor = (id) => mint({ sub: String(id), exp: NOW + 3600_000, ep: 0 }, SECRET);
const post = (slot) => env.DB.prepare("SELECT * FROM posts WHERE slot_id = ?").bind(slot).first();
const file = async (slot, name) => (await env.DB.prepare("SELECT text FROM post_files WHERE slot_id = ? AND name = ?").bind(slot, name).first())?.text;
const job = (kind, slot) => env.DB.prepare("SELECT * FROM jobs WHERE kind = ? AND slot_id = ? ORDER BY id DESC").bind(kind, slot).first();

async function call(method, path, { form, raw, headers = {} } = {}) {
  headers.Cookie = `s=${await tokenFor(1)}`;
  let body = raw;
  if (form) {
    body = new URLSearchParams(form).toString();
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }
  const res = await mf.dispatchFetch(`http://t${path}`, { method, headers, body, redirect: "manual" });
  return { status: res.status, text: await res.text(), headers: res.headers };
}

const AT = "2099-01-05T06:30:00+00:00";
const AT2 = "2099-01-05T18:30:00+00:00";
const upload = (at, name, bytes) => call("POST", `/rosa/new/upload?at=${encodeURIComponent(at)}&name=${encodeURIComponent(name)}`, { raw: bytes, headers: { "Content-Length": String(bytes.length) } });

test("the add box opens for ?add=<slot>; a prompt books the slot and asks a PC to produce it", async () => {
  const cal = await call("GET", "/rosa/calendar?w=2099-W02");
  assert.match(cal.text, /id=addnew hidden/);
  assert.match(cal.text, /<form id=addup data-c='rosa'>/);
  assert.match(cal.text, /<form id=addgen method=post action='\/rosa\/new' hidden><input type=hidden name=at>/);
  assert.match(cal.text, /data-add='2099-01-05T06:30:00\+00:00'>\+ Add new/);
  assert.doesNotMatch((await call("GET", "/rosa/calendar?w=2001-W02")).text, /data-add=/); // passed
  const r = await call("POST", "/rosa/new", { form: { at: AT, prompt: " particles over the swell chart ", engine: "remotion" } });
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("Location"), "/rosa/v/2099-w02-01");
  const row = await post("2099-w02-01");
  assert.equal(row.state, "BRIEFED");
  assert.equal(row.scheduled_at, AT);
  assert.equal(row.angle, "New video");
  assert.equal(row.engine, "remotion");
  const j = await job("produce", "2099-w02-01");
  assert.deepEqual(JSON.parse(j.payload), { argv: ["spine.manual", "produce", "rosa", "2099-w02-01"], prompt: "particles over the swell chart", engine: "remotion" });
  assert.equal(j.by, 1);
  const meta = JSON.parse(await file("2099-w02-01", "meta.json"));
  assert.deepEqual(meta, { slot_id: "2099-w02-01", title: "New video", source: "prompt", plan: "manual", engine_choice: "remotion" });
  assert.match((await call("GET", "/rosa/v/2099-w02-01")).text, /In production/);
  // the slot is taken now; the past and a time off the schedule are refused; an unknown engine is Claude
  const taken = await call("POST", "/rosa/new", { form: { at: AT, prompt: "x" } });
  assert.equal(taken.status, 400);
  assert.match(taken.text, /that slot is taken/);
  assert.equal((await call("POST", "/rosa/new", { form: { at: "2000-01-03T06:30:00+00:00" } })).status, 400);
  assert.equal((await call("POST", "/rosa/new", { form: { at: "2099-01-05T07:00:00+00:00" } })).status, 400);
  assert.equal((await call("POST", "/rosa/new", { form: { at: "nope" } })).status, 400);
  assert.equal((await call("POST", "/rosa/new", { form: { at: AT2, engine: "gif" } })).status, 303);
  assert.equal((await post("2099-w02-02")).engine, "html");
  assert.equal(JSON.parse((await job("produce", "2099-w02-02")).payload).engine, "html");
  const journal = (await env.DB.prepare("SELECT action, json_extract(intent, '$.to') AS t FROM journal WHERE target = '2099-w02-01' ORDER BY id").all()).results;
  assert.deepEqual(journal.map((x) => [x.action, x.t]), [["post.create", null], ["post.state", "BRIEFED"]]);
  // one batch: a write that fails partway leaves no row, no job, and the slot free
  await env.DB.prepare("INSERT INTO post_files (client, slot_id, name, text, updated_at) VALUES ('rosa', '2099-w02-03', 'meta.json', 'stray', 0)").run();
  assert.equal((await call("POST", "/rosa/new", { form: { at: "2099-01-07T06:30:00+00:00", prompt: "x" } })).status, 500);
  assert.equal(await post("2099-w02-03"), null);
  assert.equal(await job("produce", "2099-w02-03"), null);
  assert.equal((await env.DB.prepare("SELECT count(*) AS n FROM journal WHERE target = '2099-w02-03'").first()).n, 0);
  await env.DB.prepare("DELETE FROM post_files WHERE slot_id = '2099-w02-03'").run();
});

test("an upload streams into R2, lands in Needs approval with a spec job; approve waits for the check", async () => {
  const at = "2099-01-06T06:30:00+00:00";
  const r = await upload(at, "My_clip-01.MOV", "not really a video");
  assert.equal(r.status, 303, r.text);
  assert.equal(r.headers.get("Location"), "/rosa/v/2099-w02-03");
  const slot = "2099-w02-03";
  const row = await post(slot);
  assert.equal(row.state, "NEEDS_APPROVAL");
  assert.equal(row.scheduled_at, at);
  assert.equal(row.angle, "My clip 01");
  assert.equal(row.engine, "upload");
  assert.match(row.r2_key, /^rosa\/2099-w02-03\/[0-9a-f]{32}\.mp4$/);
  assert.equal(await (await env.MEDIA.get(row.r2_key)).text(), "not really a video");
  const meta = JSON.parse(await file(slot, "meta.json"));
  assert.equal(meta.upload, `uploads/${slot}.mp4`);
  assert.equal(meta.uploaded_name, "My_clip-01.MOV");
  assert.equal(meta.source, "upload");
  assert.equal(await file(slot, "caption.txt"), "");
  assert.deepEqual(await env.DB.prepare("SELECT host, path, size FROM media WHERE slot_id = ?").bind(slot).first(), { host: "", path: "My_clip-01.MOV", size: 18 });
  const spec = await job("spec", slot);
  assert.equal(spec.payload, null);
  assert.equal(spec.state, "queued");
  const walk = (await env.DB.prepare("SELECT json_extract(intent, '$.to') AS t FROM journal WHERE target = ? AND action = 'post.state' ORDER BY id").bind(slot).all()).results.map((x) => x.t);
  assert.deepEqual(walk, ["BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL"]);
  const page = await call("GET", `/rosa/v/${slot}`);
  assert.match(page.text, /src='\/m\/rosa\/2099-w02-03\/video'/);
  assert.match(page.text, /value=approve/);
  // approve: not before a PC checked the file, not with issues, then yes
  let a = await call("POST", `/rosa/v/${slot}/decide`, { form: { action: "approve" } });
  assert.equal(a.status, 409);
  assert.match(a.text, /not checked the file yet/);
  await env.DB.prepare("UPDATE jobs SET state = 'done', result = ? WHERE id = ?").bind(JSON.stringify({ issues: ["video codec vp9, want h264"] }), spec.id).run();
  a = await call("POST", `/rosa/v/${slot}/decide`, { form: { action: "approve" } });
  assert.equal(a.status, 409);
  assert.match(a.text, /Instagram would refuse this file: video codec vp9, want h264/);
  assert.equal((await post(slot)).state, "NEEDS_APPROVAL");
  await env.DB.prepare("UPDATE jobs SET result = ? WHERE id = ?").bind(JSON.stringify({ issues: [] }), spec.id).run();
  a = await call("POST", `/rosa/v/${slot}/decide`, { form: { action: "approve" } });
  assert.equal(a.status, 303);
  assert.equal((await post(slot)).state, "APPROVED");
  assert.equal(await job("upload", slot), null); // the file is in R2 already
});

test("a refused upload leaves no row: not a video, a taken slot, no body", async () => {
  const at = "2099-01-06T18:30:00+00:00";
  const bad = await upload(at, "notes.txt", "x");
  assert.equal(bad.status, 400);
  assert.match(bad.text, /not a video file: notes.txt/);
  assert.equal((await upload("2099-01-06T06:30:00+00:00", "a.mp4", "x")).status, 400); // 2099-w02-03 holds it
  const empty = await call("POST", `/rosa/new/upload?at=${encodeURIComponent(at)}&name=a.mp4`);
  assert.equal(empty.status, 411);
  assert.equal(await post("2099-w02-04"), null);
  assert.equal((await env.DB.prepare("SELECT count(*) AS n FROM journal WHERE target = '2099-w02-04'").first()).n, 0);
  assert.equal((await env.DB.prepare("SELECT count(*) AS n FROM jobs WHERE kind = 'spec'").first()).n, 1);
  // a failure after the file is in R2 takes the file and the rows back out
  await env.DB.prepare("INSERT INTO post_files (client, slot_id, name, text, updated_at) VALUES ('rosa', '2099-w02-04', 'meta.json', 'stray', 0)").run();
  assert.equal((await upload(at, "a.mp4", "ok")).status, 500);
  assert.equal(await post("2099-w02-04"), null);
  assert.equal((await env.MEDIA.list({ prefix: "rosa/2099-w02-04/" })).objects.length, 0);
  assert.equal((await env.DB.prepare("SELECT count(*) AS n FROM media WHERE slot_id = '2099-w02-04'").first()).n, 0);
  assert.equal((await env.DB.prepare("SELECT count(*) AS n FROM journal WHERE target = '2099-w02-04'").first()).n, 0);
  assert.equal((await env.DB.prepare("SELECT count(*) AS n FROM jobs WHERE kind = 'spec'").first()).n, 1);
  await env.DB.prepare("DELETE FROM post_files WHERE slot_id = '2099-w02-04'").run();
  // the slot is still free
  assert.equal((await upload(at, "a.mp4", "ok")).status, 303);
  assert.equal((await post("2099-w02-04")).state, "NEEDS_APPROVAL");
});
