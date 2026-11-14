// Members and Clients (docs/CLOUDFLARE-PLAN.md, "Dashboard": admins also see them): HTML
// forms over src/admin.ts's JSON API, called as the API would be, so the rules live there
// alone. Only an admin gets here (src/pages/index.ts checks `user.admin`, as src/index.ts does
// for /api/admin). The shell needs a client: the admin's first, or a stand-in when none exists
// yet (the Clients page is how the first one is made).
//
//   GET  /admin/members    the users, their clients, the invite form
//   POST /admin/members    action = invite {email, admin?} | remove {id} | add | drop {user, client}
//   GET  /admin/clients    the clients, the create form
//   POST /admin/clients    action = create {id, name}; a new client starts at `setup` (src/pages/setup.ts),
//                          ?active=<id> is the banner after its approval

import { admin } from "../admin.ts";
import { HttpError } from "../http.ts";
import type { UserRow } from "../members.ts";
import { STAGES } from "./setup.ts";
import { ago, esc, icon, parseJson, redirect, shell, when, type Json, type Page } from "./shell.ts";

interface User {
  id: number;
  email: string;
  name: string | null;
  admin: boolean;
  signed_in: boolean;
  last_seen_at: number | null;
  clients: string[];
}
interface Client {
  id: string;
  name: string;
  ig_username: string | null;
  connected: number;
  publisher: string;
  status: string;
  created_at: number;
}

/** A Page for an admin with no clients at all. */
export function noClient(env: Page["env"], user: UserRow, now: number): Page {
  const client = { id: "", name: "Tachyon", ig_user_id: null, page_id: null, ig_username: null, connected: true, token_expires: null, grants: {}, emergency_stop: 0, publisher: "worker", status: "active" };
  return { env, c: { env, client: "", by: user.id, now }, user, client, nav: [], now };
}

/** One call into src/admin.ts as the JSON API gets it: the method, the path under /api/admin, the body. */
async function api(p: Page, method: string, tail: string[], body: Json = {}): Promise<Json> {
  const r = await admin(new Request("http://admin", { method }), p.env, ["api", "admin", ...tail], async () => body, p.user.id, p.now);
  if (!r) throw new HttpError(404, "not found");
  return (await r.json()) as Json;
}

async function members(p: Page): Promise<string> {
  const users = (await api(p, "GET", ["users"])).users as User[];
  const clients = (await api(p, "GET", ["clients"])).clients as Client[];
  const names = new Map(clients.map((c) => [c.id, c.name]));
  const hidden = (fields: Record<string, string | number>) => Object.entries(fields).map(([k, v]) => `<input type=hidden name=${k} value='${esc(v)}'>`).join("");
  const rows = users.map((u) => {
    // a client the user manages: its name and an x that drops the membership
    const mine = u.clients.map((c) => `<form method=post class=chip>${hidden({ action: "drop", user: u.id, client: c })}<i></i>${esc(names.get(c) ?? c)}<button aria-label='Remove from ${esc(names.get(c) ?? c)}'>${icon("x", 16)}</button></form>`).join("");
    const free = clients.filter((c) => !u.clients.includes(c.id));
    // Add: picking a client adds it at once (the button is the fallback without script)
    const add = free.length
      ? `<form method=post class=addc>${hidden({ action: "add", user: u.id })}<select name=client class=dd onchange='this.form.submit()' aria-label='Add a client'><option value='' selected disabled>Add</option>${free.map((c) => `<option value='${esc(c.id)}'>${esc(c.name)}</option>`).join("")}</select><noscript><button class=rm>Add</button></noscript></form>`
      : "";
    const seen = u.last_seen_at ? ago(new Date(u.last_seen_at).toISOString(), p.now) : u.signed_in ? "" : "not signed in yet";
    const remove = u.id === p.user.id ? "" : `<form method=post>${hidden({ action: "remove", id: u.id })}<button class='rm red'>Remove</button></form>`;
    return `<tr><td><span class=em>${esc(u.email)}</span>${u.admin ? "<span class='tag need'>admin</span>" : ""}</td><td>${esc(u.name ?? "")}</td><td${u.last_seen_at ? "" : " class=muted"}>${seen}</td><td><span class=clis>${mine}${add}</span></td><td class=act>${remove}</td></tr>`;
  }).join("");
  return `<div class=adm><h1>Members</h1><p class=sub>Who may sign in and which clients they manage. A member does everything for the client.</p>
<section class=card><h2>Invite</h2><form method=post class=btns><input type=hidden name=action value=invite><input type=email name=email required placeholder='them@example.com' aria-label=Email class=w567><label class=chk><input type=checkbox name=admin value=1>Admin</label><button class='btn pri'>Invite</button></form>
<p class=hint>They sign in with that Google account at /login.</p></section>
<section class=card style='margin-top:20px'><h2>Users</h2><div class=tw><table class='full mem'><tr><th>Email</th><th>Name</th><th>Seen</th><th>Clients</th><th class=act></th></tr>${rows}</table></div></section></div>`;
}

