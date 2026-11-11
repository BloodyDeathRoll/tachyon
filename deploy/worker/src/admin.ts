// Users, members and clients, for an admin (docs/CLOUDFLARE-PLAN.md, "Access"). The JSON
// API the dashboard's Members and Clients pages (phase 6) call; a PC never does.
//
//   GET    /api/admin/users                      -> {users: [{id, email, name, admin, clients}]}
//   POST   /api/admin/users {email, admin?}      -> {id}        invite: the row the sign-in binds to
//   DELETE /api/admin/users/<id>                 -> {ok}        memberships and hosts go with it
//   POST   /api/admin/memberships {user, client} -> {ok}
//   DELETE /api/admin/memberships {user, client} -> {ok}
//   GET    /api/admin/clients                    -> {clients: [...]}  the rows without their tokens
//   POST   /api/admin/clients {id, name}         -> {id}        publisher 'worker': the cron posts for it

import { HttpError, json } from "./http.ts";

const ID = /^[\w-]{1,64}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Body = Record<string, unknown>;

async function users(env: { DB: D1Database }): Promise<Response> {
  const rows = (await env.DB.prepare("SELECT id, email, name, admin, google_sub IS NOT NULL AS signed_in, last_seen_at FROM users ORDER BY email").all<Record<string, unknown>>()).results;
  const members = (await env.DB.prepare("SELECT user, client FROM memberships ORDER BY client").all<{ user: number; client: string }>()).results;
  return json(200, {
    users: rows.map((u) => ({ ...u, admin: Boolean(u.admin), signed_in: Boolean(u.signed_in), clients: members.filter((m) => m.user === u.id).map((m) => m.client) })),
  });
}

export async function invite(env: { DB: D1Database }, body: Body, now: number): Promise<Response> {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL.test(email)) throw new HttpError(400, "email");
  try {
    const r = await env.DB.prepare("INSERT INTO users (email, admin, created_at) VALUES (?, ?, ?)").bind(email, body.admin === true ? 1 : 0, now).run();
    return json(200, { id: r.meta.last_row_id });
  } catch (e) {
    if (String(e).includes("UNIQUE")) throw new HttpError(409, "exists", `${email} is invited already`);
    throw e;
  }
}

async function membership(env: { DB: D1Database }, body: Body, add: boolean): Promise<Response> {
  const user = typeof body.user === "number" && Number.isInteger(body.user) ? body.user : NaN;
  const client = typeof body.client === "string" && ID.test(body.client) ? body.client : "";
  if (!Number.isFinite(user) || !client) throw new HttpError(400, "membership");
  if (add) {
    if (!(await env.DB.prepare("SELECT 1 FROM clients WHERE id = ?").bind(client).first())) throw new HttpError(404, "client");
    if (!(await env.DB.prepare("SELECT 1 FROM users WHERE id = ?").bind(user).first())) throw new HttpError(404, "user");
    await env.DB.prepare("INSERT OR IGNORE INTO memberships (user, client) VALUES (?, ?)").bind(user, client).run();
  } else {
    await env.DB.prepare("DELETE FROM memberships WHERE user = ? AND client = ?").bind(user, client).run();
  }
  return json(200, { ok: true });
}

// first path segments index.ts (and pages/index.ts's /admin) route before a client's pages; paths
// compare case-sensitively there, so `App` is a plain client. api.test.mjs checks the list against index.ts.
export const RESERVED = new Set(["app", "me", "m", "ig", "static", "api", "auth", "login", "connect", "admin"]);

async function createClient(env: { DB: D1Database }, body: Body, by: number, now: number): Promise<Response> {
  const id = typeof body.id === "string" && ID.test(body.id) ? body.id : "";
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 100) : id;
  if (!id) throw new HttpError(400, "id");
  if (RESERVED.has(id)) throw new HttpError(400, "reserved", `${id} is a path of the Worker's own`);
  try {
    await env.DB.prepare("INSERT INTO clients (id, name, publisher, created_by, created_at) VALUES (?, ?, 'worker', ?, ?)").bind(id, name, by, now).run();
  } catch (e) {
    if (String(e).includes("UNIQUE")) throw new HttpError(409, "exists", `client ${id} exists`);
    throw e;
  }
  return json(200, { id });
}

/** The admin routes under /api/admin, or null. The caller has checked `user.admin`. */
export async function admin(req: Request, env: { DB: D1Database }, p: string[], body: () => Promise<Body>, by: number, now: number): Promise<Response | null> {
  const m = req.method;
  if (p[2] === "users" && p.length === 3 && m === "GET") return users(env);
  if (p[2] === "users" && p.length === 3 && m === "POST") return invite(env, await body(), now);
  if (p[2] === "users" && p.length === 4 && m === "DELETE" && /^\d{1,12}$/.test(p[3] ?? "")) {
    // an admin cannot remove themself, so one admin always remains; nothing demotes an admin
    // (the only way to make one is the invite's `admin` flag)
    if (Number(p[3]) === by) throw new HttpError(400, "self", "an admin cannot remove themself");
    await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(Number(p[3])).run(); // memberships and hosts cascade; sessions die with the row
    return json(200, { ok: true });
  }
  if (p[2] === "memberships" && p.length === 3 && (m === "POST" || m === "DELETE")) return membership(env, await body(), m === "POST");
  if (p[2] === "clients" && p.length === 3 && m === "GET") {
    const rows = (await env.DB.prepare("SELECT id, name, ig_user_id, page_id, ig_username, token_enc IS NOT NULL AS connected, token_expires, emergency_stop, publisher, created_at FROM clients ORDER BY id").all()).results;
    return json(200, { clients: rows });
  }
  if (p[2] === "clients" && p.length === 3 && m === "POST") return createClient(env, await body(), by, now);
  return null;
}
