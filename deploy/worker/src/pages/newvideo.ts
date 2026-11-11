// A new video on an open calendar slot (the box is calendar.ts addNewBox; app.py _upload, spine/manual.py
// add_prompt and add_upload, port): a prompt books the slot and asks a PC for a `produce` job;
// an upload streams the browser's file into R2 through the API's PUT (src/index.ts media),
// lands in Needs approval and asks a PC for the spec check (a `spec` job: approve waits for
// it, video.ts), as docs/CLOUDFLARE-PLAN.md "Uploads" has it. Left out from manual.py: the
// ffmpeg fit to 9:16 and the cover frame, the safe-zone check and qa.md, the Remotion film
// an edit note would build on (the file is in R2, not on a PC), the caption writer (the
// video page's button asks for it).
//
//   POST /<client>/new                    at, prompt, engine
//   POST /<client>/new/upload?at=&name=   body = the file (the box's script sends it)

import { iso, journalIfChanged, OPS } from "../db.ts";
import { HttpError } from "../http.ts";
import { media } from "../index.ts";
import { insertJob } from "../jobs.ts";
import { newSlotId, walked } from "../pickup.ts";
import { dropVideo } from "../publish.ts";
import { slots, takenSlots } from "./schedule.ts";
import { ENGINES, parse, path, redirect, type Page } from "./shell.ts";
import { field } from "./video.ts";

const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv"]);
const TO_APPROVAL = ["BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL"];
/** The slot must be a future, free publishing slot (as the calendar showed it); its ISO form. */
async function checkSlot(p: Page, at: string): Promise<string> {
  const ms = parse(at);
  if (ms === null) throw new HttpError(400, "at", "not a slot time");
  if (ms <= p.now) throw new HttpError(400, "at", "that slot is in the past");
  const s = iso(ms);
  if (!slots(p.client.grants).includes(s.slice(11, 16)) || s.slice(17, 19) !== "00") throw new HttpError(400, "at", "that is not one of the publishing slots");
  if ((await takenSlots(p.c)).has(s)) throw new HttpError(400, "taken", "that slot is taken");
  return s;
}

/** POST /<client>/new: book the slot, BRIEFED, a `produce` job with the prompt (manual.py
    add_prompt), in one batch: a failure leaves no row and the slot free. */
export async function newPrompt(p: Page, form: FormData): Promise<Response> {
  const at = await checkSlot(p, field(form, "at"));
  const engine = field(form, "engine") in ENGINES ? field(form, "engine") : "html";
  const prompt = field(form, "prompt").trim();
  const slot = await newSlotId(p.c, at);
  const fields = { scheduled_at: at, angle: "New video", engine: engine === "html" ? "html" : "remotion" };
  const meta = { slot_id: slot, title: "New video", source: "prompt", plan: "manual", engine_choice: engine };
  const payload = { argv: ["spine.manual", "produce", p.client.id, slot], prompt, engine };
  await p.env.DB.batch([
    p.env.DB.prepare("INSERT INTO posts (client, slot_id, state, scheduled_at, angle, engine, created_at, updated_at) VALUES (?, ?, 'IDEA', ?, ?, ?, ?, ?)").bind(
      p.client.id, slot, fields.scheduled_at, fields.angle, fields.engine, iso(p.now), iso(p.now),
    ),
    journalIfChanged(p.c, "post.create", slot, { client: p.client.id, ...fields }),
    p.env.DB.prepare("INSERT INTO post_files (client, slot_id, name, text, updated_by, updated_at) VALUES (?, ?, 'meta.json', ?, ?, ?)").bind(p.client.id, slot, JSON.stringify(meta, null, 2) + "\n", p.user.id, p.now),
    p.env.DB.prepare("UPDATE posts SET state = 'BRIEFED', updated_at = ?, version = version + 1 WHERE client = ? AND slot_id = ? AND state = 'IDEA'").bind(iso(p.now), p.client.id, slot),
    journalIfChanged(p.c, "post.state", slot, { from: "IDEA", to: "BRIEFED", note: null }),
    p.env.DB.prepare("INSERT INTO jobs (kind, client, slot_id, payload, by, created_at, updated_at) VALUES ('produce', ?, ?, ?, ?, ?, ?)").bind(p.client.id, slot, JSON.stringify(payload), p.user.id, p.now, p.now),
  ]);
  return redirect(path(p.client.id, slot));
}

/** Nothing half-made stays behind: the R2 object if the row has one, then every row of the slot. */
async function undo(p: Page, slot: string): Promise<void> {
  await dropVideo(p.env, p.client.id, slot);
  await p.env.DB.batch(["posts", "post_files", "media"].map((t) => p.env.DB.prepare(`DELETE FROM ${t} WHERE client = ? AND slot_id = ?`).bind(p.client.id, slot)).concat(
    p.env.DB.prepare("DELETE FROM journal WHERE client = ? AND target = ?").bind(p.client.id, slot),
  ));
}

/** POST /<client>/new/upload: the row, the file into R2, the walk to NEEDS_APPROVAL, a `media`
    row with no host, a `spec` job (manual.py add_upload); a failure anywhere undoes it all. */
export async function upload(p: Page, req: Request, q: URLSearchParams): Promise<Response> {
  const name = q.get("name") || "upload.mp4";
  if (!VIDEO_EXT.has((/\.[^.]*$/.exec(name)?.[0] ?? "").toLowerCase())) throw new HttpError(400, "name", `not a video file: ${name}`);
  const at = await checkSlot(p, q.get("at") ?? "");
  const title = name.replace(/\.[^.]*$/, "").replace(/[_-]/g, " ").trim().slice(0, 40) || "Upload";
  const slot = await newSlotId(p.c, at);
  await OPS.create_post!(p.c, { slot_id: slot, fields: { scheduled_at: at, angle: title, engine: "upload" } });
  try {
    await media(new Request(req, { method: "PUT" }), p.env, p.user, p.client.id, slot, "video"); // the API's PUT: the body streams on into R2
    const meta = { slot_id: slot, title, source: "upload", upload: `uploads/${slot}.mp4`, uploaded_name: name, plan: "manual", share_to_feed: true, story: true, trial: false };
    const res = await p.env.DB.batch([
      p.env.DB.prepare("INSERT INTO post_files (client, slot_id, name, text, updated_by, updated_at) VALUES (?1, ?2, 'caption.txt', '', ?3, ?4), (?1, ?2, 'meta.json', ?5, ?3, ?4)").bind(
        p.client.id, slot, p.user.id, p.now, JSON.stringify(meta, null, 2) + "\n",
      ),
      p.env.DB.prepare("UPDATE posts SET state = 'NEEDS_APPROVAL', updated_at = ?, version = version + 1 WHERE client = ? AND slot_id = ? AND state = 'IDEA'").bind(iso(p.now), p.client.id, slot),
      ...walked(p.c, slot, "IDEA", TO_APPROVAL, null, {}),
      p.env.DB.prepare("INSERT INTO media (client, slot_id, host, path, sha, size) VALUES (?, ?, '', ?, NULL, ?)").bind(p.client.id, slot, name, Number(req.headers.get("Content-Length"))),
    ]);
    if (res[1]!.meta.changes !== 1) throw new HttpError(409, "changed", `${slot} moved on under the upload`);
    await insertJob(p.env.DB, "spec", p.client.id, slot, null, p.user.id, p.now);
  } catch (e) {
    await undo(p, slot);
    throw e;
  }
  return redirect(path(p.client.id, slot));
}
