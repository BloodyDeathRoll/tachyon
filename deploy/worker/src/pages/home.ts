// GET /app: the first client's dashboard; with no client yet, who is signed in and what they may do.
// Rights (docs/CLOUDFLARE-PLAN.md, "Access"): a member does everything for their clients;
// an admin sees every client and also manages members and clients.

import type { UserRow } from "../members.ts";
import { clientsOf } from "../members.ts";
import { CSS, display, esc, icon, page, path, type ClientInfo } from "./shell.ts";

const MEMBER_RIGHTS = "Plan, approve and schedule videos, edit captions, connect Instagram, change settings";
const ADMIN_RIGHTS = "Everything a member can, for every client, plus invite people and add clients";

export async function homePage(env: { DB: D1Database }, user: UserRow): Promise<Response> {
  const ids = await clientsOf(env, user);
  // signed in with clients: straight to the dashboard (the side menu switches clients)
  if (ids.length) return new Response(null, { status: 302, headers: { Location: path([...ids].sort()[0]!) } });
  const rows = ids.length
    ? (
        await env.DB.prepare(
          `SELECT id, name, ig_user_id, page_id, ig_username, token_enc IS NOT NULL AS connected, token_expires, grants, emergency_stop, publisher FROM clients WHERE id IN (${ids.map(() => "?").join(",")}) ORDER BY name`,
        )
          .bind(...ids)
          .all<ClientInfo & { grants: string }>()
      ).results
    : [];
  const items = rows
    .map((r) => {
      const d = display({ ...r, grants: {} } as ClientInfo);
      const state = [r.connected ? "Instagram connected" : "Instagram not connected", r.publisher === "worker" ? "publishes online" : "publishes from a PC", d.stop ? "emergency stop on" : ""]
        .filter(Boolean)
        .join(" · ");
      return `<li><a class=row href='${path(r.id)}'><span><b>${esc(d.name)}</b>${d.handle ? ` <small>@${esc(d.handle)}</small>` : ""}<br><small>${esc(state)}</small></span>${icon("chev", 16)}</a></li>`;
    })
    .join("");
  const role = user.admin ? "Admin" : "Member";
  const admin = user.admin
    ? `<p><a class='btn sec' href='/admin/members'>${icon("users", 16)}Members</a> <a class='btn sec' href='/admin/clients'>${icon("briefcase", 16)}Clients</a></p>`
    : "";
  const list = items ? `<ul class=home>${items}</ul>` : "<p>No clients yet: ask an admin to add you to one.</p>";
  const html = `<!doctype html><html lang=en><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>
<link rel=manifest href=/manifest.webmanifest><meta name=theme-color content='#111'><title>Tachyon</title><style>${CSS}
ul.home{list-style:none;padding:0;margin:16px 0}ul.home li+li{margin-top:10px}a.row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;border:1px solid #e5e7eb;border-radius:12px;color:inherit;text-decoration:none}a.row:hover{border-color:#9ca3af}a.row>span{flex:1;min-width:0}a.row>svg{flex:none;transform:rotate(-90deg)}
</style>
<main style='max-width:40rem;margin:3rem auto;padding:0 16px'>
<section class=card><h2>Your clients</h2>${list}</section>
<section class=card style='margin-top:16px'><h2>You</h2><p>${user.name ? `<b>${esc(user.name)}</b><br>` : ""}${esc(user.email)}</p>
<p><b>${role}</b>: ${esc(user.admin ? ADMIN_RIGHTS : MEMBER_RIGHTS)}.</p>${admin}
<p><a class='btn sec' href='/login?pc=1'>${icon("link", 16)}Link a PC</a></p>
<form method=post action='/auth/logout'><button class='btn sec'>Sign out</button></form></section></main></html>`;
  return page(html, 200);
}
