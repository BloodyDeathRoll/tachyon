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
//   GET  /<client>/calendar             week | ?view=month   src/pages/calendar.ts
//   POST /<client>/move                 slot, swap | at
//   POST /<client>/new | new/upload     a prompt | the file  src/pages/newvideo.ts
//   GET  /<client>/settings             src/pages/settings.ts
//   POST /<client>/flag | schedule | sync
//   GET  /<client>/insights             src/pages/insights.ts
//   POST /<client>/audience/upload      the followers export      src/pages/audience.ts
//   GET|POST /<client>/setup            a new client: the business, the learning, the approval   src/pages/setup.ts
//                                       (a client that is not active yet has it in place of every other page)
//   GET|POST /admin/members | clients   admins only               src/pages/admin.ts
//   GET /account, POST /account/disconnect  the signed-in user     src/pages/account.ts

import { clientRow, type Ctx } from "../db.ts";
import type { Fetcher } from "../graph.ts";
import { HttpError } from "../http.ts";
import { clientsOf, member, type UserRow } from "../members.ts";
import { disconnect, renderAccount } from "./account.ts";
import { noClient, renderAdmin } from "./admin.ts";
import { upload as audienceUpload } from "./audience.ts";
import { renderInsights } from "./insights.ts";
import { prepareWeek, renderOverview } from "./overview.ts";
import { errorPage, path, type ClientInfo, type Page } from "./shell.ts";
import { act, mixing, renderByhand, renderQa, renderVideo, trackFile } from "./video.ts";
// slice b
import { move, renderCalendar } from "./calendar.ts";
import { newPrompt, upload as newUpload } from "./newvideo.ts";
import { flag, renderSettings, schedule, sync } from "./settings.ts";
import { renderSetup, setupPost } from "./setup.ts";
import { redirect } from "./shell.ts";

const ID = /^[\w-]{1,64}$/;

/** The form a button sent; a POST with no body (a bare button) is an empty form. */
function formOf(req: Request): Promise<FormData> {
  return req.formData().catch(() => new FormData());
}

/** A client still being set up, asked for a page it does not have yet. */
class NotActive extends Error {
  page: Page; // no parameter property: the tests import this file with Node's type stripping
  constructor(page: Page) {
    super("not active");
    this.page = page;
  }
}

/** `gate`: a client that is not active has only its setup page (src/pages/setup.ts). */
async function pageOf(env: Page["env"], user: UserRow, client: string, now: number, gate = false): Promise<Page> {
  const c: Ctx = { env, client, by: user.id, now };
  const info = (await clientRow(c)) as unknown as ClientInfo;
  const mine = await clientsOf(env, user);
  const nav = (await env.DB.prepare(`SELECT id, name FROM clients WHERE id IN (${mine.map(() => "?").join(", ")}) ORDER BY name`).bind(...mine).all<{ id: string; name: string }>()).results;
  const page = { env, c, user, client: info, nav, now };
  if (gate && info.status !== "active") throw new NotActive(page);
  return page;
}

/** The page for this request, or null when the path is not a page. */
export async function pages(req: Request, env: Page["env"], ctx: ExecutionContext, user: UserRow, url: URL, now: number, fetcher: Fetcher = fetch): Promise<Response | null> {
  try {
    return await routes(req, env, ctx, user, url, now, fetcher);
  } catch (e) {
    if (!(e instanceof NotActive)) throw e;
    // the client's own address shows the setup; every other page of it leads there
    const home = url.pathname.replace(/\/+$/, "") === path(e.page.client.id);
    return home && req.method === "GET" ? renderSetup(e.page, url.searchParams) : redirect(path(e.page.client.id));
  }
}

