// The audience export upload (app.py _audience and spine/audience.py parse_export, port):
// Overview → Followers who dropped → Upload export, a form with the file (app.py took the raw
// body from a script). The JSON file only: a zip needs an unpacker the Worker does not have,
// so the page says to upload followers_1.json from inside it. The import is the
// import_followers op; the card shows the result from the `up` query it is sent back with.

import { iso, OPS } from "../db.ts";
import { HttpError } from "../http.ts";
import { path, redirect, type Page } from "./shell.ts";

const FOLLOWING = /(^|\/)following(_\d+)?\.json$/;
export const MAX_BYTES = 4 * 1024 * 1024; // shortcut: 4 MB (about 20k followers) keeps JSON.parse inside the 10 ms CPU budget, far under the plan's 100 MB body limit; raise it when a client's followers_1.json is bigger

/** Usernames from one export file, either layout: a list of entries, or {"relationships_…": [entries]}.
    An entry names the account in string_list_data[].value, its href, or its title. */
export function names(data: unknown): Set<string> {
  if (data && typeof data === "object" && !Array.isArray(data)) data = Object.values(data).find(Array.isArray) ?? [];
  const out = new Set<string>();
  for (const e of Array.isArray(data) ? (data as unknown[]) : []) {
    if (!e || typeof e !== "object") continue;
    const { title, string_list_data: list } = e as { title?: unknown; string_list_data?: unknown };
    for (const s of Array.isArray(list) && list.length ? (list as unknown[]) : [{}]) {
      const { value, href } = (s && typeof s === "object" ? s : {}) as { value?: unknown; href?: unknown };
      const u = (typeof value === "string" && value) || (typeof title === "string" && title) || (typeof href === "string" ? href.replace(/\/+$/, "").split("/").pop() : "");
      if (u) out.add(u.trim().replace(/^@+/, "").toLowerCase());
    }
  }
  return out;
}

/** POST /<client>/audience/upload: the form's `file`, then back to the Overview's card. */
export async function upload(p: Page, req: Request): Promise<Response> {
  if (Number(req.headers.get("Content-Length") ?? "0") > MAX_BYTES + 4096) throw new HttpError(413, "size", `the file is over ${MAX_BYTES >> 20} MB: upload followers_1.json alone`);
  const file = (await req.formData().catch(() => new FormData())).get("file");
  if (!(file instanceof File) || !file.size) throw new HttpError(400, "empty", "no file: pick followers_1.json from the export");
  if (file.size > MAX_BYTES) throw new HttpError(413, "size", `the file is over ${MAX_BYTES >> 20} MB: upload followers_1.json alone`);
  const raw = new Uint8Array(await file.arrayBuffer());
  if (/\.zip$/i.test(file.name) || (raw[0] === 0x50 && raw[1] === 0x4b)) {
    throw new HttpError(400, "zip", "a zip cannot be unpacked here: unzip it and upload followers_1.json from connections/followers_and_following");
  }
  const name = "followers_1.json"; // one file on its own is the followers list (spine/audience.py _files)
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    throw new HttpError(400, "json", `${name} is not readable JSON: download the export in JSON format`);
  }
  const followers = FOLLOWING.test(file.name) ? new Set<string>() : names(data);
  if (!followers.size) throw new HttpError(400, "followers", "no followers in it: download the export in JSON format with Followers and following");
  // the same sha as parse_export's for one file, so an export already imported from a PC is seen as such
  const prefix = new TextEncoder().encode(name + "\0");
  const bytes = new Uint8Array(prefix.length + raw.length);
  bytes.set(prefix);
  bytes.set(raw, prefix.length);
  const sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const sid = await OPS.import_followers!(p.c, { sha, taken_at: iso(p.now), source: file.name.slice(0, 100), followers: [...followers].sort(), following: null });
  return redirect(`${path(p.client.id)}?up=${sid === null ? "same" : "ok"}#dropped`);
}
