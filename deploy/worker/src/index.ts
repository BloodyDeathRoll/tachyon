// Tachyon Worker - the online half of docs/CLOUDFLARE-PLAN.md: Google sign-in
// (invite-only), members per client, the job queue the PCs poll, video upload to R2,
// spine/db.py's ops on D1, Connect Instagram (src/connect.ts), the publishing cron
// (src/cron.ts, src/publish.ts) and the dashboard pages (src/pages/, phase 6, first slice).
//
//   POST /auth/google  {code} | {credential}       -> {token, profile, admin, clients}; also
//                                                     sets the `s` cookie for the browser pages
//   GET  /connect/<client>, /connect/callback, POST /connect/pick   src/connect.ts
//   GET  /app                                      -> 302 to the user's first client's overview
//   GET  /<client>, /<client>/v/<slot>[/byhand|/qa], POST /<client>/v/<slot>/<action>   src/pages/
//   GET  /m/<client>/<slot>/video | cover          -> the file, for the pages' player (cookie ok)
//   GET  /me                                       -> {profile, admin, clients}
//   POST /auth/logout                              -> {ok}      revokes every session
//   POST /api/hosts    {id, name, clients, caps}   -> {clients} a PC registers; clients it is
//                                                     not a member of are dropped
//   GET  /login                                    -> the sign-in page: Google, then the session
//                                                     token to paste into `spine.worker login`
//   GET  /manifest.webmanifest, /icon.svg          -> the web-app manifest, public
//   GET  /api/jobs/next?host=<id>                  -> job | 204  claim the oldest open job for
//                                                     the host's clients (5 min lease)
//   GET  /api/jobs?client=<c>[&slot=<s>]           -> the client's last 50 jobs, newest first
//   POST /api/jobs     {kind, client, slot_id, payload} -> {id}
//   POST /api/jobs/<id>/heartbeat | done | fail  {host, result}   done with result.media
//                                                     {path, sha, size} records the file on the host
//   PUT  /api/media/<client>/<slot>/video | cover  body = the file, X-Sha256 -> {key}
//   GET  /api/media/<client>/<slot>/video | cover  -> the file
//   POST /api/db/<client>/<op>  {...args}          -> the op's result (src/db.ts: spine/db.py's
//                                                     methods, for a member of the client)
//   /api/admin/users | memberships | clients       -> src/admin.ts, admins only
//
// Authenticated routes take `Authorization: Bearer <session>` (the PCs) or the `s`
// cookie (the browser). session.ts and google.ts are Rosa's (deploy/user-api), unchanged;
// the session's `sub` carries users.id here. An error is {error: <code>, detail?: <sentence>}.

import { admin } from "./admin.ts";
import { callback, pick, startUrl } from "./connect.ts";
import { tick } from "./cron.ts";
import { OPS } from "./db.ts";
import { TokenError, verifyIdToken, type GoogleClaims } from "./google.ts";
import { HttpError, json } from "./http.ts";
import { insertJob, JOB_KINDS } from "./jobs.ts";
import { clientsOf, member, type UserRow } from "./members.ts";
import { homePage } from "./pages/home.ts";
import { pages } from "./pages/index.ts";
import { esc } from "./pages/shell.ts";
import { roomFor } from "./quota.ts";
import { mint, SESSION_TTL_MS, verify } from "./session.ts";

export { HttpError };
export type { UserRow };

export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string; // secret: needed to exchange a code for an ID token
  SESSION_SECRET: string;
  META_APP_ID: string;
  META_APP_SECRET: string; // secret
  TOKEN_SECRET: string; // secret: seals the Page tokens (src/crypto.ts)
  MEDIA_PUBLIC_URL: string;
  VERCEL_TOKEN?: string; // secret: the bio link
}

const COOKIE = "s";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const MAX_BODY_BYTES = 64 * 1024;
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // the Free-plan request body limit (docs/CLOUDFLARE-PLAN.md, limits)
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;
const JOB_LEASE_MS = 5 * 60 * 1000; // a running job silent this long goes back to the queue
const ID = /^[\w-]{1,64}$/; // client, slot and host ids
const JOBS_LIST = 50;
const MEDIA = {
  video: { ext: "mp4", type: "video/mp4", column: "r2_key" },
  cover: { ext: "jpg", type: "image/jpeg", column: "cover_key" },
} as const;
// slice c: the web-app manifest (docs/CLOUDFLARE-PLAN.md, "Dashboard") and its icon, the only
// static files here. Colours are the shell's --side and --ground. Public: a manifest is fetched
// without the cookie unless the link says use-credentials (MDN, crossorigin), and it holds nothing.
const MANIFEST = JSON.stringify({ name: "Tachyon", short_name: "Tachyon", start_url: "/app", display: "standalone", background_color: "#F8F8F8", theme_color: "#111111", icons: [{ src: "/icon.svg", sizes: "192x192 512x512", type: "image/svg+xml" }, { src: "/icon.svg", sizes: "any", type: "image/svg+xml" }] });
const ICON = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='#111'/><text x='32' y='45' text-anchor='middle' font-family='system-ui,sans-serif' font-weight='800' font-size='38' fill='#8DF000'>T</text></svg>";

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

