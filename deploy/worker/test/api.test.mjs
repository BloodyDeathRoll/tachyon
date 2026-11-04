// The Worker's routes against a local D1 and R2 (Miniflare, no account needed).
// `npm test` bundles src/ with esbuild into .test/index.mjs and runs it in workerd,
// so request bodies stream into R2 the way they do online. Google ID-token
// verification is Rosa's and tested there; here sign-in starts at bindUser, which
// runs in Node against the same D1 (Node >= 22.18 imports the .ts source directly).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { Miniflare } from "miniflare";
import { bindUser, HttpError } from "../src/index.ts";
import { mint } from "../src/session.ts";

const SECRET = "test-secret";
const NOW = Date.now();
let mf;
let env;

before(async () => {
  const text = (value) => ({ type: "text", value });
  mf = new Miniflare({
    workers: [
      {
        config: {
          name: "tachyon",
          compatibilityDate: "2026-08-01",
          manifest: {
            mainModule: "index.mjs",
            modules: { "index.mjs": { type: "esm", contents: readFileSync(new URL("../.test/index.mjs", import.meta.url), "utf8") } },
          },
          env: {
            DB: { type: "d1", name: "tachyon" },
            MEDIA: { type: "r2", name: "tachyon-media" },
            SESSION_SECRET: text(SECRET),
            GOOGLE_CLIENT_ID: text("x"),
            GOOGLE_CLIENT_SECRET: text(""),
          },
        },
      },
    ],
  });
  const DB = await mf.getD1Database("DB");
  const MEDIA = await mf.getR2Bucket("MEDIA");
  // one statement at a time: D1's exec() wants one statement per line
  const schema = readFileSync(new URL("../schema.sql", import.meta.url), "utf8").replace(/^\s*--.*$/gm, "");
  for (const stmt of schema.split(";").map((s) => s.trim()).filter(Boolean)) await DB.prepare(stmt).run();
  await DB.batch([
    DB.prepare(
      "INSERT INTO users (id, email, admin, created_at) VALUES (1, 'alice@example.com', 0, ?1), (2, 'bob@example.com', 0, ?1), (3, 'root@example.com', 1, ?1)",
    ).bind(NOW),
    DB.prepare("INSERT INTO clients (id, name, created_at) VALUES ('rosa', 'Rosa', ?1), ('acme', 'Acme', ?1)").bind(NOW),
    DB.prepare("INSERT INTO memberships (user, client) VALUES (1, 'rosa')"),
    DB.prepare(
      "INSERT INTO posts (client, slot_id, state, ig_media_id, created_at, updated_at) VALUES ('rosa', 'w45-1', 'APPROVED', NULL, '', ''), ('rosa', 'w45-2', 'PUBLISHED', '123', '', '')",
    ),
  ]);
  env = { DB, MEDIA, GOOGLE_CLIENT_ID: "x", GOOGLE_CLIENT_SECRET: "", SESSION_SECRET: SECRET };
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
  assert.deepEqual(r.data.clients, ["rosa"]);
  assert.equal((await call("POST", "/api/hosts", { as: 2, body: { id: "pc-a", clients: ["rosa"] } })).status, 409);
  assert.deepEqual((await call("POST", "/api/hosts", { as: 2, body: { id: "pc-b", clients: ["rosa"] } })).data.clients, []);
});

test("jobs: members enqueue, a host claims the oldest, a lease that ran out is claimable", async () => {
  assert.equal((await call("POST", "/api/jobs", { as: 2, body: { kind: "produce", client: "rosa" } })).status, 403);
  assert.equal((await call("POST", "/api/jobs", { as: 1, body: { kind: "dance", client: "rosa" } })).status, 400);
  const j1 = (await call("POST", "/api/jobs", { as: 1, body: { kind: "produce", client: "rosa", slot_id: "w45-1", payload: { n: 1 } } })).data.id;
  const j2 = (await call("POST", "/api/jobs", { as: 1, body: { kind: "upload", client: "rosa", slot_id: "w45-1" } })).data.id;
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
  assert.equal((await call("POST", `/api/jobs/${j1}/done`, { as: 1, body: { host: "pc-a", result: { ok: 1 } } })).status, 200);
  assert.equal((await call("POST", `/api/jobs/${j1}/done`, { as: 1, body: { host: "pc-a" } })).status, 409); // already done
  await env.DB.prepare("UPDATE jobs SET until = ? WHERE id = ?").bind(NOW - 1, j2).run();
  assert.equal((await call("GET", "/api/jobs/next?host=pc-a", { as: 1 })).data.id, j2);
  assert.equal((await call("POST", `/api/jobs/${j2}/fail`, { as: 1, body: { host: "pc-a", result: "boom" } })).status, 200);
  const row = await env.DB.prepare("SELECT state, result FROM jobs WHERE id = ?").bind(j2).first();
  assert.deepEqual(row, { state: "failed", result: '"boom"' });
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

test("logout bumps the epoch: every token dies", async () => {
  assert.equal((await call("POST", "/auth/logout", { as: 2 })).status, 200);
  assert.equal((await call("GET", "/me", { as: 2 })).status, 401);
});
