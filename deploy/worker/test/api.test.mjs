// The Worker's routes against a local D1 and R2 (Miniflare, no account needed).
// `npm test` bundles src/ with esbuild into .test/index.mjs and runs it in workerd,
// so request bodies stream into R2 the way they do online. Google ID-token
// verification is Rosa's and tested there; here sign-in starts at bindUser, which
// runs in Node against the same D1 (Node >= 22.18 imports the .ts source directly).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { RESERVED } from "../src/admin.ts";
import { bindUser, HttpError } from "../src/index.ts";
import { mint } from "../src/session.ts";
import { NOW, SECRET, start } from "./harness.mjs";

let mf;
let env;

before(async () => {
  ({ mf, env } = await start());
  await env.DB.prepare(
    "INSERT INTO posts (client, slot_id, state, ig_media_id, created_at, updated_at) VALUES ('rosa', 'w45-1', 'APPROVED', NULL, '', ''), ('rosa', 'w45-2', 'PUBLISHED', '123', '', '')",
  ).run();
});
after(() => mf.dispose());

const tokenFor = (id, ep = 0) => mint({ sub: String(id), exp: NOW + 3600_000, ep }, SECRET);

async function call(method, path, { as, body, raw, headers = {} } = {}) {
  if (as) headers.Authorization = `Bearer ${await tokenFor(as)}`;
  let payload = raw;
  if (body !== undefined) {
    payload = JSON.stringify(body);
    headers["Content-Type"] = "application/json";
  }
  const res = await mf.dispatchFetch(`http://t${path}`, { method, headers, body: payload });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
}

const claims = (sub, email, name = null) => ({ sub, email, name, picture: null });
const forbidden = (e) => e instanceof HttpError && e.status === 403;

test("sign-in is invite-only and binds google_sub once", async () => {
  await assert.rejects(bindUser(env, claims("g-x", "nobody@example.com")), forbidden);
  const alice = await bindUser(env, claims("g-alice", "Alice@Example.com", "Alice"));
  assert.equal(alice.id, 1);
  // the same email from another Google account: the row is taken
  await assert.rejects(bindUser(env, claims("g-other", "alice@example.com")), forbidden);
  // after the bind the match is on sub alone, so an email change keeps the account
  const again = await bindUser(env, claims("g-alice", "new@example.com", "Alice"));
  assert.equal(again.id, 1);
  await assert.rejects(bindUser(env, claims("g-noemail", null)), forbidden);
});

test("/me lists memberships; an admin sees every client", async () => {
  assert.equal((await call("GET", "/me")).status, 401);
  assert.deepEqual((await call("GET", "/me", { as: 1 })).data.clients, ["rosa"]);
  assert.deepEqual((await call("GET", "/me", { as: 2 })).data.clients, []);
  const root = await call("GET", "/me", { as: 3 });
  assert.equal(root.data.admin, true);
  assert.deepEqual(root.data.clients, ["acme", "rosa"]);
});

test("a PC registers with the clients it is a member of; an id belongs to one user", async () => {
  const r = await call("POST", "/api/hosts", {
    as: 1,
    body: { id: "pc-a", name: "Alice's PC", clients: ["rosa", "acme"], caps: ["render"] },
  });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { clients: ["rosa"], dropped: ["acme"] });
  assert.equal((await call("POST", "/api/hosts", { as: 2, body: { id: "pc-a", clients: ["rosa"] } })).status, 409);
  assert.deepEqual((await call("POST", "/api/hosts", { as: 2, body: { id: "pc-b", clients: ["rosa"] } })).data.clients, []);
});

