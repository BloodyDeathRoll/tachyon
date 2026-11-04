// Tachyon Worker - the online half of docs/CLOUDFLARE-PLAN.md. Phases 0-1: Google
// sign-in (invite-only), members per client, the job queue the PCs poll, and video
// upload to R2. No dashboard, publisher or cron yet; those are later phases.
//
//   POST /auth/google  {code} | {credential}       -> {token, profile, admin, clients}
//   GET  /me                                       -> {profile, admin, clients}
//   POST /auth/logout                              -> {ok}      revokes every session
//   POST /api/hosts    {id, name, clients, caps}   -> {clients} a PC registers; clients it is
//                                                     not a member of are dropped
//   GET  /api/jobs/next?host=<id>                  -> job | 204  claim the oldest open job for
//                                                     the host's clients (5 min lease)
//   POST /api/jobs     {kind, client, slot_id, payload} -> {id}
//   POST /api/jobs/<id>/heartbeat | done | fail  {host, result}
//   PUT  /api/media/<client>/<slot>/video | cover  body = the file -> {key}
//   GET  /api/media/<client>/<slot>/video | cover  -> the file
//
// Authenticated routes take `Authorization: Bearer <session>`. session.ts and google.ts
// are Rosa's (deploy/user-api), unchanged; the session's `sub` carries users.id here.

import { TokenError, verifyIdToken, type GoogleClaims } from "./google.ts";
import { mint, SESSION_TTL_MS, verify } from "./session.ts";

export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string; // secret: needed to exchange a code for an ID token
  SESSION_SECRET: string;
}

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const MAX_BODY_BYTES = 64 * 1024;
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // the Free-plan request body limit (docs/CLOUDFLARE-PLAN.md, limits)
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;
const JOB_LEASE_MS = 5 * 60 * 1000; // a running job silent this long goes back to the queue
const ID = /^[\w-]{1,64}$/; // client, slot and host ids
const JOB_KINDS = new Set(["plan", "produce", "revise", "formats", "voice", "upload", "spec"]);
const MEDIA = {
  video: { ext: "mp4", type: "video/mp4", column: "r2_key" },
  cover: { ext: "jpg", type: "image/jpeg", column: "cover_key" },
} as const;

export interface UserRow {
  id: number;
  email: string;
  google_sub: string | null;
  name: string | null;
  picture: string | null;
  admin: number;
  session_epoch: number;
  created_at: number;
  last_seen_at: number | null;
}
interface HostRow {
  id: string;
  user: number;
  name: string;
  clients: string;
  caps: string;
  last_seen: number;
}
interface JobRow {
  id: number;
  kind: string;
  client: string;
  slot_id: string | null;
  state: string;
  holder: string | null;
  until: number | null;
  payload: string | null;
  result: string | null;
  by: number | null;
  created_at: number;
  updated_at: number;
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  const len = Number(req.headers.get("Content-Length") ?? "0");
  if (len > MAX_BODY_BYTES) throw new HttpError(413, "body");
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, "body");
  try {
    const v: unknown = text ? JSON.parse(text) : {};
    if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error();
    return v as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "json");
  }
}

function id(v: unknown, what: string): string {
  if (typeof v !== "string" || !ID.test(v)) throw new HttpError(400, what);
  return v;
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && ID.test(x)) : [];
}

function parseList(text: string): string[] {
  try {
    return strings(JSON.parse(text));
  } catch {
    return [];
  }
}

function hex32(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Exchange the browser's one-time code for an ID token. `redirect_uri` is
    literally "postmessage" for the GIS popup flow. Anything but a clean 200 is a
    401 - the code was wrong, reused, or for another client. */
async function exchangeCode(code: string, env: Env): Promise<string> {
  if (!env.GOOGLE_CLIENT_SECRET) throw new HttpError(503, "google-secret");
  let r: Response;
  try {
    r = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: "postmessage",
        grant_type: "authorization_code",
      }),
    });
  } catch {
    throw new HttpError(503, "google");
  }
  if (!r.ok) throw new HttpError(401, "token:code");
  const body = (await r.json()) as { id_token?: string };
  if (typeof body.id_token !== "string") throw new HttpError(401, "token:code");
  return body.id_token;
}

// ── users and membership ──────────────────────────────────────────────────────

