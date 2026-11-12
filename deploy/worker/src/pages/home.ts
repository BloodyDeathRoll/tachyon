// GET /app: the first client's dashboard; with no client yet, who is signed in and what they may do.
// Rights (docs/CLOUDFLARE-PLAN.md, "Access"): a member does everything for their clients;
// an admin sees every client and also manages members and clients.

import type { UserRow } from "../members.ts";
import { clientsOf } from "../members.ts";
import { CSS, esc, icon, page, path } from "./shell.ts";

const MEMBER_RIGHTS = "Plan, approve and schedule videos, edit captions, connect Instagram, change settings";
const ADMIN_RIGHTS = "Everything a member can, for every client, plus invite people and add clients";

export async function homePage(env: { DB: D1Database }, user: UserRow): Promise<Response> {
  const ids = await clientsOf(env, user);
  // signed in with clients: straight to the dashboard (the side menu switches clients)
  if (ids.length) return new Response(null, { status: 302, headers: { Location: path([...ids].sort()[0]!) } });
  const role = user.admin ? "Admin" : "Member";
  const admin = user.admin
    ? `<p><a class='btn sec' href='/admin/members'>${icon("users", 16)}Members</a> <a class='btn sec' href='/admin/clients'>${icon("briefcase", 16)}Clients</a></p>`
    : "";
  const list = "<p>No clients yet: ask an admin to add you to one.</p>";
  const html = `<!doctype html><html lang=en><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>
<link rel=manifest href=/manifest.webmanifest><meta name=theme-color content='#111'><title>Tachyon</title><style>${CSS}
</style>
<main style='max-width:40rem;margin:3rem auto;padding:0 16px'>
<section class=card><h2>Your clients</h2>${list}</section>
<section class=card style='margin-top:16px'><h2>You</h2><p>${user.name ? `<b>${esc(user.name)}</b><br>` : ""}${esc(user.email)}</p>
<p><b>${role}</b>: ${esc(user.admin ? ADMIN_RIGHTS : MEMBER_RIGHTS)}.</p>${admin}
<p><a class='btn sec' href='/login?pc=1'>${icon("link", 16)}Link a PC</a></p>
<form method=post action='/auth/logout'><button class='btn sec'>Sign out</button></form></section></main></html>`;
  return page(html, 200);
}
