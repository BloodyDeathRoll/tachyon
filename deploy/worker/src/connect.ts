// Connect Instagram (docs/CLOUDFLARE-PLAN.md, "Instagram connection"): Facebook Login in
// the browser, the Page pick, the Page token sealed on the clients row. Replaces
// spine/publisher/auth.py's token pasting.
//
//   GET  /connect/<client>   (a member, in a browser)  -> 302 to Facebook's dialog
//   GET  /connect/callback?code&state                   -> the Page pick form; the state was
//                                                          signed here for that member and client
//   POST /connect/pick  id, page_id (the form)          -> the Page token stored, "Connected"
//
// The scopes are PLAN.md §5's. While the Meta app is in development mode only people with a
// role on it can get through the dialog.

import { open, seal } from "./crypto.ts";
import { iso } from "./db.ts";
import { GRAPH, request, VERSION, type Fetcher } from "./graph.ts";
import { HttpError } from "./http.ts";
import { mint, verify } from "./session.ts";

export interface ConnectEnv {
  DB: D1Database;
  META_APP_ID: string;
  META_APP_SECRET: string;
  SESSION_SECRET: string;
  TOKEN_SECRET: string;
}

export const SCOPES = [
  "instagram_basic", "instagram_content_publish", "instagram_manage_comments", "instagram_manage_messages",
  "instagram_manage_insights", "pages_show_list", "pages_read_engagement",
];
const STATE_TTL_MS = 10 * 60 * 1000;
const PENDING_TTL_MS = 10 * 60 * 1000;
type Json = Record<string, unknown>;
interface Page {
  id: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: { id?: string; username?: string };
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

function page(body: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tachyon · Connect Instagram</title>
<style>body{font:16px system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem;color:#111}button{font:inherit;padding:.5rem 1rem;margin:.25rem 0}</style>
<h1>Connect Instagram</h1>
${body}
</html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'" },
  });
}