/** The users row for a verified Google identity, or a 403. Invite-only: a Google
    account signs in only if an admin added its email. The first sign-in binds
    `google_sub` to that row; after that the match is on `google_sub` alone, so a
    later email change keeps the account. */
export async function bindUser(env: Env, claims: GoogleClaims): Promise<UserRow> {
  const bySub = env.DB.prepare("SELECT * FROM users WHERE google_sub = ?");
  let row = await bySub.bind(claims.sub).first<UserRow>();
  if (!row) {
    if (!claims.email) throw new HttpError(403, "invite");
    const r = await env.DB.prepare(
      "UPDATE users SET google_sub = ?, name = ?, picture = ? WHERE google_sub IS NULL AND email = lower(?)",
    )
      .bind(claims.sub, claims.name, claims.picture, claims.email)
      .run();
    if (r.meta.changes !== 1) throw new HttpError(403, "invite");
    row = await bySub.bind(claims.sub).first<UserRow>();
    if (!row) throw new HttpError(500, "db");
  } else if (row.name !== claims.name || row.picture !== claims.picture) {
    await env.DB.prepare("UPDATE users SET name = ?, picture = ? WHERE id = ?").bind(claims.name, claims.picture, row.id).run();
  }
  return row;
}

/** The clients `user` manages: every client for an admin, else their memberships. */
async function clientsOf(env: Env, user: UserRow): Promise<string[]> {
  const q = user.admin
    ? env.DB.prepare("SELECT id AS client FROM clients ORDER BY id")
    : env.DB.prepare("SELECT client FROM memberships WHERE user = ? ORDER BY client").bind(user.id);
  return (await q.all<{ client: string }>()).results.map((r) => r.client);
}

async function member(env: Env, user: UserRow, client: string): Promise<void> {
  if (!(await clientsOf(env, user)).includes(client)) throw new HttpError(403, "member");
}

