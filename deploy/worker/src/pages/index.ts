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
//   GET|POST /admin/members | clients   admins only               src/pages/admin.ts

import { clientRow, type Ctx } from "../db.ts";
import type { Fetcher } from "../graph.ts";
import { HttpError } from "../http.ts";
import { clientsOf, member, type UserRow } from "../members.ts";
import { noClient, renderAdmin } from "./admin.ts";
import { upload as audienceUpload } from "./audience.ts";
import { renderInsights } from "./insights.ts";
import { prepareWeek, renderOverview } from "./overview.ts";
import { errorPage, path, type ClientInfo, type Page } from "./shell.ts";
import { act, renderByhand, renderQa, renderVideo, trackFile } from "./video.ts";
// slice b
import { move, renderCalendar } from "./calendar.ts";
import { newPrompt, upload as newUpload } from "./newvideo.ts";
import { flag, renderSettings, schedule, sync } from "./settings.ts";

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
  // slice c: the membership gate and the page context, the error page, then the routes
  const pageFor = async (): Promise<Page> => {
    await member(env, user, client);
    return pageOf(env, user, client, now);
  };
  const catching = async (back: string, run: () => Promise<Response>): Promise<Response> => {
    try {
      return await run();
    } catch (e) {
      if (e instanceof HttpError) return errorPage(e.status, e.detail ?? e.message, back);
      throw e;
    }
  };
  if (client === "admin" && parts.length === 2 && (kind === "members" || kind === "clients")) {
    return catching("/app", async () => {
      if (!user.admin) throw new HttpError(403, "admin", "admins only");
      const first = (await clientsOf(env, user))[0];
      return renderAdmin(first ? await pageOf(env, user, first, now) : noClient(env, user, now), kind, req);
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
      const page = await pageOf(env, user, client, now);
      if (b === "calendar") return await renderCalendar(page, req, url);
      if (b === "settings") return renderSettings(page);
      if (b === "upload") return await newUpload(page, req, url.searchParams);
      if (b === "sync") return await sync(page, fetcher);
      const form = await formOf(req);
      if (b === "move") return await move(page, form);
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
  try {
    // `return await`: a promise returned from inside the try would skip the catch below
    await member(env, user, client);
    const page = await pageOf(env, user, client, now);
    if (parts.length === 1) return req.method === "GET" ? await renderOverview(page, url.searchParams) : null;
    if (kind === "week") return req.method === "POST" ? await prepareWeek(page, await formOf(req)) : null;
    if (req.method === "GET") {
      if (action === undefined) return await renderVideo(page, slot!, url.searchParams, fetcher);
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
