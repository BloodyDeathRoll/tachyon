// Who may act for which client: the routes (src/index.ts) and the pages (src/pages/) ask
// here. Every call re-reads the rows, so a removed member stops at once.

import { HttpError } from "./http.ts";

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

/** The clients `user` manages: every client for an admin, else their memberships. */
export async function clientsOf(env: { DB: D1Database }, user: UserRow): Promise<string[]> {
  const q = user.admin
    ? env.DB.prepare("SELECT id AS client FROM clients ORDER BY id")
    : env.DB.prepare("SELECT client FROM memberships WHERE user = ? ORDER BY client").bind(user.id);
  return (await q.all<{ client: string }>()).results.map((r) => r.client);
}

export async function member(env: { DB: D1Database }, user: UserRow, client: string): Promise<void> {
  if (!(await clientsOf(env, user)).includes(client)) throw new HttpError(403, "member");
}