function cookie(req: Request, name: string): string {
  for (const part of (req.headers.get("Cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return "";
}

/** The signed-in user for this request, or a 401. The cookie counts only for the browser
    pages: the API (the PCs' routes, a GET of which claims a job) takes the header alone, so
    no cross-site navigation can act through a signed-in browser. Touches last_seen_at at
    most every 5 min. */
async function auth(req: Request, env: Env, ctx: ExecutionContext, now: number, path: string): Promise<UserRow> {
  const h = req.headers.get("Authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : path.startsWith("/api/") ? "" : cookie(req, COOKIE);
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
  const res = json(200, { token, ...((await (await me(env, row)).json()) as object) });
  // the browser pages (Connect, later the dashboard) ride on the cookie; Lax keeps a cross-site POST from carrying it
  res.headers.append("Set-Cookie", `${COOKIE}=${token}; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; HttpOnly; Secure; SameSite=Lax`);
  return res;
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
  // two hosts, or the cron and a button, asking for the same week while it is still open: one job
  return json(200, await insertJob(env.DB, kind, client, slot, payload, user.id, now));
}

/** heartbeat | done | fail on a job this host is running. A lost lease is a 409:
    the job was handed to another host, so this one's result is dropped. A done
    result's `media` ({path, sha, size}) says the slot's video is on this host. */
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
  const media = action === "done" && typeof body.result === "object" && body.result !== null ? (body.result as Record<string, unknown>).media : null;
  if (media && typeof media === "object") {
    const m = media as Record<string, unknown>;
    const job = await env.DB.prepare("SELECT client, slot_id FROM jobs WHERE id = ?").bind(jobId).first<{ client: string; slot_id: string | null }>();
    if (job?.slot_id && typeof m.path === "string") {
      await env.DB.prepare(
        "INSERT INTO media (client, slot_id, host, path, sha, size) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(client, slot_id, host) DO UPDATE SET path = excluded.path, sha = excluded.sha, size = excluded.size",
      )
        .bind(job.client, job.slot_id, host.id, m.path, typeof m.sha === "string" ? m.sha : null, typeof m.size === "number" ? m.size : null)
        .run();
    }
  }
  return json(200, { ok: true });
}

async function listJobs(url: URL, env: Env, user: UserRow): Promise<Response> {
  const client = id(url.searchParams.get("client"), "client");
  await member(env, user, client);
  const slot = url.searchParams.get("slot");
  const q = slot
    ? env.DB.prepare(`SELECT * FROM jobs WHERE client = ? AND slot_id = ? ORDER BY id DESC LIMIT ${JOBS_LIST}`).bind(client, id(slot, "slot"))
    : env.DB.prepare(`SELECT * FROM jobs WHERE client = ? ORDER BY id DESC LIMIT ${JOBS_LIST}`).bind(client);
  return json(200, { jobs: (await q.all<JobRow>()).results });
}

/** Where sign-in goes next: a path on this site only (`/\\evil.com` and `//evil.com` are other
    sites to a browser), else /app. Runs in the page too: loginPage inlines its source, so keep
    it one plain function (no nested named functions, no imports). */
export function safeNext(next: string | null, origin: string): string {
  if (!next) return "/app";
  try {
    const u = new URL(next, origin);
    // the origin written out, not just the path: a path like //evil.com (from /.//evil.com) is
    // another host on its own; built from parts so no user@ part comes along
    return u.origin === origin ? origin + u.pathname + u.search + u.hash : "/app";
  } catch {
    return "/app";
  }
}

/** The sign-in page: Google's button, then the session token for `python -m spine.worker login`. */
function loginPage(env: Env): Response {
  const setup = env.GOOGLE_CLIENT_ID
    ? `<div id="g"></div>
<script src="https://accounts.google.com/gsi/client" async></script>
<script>
window.onload = () => {
  google.accounts.id.initialize({ client_id: ${JSON.stringify(env.GOOGLE_CLIENT_ID)}, callback: async (r) => {
    const x = await fetch("/auth/google", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential: r.credential }) });
    const j = await x.json();
    if (!x.ok) { m.textContent = "Refused: " + j.error + (j.error === "invite" ? " (ask an admin to invite this email)" : ""); return; }
    const q = new URLSearchParams(location.search);
    if (q.get("pc") !== "1") {
      location.replace((${safeNext.toString()})(q.get("next"), location.origin)); // same site only
      return;
    }
    m.textContent = "Signed in as " + j.profile.email + ". Copy the token into: python -m spine.worker login " + location.origin;
    t.hidden = false; t.value = j.token;
  } });
  google.accounts.id.renderButton(g, { theme: "outline", size: "large" });
};
</script>`
    : "<p>Not configured yet: GOOGLE_CLIENT_ID is empty (wrangler.toml).</p>";
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tachyon sign-in</title>
<style>body{font:16px system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem;color:#111}textarea{width:100%;height:8rem;font:13px monospace}</style>
<h1>Tachyon</h1>
<p>Sign in with the Google account an admin invited.</p>
<p id="pc" hidden>Linking a PC: sign in, then copy the token below into the PC.</p>
<script>if (new URLSearchParams(location.search).get("pc") === "1") document.getElementById("pc").hidden = false;</script>
${setup}
<p id="m"></p>
<textarea id="t" readonly hidden></textarea>
</html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'unsafe-inline' https://accounts.google.com/gsi/client; frame-src https://accounts.google.com/gsi/; connect-src 'self' https://accounts.google.com/gsi/; style-src 'unsafe-inline' https://accounts.google.com/gsi/style; img-src 'self' data:",
    },
  });
}

// ── media ─────────────────────────────────────────────────────────────────────

/** PUT: the file streams into R2 under an unguessable key, the key is written on the
    post by compare-and-set (the row must still hold the key read before the upload, and
    a video's post must still be unpublished; otherwise the new object is deleted and
    the caller gets a 409), and the previous object is deleted. GET: the object, for a
    host's spec check and the dashboard player; a Range request gets its part (a phone's
    video player refuses a file it cannot seek). */
// A stored file, whole or one `bytes=` range. The range is read here rather than handed to R2:
// what R2 answers to a range past the end is not documented (the local one serves the whole
// file), and the headers come from these numbers. Anything else in Range is ignored and the whole
// file goes, as RFC 9110 allows.
async function serve(req: Request, bucket: R2Bucket, key: string, type: string): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "private, no-store" };
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("Range")?.trim() ?? "");
  // an end before the start is not a range either (RFC 9110: ignored); a key is never overwritten
  // (a replaced video gets a new key), so the head's size holds for the get that follows
  if (m && (m[1] || m[2]) && !(m[1] && m[2] && Number(m[2]) < Number(m[1]))) {
    const head = await bucket.head(key);
    if (!head) throw new HttpError(404, "file");
    const start = m[1] ? Number(m[1]) : Math.max(0, head.size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), head.size - 1) : head.size - 1;
    if (start >= head.size) return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${head.size}` } });
    const part = await bucket.get(key, { range: { offset: start, length: end - start + 1 } });
    if (!part) throw new HttpError(404, "file");
    return new Response(part.body, { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${head.size}`, "Content-Length": String(end - start + 1) } });
  }
  const obj = await bucket.get(key);
  if (!obj) throw new HttpError(404, "file");
  return new Response(obj.body, { status: 200, headers: { ...headers, "Content-Length": String(obj.size) } });
}