/** Where a client is on the way to active (src/pages/setup.ts): the scheduler's tags. */
function statusTag(c: Client, learned: Map<string, number>): string {
  const setup = `/${encodeURIComponent(c.id)}/setup`;
  if (c.status === "setup") return `<a class='tag need' href='${setup}'>setup · add the business</a>`;
  if (c.status === "learning") return `<a class='tag busy' href='${setup}'>learning · ${learned.get(c.id) ?? 0} of ${STAGES.length}</a>`;
  if (c.status === "review") return `<a class='tag need' href='${setup}'>to approve</a>`;
  return "<span class='tag live'>active</span>";
}

async function clientsPage(p: Page, activated: string | null): Promise<string> {
  const clients = (await api(p, "GET", ["clients"])).clients as Client[];
  // how far each learning client is: the stages its running job has reported done
  const learned = new Map<string, number>();
  if (clients.some((c) => c.status === "learning")) {
    const jobs = (await p.env.DB.prepare("SELECT client, result FROM jobs WHERE kind = 'learn' AND state = 'running'").all<{ client: string; result: string | null }>()).results;
    for (const j of jobs) learned.set(j.client, Array.isArray(parseJson(j.result).done) ? (parseJson(j.result).done as unknown[]).length : 0);
  }
  const rows = clients.map((c) => `<tr><td><a href='/${encodeURIComponent(c.id)}'>${esc(c.name)}</a></td><td>${esc(c.id)}</td><td${c.ig_username || c.connected ? "" : " class=muted"}>${c.ig_username ? `@${esc(c.ig_username)}` : c.connected ? "connected" : "not connected"}</td><td>${esc(c.publisher)}</td><td>${statusTag(c, learned)}</td><td class=act>${when(new Date(c.created_at).toISOString())}</td></tr>`).join("");
  const now = clients.find((c) => c.id === activated && c.status === "active");
  const banner = now ? `<div class='banner ok'><span><b>${esc(now.name)} is active</b>The industry file is approved. Tachyon plans its weeks from now on.</span><a class='btn sec small' href='/${encodeURIComponent(now.id)}/setup?view=long'>View the industry file</a><a class='btn pri small' href='/${encodeURIComponent(now.id)}'>Open ${esc(now.name)}</a></div>` : "";
  return `<div class=adm><h1>Clients</h1><p class=sub>Every client the Worker publishes for. A new one is set up from its row: the business, the industry study, your approval.</p>${banner}
<section class=card><h2>New client</h2><form method=post class=btns><input type=hidden name=action value=create><input type=text name=id required pattern='[\\w-]{1,64}' placeholder='id (letters, digits, - and _)' aria-label=Id class=w280><input type=text name=name placeholder='Name' aria-label=Name class=w280><button class='btn pri'>Create</button></form></section>
<section class=card style='margin-top:20px'><h2>Clients</h2><div class=tw><table class='full cli'><tr><th>Name</th><th>Id</th><th>Instagram</th><th>Publisher</th><th>Status</th><th class=act>Created</th></tr>${rows}</table></div></section></div>`;
}

export async function renderAdmin(p: Page, kind: "members" | "clients", req: Request): Promise<Response> {
  if (req.method === "POST") {
    const form = await req.formData().catch(() => new FormData());
    const f = (k: string) => String(form.get(k) ?? "");
    const action = f("action");
    if (kind === "members" && action === "invite") await api(p, "POST", ["users"], { email: f("email"), admin: f("admin") === "1" });
    else if (kind === "members" && action === "remove") await api(p, "DELETE", ["users", f("id")]);
    else if (kind === "members" && (action === "add" || action === "drop")) await api(p, action === "add" ? "POST" : "DELETE", ["memberships"], { user: Number(f("user")), client: f("client") });
    else if (kind === "clients" && action === "create") await api(p, "POST", ["clients"], { id: f("id"), name: f("name") });
    else throw new HttpError(400, "action");
    return redirect(`/admin/${kind}`);
  }
  if (req.method !== "GET") throw new HttpError(405, "method");
  return shell(p, kind, kind === "members" ? await members(p) : await clientsPage(p, new URL(req.url).searchParams.get("active")), kind === "members" ? "Members" : "Clients");
}
