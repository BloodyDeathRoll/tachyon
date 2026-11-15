// GET /app: the first client's dashboard; with no client yet, the same shell (side menu and all)
// around an empty state that says what to do next (no title: the side menu marks the page). Who is signed in, Link a PC and Sign out are
// on the Account page, at the side menu's foot.

import type { UserRow } from "../members.ts";
import { clientsOf } from "../members.ts";
import { noClient } from "./admin.ts";
import { icon, path, shell, type Page } from "./shell.ts";

export async function homePage(env: Page["env"], user: UserRow, now: number): Promise<Response> {
  const ids = await clientsOf(env, user);
  // signed in with clients: straight to the dashboard of the menu's first (by name; the side menu switches clients)
  if (ids.length) {
    const first = await env.DB.prepare(`SELECT id FROM clients WHERE id IN (${ids.map(() => "?").join(", ")}) ORDER BY name LIMIT 1`).bind(...ids).first<{ id: string }>();
    return new Response(null, { status: 302, headers: { Location: path(first?.id ?? ids[0]!) } });
  }
  const next = user.admin
    ? `<p>Add the first client, then connect its Instagram.</p><div class=btns><a class='btn pri' href='/admin/clients'>${icon("briefcase", 16)}Add a client</a><a class='btn sec' href='/admin/members'>${icon("users", 16)}Members</a></div>`
    : "<p>Ask an admin to add you to one.</p>";
  return shell(noClient(env, user, now), "overview", `<div class=acctpage><section class=card><h2>No clients yet</h2>${next}</section></div>`, "Overview");
}
