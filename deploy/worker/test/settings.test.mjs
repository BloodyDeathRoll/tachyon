// Settings (src/pages/settings.ts): the switches and the emergency stop into the grants, the
// posting times (as tests/test_dashboard_v3.py pins them), and Sync running the cron's pickup
// once (pages() in Node with a scripted fetcher, as pages.test.mjs does for Meta).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { seal } from "../src/crypto.ts";
import { pages } from "../src/pages/index.ts";
import { freeTime, scheduleCard } from "../src/pages/settings.ts";
import { mint } from "../src/session.ts";
import { NOW, SECRET, start } from "./harness.mjs";

let mf;
let env;
const script = [];
const fetcher = async (url) => {
  const next = script.shift();
  if (!next) throw new Error(`unexpected fetch ${url}`);
  if (next.throw) throw new Error("down");
  return new Response(JSON.stringify(next.body ?? {}), { status: next.status ?? 200 });
};

before(async () => {
  ({ mf, env } = await start());
  env = { ...env, TOKEN_SECRET: "token-secret" };
});
after(() => mf.dispose());

const tokenFor = (id) => mint({ sub: String(id), exp: NOW + 3600_000, ep: 0 }, SECRET);
const client = () => env.DB.prepare("SELECT grants, emergency_stop FROM clients WHERE id = 'rosa'").first().then((r) => ({ ...r, grants: JSON.parse(r.grants) }));

async function call(method, path, { form, headers = {} } = {}) {
  headers.Cookie = `s=${await tokenFor(1)}`;
  let body;
  if (form) {
    body = new URLSearchParams(form).toString();
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }
  const res = await mf.dispatchFetch(`http://t${path}`, { method, headers, body, redirect: "manual" });
  return { status: res.status, text: await res.text(), headers: res.headers };
}

async function node(method, path, form) {
  const user = await env.DB.prepare("SELECT * FROM users WHERE id = 1").first();
  const req = new Request(`http://t${path}`, { method, body: form ? new URLSearchParams(form) : undefined });
  const res = await pages(req, env, { waitUntil() {} }, user, new URL(req.url), Date.now(), fetcher);
  return { status: res.status, text: await res.text(), headers: res.headers };
}

test("the switches flip the grants; the emergency stop shows on every page; anything else is 400", async () => {
  const page = await call("GET", "/rosa/settings");
  assert.equal(page.status, 200);
  assert.match(page.text, /Reply to comments/);
  assert.match(page.text, /name=flag value='auto_reply.comments'><input type=hidden name=value value='1'><button class='btn sec'>Off/);
  assert.match(page.text, /Stop everything/);
  let r = await call("POST", "/rosa/flag", { form: { flag: "auto_reply.comments", value: "1" } });
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("Location"), "/rosa/settings");
  assert.deepEqual((await client()).grants.auto_reply, { comments: true });
  assert.match((await call("GET", "/rosa/settings")).text, /name=value value='0'><button class='btn pri'>On/);
  await call("POST", "/rosa/flag", { form: { flag: "auto_reply.dm", value: "1" } });
  await call("POST", "/rosa/flag", { form: { flag: "auto_reply.comments", value: "0" } });
  assert.deepEqual((await client()).grants.auto_reply, { comments: false, dm: true });
  r = await call("POST", "/rosa/flag", { form: { flag: "emergency_stop", value: "1" } });
  assert.equal(r.status, 303);
  assert.equal((await client()).emergency_stop, 1);
  assert.match((await call("GET", "/rosa")).text, /Emergency stop is on/);
  assert.match((await call("GET", "/rosa/settings")).text, /Resume/);
  await call("POST", "/rosa/flag", { form: { flag: "emergency_stop", value: "0" } });
  assert.equal((await client()).emergency_stop, 0);
  assert.deepEqual((await client()).grants.auto_reply, { comments: false, dm: true }); // the stop left the rest alone
  const bad = await call("POST", "/rosa/flag", { form: { flag: "page_id", value: "1" } });
  assert.equal(bad.status, 400);
  assert.match(bad.text, /not a switch: page_id/);
});