function hex32(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function isMember(env: ConnectEnv, user: number, client: string): Promise<boolean> {
  const r = await env.DB.prepare(
    "SELECT 1 FROM users u WHERE u.id = ? AND (u.admin = 1 OR EXISTS (SELECT 1 FROM memberships m WHERE m.user = u.id AND m.client = ?))",
  )
    .bind(user, client)
    .first();
  return Boolean(r);
}

/** Facebook's dialog URL for a member; the state binds the callback to this user and client. */
export async function startUrl(env: ConnectEnv, origin: string, userId: number, client: string, now: number): Promise<string> {
  if (!env.META_APP_ID) throw new HttpError(503, "meta-app", "META_APP_ID is not set");
  const state = await mint({ sub: `${userId}:${client}`, exp: now + STATE_TTL_MS, ep: 0 }, env.SESSION_SECRET);
  const q = new URLSearchParams({ client_id: env.META_APP_ID, redirect_uri: `${origin}/connect/callback`, state, scope: SCOPES.join(","), response_type: "code" });
  return `https://www.facebook.com/${VERSION}/dialog/oauth?${q}`;
}

/** Back from Facebook: the code becomes a long-lived user token, the Pages are listed (their
    tokens sealed in a pending row), the member picks one. */
export async function callback(env: ConnectEnv, url: URL, now: number, fetcher: Fetcher = fetch): Promise<Response> {
  if (url.searchParams.get("error")) {
    return page(`<p>Facebook refused: ${esc(url.searchParams.get("error_description") ?? url.searchParams.get("error"))}</p>`, 400);
  }
  const code = url.searchParams.get("code") ?? "";
  const session = await verify(url.searchParams.get("state") ?? "", env.SESSION_SECRET, now);
  if (!session || !code) throw new HttpError(400, "state", "the sign-in is stale; start Connect again");
  const [userText, client] = session.sub.split(":");
  const user = Number(userText);
  if (!client || !Number.isInteger(user) || !(await isMember(env, user, client))) throw new HttpError(403, "member");
  const origin = `${url.protocol}//${url.host}`;
  const short = await request(fetcher, "GET", `${GRAPH}/oauth/access_token?${new URLSearchParams({
    client_id: env.META_APP_ID, redirect_uri: `${origin}/connect/callback`, client_secret: env.META_APP_SECRET, code,
  })}`);
  const long = await request(fetcher, "GET", `${GRAPH}/oauth/access_token?${new URLSearchParams({
    grant_type: "fb_exchange_token", client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, fb_exchange_token: String(short.access_token),
  })}`);
  const pages = ((await request(fetcher, "GET", `${GRAPH}/me/accounts?${new URLSearchParams({
    fields: "id,name,access_token,instagram_business_account{id,username}", access_token: String(long.access_token),
  })}`)).data ?? []) as Page[];
  if (!pages.length) return page("<p>This Facebook account manages no Page. The Instagram account must be a professional one linked to a Page you manage.</p>", 400);
  const id = hex32();
  await env.DB.prepare("INSERT INTO pending_connects (id, user, client, pages_enc, expires) VALUES (?, ?, ?, ?, ?)")
    .bind(id, user, client, await seal(JSON.stringify(pages), env.TOKEN_SECRET), now + PENDING_TTL_MS)
    .run();
  const forms = pages.map((p) => {
    const ig = p.instagram_business_account;
    const label = ig?.id ? `${esc(p.name)} → @${esc(ig.username ?? ig.id)}` : `${esc(p.name)} (no Instagram professional account)`;
    return `<form method="post" action="/connect/pick"><input type="hidden" name="id" value="${id}"><input type="hidden" name="page_id" value="${esc(p.id)}"><button${ig?.id ? "" : " disabled"}>${label}</button></form>`;
  });
  return page(`<p>Which Page is <b>${esc(client)}</b>'s Instagram linked to?</p>${forms.join("\n")}`);
}

/** The pick: the Page token sealed on the clients row, with the Instagram account it carries. */
export async function pick(env: ConnectEnv, form: FormData, now: number, fetcher: Fetcher = fetch): Promise<Response> {
  const id = String(form.get("id") ?? "");
  const pageId = String(form.get("page_id") ?? "");
  const row = await env.DB.prepare("SELECT * FROM pending_connects WHERE id = ? AND expires > ?")
    .bind(id, now)
    .first<{ id: string; user: number; client: string; pages_enc: string }>();
  if (!row) throw new HttpError(400, "pending", "the sign-in is stale; start Connect again");
  if (!(await isMember(env, row.user, row.client))) throw new HttpError(403, "member");
  const pages = JSON.parse(await open(row.pages_enc, env.TOKEN_SECRET)) as Page[];
  const p = pages.find((x) => String(x.id) === pageId);
  if (!p?.access_token) throw new HttpError(400, "page", "not one of the Pages listed");
  const ig = p.instagram_business_account;
  if (!ig?.id) throw new HttpError(400, "page", "that Page has no Instagram professional account");
  // Meta cuts data access 90 days after the last login to the app; the dashboard warns before it
  let expires: number | null = null;
  try {
    const d = (await request(fetcher, "GET", `${GRAPH}/debug_token?${new URLSearchParams({ input_token: p.access_token, access_token: `${env.META_APP_ID}|${env.META_APP_SECRET}` })}`)).data as Json | undefined;
    if (d?.data_access_expires_at) expires = Number(d.data_access_expires_at) * 1000;
  } catch {
    expires = null; // the debug call is informational
  }
  await env.DB.batch([
    env.DB.prepare("UPDATE clients SET token_enc = ?, token_expires = ?, page_id = ?, ig_user_id = ?, ig_username = ? WHERE id = ?").bind(
      await seal(p.access_token, env.TOKEN_SECRET), expires, String(p.id), String(ig.id), ig.username ?? null, row.client,
    ),
    env.DB.prepare("INSERT INTO journal (client, ts, action, target, intent, by) VALUES (?, ?, 'meta.connect', NULL, ?, ?)").bind(
      row.client, iso(now), JSON.stringify({ page_id: p.id, ig_user_id: ig.id, ig_username: ig.username ?? null }), row.user,
    ),
    env.DB.prepare("DELETE FROM pending_connects WHERE id = ?").bind(id),
  ]);
  return page(`<p>Connected <b>${esc(row.client)}</b> to @${esc(ig.username ?? ig.id)} (Page ${esc(p.name)}).</p>`);
}
