// The account page (the sidebar's name at the bottom, as in the Figma): who is signed in, the
// Instagram accounts of the clients they manage (Connect, Disconnect), the admin pages, Link a
// PC and Sign out.
//
//   GET  /account
//   POST /account/disconnect   client: forget the client's Instagram token (nothing publishes)

import { clientsOf, member } from "../members.ts";
import { iso } from "../db.ts";
import { esc, icon, redirect, shell, type Page } from "./shell.ts";

interface Row {
  id: string;
  name: string;
  ig_username: string | null;
  connected: number;
}

export async function renderAccount(p: Page): Promise<Response> {
  const ids = await clientsOf(p.env, p.user);
  const rows = ids.length
    ? (await p.env.DB.prepare(`SELECT id, name, ig_username, token_enc IS NOT NULL AS connected FROM clients WHERE id IN (${ids.map(() => "?").join(", ")}) ORDER BY name`).bind(...ids).all<Row>()).results
    : [];
  const accounts = rows.map((r) => {
    const c = encodeURIComponent(r.id);
    const state = r.connected ? (r.ig_username ? `@${esc(r.ig_username)}` : "Connected") : "Not connected";
    const btns = r.connected
      ? `<a class='btn sec small' href='/connect/${c}'>Reconnect</a><form method=post action='/account/disconnect' onsubmit="return confirm('Disconnect this account from Instagram? Nothing publishes until it is connected again.')"><input type=hidden name=client value='${esc(r.id)}'><button class='btn sec small'>Disconnect</button></form>`
      : `<a class='btn pri small' href='/connect/${c}'>Connect Instagram</a>`;
    return `<li><img class=av src='/static/avatar/${c}.png' alt=''><span><b>${esc(r.name)}</b><small>${state}</small></span><div class=btns>${btns}</div></li>`;
  }).join("");
  const list = accounts ? `<ul class=accts>${accounts}</ul>` : "<p>No clients yet: ask an admin to add you to one.</p>";
  const more = p.user.admin ? `<p class=hint>Another account: add a client in <a href='/admin/clients'>Clients</a>, then connect it here.</p>` : "";
  const admin = p.user.admin
    ? `<section class=card style='margin-top:20px'><h2>Admin</h2><div class=btns><a class='btn sec' href='/admin/members'>${icon("users", 16)}Members</a><a class='btn sec' href='/admin/clients'>${icon("briefcase", 16)}Clients</a></div></section>`
    : "";
  const me = `${p.user.name ? `<b>${esc(p.user.name)}</b><br>` : ""}${esc(p.user.email)} · ${p.user.admin ? "Admin" : "Member"}`;
  const body = `<h1>Account</h1><p class=sub>${me}</p>
<section class=card><h2>Instagram accounts</h2>${list}${more}</section>${admin}
<section class=card style='margin-top:20px'><h2>This account</h2><div class=btns><a class='btn sec' href='/login?pc=1'>${icon("link", 16)}Link a PC</a><form method=post action='/auth/logout'><button class='btn sec'>Sign out</button></form></div></section>
<style>.accts{list-style:none;margin:14px 0 0;padding:0}.accts li{display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid var(--rule)}.accts li:first-child{border-top:0}
.accts li>span{flex:1;min-width:0}.accts b,.accts small{display:block}.accts small{color:var(--ink3);font-size:13px}.accts .btns,.card>.btns{margin:0}.accts form,.card form{margin:0}
.card>.btns{margin-top:14px}</style>`;
  return shell(p, "account", body, "Account");
}

/** POST /account/disconnect: the client's Instagram token, page and account forgotten, journalled. */
export async function disconnect(p: Page, form: FormData): Promise<Response> {
  const client = String(form.get("client") ?? "");
  await member(p.env, p.user, client);
  await p.env.DB.batch([
    p.env.DB.prepare("UPDATE clients SET token_enc = NULL, token_expires = NULL, page_id = NULL, ig_user_id = NULL, ig_username = NULL WHERE id = ?").bind(client),
    p.env.DB.prepare("INSERT INTO journal (client, ts, action, target, intent, by) VALUES (?, ?, 'meta.disconnect', NULL, '{}', ?)").bind(client, iso(p.now), p.user.id),
  ]);
  return redirect("/account");
}