// GET /ig/<client>/<slot>/<random>.mp4, no sign-in: the address Instagram fetches the video from
// (publish.ts, MEDIA_PUBLIC_URL). The key's 128 random bits are the only secret, and only a video
// still waiting to publish is served: once published the file is deleted, and a replaced one has
// no row pointing at it.
async function publicVideo(req: Request, env: Env, key: string): Promise<Response> {
  if (!/^[a-z0-9-]+\/[A-Za-z0-9_-]+\/[0-9a-f]{32}\.mp4$/.test(key)) throw new HttpError(404, "not found");
  const row = await env.DB.prepare("SELECT 1 AS ok FROM posts WHERE r2_key = ? AND ig_media_id IS NULL").bind(key).first();
  if (!row) throw new HttpError(404, "not found");
  const res = await serve(req, env.MEDIA, key, MEDIA.video.type);
  return req.method === "HEAD" ? new Response(null, { status: res.status, headers: res.headers }) : res;
}

export async function media(req: Request, env: { DB: D1Database; MEDIA: R2Bucket }, user: UserRow, client: string, slot: string, name: string): Promise<Response> {
  const kind = MEDIA[name as keyof typeof MEDIA];
  if (!kind) throw new HttpError(404, "not found");
  await member(env, user, client);
  const post = await env.DB.prepare(`SELECT ig_media_id, ${kind.column} AS key FROM posts WHERE client = ? AND slot_id = ?`)
    .bind(client, slot)
    .first<{ ig_media_id: string | null; key: string | null }>();
  if (!post) throw new HttpError(404, "slot");
  if (req.method === "GET") {
    if (!post.key) throw new HttpError(404, "file");
    return serve(req, env.MEDIA, post.key, kind.type);
  }
  if (req.method !== "PUT") throw new HttpError(405, "method");
  if (name === "video" && post.ig_media_id) throw new HttpError(409, "published");
  const len = Number(req.headers.get("Content-Length"));
  if (!req.body || !Number.isInteger(len) || len <= 0) throw new HttpError(411, "length");
  if (len > MAX_UPLOAD_BYTES) throw new HttpError(413, "size");
  if (!(await roomFor(env.MEDIA, len))) throw new HttpError(507, "storage"); // stay inside R2's free tier; check-then-put is not atomic, the cap's 2 GB margin absorbs a race
  const key = `${client}/${slot}/${hex32()}.${kind.ext}`;
  await env.MEDIA.put(key, req.body, { httpMetadata: { contentType: kind.type } });
  // a video is not replaced while Instagram may be fetching it (a container in flight)
  const guard = name === "video" ? " AND ig_media_id IS NULL AND state != 'PUBLISHING'" : "";
  // the file's sha256, as the host computed it: what it compares its cut against next time
  const sha = /^[0-9a-f]{64}$/.exec(req.headers.get("X-Sha256") ?? "")?.[0] ?? null;
  const shaSet = name === "video" ? ", r2_sha = ?" : "";
  let changes = 0;
  try {
    const r = await env.DB.prepare(
      `UPDATE posts SET ${kind.column} = ?${shaSet} WHERE client = ? AND slot_id = ? AND ${kind.column} IS ?${guard}`,
    )
      .bind(key, ...(name === "video" ? [sha] : []), client, slot, post.key)
      .run();
    changes = r.meta.changes;
  } finally {
    if (changes !== 1) await env.MEDIA.delete(key).catch(() => {}); // no row points at it, whatever the cause
  }
  if (changes !== 1) throw new HttpError(409, "changed");
  if (post.key) await env.MEDIA.delete(post.key).catch(() => {}); // unreferenced now, so not an error
  return json(200, { key });
}

