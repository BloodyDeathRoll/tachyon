// A new client's setup (src/pages/setup.ts): the business form, the learn job a PC claims and
// reports on, the industry file's short and long views, the approval that makes the client active.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { enqueueAuto } from "../src/cron.ts";
import { parseShort } from "../src/pages/setup.ts";
import { mint } from "../src/session.ts";
import { NOW, SECRET, start } from "./harness.mjs";

let mf;
let env;
before(async () => {
  ({ mf, env } = await start());
});
after(() => mf.dispose());

const tokenFor = (id) => mint({ sub: String(id), exp: NOW + 3600_000, ep: 0 }, SECRET);
/** A page request with the cookie (root, the admin, unless `as`). */
async function page(method, path, { as = 3, form, multipart } = {}) {
  const headers = { Cookie: `s=${await tokenFor(as)}` };
  let body;
  if (multipart) {
    // the bytes and their boundary, as a browser sends them (Miniflare's dispatchFetch loses a FormData's)
    const req = new Request("http://t/", { method: "POST", body: multipart });
    headers["Content-Type"] = req.headers.get("Content-Type");
    body = Buffer.from(await req.arrayBuffer());
  }
  if (form) {
    body = new URLSearchParams(form).toString();
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }
  const res = await mf.dispatchFetch(`http://t${path}`, { method, headers, body, redirect: "manual" });
  return { status: res.status, text: await res.text(), location: res.headers.get("Location") };
}
/** An API request with the bearer token, as a PC sends it. */
async function api(method, path, body, as = 3) {
  const res = await mf.dispatchFetch(`http://t${path}`, {
    method,
    headers: { Authorization: `Bearer ${await tokenFor(as)}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, data };
}
const status = async (id) => (await env.DB.prepare("SELECT status FROM clients WHERE id = ?").bind(id).first()).status;

const SHORT = `Nomad sells a habit, not a product.

## Ecosystem
- The money is in subscriptions.
- Buyers compare on roast date.

## Rules
- No health claims for caffeine.

## Open questions
- May we show the price on screen?
- Is Nomad certified organic?
`;
const LONG = `# Industry file

## 1  Ecosystem

A roaster buys green beans and sells on three channels. [1]

- October: new harvest.

[1] https://nomadcoffee.example/wholesale · read 14 Nov 2026
[2] https://sca.coffee/research · read 14 Nov 2026

## 2  Rules

No <b>health</b> claims.
`;

test("the short file: the one line, the sections, the open questions", () => {
  const s = parseShort(SHORT);
  assert.equal(s.line, "Nomad sells a habit, not a product.");
  assert.deepEqual(s.tiles, [{ title: "Ecosystem", points: ["The money is in subscriptions.", "Buyers compare on roast date."] }, { title: "Rules", points: ["No health claims for caffeine."] }]);
  assert.deepEqual(s.questions, ["May we show the price on screen?", "Is Nomad certified organic?"]);
});

test("a new client starts at setup: its address is the business form, its other pages lead there", async () => {
  assert.equal((await page("POST", "/admin/clients", { form: { action: "create", id: "nomad", name: "Nomad Coffee" } })).status, 303);
  assert.equal(await status("nomad"), "setup");
  assert.equal(await status("rosa"), "active"); // a client that existed stays active
  const list = await page("GET", "/admin/clients");
  assert.match(list.text, /<a class='tag need' href='\/nomad\/setup'>setup · add the business<\/a>/);
  assert.match(list.text, /<td>local<\/td><td><span class='tag live'>active<\/span><\/td>/);
  const home = await page("GET", "/nomad");
  assert.equal(home.status, 200);
  assert.match(home.text, /<h1>New client · Nomad Coffee<\/h1>/);
  assert.match(home.text, /<li class='now'><i>1<\/i>Business<\/li>/);
  for (const path of ["/nomad/calendar", "/nomad/settings", "/nomad/insights"]) {
    const r = await page("GET", path);
    assert.equal(r.status, 303, path);
    assert.equal(r.location, "/nomad");
  }
  assert.equal((await page("POST", "/nomad/week")).location, "/nomad"); // nothing is planned for it yet
  assert.equal((await page("GET", "/nomad/setup", { as: 1 })).status, 403); // alice is no member
  assert.deepEqual(await enqueueAuto(env, [{ id: "nomad", status: "setup" }], NOW), []); // nor by the cron
});

test("the form: the fields, a link, a file, a removed row; Start learning needs the business", async () => {
  let r = await page("POST", "/nomad/setup", { form: { action: "add", industry: " Specialty coffee ", type: "Website", url: "nomadcoffee.example/about", note: "The shop" } });
  assert.equal(r.location, "/nomad/setup");
  assert.equal((await page("POST", "/nomad/setup", { form: { action: "add", url: "javascript:alert(1)" } })).status, 400);
  assert.equal((await page("POST", "/nomad/setup", { form: { action: "start", industry: "Specialty coffee" } })).status, 400); // no summary
  assert.equal(await status("nomad"), "setup");
  const fd = new FormData();
  fd.set("industry", "Specialty coffee");
  fd.set("summary", "Roasts in Lisbon.");
  fd.set("file", new File(["%PDF menu"], "Menu 2026.pdf", { type: "application/pdf" }));
  assert.equal((await page("POST", "/nomad/setup", { multipart: fd })).status, 303); // a chosen file submits the form with no button
  r = await page("GET", "/nomad/setup");
  assert.match(r.text, /name=industry maxlength=120 class=w520 value='Specialty coffee'/);
  assert.match(r.text, />Roasts in Lisbon\.<\/textarea>/);
  assert.match(r.text, /<td>Website<\/td><td><a class=lnk href='https:\/\/nomadcoffee\.example\/about'[^>]*>https:\/\/nomadcoffee\.example\/about<\/a><\/td><td class=muted>The shop<\/td>/);
  assert.match(r.text, /<td>Document<\/td><td>Menu 2026\.pdf<\/td>/);
  // the PC reads the file by its place in the list; a link has no file
  const file = await mf.dispatchFetch("http://t/api/intake/nomad/1", { headers: { Authorization: `Bearer ${await tokenFor(3)}` } });
  assert.equal(await file.text(), "%PDF menu");
  assert.equal((await api("GET", "/api/intake/nomad/0")).status, 404);
  assert.equal((await api("GET", "/api/intake/nomad/1", undefined, 1)).status, 403);
  // a second link, removed again: its row goes, the others stay
  await page("POST", "/nomad/setup", { form: { action: "add", industry: "Specialty coffee", summary: "Roasts in Lisbon.", url: "https://x.example/" } });
  await page("POST", "/nomad/setup", { form: { action: "remove:2", industry: "Specialty coffee", summary: "Roasts in Lisbon." } });
  const sources = JSON.parse((await env.DB.prepare("SELECT sources FROM client_intake WHERE client = 'nomad'").first()).sources);
  assert.deepEqual(sources.map((s) => s.url ?? s.file), ["https://nomadcoffee.example/about", "Menu 2026.pdf"]);
});

test("learning: a job any of the user's PCs with claude claims; its heartbeats are the progress; done is review", async () => {
  const form = { action: "start", industry: "Specialty coffee", summary: "Roasts in Lisbon." };
  assert.equal((await page("POST", "/nomad/setup", { form })).status, 303);
  assert.equal(await status("nomad"), "learning");
  const job = await env.DB.prepare("SELECT * FROM jobs WHERE client = 'nomad' AND kind = 'learn'").first();
  const payload = JSON.parse(job.payload);
  assert.equal(payload.industry, "Specialty coffee");
  assert.deepEqual(payload.sources, [{ type: "Website", url: "https://nomadcoffee.example/about", note: "The shop" }, { type: "Document", file: "Menu 2026.pdf", n: 1 }]); // never the R2 key
  let r = await page("GET", "/nomad/setup");
  assert.match(r.text, /<meta http-equiv=refresh content=5>/);
  assert.match(r.text, /Waiting for a PC that runs Tachyon/);
  assert.match((await page("GET", "/admin/clients")).text, /learning · 0 of 8/);
  // a PC that holds no client folder: without claude nothing, with it the learn job
  await api("POST", "/api/hosts", { id: "pc-plain", clients: [], caps: ["render"] });
  assert.equal((await api("GET", "/api/jobs/next?host=pc-plain")).status, 204);
  await api("POST", "/api/hosts", { id: "pc-ai", clients: [], caps: ["claude"] });
  const got = await api("GET", "/api/jobs/next?host=pc-ai");
  assert.equal(got.data.id, job.id);
  const progress = { done: ["sources", "ecosystem"], notes: { sources: "2 sources" }, now: "reading the trade press", log: [{ t: NOW, text: "Read nomadcoffee.example" }] };
  assert.equal((await api("POST", `/api/jobs/${job.id}/heartbeat`, { host: "pc-ai", result: progress })).status, 200);
  assert.equal((await api("POST", `/api/jobs/${job.id}/heartbeat`, { host: "pc-ai" })).status, 200); // a plain beat keeps the progress
  r = await page("GET", "/nomad/setup");
  assert.match(r.text, /2 of 8 done/);
  assert.match(r.text, /<i style='width:25%'><\/i>/);
  assert.match(r.text, /Now: reading the trade press/);
  assert.match(r.text, /<li class='done'>[\s\S]*?<b>Read your sources<\/b>[\s\S]*?Done · 2 sources<\/em>/);
  assert.match(r.text, /<li class='now'>[\s\S]*?<b>Buying cycle and calendar<\/b>/);
  assert.match(r.text, /Read nomadcoffee\.example<\/p>/);
  assert.match((await page("GET", "/admin/clients")).text, /learning · 2 of 8/);
  // the PC writes the two files, then reports done
  for (const [name, text] of [["industry.md", LONG], ["industry-short.md", SHORT]]) assert.equal((await api("POST", "/api/db/nomad/set_client_file", { name, text })).status, 200);
  assert.equal((await api("POST", `/api/jobs/${job.id}/done`, { host: "pc-ai", result: { files: 2 } })).status, 200);
  assert.equal(await status("nomad"), "review");
});

test("review: the short and the long view; the answers go into the files; approval makes it active", async () => {
  let r = await page("GET", "/nomad");
  assert.match(r.text, /<li class='now'><i>3<\/i>Approve<\/li>/);
  assert.match(r.text, /<h2>Industry file · Specialty coffee<\/h2><p class=hint>2 sources · learned /);
  assert.match(r.text, /<div class='seg sm'><a href='\/nomad\/setup' class=on>Short<\/a><a href='\/nomad\/setup\?view=long'>Long<\/a><\/div>/);
  assert.match(r.text, /<p>Nomad sells a habit, not a product\.<\/p>/);
  assert.match(r.text, /<b>Ecosystem<\/b><a href='\/nomad\/setup\?view=long#s-ecosystem'>Read more<\/a>/);
  assert.match(r.text, /<h2>2 things Tachyon could not find<\/h2>/);
  r = await page("GET", "/nomad/setup?view=long");
  assert.match(r.text, /<a href='#s-ecosystem'>1 {2}Ecosystem<\/a>/);
  assert.match(r.text, /<h3 id='s-ecosystem'>1 {2}Ecosystem<\/h3><p>A roaster buys green beans and sells on three channels\. \[1\]<\/p><ul><li>October: new harvest\.<\/li><\/ul>/);
  assert.match(r.text, /<p class=src>\[1\] <a class=lnk href='https:\/\/nomadcoffee\.example\/wholesale'/);
  assert.match(r.text, /No &lt;b&gt;health&lt;\/b&gt; claims\./); // the file's text is never markup
  assert.equal((await page("POST", "/nomad/setup", { form: { action: "start" } })).status, 400); // not while waiting for approval
  assert.equal((await page("POST", "/nomad/setup", { form: { action: "changes", changes: " " } })).status, 400);
  r = await page("POST", "/nomad/setup", { form: { action: "approve", a0: "Yes, the monthly price only", a1: "" } });
  assert.equal(r.location, "/admin/clients?active=nomad");
  assert.equal(await status("nomad"), "active");
  const files = Object.fromEntries((await env.DB.prepare("SELECT name, text FROM client_files WHERE client = 'nomad'").all()).results.map((f) => [f.name, f.text]));
  assert.match(files["industry.md"], /## Answers from the operator\n\n- May we show the price on screen\? Yes, the monthly price only\n$/);
  assert.deepEqual(parseShort(files["industry-short.md"]).questions, ["Is Nomad certified organic?"]);
  r = await page("GET", "/admin/clients?active=nomad");
  assert.match(r.text, /<div class='banner ok'><span><b>Nomad Coffee is active<\/b>/);
  assert.match(r.text, /href='\/nomad\/setup\?view=long'>View the industry file<\/a>/);
  assert.doesNotMatch((await page("GET", "/admin/clients?active=rosa2")).text, /banner ok/);
  // active: the overview is back, the file stays readable, nothing more to approve
  assert.doesNotMatch((await page("GET", "/nomad")).text, /New client/);
  assert.equal((await page("GET", "/nomad/calendar")).status, 200);
  r = await page("GET", "/nomad/setup");
  assert.match(r.text, /<h1>Industry file<\/h1>/);
  assert.doesNotMatch(r.text, /Approve and activate/);
  assert.equal((await page("POST", "/nomad/setup", { form: { action: "approve" } })).status, 400);
});

test("stop and retry while learning; ask for changes and learn again from review", async () => {
  await page("POST", "/admin/clients", { form: { action: "create", id: "atlas", name: "Atlas Bikes" } });
  const form = { industry: "Bike shop", summary: "Sells and repairs bikes." };
  await page("POST", "/atlas/setup", { form: { ...form, action: "start" } });
  const first = (await api("GET", "/api/jobs/next?host=pc-ai")).data;
  assert.equal(first.client, "atlas");
  // stopped: back at the form, the job closed, the PC's report refused
  assert.equal((await page("POST", "/atlas/setup", { form: { action: "stop" } })).status, 303);
  assert.equal(await status("atlas"), "setup");
  assert.equal((await api("POST", `/api/jobs/${first.id}/heartbeat`, { host: "pc-ai", result: { done: [] } })).status, 409);
  assert.equal((await api("POST", `/api/jobs/${first.id}/done`, { host: "pc-ai", result: {} })).status, 409);
  assert.equal(await status("atlas"), "setup");
  // no work is queued through the API for a client that is not active
  assert.equal((await api("POST", "/api/jobs", { kind: "plan", client: "atlas", slot_id: "2026-W47" })).status, 409);
  // started again, the PC fails: the page says why and offers another try
  await page("POST", "/atlas/setup", { form: { ...form, action: "start" } });
  const second = (await api("GET", "/api/jobs/next?host=pc-ai")).data;
  assert.notEqual(second.id, first.id);
  await api("POST", `/api/jobs/${second.id}/fail`, { host: "pc-ai", result: "claude failed: no network" });
  let r = await page("GET", "/atlas/setup");
  assert.match(r.text, /<h2>Learning stopped<\/h2><pre class=errlog>claude failed: no network<\/pre>/);
  assert.equal((await page("POST", "/atlas/setup", { form: { action: "retry" } })).status, 303);
  const third = (await api("GET", "/api/jobs/next?host=pc-ai")).data;
  await api("POST", "/api/db/atlas/set_client_file", { name: "industry.md", text: LONG });
  await api("POST", `/api/jobs/${third.id}/done`, { host: "pc-ai", result: {} });
  assert.equal(await status("atlas"), "review");
  // ask for changes: learning again, the note in the job
  assert.equal((await page("POST", "/atlas/setup", { form: { action: "changes", changes: "Look at e-bikes too." } })).status, 303);
  assert.equal(await status("atlas"), "learning");
  const fourth = (await api("GET", "/api/jobs/next?host=pc-ai")).data;
  assert.equal(JSON.parse(fourth.payload).changes, "Look at e-bikes too.");
  await api("POST", `/api/jobs/${fourth.id}/done`, { host: "pc-ai", result: {} });
  // at review with the file gone (a hand-made request): nothing to approve
  const held = await env.DB.prepare("SELECT * FROM client_files WHERE client = 'atlas' AND name = 'industry.md'").first();
  await env.DB.prepare("DELETE FROM client_files WHERE client = 'atlas' AND name = 'industry.md'").run();
  assert.equal((await page("POST", "/atlas/setup", { form: { action: "approve" } })).status, 400);
  assert.equal(await status("atlas"), "review");
  await api("POST", "/api/db/atlas/set_client_file", { name: "industry.md", text: held.text });
  assert.equal((await page("POST", "/atlas/setup", { form: { action: "again" } })).status, 303);
  assert.equal(await status("atlas"), "learning");
  // a member who is no admin lands on the client after approving
  await env.DB.prepare("INSERT INTO memberships (user, client) VALUES (1, 'atlas')").run();
  const fifth = (await api("GET", "/api/jobs/next?host=pc-ai")).data;
  await api("POST", `/api/jobs/${fifth.id}/done`, { host: "pc-ai", result: {} });
  r = await page("POST", "/atlas/setup", { as: 1, form: { action: "approve" } });
  assert.equal(r.location, "/atlas");
  assert.equal(await status("atlas"), "active");
});
