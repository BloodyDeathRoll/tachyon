// Connect Instagram (src/connect.ts): the dialog URL and the cookie session over HTTP;
// the callback and the pick in Node with Facebook's answers scripted.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { callback, pick, SCOPES, startUrl } from "../src/connect.ts";
import { open } from "../src/crypto.ts";
import { mint, verify } from "../src/session.ts";
import { NOW, SECRET, start } from "./harness.mjs";

let mf;
let env;
const script = [];
const calls = [];
const fetcher = async (url, init = {}) => {
  calls.push({ method: init.method ?? "GET", url });
  const next = script.shift();
  if (!next) throw new Error(`unexpected fetch ${url}`);
  return new Response(JSON.stringify(next), { status: 200 });
};

before(async () => {
  ({ mf, env } = await start());
  env = { ...env, META_APP_ID: "app1", META_APP_SECRET: "appsecret", TOKEN_SECRET: "tsecret" };
});
after(() => mf.dispose());

const tokenFor = (id) => mint({ sub: String(id), exp: NOW + 3600_000, ep: 0 }, SECRET);

test("a member is sent to Facebook's dialog; the cookie carries the session for the browser", async () => {
  const alice = await tokenFor(1);
  let r = await mf.dispatchFetch("http://t/connect/rosa", { headers: { Cookie: `s=${alice}; other=1` }, redirect: "manual" });
  assert.equal(r.status, 302);
  const to = new URL(r.headers.get("Location"));
  assert.equal(to.origin, "https://www.facebook.com");
  assert.equal(to.searchParams.get("client_id"), "app1");
  assert.equal(to.searchParams.get("redirect_uri"), "http://t/connect/callback");
  assert.equal((await verify(to.searchParams.get("state"), SECRET, NOW)).sub, "1:rosa");
  r = await mf.dispatchFetch("http://t/connect/rosa", { headers: { Cookie: `s=${await tokenFor(2)}` }, redirect: "manual" });
  assert.equal(r.status, 403);
  assert.equal((await mf.dispatchFetch("http://t/me", { headers: { Cookie: `s=${alice}` } })).status, 200);
  assert.equal((await mf.dispatchFetch("http://t/connect/callback?code=x&state=bad")).status, 400);
});

test("the callback lists the Pages and the pick stores the sealed Page token", async () => {
  const url = await startUrl(env, "https://t", 1, "rosa", NOW);
  const state = new URL(url).searchParams.get("state");
  assert.equal(new URL(url).searchParams.get("scope"), SCOPES.join(","));
  assert.equal((await verify(state, SECRET, NOW)).sub, "1:rosa");
  script.push(
    { access_token: "short" },
    { access_token: "long" },
    { data: [
      { id: "p1", name: "Rosa Page", access_token: "pagetok", instagram_business_account: { id: "178", username: "rosasurfapp" } },
      { id: "p2", name: "Other", access_token: "x" },
    ] },
  );
  const res = await callback(env, new URL(`https://t/connect/callback?code=CODE&state=${state}`), NOW, fetcher);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Rosa Page → @rosasurfapp/);
  assert.match(html, /<button disabled>Other/);
  assert.match(calls[0].url, /oauth\/access_token\?.*code=CODE/);
  assert.match(calls[1].url, /fb_exchange_token=short/);
  assert.match(calls[2].url, /me\/accounts\?.*access_token=long/);
  const id = html.match(/name="id" value="([0-9a-f]{32})"/)[1];
  const pending = await env.DB.prepare("SELECT * FROM pending_connects WHERE id = ?").bind(id).first();
  assert.equal(pending.client, "rosa");
  assert.ok(!pending.pages_enc.includes("pagetok"));

  const form = new FormData();
  form.set("id", id);
  form.set("page_id", "p2");
  await assert.rejects(pick(env, form, NOW, fetcher), (e) => e.status === 400);
  form.set("page_id", "p1");
  script.push({ data: { data_access_expires_at: 1900000000 } });
  const done = await pick(env, form, NOW, fetcher);
  assert.match(await done.text(), /Connected <b>rosa<\/b> to @rosasurfapp/);
  const row = await env.DB.prepare("SELECT * FROM clients WHERE id = 'rosa'").first();
  assert.equal(await open(row.token_enc, "tsecret"), "pagetok");
  assert.equal(row.ig_user_id, "178");
  assert.equal(row.page_id, "p1");
  assert.equal(row.ig_username, "rosasurfapp");
  assert.equal(row.token_expires, 1900000000000);
  assert.equal(await env.DB.prepare("SELECT count(*) AS n FROM pending_connects").first().then((r) => r.n), 0);
  const j = await env.DB.prepare("SELECT action, by FROM journal WHERE client = 'rosa' ORDER BY id DESC LIMIT 1").first();
  assert.deepEqual(j, { action: "meta.connect", by: 1 });
  await assert.rejects(pick(env, form, NOW, fetcher), (e) => e.status === 400); // used once
  // a stale state, or one for a non-member, gets nowhere
  const stale = await mint({ sub: "1:rosa", exp: NOW - 1, ep: 0 }, SECRET);
  await assert.rejects(callback(env, new URL(`https://t/connect/callback?code=x&state=${stale}`), NOW, fetcher), (e) => e.status === 400);
  const bob = await mint({ sub: "2:rosa", exp: NOW + 1000, ep: 0 }, SECRET);
  await assert.rejects(callback(env, new URL(`https://t/connect/callback?code=x&state=${bob}`), NOW, fetcher), (e) => e.status === 403);
});