test("jobs: members enqueue, a host claims the oldest, a lease that ran out is claimable", async () => {
  assert.equal((await call("POST", "/api/jobs", { as: 2, body: { kind: "produce", client: "rosa" } })).status, 403);
  assert.equal((await call("POST", "/api/jobs", { as: 1, body: { kind: "dance", client: "rosa" } })).status, 400);
  const j1 = (await call("POST", "/api/jobs", { as: 1, body: { kind: "produce", client: "rosa", slot_id: "w45-1", payload: { n: 1 } } })).data.id;
  const j2 = (await call("POST", "/api/jobs", { as: 1, body: { kind: "upload", client: "rosa", slot_id: "w45-1" } })).data.id;
  // the same week asked twice while the first is open: one job; once it is done, a new one
  const plan = { kind: "plan", client: "rosa", payload: { argv: ["spine.week", "prepare", "rosa", "2026-W10"] } };
  const p1 = (await call("POST", "/api/jobs", { as: 1, body: plan })).data;
  assert.deepEqual(await call("POST", "/api/jobs", { as: 1, body: plan }).then((r) => r.data), { id: p1.id, same: true });
  await env.DB.prepare("UPDATE jobs SET state = 'done' WHERE id = ?").bind(p1.id).run();
  assert.notEqual((await call("POST", "/api/jobs", { as: 1, body: plan })).data.id, p1.id);
  await env.DB.prepare("DELETE FROM jobs WHERE kind = 'plan'").run();
  assert.equal((await call("GET", "/api/jobs/next?host=pc-b", { as: 2 })).status, 204); // no clients
  assert.equal((await call("GET", "/api/jobs/next?host=pc-a", { as: 2 })).status, 404); // not bob's host
  const got = await call("GET", "/api/jobs/next?host=pc-a", { as: 1 });
  assert.equal(got.status, 200);
  assert.equal(got.data.id, j1);
  assert.equal(got.data.payload, '{"n":1}');
  assert.equal(got.data.state, "running");
  assert.equal((await call("GET", "/api/jobs/next?host=pc-a", { as: 1 })).data.id, j2);
  assert.equal((await call("GET", "/api/jobs/next?host=pc-a", { as: 1 })).status, 204);
  // only the holding host may report
  assert.equal((await call("POST", `/api/jobs/${j1}/heartbeat`, { as: 2, body: { host: "pc-b" } })).status, 409);
  assert.equal((await call("POST", `/api/jobs/${j1}/heartbeat`, { as: 1, body: { host: "pc-a" } })).status, 200);
  const done = { host: "pc-a", result: { ok: 1, media: { path: "/home/a/posts/w45-1/video.mp4", sha: "ab", size: 3 } } };
  assert.equal((await call("POST", `/api/jobs/${j1}/done`, { as: 1, body: done })).status, 200);
  assert.deepEqual(await env.DB.prepare("SELECT * FROM media WHERE slot_id = 'w45-1'").first(), {
    client: "rosa", slot_id: "w45-1", host: "pc-a", path: "/home/a/posts/w45-1/video.mp4", sha: "ab", size: 3,
  });
  assert.equal((await call("POST", `/api/jobs/${j1}/done`, { as: 1, body: { host: "pc-a" } })).status, 409); // already done
  const list = await call("GET", "/api/jobs?client=rosa", { as: 1 });
  assert.deepEqual(list.data.jobs.map((j) => [j.id, j.state]), [[j2, "running"], [j1, "done"]]);
  assert.equal((await call("GET", "/api/jobs?client=rosa&slot=w45-1", { as: 1 })).data.jobs.length, 2);
  assert.equal((await call("GET", "/api/jobs?client=rosa", { as: 2 })).status, 403);
  await env.DB.prepare("UPDATE jobs SET until = ? WHERE id = ?").bind(NOW - 1, j2).run();
  assert.equal((await call("GET", "/api/jobs/next?host=pc-a", { as: 1 })).data.id, j2);
  assert.equal((await call("POST", `/api/jobs/${j2}/fail`, { as: 1, body: { host: "pc-a", result: "boom" } })).status, 200);
  const row = await env.DB.prepare("SELECT state, result FROM jobs WHERE id = ?").bind(j2).first();
  assert.deepEqual(row, { state: "failed", result: '"boom"' });
});

test("a PC registers its own render running and holds it; no PC is ever handed it", async () => {
  assert.equal((await call("POST", "/api/jobs", { as: 1, body: { kind: "pc", client: "rosa", host: "pc-a" } })).status, 400);   // needs a slot
  assert.equal((await call("POST", "/api/jobs", { as: 2, body: { kind: "pc", client: "rosa", slot_id: "w45-1", host: "pc-a" } })).status, 403);
  const id = (await call("POST", "/api/jobs", { as: 1, body: { kind: "pc", client: "rosa", slot_id: "w45-1", host: "pc-a", payload: { notes: "rebuilt" } } })).data.id;
  const row = await env.DB.prepare("SELECT state, holder, until FROM jobs WHERE id = ?").bind(id).first();
  assert.equal(row.state, "running");
  assert.equal(row.holder, "pc-a");
  assert.equal((await call("GET", "/api/jobs/next?host=pc-a", { as: 1 })).status, 204);
  await env.DB.prepare("UPDATE jobs SET until = ? WHERE id = ?").bind(NOW - 1, id).run();
  assert.equal((await call("GET", "/api/jobs/next?host=pc-a", { as: 1 })).status, 204);   // even with its lease run out
  await env.DB.prepare("UPDATE jobs SET until = ? WHERE id = ?").bind(NOW + 60_000, id).run();
  assert.equal((await call("POST", `/api/jobs/${id}/done`, { as: 1, body: { host: "pc-a", result: {} } })).status, 200);
  await env.DB.prepare("DELETE FROM jobs WHERE id = ?").bind(id).run();
});