/** The signed-in user for this request, or a 401. Touches last_seen_at at most every 5 min. */
async function auth(req: Request, env: Env, ctx: ExecutionContext, now: number): Promise<UserRow> {
  const h = req.headers.get("Authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token) throw new HttpError(401, "auth");
  const session = await verify(token, env.SESSION_SECRET, now);
  if (!session) throw new HttpError(401, "auth");
  const row = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(Number(session.sub)).first<UserRow>();
  if (!row || row.session_epoch !== session.ep) throw new HttpError(401, "auth");
  if (now - (row.last_seen_at ?? 0) > LAST_SEEN_THROTTLE_MS) {
    ctx.waitUntil(env.DB.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?").bind(now, row.id).run());
  }
  return row;
}

async function me(env: Env, row: UserRow): Promise<Response> {
  return json(200, {
    profile: { id: row.id, email: row.email, name: row.name, picture: row.picture },
    admin: Boolean(row.admin),
    clients: await clientsOf(env, row),
  });
}

async function signIn(req: Request, env: Env, now: number): Promise<Response> {
  const body = await readJson(req);
  let credential: string;
  if (typeof body.code === "string" && body.code.length > 0 && body.code.length <= 512) {
    credential = await exchangeCode(body.code, env);
  } else if (typeof body.credential === "string" && body.credential.length > 0 && body.credential.length <= MAX_BODY_BYTES) {
    credential = body.credential;
  } else {
    throw new HttpError(400, "credential");
  }
  let claims: GoogleClaims;
  try {
    claims = await verifyIdToken(credential, env.GOOGLE_CLIENT_ID, { now });
  } catch (e) {
    if (e instanceof TokenError) throw new HttpError(401, `token:${e.message}`);
    throw new HttpError(503, "google"); // JWKS unreachable - try again, do not sign a stranger in
  }
  const row = await bindUser(env, claims);
  const token = await mint({ sub: String(row.id), exp: now + SESSION_TTL_MS, ep: row.session_epoch }, env.SESSION_SECRET);
  const res = await me(env, row);
  return json(200, { token, ...((await res.json()) as object) });
}

// ── hosts and jobs ────────────────────────────────────────────────────────────

/** The caller's host row, or a 404 (another user's host id is a 404 too). */
async function hostOf(env: Env, user: UserRow, hostId: unknown): Promise<HostRow> {
  const row = await env.DB.prepare("SELECT * FROM hosts WHERE id = ? AND user = ?").bind(id(hostId, "host"), user.id).first<HostRow>();
  if (!row) throw new HttpError(404, "host");
  return row;
}

async function registerHost(req: Request, env: Env, user: UserRow, now: number): Promise<Response> {
  const body = await readJson(req);
  const hostId = id(body.id, "id");
  const name = typeof body.name === "string" && body.name.length <= 100 ? body.name : hostId;
  const mine = await clientsOf(env, user);
  const asked = strings(body.clients);
  const clients = asked.filter((c) => mine.includes(c));
  const r = await env.DB.prepare(
    `INSERT INTO hosts (id, user, name, clients, caps, last_seen) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, clients = excluded.clients, caps = excluded.caps,
       last_seen = excluded.last_seen WHERE hosts.user = excluded.user`,
  )
    .bind(hostId, user.id, name, JSON.stringify(clients), JSON.stringify(strings(body.caps)), now)
    .run();
  if (r.meta.changes !== 1) throw new HttpError(409, "host"); // the id belongs to another user
  return json(200, { clients, dropped: asked.filter((c) => !clients.includes(c)) });
}

/** Claim the oldest open job for one of the host's clients. The claim is one
    conditional UPDATE: it holds only if `meta.changes` is 1 (D1 has no locks). A
    running job whose lease ran out counts as open again. */
async function nextJob(url: URL, env: Env, ctx: ExecutionContext, user: UserRow, now: number): Promise<Response> {
  const host = await hostOf(env, user, url.searchParams.get("host"));
  if (now - host.last_seen > LAST_SEEN_THROTTLE_MS) {
    ctx.waitUntil(env.DB.prepare("UPDATE hosts SET last_seen = ? WHERE id = ?").bind(now, host.id).run());
  }
  const mine = await clientsOf(env, user); // re-read: a removed member's PC stops at once
  const clients = parseList(host.clients).filter((c) => mine.includes(c));
  if (clients.length === 0) return new Response(null, { status: 204 });
  const marks = clients.map(() => "?").join(",");
  const open = `(state = 'queued' OR (state = 'running' AND until < ?))`;
  const job = await env.DB.prepare(
    `SELECT * FROM jobs WHERE client IN (${marks}) AND ${open} ORDER BY created_at, id LIMIT 1`,
  )
    .bind(...clients, now)
    .first<JobRow>();
  if (!job) return new Response(null, { status: 204 });
  const r = await env.DB.prepare(
    `UPDATE jobs SET state = 'running', holder = ?, until = ?, updated_at = ? WHERE id = ? AND ${open}`,
  )
    .bind(host.id, now + JOB_LEASE_MS, now, job.id, now)
    .run();
  if (r.meta.changes !== 1) return new Response(null, { status: 204 }); // another host took it; poll again
  return json(200, { ...job, state: "running", holder: host.id, until: now + JOB_LEASE_MS });
}

async function enqueue(req: Request, env: Env, user: UserRow, now: number): Promise<Response> {
  const body = await readJson(req);
  const kind = body.kind;
  if (typeof kind !== "string" || !JOB_KINDS.has(kind)) throw new HttpError(400, "kind");
  const client = id(body.client, "client");
  await member(env, user, client);
  const slot = body.slot_id == null ? null : id(body.slot_id, "slot_id");
  const payload = body.payload == null ? null : JSON.stringify(body.payload);
  const r = await env.DB.prepare(
    "INSERT INTO jobs (kind, client, slot_id, payload, by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(kind, client, slot, payload, user.id, now, now)
    .run();
  return json(200, { id: r.meta.last_row_id });
}

/** heartbeat | done | fail on a job this host is running. A lost lease is a 409:
    the job was handed to another host, so this one's result is dropped. */
async function updateJob(req: Request, env: Env, user: UserRow, jobId: number, action: string, now: number): Promise<Response> {
  const body = await readJson(req);
  const host = await hostOf(env, user, body.host);
  const result = body.result == null ? null : JSON.stringify(body.result);
  const sets: Record<string, [string, unknown[]]> = {
    heartbeat: ["until = ?", [now + JOB_LEASE_MS]],
    done: ["state = 'done', result = ?, until = NULL", [result]],
    fail: ["state = 'failed', result = ?, until = NULL", [result]],
  };
  const set = sets[action];
  if (!set) throw new HttpError(404, "not found");
  const r = await env.DB.prepare(`UPDATE jobs SET ${set[0]}, updated_at = ? WHERE id = ? AND holder = ? AND state = 'running'`)
    .bind(...set[1], now, jobId, host.id)
    .run();
  if (r.meta.changes !== 1) throw new HttpError(409, "lease");
  return json(200, { ok: true });
}

// ── media ─────────────────────────────────────────────────────────────────────

/** PUT: the file streams into R2 under an unguessable key, the key is written on the
    post by compare-and-set (the row must still hold the key read before the upload, and
    a video's post must still be unpublished; otherwise the new object is deleted and
    the caller gets a 409), and the previous object is deleted. GET: the object, for a
    host's spec check and the dashboard player. */
async function media(req: Request, env: Env, user: UserRow, client: string, slot: string, name: string): Promise<Response> {
  const kind = MEDIA[name as keyof typeof MEDIA];
  if (!kind) throw new HttpError(404, "not found");
  await member(env, user, client);
  const post = await env.DB.prepare(`SELECT ig_media_id, ${kind.column} AS key FROM posts WHERE client = ? AND slot_id = ?`)
    .bind(client, slot)
    .first<{ ig_media_id: string | null; key: string | null }>();
  if (!post) throw new HttpError(404, "slot");
  if (req.method === "GET") {
    const obj = post.key ? await env.MEDIA.get(post.key) : null;
    if (!obj) throw new HttpError(404, "file");
    return new Response(obj.body, {
      headers: { "Content-Type": kind.type, "Content-Length": String(obj.size), "Cache-Control": "private, no-store" },
    });
  }
  if (req.method !== "PUT") throw new HttpError(405, "method");
  if (name === "video" && post.ig_media_id) throw new HttpError(409, "published");
  const len = Number(req.headers.get("Content-Length"));
  if (!req.body || !Number.isInteger(len) || len <= 0) throw new HttpError(411, "length");
  if (len > MAX_UPLOAD_BYTES) throw new HttpError(413, "size");
  const key = `${client}/${slot}/${hex32()}.${kind.ext}`;
  await env.MEDIA.put(key, req.body, { httpMetadata: { contentType: kind.type } });
  const guard = name === "video" ? " AND ig_media_id IS NULL" : "";
  const r = await env.DB.prepare(
    `UPDATE posts SET ${kind.column} = ? WHERE client = ? AND slot_id = ? AND ${kind.column} IS ?${guard}`,
  )
    .bind(key, client, slot, post.key)
    .run();
  if (r.meta.changes !== 1) {
    await env.MEDIA.delete(key);
    throw new HttpError(409, "changed");
  }
  if (post.key) await env.MEDIA.delete(post.key);
  return json(200, { key });
}

// ── router ────────────────────────────────────────────────────────────────────

async function route(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const now = Date.now();

  if (path === "/") return json(200, { ok: true, service: "tachyon" });
  if (path === "/auth/google" && req.method === "POST") return signIn(req, env, now);

  const user = await auth(req, env, ctx, now);
  const p = path.split("/").slice(1);

  if (path === "/me" && req.method === "GET") return me(env, user);
  if (path === "/auth/logout" && req.method === "POST") {
    await env.DB.prepare("UPDATE users SET session_epoch = session_epoch + 1 WHERE id = ?").bind(user.id).run();
    return json(200, { ok: true });
  }
  if (path === "/api/hosts" && req.method === "POST") return registerHost(req, env, user, now);
  if (path === "/api/jobs/next" && req.method === "GET") return nextJob(url, env, ctx, user, now);
  if (path === "/api/jobs" && req.method === "POST") return enqueue(req, env, user, now);
  if (p[0] === "api" && p[1] === "jobs" && p.length === 4 && /^\d{1,12}$/.test(p[2] ?? "") && req.method === "POST") {
    return updateJob(req, env, user, Number(p[2]), p[3] ?? "", now);
  }
  if (p[0] === "api" && p[1] === "media" && p.length === 5) {
    return media(req, env, user, id(p[2], "client"), id(p[3], "slot"), p[4] ?? "");
  }
  return json(404, { error: "not found" });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await route(req, env, ctx);
    } catch (e) {
      if (e instanceof HttpError) return json(e.status, { error: e.message });
      console.error("tachyon", e);
      return json(500, { error: "internal" });
    }
  },
} satisfies ExportedHandler<Env>;
