// The dashboard pages (docs/CLOUDFLARE-PLAN.md, "Dashboard"): src/index.ts hands a signed-in
// user over after auth; membership is checked here before anything is read. Form POSTs
// answer with a 303 back to the page, a refused one with a small HTML page and app.py's
// status code. The Graph calls (link by hand, remove) take the fetch function as a
// parameter so the tests script Meta's answers.
//
//   GET  /<client>                      the overview          src/pages/overview.ts
//   POST /<client>/week                 Prepare next week (a `plan` job)
//   GET  /<client>/v/<slot>             one video             src/pages/video.ts
//   GET  /<client>/v/<slot>/byhand|qa
//   POST /<client>/v/<slot>/<action>    decide | replies | ailabel | byhand | formats | remove | delete

import { clientRow, type Ctx } from "../db.ts";
import type { Fetcher } from "../graph.ts";
import { HttpError } from "../http.ts";
import { clientsOf, member, type UserRow } from "../members.ts";
import { prepareWeek, renderOverview } from "./overview.ts";
import { errorPage, path, type ClientInfo, type Page } from "./shell.ts";
import { act, renderByhand, renderQa, renderVideo } from "./video.ts";

const ID = /^[\w-]{1,64}$/;

/** The form a button sent; a POST with no body (a bare button) is an empty form. */
function formOf(req: Request): Promise<FormData> {
  return req.formData().catch(() => new FormData());
}

async function pageOf(env: Page["env"], user: UserRow, client: string, now: number): Promise<Page> {
  const c: Ctx = { env, client, by: user.id, now };
  const info = (await clientRow(c)) as unknown as ClientInfo;
  const mine = await clientsOf(env, user);
  const nav = (await env.DB.prepare(`SELECT id, name FROM clients WHERE id IN (${mine.map(() => "?").join(", ")}) ORDER BY name`).bind(...mine).all<{ id: string; name: string }>()).results;
  return { env, c, user, client: info, nav, now };
}

/** The page for this request, or null when the path is not a page. */
export async function pages(req: Request, env: Page["env"], _ctx: ExecutionContext, user: UserRow, url: URL, now: number, fetcher: Fetcher = fetch): Promise<Response | null> {
  const parts = url.pathname.replace(/\/+$/, "").split("/").slice(1);
  const [client, kind, slot, action] = parts;
  if (!client || !ID.test(client)) return null;
  const video = kind === "v" && slot !== undefined && ID.test(slot) && parts.length <= 4;
  if (!(parts.length === 1 || (kind === "week" && parts.length === 2) || video)) return null;
  try {
    // `return await`: a promise returned from inside the try would skip the catch below
    await member(env, user, client);
    const page = await pageOf(env, user, client, now);
    if (parts.length === 1) return req.method === "GET" ? await renderOverview(page, url.searchParams) : null;
    if (kind === "week") return req.method === "POST" ? await prepareWeek(page, await formOf(req)) : null;
    if (req.method === "GET") {
      if (action === undefined) return await renderVideo(page, slot!);
      if (action === "byhand") return await renderByhand(page, slot!, fetcher);
      if (action === "qa") return await renderQa(page, slot!);
      return null;
    }
    if (req.method === "POST" && action) return await act(page, slot!, action, await formOf(req), fetcher);
    return null;
  } catch (e) {
    if (e instanceof HttpError) return errorPage(e.status, e.detail ?? e.message, slot ? path(client, slot) : "/app");
    throw e;
  }
}
