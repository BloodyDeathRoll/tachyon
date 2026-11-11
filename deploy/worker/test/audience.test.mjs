// The audience export upload (src/pages/audience.ts) over HTTP with the `s` cookie, against
// the harness D1: the export layouts, the card after an upload, the refusals, the limits.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, test } from "node:test";
import { MAX_BYTES, names } from "../src/pages/audience.ts";
import { mint } from "../src/session.ts";
import { NOW, SECRET, start } from "./harness.mjs";

let mf;
let env;
before(async () => {
  ({ mf, env } = await start());
});
after(() => mf.dispose());

const tokenFor = (id) => mint({ sub: String(id), exp: NOW + 3600_000, ep: 0 }, SECRET);
/** Instagram's followers file: a list of entries with the name in string_list_data[].value. */
const followers = (users) => JSON.stringify(users.map((u) => ({ title: "", string_list_data: [{ href: `https://www.instagram.com/${u}`, value: u, timestamp: 1 }] })));

async function get(path, as = 1) {
  const res = await mf.dispatchFetch(`http://t${path}`, { headers: { Cookie: `s=${await tokenFor(as)}` }, redirect: "manual" });
  return { status: res.status, text: await res.text() };
}

async function up(body, name = "followers_1.json", as = 1) {
  const form = new FormData();
  form.append("file", new File([body], name));
  const headers = as === null ? {} : { Cookie: `s=${await tokenFor(as)}` };
  const multipart = new Request("http://x", { method: "POST", body: form }); // serialized here: dispatchFetch sends a FormData as text
  const bytes = await multipart.arrayBuffer();
  headers["Content-Type"] = multipart.headers.get("Content-Type");
  headers["Content-Length"] = String(bytes.byteLength); // as a browser form sends it; dispatchFetch would otherwise chunk the body
  const res = await mf.dispatchFetch("http://t/rosa/audience/upload", { method: "POST", headers, body: bytes, redirect: "manual" });
  return { status: res.status, text: await res.text(), location: res.headers.get("Location") };
}

test("names: both layouts Instagram has used, the href as a last resort, lower-cased without @", () => {
  assert.deepEqual([...names(JSON.parse(followers(["Ann", "bob"])))].sort(), ["ann", "bob"]);
  const following = { relationships_following: [{ title: "carl", string_list_data: [{ href: "https://www.instagram.com/_u/carl", timestamp: 1 }] }] };
  assert.deepEqual([...names(following)], ["carl"]);
  assert.deepEqual([...names([{ string_list_data: [{ href: "https://www.instagram.com/Dee/" }] }, { title: "@Eve" }, 7, { string_list_data: [{}] }])], ["dee", "eve"]);
  assert.deepEqual([...names({})], []);
  assert.deepEqual([...names("x")], []);
});

test("the first export: the card says how many followers it read, and nobody dropped", async () => {
  const page = await get("/rosa");
  assert.match(page.text, /Upload your Instagram export/);
  assert.match(page.text, /<form method=post enctype=multipart\/form-data action='\/rosa\/audience\/upload'/);
  const r = await up(followers(["ann", "bob"]));
  assert.equal(r.status, 303);
  assert.equal(r.location, "/rosa?up=ok#dropped");
  const after1 = await get("/rosa?up=ok");
  assert.match(after1.text, /Export read: 2 followers\./);
  assert.match(after1.text, /<b class=dnum>0<\/b> dropped\./);
  assert.match(after1.text, /Last export <time [^>]*>[^<]*<\/time> · 2 followers\./);
  const snap = await env.DB.prepare("SELECT * FROM follower_snapshots WHERE client = 'rosa'").first();
  assert.equal(snap.source, "followers_1.json");
  assert.equal(snap.n_followers, 2);
  assert.equal(snap.n_following, null);
  // the same sha spine/audience.py parse_export gives one file, so a PC import of it is the same export
  assert.equal(snap.file_sha, createHash("sha256").update("followers_1.json\0").update(followers(["ann", "bob"])).digest("hex"));
  assert.deepEqual((await env.DB.prepare("SELECT username FROM follower_members WHERE snapshot_id = ? ORDER BY username").bind(snap.id).all()).results.map((x) => x.username), ["ann", "bob"]);
});

test("the same export again changes nothing; the next one says who dropped", async () => {
  const same = await up(followers(["ann", "bob"]), "my-export.json");
  assert.equal(same.location, "/rosa?up=same#dropped");
  assert.match((await get("/rosa?up=same")).text, /This export was already in: nothing changed\./);
  assert.equal((await env.DB.prepare("SELECT count(*) AS n FROM follower_snapshots").first()).n, 1);
  assert.equal((await up(followers(["ann"]))).location, "/rosa?up=ok#dropped");
  const page = await get("/rosa?up=ok");
  assert.match(page.text, /Export read: 1 followers, 1 dropped\./);
  assert.match(page.text, /<b class=dnum>1<\/b> dropped\./);
  assert.match(page.text, /1 followers dropped since <time/);
  assert.match(page.text, /@bob/);
  assert.doesNotMatch(page.text, /@ann/);
  assert.doesNotMatch((await get("/rosa")).text, /Export read/); // the note shows once, on the way back
});

test("refused: not JSON, no followers, the following list, a zip, too large, a stranger", async () => {
  let r = await up("{}");
  assert.equal(r.status, 400);
  assert.match(r.text, /no followers in it: download the export in JSON format/);
  assert.match(r.text, /href='\/rosa'/); // a page with a way back
  r = await up("not json");
  assert.equal(r.status, 400);
  assert.match(r.text, /followers_1\.json is not readable JSON/);
  r = await up(followers(["x"]), "following_1.json");
  assert.equal(r.status, 400);
  assert.match(r.text, /no followers in it/);
  r = await up(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]), "export.zip");
  assert.equal(r.status, 400);
  assert.match(r.text, /unzip it and upload followers_1\.json/);
  assert.equal((await up(followers(["x"]), "x.zip")).status, 400); // the name alone says zip
  r = await up(new Uint8Array(MAX_BYTES + 1), "followers_1.json");
  assert.equal(r.status, 413);
  assert.match(r.text, /over 4 MB/);
  // a chunked body has no length to check before it is buffered: refused unread
  const form = new FormData();
  form.append("file", new File([followers(["x"])], "followers_1.json"));
  const multipart = new Request("http://x", { method: "POST", body: form });
  const chunked = await mf.dispatchFetch("http://t/rosa/audience/upload", {
    method: "POST",
    headers: { Cookie: `s=${await tokenFor(1)}`, "Content-Type": multipart.headers.get("Content-Type") },
    body: multipart.body,
    duplex: "half",
    redirect: "manual",
  });
  assert.equal(chunked.status, 411);
  assert.match(await chunked.text(), /needs a Content-Length/);
  assert.equal((await up("")).status, 400);
  assert.equal((await up(followers(["x"]), "followers_1.json", 2)).status, 403);
  assert.equal((await up(followers(["x"]), "followers_1.json", null)).status, 401);
  assert.equal((await env.DB.prepare("SELECT count(*) AS n FROM follower_snapshots").first()).n, 2);
});