test("media: a video uploads under a random key, a replacement deletes the old one, published is final", async () => {
  const bytes = new TextEncoder().encode("not really mp4");
  // Content-Length as a real upload sends it; dispatchFetch would otherwise chunk the body
  const put = (as, slot, name) =>
    call("PUT", `/api/media/rosa/${slot}/${name}`, { as, raw: bytes, headers: { "Content-Length": String(bytes.length) } });
  assert.equal((await put(2, "w45-1", "video")).status, 403);
  assert.equal((await put(1, "w45-9", "video")).status, 404);
  assert.equal((await put(1, "w45-2", "video")).status, 409);
  const first = await put(1, "w45-1", "video");
  assert.equal(first.status, 200);
  assert.match(first.data.key, /^rosa\/w45-1\/[0-9a-f]{32}\.mp4$/);
  const second = await put(1, "w45-1", "video");
  assert.notEqual(second.data.key, first.data.key);
  assert.equal(await env.MEDIA.get(first.data.key), null);
  assert.equal((await env.DB.prepare("SELECT r2_key FROM posts WHERE slot_id = 'w45-1'").first()).r2_key, second.data.key);
  const get = await call("GET", "/api/media/rosa/w45-1/video", { as: 1 });
  assert.equal(get.status, 200);
  assert.equal(get.data, "not really mp4");
  assert.equal(get.headers.get("Content-Type"), "video/mp4");
  assert.equal((await call("GET", "/api/media/rosa/w45-1/cover", { as: 1 })).status, 404);
  assert.equal((await call("PUT", "/api/media/rosa/w45-1/video", { as: 1 })).status, 411);
  assert.equal((await put(1, "w45-2", "cover")).status, 200); // a cover may change after publish
});

test("/ig/<key> serves a waiting video without sign-in, and nothing else", async () => {
  const bytes = new TextEncoder().encode("0123456789");
  const up = await call("PUT", "/api/media/rosa/w45-1/video", { as: 1, raw: bytes, headers: { "Content-Length": "10" } });
  const key = up.data.key;
  const whole = await call("GET", `/ig/${key}`);
  assert.equal(whole.status, 200);
  assert.equal(whole.data, "0123456789");
  assert.equal(whole.headers.get("Content-Type"), "video/mp4");
  const head = await call("HEAD", `/ig/${key}`);
  assert.equal(head.status, 200);
  assert.equal(head.data, "");
  assert.equal(head.headers.get("Content-Length"), "10");
  const part = await call("GET", `/ig/${key}`, { headers: { Range: "bytes=2-4" } });
  assert.equal(part.status, 206);
  assert.equal(String(part.data), "234"); // call() parses JSON, and "234" is a number
  assert.equal((await call("GET", "/ig/rosa/w45-1/00000000000000000000000000000000.mp4")).status, 404); // no row
  assert.equal((await call("GET", `/ig/${key.replace(".mp4", ".jpg")}`)).status, 404); // not a video key
  assert.equal((await call("GET", "/ig/rosa%2F..%2Fw45-1%2Fx.mp4")).status, 404); // no key shape, no lookup
  // a replacement: the old address dies with the old file
  await call("PUT", "/api/media/rosa/w45-1/video", { as: 1, raw: bytes, headers: { "Content-Length": "10" } });
  assert.equal((await call("GET", `/ig/${key}`)).status, 404);
  // the host's sha goes with the key; a malformed one is not stored
  const sha = "a".repeat(64);
  await call("PUT", "/api/media/rosa/w45-1/video", { as: 1, raw: bytes, headers: { "Content-Length": "10", "X-Sha256": sha } });
  assert.equal((await env.DB.prepare("SELECT r2_sha FROM posts WHERE slot_id = 'w45-1'").first()).r2_sha, sha);
  await call("PUT", "/api/media/rosa/w45-1/video", { as: 1, raw: bytes, headers: { "Content-Length": "10", "X-Sha256": "nope" } });
  assert.equal((await env.DB.prepare("SELECT r2_sha FROM posts WHERE slot_id = 'w45-1'").first()).r2_sha, null);
  // the story cut: its own key and sha, served to members, never on the public address
  const story = await call("PUT", "/api/media/rosa/w45-1/story", { as: 1, raw: bytes, headers: { "Content-Length": "10", "X-Sha256": sha } });
  assert.equal(story.status, 200);
  const srow = await env.DB.prepare("SELECT story_key, story_sha FROM posts WHERE slot_id = 'w45-1'").first();
  assert.equal(srow.story_key, story.data.key);
  assert.equal(srow.story_sha, sha);
  assert.equal((await call("GET", "/api/media/rosa/w45-1/story", { as: 1 })).status, 200);
  assert.equal((await call("GET", `/ig/${story.data.key}`)).status, 404);
  // while Instagram may be fetching it, the video stays as it is
  await env.DB.prepare("UPDATE posts SET state = 'PUBLISHING' WHERE slot_id = 'w45-1'").run();
  assert.equal((await call("PUT", "/api/media/rosa/w45-1/video", { as: 1, raw: bytes, headers: { "Content-Length": "10" } })).status, 409);
  await env.DB.prepare("UPDATE posts SET state = 'APPROVED' WHERE slot_id = 'w45-1'").run();
  const current = (await env.DB.prepare("SELECT r2_key FROM posts WHERE slot_id = 'w45-1'").first()).r2_key;
  // published: no longer served, even while the file is still there
  await env.DB.prepare("UPDATE posts SET ig_media_id = '9' WHERE slot_id = 'w45-1'").run();
  assert.equal((await call("GET", `/ig/${current}`)).status, 404);
  await env.DB.prepare("UPDATE posts SET ig_media_id = NULL WHERE slot_id = 'w45-1'").run();
});