test("the posting times: shown local, stored UTC; add fills the longest gap; never below one, at most six", async () => {
  // the card sits on the Overview, as app.py's schedule_card
  const card = async () => scheduleCard({ client: { id: "rosa", grants: (await client()).grants } });
  const form = /<form method=post action='\/rosa\/schedule'>[\s\S]*?<\/form>/.exec(await card())[0];
  assert.match(form, /name=t value='06:30' data-utc='06:30'/);
  assert.match(/<button[^>]*>/.exec(form)[0], /name=save/); // Enter in a field submits the first button: Save, not a remove
  let r = await call("POST", "/rosa/schedule", { form: { t1: "19:00", t2: "07:15", tz: "-120" } }); // two hours ahead of UTC
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("Location"), "/rosa");
  assert.deepEqual((await client()).grants.slots, ["05:15", "17:00"]);
  assert.match(await card(), /value='05:15'/);
  assert.equal((await call("POST", "/rosa/schedule", { form: { t1: "7pm", t2: "07:15" } })).status, 400);
  assert.equal((await call("POST", "/rosa/schedule", { form: { t1: "07:15", t2: "07:15" } })).status, 400);
  assert.deepEqual((await client()).grants.slots, ["05:15", "17:00"]); // the refusals changed nothing
  // the browser's form posts every time as `t`
  const body = new URLSearchParams([["t", "06:30"], ["add", "1"], ["tz", "0"]]).toString();
  r = await call("POST", "/rosa/schedule", { form: body });
  assert.equal(r.status, 303);
  assert.deepEqual((await client()).grants.slots, ["06:30", "18:30"]); // longest gap: the opposite side of the day
  await call("POST", "/rosa/schedule", { form: { t1: "06:30", t2: "12:00", t3: "18:30", tz: "0" } });
  assert.deepEqual((await client()).grants.slots, ["06:30", "12:00", "18:30"]);
  assert.match((await call("GET", "/rosa")).text, /Three times a day/);
  await call("POST", "/rosa/schedule", { form: { t1: "06:30", t2: "12:00", t3: "18:30", remove: "1", tz: "0" } });
  assert.deepEqual((await client()).grants.slots, ["06:30", "18:30"]);
  await call("POST", "/rosa/schedule", { form: { t1: "06:30", remove: "0", tz: "0" } });
  assert.deepEqual((await client()).grants.slots, ["06:30"]);
  const six = Object.fromEntries(["00:00", "04:00", "08:00", "12:00", "16:00", "20:00"].map((t, i) => [`t${i + 1}`, t]));
  assert.equal((await call("POST", "/rosa/schedule", { form: { ...six, add: "1" } })).status, 400);
  assert.equal((await call("POST", "/rosa/schedule", { form: { tz: "0" } })).status, 400); // nothing kept
  // remove counts the rows as the page shows them, an emptied field included
  await call("POST", "/rosa/schedule", { form: new URLSearchParams([["t", "06:30"], ["t", ""], ["t", "18:30"], ["remove", "2"], ["tz", "0"]]).toString() });
  assert.deepEqual((await client()).grants.slots, ["06:30"]);
  await call("POST", "/rosa/schedule", { form: new URLSearchParams([["t", "06:30"], ["t", ""], ["t", "18:30"], ["remove", "1"], ["tz", "0"]]).toString() });
  assert.deepEqual((await client()).grants.slots, ["06:30", "18:30"]);
  // a day wraps
  await call("POST", "/rosa/schedule", { form: { t1: "01:00", tz: "-120" } });
  assert.deepEqual((await client()).grants.slots, ["23:00"]);
  assert.equal(freeTime(["06:30", "18:30"]), "00:30");
  assert.equal(freeTime([]), "18:30");
  assert.equal(freeTime(["00:00", "00:15", "00:30"]), "12:15");
});

test("Sync runs the cron's pickup once under the publish lease and reports on the overview", async () => {
  assert.equal((await node("POST", "/rosa/sync", {})).status, 409); // not connected
  await env.DB.prepare("UPDATE clients SET token_enc = ?, ig_user_id = '178' WHERE id = 'rosa'").bind(await seal("tok", "token-secret")).run();
  script.push({ body: { data: [{ id: "m-new", caption: "A fresh one.", timestamp: "2030-03-10T09:30:00+0000", permalink: "https://instagram.com/reel/m-new", media_product_type: "REELS" }] } });
  const r = await node("POST", "/rosa/sync", {});
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("Location"), "/rosa?synced=1-0#sync");
  const row = await env.DB.prepare("SELECT state, ig_media_id FROM posts WHERE slot_id = '2030-w10-01'").first();
  assert.deepEqual(row, { state: "MEASURING", ig_media_id: "m-new" });
  assert.equal((await env.DB.prepare("SELECT until FROM leases WHERE name = 'publish:rosa'").first()).until, 0); // released
  const page = await call("GET", "/rosa?synced=1-0");
  assert.match(page.text, /1 video added\./);
  assert.match(page.text, /action='\/rosa\/sync'/);
  assert.match((await call("GET", "/rosa?synced=0-2")).text, /Nothing new\.[\s\S]*2 could not be checked/);
  // the cron holds the lease: not now
  await env.DB.prepare("UPDATE leases SET holder = 'cron', until = ? WHERE name = 'publish:rosa'").bind(Date.now() + 50_000).run();
  const busy = await node("POST", "/rosa/sync", {});
  assert.equal(busy.status, 409);
  assert.match(busy.text, /publisher is running/);
  await env.DB.prepare("UPDATE leases SET until = 0 WHERE name = 'publish:rosa'").run();
  // Meta down: the card says so, the lease is released
  script.push({ throw: true });
  const down = await node("POST", "/rosa/sync", {});
  assert.equal(down.headers.get("Location"), "/rosa?synced=err#sync");
  assert.match((await call("GET", "/rosa?synced=err")).text, /Could not reach Instagram/);
  assert.equal((await env.DB.prepare("SELECT until FROM leases WHERE name = 'publish:rosa'").first()).until, 0);
  assert.equal(script.length, 0);
});
