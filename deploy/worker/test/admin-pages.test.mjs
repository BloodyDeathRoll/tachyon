// The Members and Clients pages (src/pages/admin.ts) over HTTP with the `s` cookie: admins
// only, the forms over src/admin.ts, the nav links, an admin with no client yet.
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
async function call(method, path, { as = 3, form } = {}) {
  const headers = { Cookie: `s=${await tokenFor(as)}` };
  let body;
  if (form) {
    body = new URLSearchParams(form).toString();
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }
  const res = await mf.dispatchFetch(`http://t${path}`, { method, headers, body, redirect: "manual" });
  return { status: res.status, text: await res.text(), location: res.headers.get("Location") };
}

test("admins only; the account page links the two pages for an admin alone", async () => {
  assert.equal((await call("GET", "/admin/members", { as: 1 })).status, 403);
  assert.equal((await call("POST", "/admin/clients", { as: 1, form: { action: "create", id: "x" } })).status, 403);
  assert.equal((await call("GET", "/admin/nothing")).status, 404);
  const r = await call("GET", "/admin/members");
  assert.equal(r.status, 200);
  assert.match(r.text, /<title>Members · Acme · Tachyon<\/title>/); // the shell on the admin's first client (by id)
  assert.doesNotMatch((await call("GET", "/account", { as: 1 })).text, /\/admin\//);
  assert.match((await call("GET", "/account")).text, /href='\/admin\/members'/);
  assert.match((await call("GET", "/account")).text, /href='\/admin\/clients'/);
  assert.match((await call("GET", "/account")).text, /Another account: add a client in <a href='\/admin\/clients'>Clients<\/a>/);
  // an unknown client is refused, an admin too, and journals nothing
  const before = (await env.DB.prepare("SELECT COUNT(*) AS n FROM journal").first()).n;
  assert.equal((await call("POST", "/account/disconnect", { form: { client: "nosuch" } })).status, 403);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM journal").first()).n, before);
});

test("Members: the users with their clients; invite, add and drop a membership, remove", async () => {
  let r = await call("GET", "/admin/members");
  assert.match(r.text, /alice@example\.com<\/td>/);
  assert.match(r.text, /alice@example\.com[\s\S]*?<span class='tag sched'>rosa /);
  assert.match(r.text, /root@example\.com <span class='tag need'>admin<\/span>/);
  assert.match(r.text, /bob@example\.com<\/td><td><\/td><td>not signed in yet<\/td>/);
  assert.doesNotMatch(r.text, /value='3'><button class='btn sec small'>Remove/); // not themself
  // invite
  r = await call("POST", "/admin/members", { form: { action: "invite", email: " Carol@Example.com ", admin: "1" } });
  assert.equal(r.status, 303);
  assert.equal(r.location, "/admin/members");
  const carol = await env.DB.prepare("SELECT * FROM users WHERE email = 'carol@example.com'").first();
  assert.equal(carol.admin, 1);
  assert.match((await call("GET", "/admin/members")).text, /carol@example\.com <span class='tag need'>admin/);
  r = await call("POST", "/admin/members", { form: { action: "invite", email: "carol@example.com" } });
  assert.equal(r.status, 409);
  assert.match(r.text, /carol@example\.com is invited already/);
  assert.equal((await call("POST", "/admin/members", { form: { action: "invite", email: "nope" } })).status, 400);
  // memberships
  r = await call("POST", "/admin/members", { form: { action: "add", user: "2", client: "acme" } });
  assert.equal(r.status, 303);
  assert.equal((await env.DB.prepare("SELECT count(*) AS n FROM memberships WHERE user = 2 AND client = 'acme'").first()).n, 1);
  assert.match((await call("GET", "/admin/members")).text, /bob@example\.com[\s\S]*?<span class='tag sched'>acme /);
  assert.equal((await call("POST", "/admin/members", { form: { action: "add", user: "2", client: "zzz" } })).status, 404);
  assert.equal((await call("POST", "/admin/members", { form: { action: "add", user: "x", client: "acme" } })).status, 400);
  assert.equal((await call("POST", "/admin/members", { form: { action: "drop", user: "2", client: "acme" } })).status, 303);
  assert.equal((await env.DB.prepare("SELECT count(*) AS n FROM memberships WHERE user = 2").first()).n, 0);
  // remove
  assert.equal((await call("POST", "/admin/members", { form: { action: "remove", id: "2" } })).status, 303);
  assert.equal(await env.DB.prepare("SELECT * FROM users WHERE id = 2").first(), null);
  r = await call("POST", "/admin/members", { form: { action: "remove", id: "3" } });
  assert.equal(r.status, 400);
  assert.match(r.text, /an admin cannot remove themself/);
  assert.equal((await call("POST", "/admin/members", { form: { action: "remove", id: "abc" } })).status, 404);
  assert.equal((await call("POST", "/admin/members", { form: { action: "what" } })).status, 400);
});

test("Clients: the rows, create one as the cron's", async () => {
  let r = await call("GET", "/admin/clients");
  assert.equal(r.status, 200);
  assert.match(r.text, /<a href='\/rosa'>Rosa<\/a><\/td><td>rosa<\/td><td>not connected<\/td><td>local<\/td>/);
  r = await call("POST", "/admin/clients", { form: { action: "create", id: "zed", name: " Zed Surf " } });
  assert.equal(r.status, 303);
  assert.equal(r.location, "/admin/clients");
  const zed = await env.DB.prepare("SELECT * FROM clients WHERE id = 'zed'").first();
  assert.equal(zed.name, "Zed Surf");
  assert.equal(zed.publisher, "worker");
  assert.equal(zed.created_by, 3);
  assert.match((await call("GET", "/admin/clients")).text, /<a href='\/zed'>Zed Surf<\/a>/);
  r = await call("POST", "/admin/clients", { form: { action: "create", id: "zed" } });
  assert.equal(r.status, 409);
  assert.match(r.text, /client zed exists/);
  assert.equal((await call("POST", "/admin/clients", { form: { action: "create", id: "a b" } })).status, 400);
  assert.equal((await call("POST", "/admin/clients", { form: { action: "invite", email: "x@y.z" } })).status, 400);
  assert.equal((await call("GET", "/zed")).status, 200); // an admin manages every client
});

test("an admin with no client yet still gets the Clients page", async () => {
  await env.DB.batch([env.DB.prepare("DELETE FROM memberships"), env.DB.prepare("DELETE FROM clients")]);
  const r = await call("GET", "/admin/clients");
  assert.equal(r.status, 200);
  assert.match(r.text, /<title>Clients · Tachyon · Tachyon<\/title>/);
  assert.match(r.text, /New client/);
  assert.equal((await call("POST", "/admin/clients", { form: { action: "create", id: "first", name: "First" } })).status, 303);
  assert.match((await call("GET", "/admin/members")).text, /<title>Members · First · Tachyon<\/title>/);
});