test("the sign-in page carries the Google client id and needs no session", async () => {
  const r = await call("GET", "/login");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("Content-Type"), /text\/html/);
  assert.match(r.data, /client_id: "x"/);
  assert.match(r.data, /spine\.worker login/);
});

test("the sign-in page carries the brand panel, its canvas and the script that draws the line wave on it", async () => {
  const r = await call("GET", "/login");
  assert.match(r.data, /class="brand"/);
  assert.match(r.data, /<canvas /);
  assert.match(r.data, /<script src="\/static\/login-art\.js" defer><\/script>/);
  assert.match(r.headers.get("Content-Security-Policy"), /script-src 'self' /); // or the browser refuses the script
  assert.ok(existsSync(new URL("../public/static/login-art.js", import.meta.url)));
});

test("every first path segment index.ts routes is a reserved client id", async () => {
  // a client id that is also a route's first segment would be shadowed: the list in admin.ts must follow the routes
  const src = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  const first = [...src.matchAll(/path === "\/([\w-]+)(?:\/[^"]*)?"|p\[0\] === "([\w-]+)"|path\.startsWith\("\/([\w-]+)\//g)].map((m) => m[1] ?? m[2] ?? m[3]);
  assert.ok(first.length >= 6, "the route patterns changed shape: update this test");
  for (const s of new Set(first)) assert.ok(RESERVED.has(s), `${s} is routed by index.ts but not reserved in admin.ts`);
});

test("an admin invites, adds members and clients; a member cannot", async () => {
  assert.equal((await call("GET", "/api/admin/users", { as: 1 })).status, 403);
  const carol = (await call("POST", "/api/admin/users", { as: 3, body: { email: " Carol@Example.com ", admin: "false" } })).data.id; // only `true` makes an admin
  assert.equal((await call("POST", "/api/admin/users", { as: 3, body: { email: "carol@example.com" } })).status, 409);
  assert.equal((await call("POST", "/api/admin/users", { as: 3, body: { email: "nope" } })).status, 400);
  assert.equal((await call("POST", "/api/admin/clients", { as: 3, body: { id: "zed", name: "Zed Surf" } })).status, 200);
  assert.equal((await call("POST", "/api/admin/clients", { as: 3, body: { id: "zed" } })).status, 409);
  assert.equal((await call("POST", "/api/admin/clients", { as: 3, body: { id: "api" } })).status, 400); // a path of the Worker's own
  assert.equal((await call("POST", "/api/admin/memberships", { as: 3, body: { user: carol, client: "nope" } })).status, 404);
  assert.equal((await call("POST", "/api/admin/memberships", { as: 3, body: { user: carol, client: "zed" } })).status, 200);
  const users = (await call("GET", "/api/admin/users", { as: 3 })).data.users;
  assert.deepEqual(users.find((u) => u.id === carol), { id: carol, email: "carol@example.com", name: null, admin: false, signed_in: false, last_seen_at: null, clients: ["zed"] });
  assert.equal((await call("GET", "/me", { as: carol })).data.clients[0], "zed");
  const zed = (await call("GET", "/api/admin/clients", { as: 3 })).data.clients.find((c) => c.id === "zed");
  assert.equal(zed.publisher, "worker");
  assert.equal(zed.token_enc, undefined);
  assert.equal((await call("DELETE", "/api/admin/memberships", { as: 3, body: { user: carol, client: "zed" } })).status, 200);
  assert.deepEqual((await call("GET", "/me", { as: carol })).data.clients, []);
  assert.equal((await call("DELETE", "/api/admin/users/3", { as: 3 })).status, 400); // not themself
  assert.equal((await call("DELETE", `/api/admin/users/${carol}`, { as: 3 })).status, 200);
  assert.equal((await call("GET", "/me", { as: carol })).status, 401);
});

test("logout bumps the epoch: every token dies", async () => {
  assert.equal((await call("POST", "/auth/logout", { as: 2 })).status, 200);
  assert.equal((await call("GET", "/me", { as: 2 })).status, 401);
});