async function routes(req: Request, env: Page["env"], _ctx: ExecutionContext, user: UserRow, url: URL, now: number, fetcher: Fetcher): Promise<Response | null> {
  const parts = url.pathname.replace(/\/+$/, "").split("/").slice(1);
  const [client, kind, slot, action] = parts;
  if (!client || !ID.test(client)) return null;
  // slice c: the membership gate and the page context, the error page, then the routes
  const pageFor = async (): Promise<Page> => {
    await member(env, user, client);
    return pageOf(env, user, client, now, true);
  };
  const catching = async (back: string, run: () => Promise<Response>): Promise<Response> => {
    try {
      return await run();
    } catch (e) {
      if (e instanceof HttpError) return errorPage(e.status, e.detail ?? e.message, back);
      throw e;
    }
  };
  if (client === "account" && (parts.length === 1 ? req.method === "GET" : parts.length === 2 && kind === "disconnect" && req.method === "POST")) {
    return catching("/account", async () => {
      const first = (await clientsOf(env, user))[0];
      const page = first ? await pageOf(env, user, first, now) : noClient(env, user, now);
      return parts.length === 1 ? renderAccount(page) : disconnect(page, await formOf(req));
    });
  }
  if (client === "admin" && parts.length === 2 && (kind === "members" || kind === "clients")) {
    return catching("/app", async () => {
      if (!user.admin) throw new HttpError(403, "admin", "admins only");
      const first = (await clientsOf(env, user))[0];
      return renderAdmin(first ? await pageOf(env, user, first, now) : noClient(env, user, now), kind, req);
    });
  }
  if (parts.length === 2 && kind === "setup" && (req.method === "GET" || req.method === "POST")) {
    return catching(`${path(client)}/setup`, async () => {
      await member(env, user, client);
      const page = await pageOf(env, user, client, now);
      return req.method === "GET" ? renderSetup(page, url.searchParams) : setupPost(page, req);
    });
  }
  if (parts.length === 2 && kind === "insights" && req.method === "GET") return catching(path(client), () => pageFor().then(renderInsights));
  if (parts.length === 3 && kind === "audience" && slot === "upload" && req.method === "POST") return catching(path(client), () => pageFor().then((page) => audienceUpload(page, req)));
  // slice b: the calendar, a new video and settings (calendar.ts, newvideo.ts, settings.ts); a refusal goes back to its page
  const b = parts.length === 2 ? kind : parts.length === 3 && kind === "new" && slot === "upload" ? "upload" : undefined;
  const bGet = req.method === "GET" && (b === "calendar" || b === "settings");
  const bPost = req.method === "POST" && ["move", "new", "upload", "schedule", "flag", "sync"].includes(b ?? "");
  if (bGet || bPost) {
    const back = `${path(client)}${b === "sync" ? "" : b === "settings" || b === "schedule" || b === "flag" ? "/settings" : "/calendar"}`;
    try {
      await member(env, user, client);
      const page = await pageOf(env, user, client, now, true);
      if (b === "calendar") return await renderCalendar(page, req, url);
      if (b === "settings") return renderSettings(page);
      if (b === "upload") return await newUpload(page, req, url.searchParams);
      if (b === "sync") return await sync(page, fetcher);
      const form = await formOf(req);
      if (b === "move") return await move(page, req, form);
      if (b === "new") return await newPrompt(page, form);
      if (b === "schedule") return await schedule(page, form);
      return await flag(page, form);
    } catch (e) {
      if (e instanceof HttpError) return errorPage(e.status, e.detail ?? e.message, back);
      throw e;
    }
  }
  if (kind === "track" && parts.length === 3 && req.method === "GET") return catching(path(client), () => pageFor().then((page) => trackFile(page, slot!, req)));
  const video = kind === "v" && slot !== undefined && ID.test(slot) && parts.length <= 4;
  if (!(parts.length === 1 || (kind === "week" && parts.length === 2) || video)) return null;
  let page: Page | undefined;
  try {
    // `return await`: a promise returned from inside the try would skip the catch below
    await member(env, user, client);
    page = await pageOf(env, user, client, now, true);
    if (parts.length === 1) return req.method === "GET" ? await renderOverview(page, url.searchParams) : null;
    if (kind === "week") return req.method === "POST" ? await prepareWeek(page, await formOf(req)) : null;
    if (req.method === "GET") {
      if (action === undefined) return await renderVideo(page, slot!, url.searchParams, fetcher);
      if (action === "byhand") return await renderByhand(page, slot!, fetcher);
      if (action === "qa") return await renderQa(page, slot!);
      if (action === "mixing") return await mixing(page, slot!);
      return null;
    }
    if (req.method === "POST" && action) return await act(page, slot!, action, await formOf(req), fetcher);
    return null;
  } catch (e) {
    // a refused action on a video says why on the video page itself (a member's page only), not on a page of its own
    if (e instanceof HttpError && page && video && req.method === "POST" && e.status < 500) {
      try {
        const r = await renderVideo(page, slot!, new URLSearchParams({ err: e.detail ?? e.message }), fetcher);
        return new Response(r.body, { status: e.status, headers: r.headers });
      } catch {
        // no video page to show it on (a slot that doesn't exist): the error page below
      }
    }
    if (e instanceof HttpError) return errorPage(e.status, e.detail ?? e.message, slot ? path(client, slot) : "/app");
    throw e;
  }
}