// ── a client's icon: the sidebar's avatar (app.py's assets/icon.png), sent up by a PC ─────────
const AVATAR_MAX = 512 * 1024;

async function avatarImage(env: Env, user: UserRow, client: string): Promise<Response> {
  await member(env, user, client);
  const obj = await env.MEDIA.get(`${client}/avatar.png`);
  if (obj) return new Response(obj.body, { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" } });
  const row = await env.DB.prepare("SELECT name FROM clients WHERE id = ?").bind(client).first<{ name: string | null }>();
  const letter = esc((row?.name || client).slice(0, 1).toUpperCase());
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="20" fill="#84E01B"/><text x="20" y="26" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-weight="700" font-size="17" fill="#111">${letter}</text></svg>`;
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=300" } });
}

async function avatarUpload(req: Request, env: Env, user: UserRow, client: string): Promise<Response> {
  await member(env, user, client);
  const len = Number(req.headers.get("Content-Length"));
  if (!req.body || !Number.isInteger(len) || len <= 0) throw new HttpError(411, "length");
  if (len > AVATAR_MAX) throw new HttpError(413, "size");
  await env.MEDIA.put(`${client}/avatar.png`, req.body, { httpMetadata: { contentType: "image/png" } });
  return json(200, { ok: true });
}

// ── router ────────────────────────────────────────────────────────────────────

async function route(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const now = Date.now();

  if (path === "/") return Response.redirect(`${url.origin}/app`, 302);
  if (path === "/login" && req.method === "GET") return loginPage(env);
  // slice c
  if (path === "/manifest.webmanifest" && req.method === "GET") return new Response(MANIFEST, { headers: { "Content-Type": "application/manifest+json" } });
  if (path === "/icon.svg" && req.method === "GET") return new Response(ICON, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" } });
  if (path === "/auth/google" && req.method === "POST") return signIn(req, env, now);
  // back from Facebook: the signed state, not a session, says who this is
  if (path === "/connect/callback" && req.method === "GET") return callback(env, url, now);
  if (path === "/connect/pick" && req.method === "POST") return pick(env, await req.formData(), now);
  if (path.startsWith("/ig/") && (req.method === "GET" || req.method === "HEAD")) return publicVideo(req, env, path.slice(4));

  const p = path.split("/").slice(1);
  let user: UserRow;
  try {
    user = await auth(req, env, ctx, now, path);
  } catch (e) {
    // a browser page without a session: sign in, then back here. The API, /me and the
    // player's /m/ files keep their 401: a PC or a <video> cannot follow a sign-in page.
    if (e instanceof HttpError && e.status === 401 && req.method === "GET" && p[0] !== "api" && p[0] !== "m" && path !== "/me") {
      return Response.redirect(`${url.origin}/login?next=${encodeURIComponent(path + url.search)}`, 302);
    }
    throw e;
  }

  if (path === "/me" && req.method === "GET") return me(env, user);
  if (path === "/app" && req.method === "GET") return homePage(env, user);
  // the pages' player: the API's GET with the cookie allowed (the path is not under /api/)
  if (p[0] === "m" && p.length === 4 && req.method === "GET") return media(req, env, user, id(p[1], "client"), id(p[2], "slot"), p[3] ?? "");
  if (p[0] === "connect" && p.length === 2 && req.method === "GET") {
    const client = id(p[1], "client");
    await member(env, user, client);
    return Response.redirect(await startUrl(env, url.origin, user.id, client, now), 302);
  }
  if (path === "/auth/logout" && req.method === "POST") {
    await env.DB.prepare("UPDATE users SET session_epoch = session_epoch + 1 WHERE id = ?").bind(user.id).run();
    const gone = `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
    if ((req.headers.get("Content-Type") ?? "").startsWith("application/x-www-form-urlencoded")) {
      // the home page's Sign out button: back to the sign-in page, the cookie dropped
      return new Response(null, { status: 303, headers: { Location: "/login", "Set-Cookie": gone } });
    }
    const res = json(200, { ok: true });
    res.headers.append("Set-Cookie", gone);
    return res;
  }
  if (path === "/api/hosts" && req.method === "POST") return registerHost(req, env, user, now);
  if (p[0] === "static" && p[1] === "avatar" && p.length === 3 && req.method === "GET") return avatarImage(env, user, p[2]!.replace(/\.png$/, ""));
  if (p[0] === "api" && p[1] === "avatar" && p.length === 3 && req.method === "PUT") return avatarUpload(req, env, user, p[2]!);
  if (path === "/api/jobs/next" && req.method === "GET") return nextJob(url, env, ctx, user, now);
  if (path === "/api/jobs" && req.method === "GET") return listJobs(url, env, user);
  if (path === "/api/jobs" && req.method === "POST") return enqueue(req, env, user, now);
  if (p[0] === "api" && p[1] === "jobs" && p.length === 4 && /^\d{1,12}$/.test(p[2] ?? "") && req.method === "POST") {
    return updateJob(req, env, user, Number(p[2]), p[3] ?? "", now);
  }
  if (p[0] === "api" && p[1] === "media" && p.length === 5) {
    return media(req, env, user, id(p[2], "client"), id(p[3], "slot"), p[4] ?? "");
  }
  if (p[0] === "api" && p[1] === "admin") {
    if (!user.admin) throw new HttpError(403, "admin");
    const r = await admin(req, env, p, () => readJson(req), user.id, now);
    if (r) return r;
  }
  if (p[0] === "api" && p[1] === "db" && p.length === 4 && req.method === "POST") {
    const client = id(p[2], "client");
    const name = p[3] ?? "";
    const op = Object.hasOwn(OPS, name) ? OPS[name] : undefined; // not Object.prototype's keys
    if (!op) throw new HttpError(404, "op");
    await member(env, user, client);
    return json(200, { result: await op({ env, client, by: user.id, now }, await readJson(req)) });
  }
  return (await pages(req, env, ctx, user, url, now)) ?? json(404, { error: "not found" });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await route(req, env, ctx);
    } catch (e) {
      if (e instanceof HttpError) return json(e.status, e.detail ? { error: e.message, detail: e.detail } : { error: e.message });
      console.error("tachyon", e);
      return json(500, { error: "internal" });
    }
  },
  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    console.log("cron", JSON.stringify(await tick(env, event.scheduledTime)));
  },
} satisfies ExportedHandler<Env>;
