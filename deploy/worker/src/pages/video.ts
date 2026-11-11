// One video (app.py render_video, render_byhand, render_qa and their POSTs, port): the
// player, approve or send back with notes, the schedule, the post text, the links, and the
// jobs a PC runs for it. What app.py forked here is a jobs row (spine/worker.py ARGV).
// The music card searches Instagram's music here; a pick is a `track` job: a PC downloads the
// song and mixes it into the video (spine/tracks.py; Instagram drops a song sent at publish).
// Left out from app.py: the PC's own music library, the safe-zone overlay and the story/format variants (local files), the
// spec check before approve (ffprobe on a PC), the local publisher on Publish now (the
// cron publishes within the minute), the bio link on a hand link (the cron's publish does
// it for its own posts), the quick-preview popup and the copy button (script).

import { open } from "../crypto.ts";
import { files, iso, journal, journalOutcome, OPS, post, posts, setState, type PostRow } from "../db.ts";
import { Graph, GraphError, type Fetcher } from "../graph.ts";
import { HttpError } from "../http.ts";
import { insertJob, latestJobs, slotJobs, type JobRow } from "../jobs.ts";
import { FIELDS, HAND_FROM, linkByHand } from "../pickup.ts";
import { dropVideo } from "../publish.ts";
import { previewSlots, slots, slotForApproval, takenSlots } from "./schedule.ts";
import {
  ago, CAPTION_LOCKED, ENGINES, esc, hostsLine, icon, jobLine, jobResult, LIVE, mediaLatest, MOVABLE, NO_DELETE, num, overdue, parse, parseJson, path,
  publishing, redirect, shell, slotNo, tagFor, titleOf, when, type Json, type Page,
} from "./shell.ts";

const RATIOS: Record<string, string> = { "1x1": "1:1", "4x5": "4:5", "2x3": "2:3", "16x9": "16:9" }; // spine/formats.py LABEL
const CAPTION_MAX = 2200;
const LOCKED = "too late: it is already publishing or live";

interface Slot {
  p: Page;
  slot: string;
  row: PostRow;
  meta: Json;
  caption: string;
  first: string;
  jobs: Record<string, JobRow>;
  host: string | null; // the PC that holds video.mp4 (the media table)
}

async function load(p: Page, slot: string): Promise<Slot> {
  const row = await post(p.c, slot);
  const f = await files(p.c, slot);
  const m = await p.env.DB.prepare("SELECT host FROM media WHERE client = ? AND slot_id = ? LIMIT 1").bind(p.client.id, slot).first<{ host: string }>();
  return { p, slot, row, meta: parseJson(f["meta.json"]), caption: (f["caption.txt"] ?? "").trim(), first: (f["first_comment.txt"] ?? "").trim(), jobs: await slotJobs(p.env.DB, p.client.id, slot), host: m?.host ?? null };
}

/** The newest of the jobs that make the video (app.py's revise.json). */
function making(jobs: Record<string, JobRow>): JobRow | undefined {
  return [jobs.produce, jobs.revise].filter((j): j is JobRow => Boolean(j)).sort((a, b) => b.id - a.id)[0];
}

function open_(j: JobRow | undefined): boolean {
  return j?.state === "running" || j?.state === "queued";
}

async function setFiles(s: Slot, given: Record<string, string>): Promise<void> {
  await OPS.set_files!(s.p.c, { slot_id: s.slot, files: given });
}

async function setMeta(s: Slot, patch: Json): Promise<void> {
  await setFiles(s, { "meta.json": JSON.stringify({ ...s.meta, ...patch }, null, 2) + "\n" });
}

async function enqueue(s: Slot, kind: string, payload: Json | null): Promise<void> {
  await insertJob(s.p.env.DB, kind, s.p.client.id, s.slot, payload && JSON.stringify(payload), s.p.user.id, s.p.now);
}

/** The text goes out with the container: editable until it is publishing or live. */
function locked(s: Slot): boolean {
  return CAPTION_LOCKED.has(s.row.state) || Boolean(s.row.published_at);
}

/** The label is a container flag too, and a due QUEUED slot is the cron's within the minute. */
function labelLocked(s: Slot): boolean {
  return locked(s) || publishing(s.row, s.p.now);
}

/** The Page token opened for this request only; never on a page. */
async function graphFor(p: Page, fetcher: Fetcher): Promise<Graph> {
  const r = await p.env.DB.prepare("SELECT token_enc FROM clients WHERE id = ?").bind(p.client.id).first<{ token_enc: string | null }>();
  if (!r?.token_enc || !p.client.ig_user_id) throw new HttpError(409, "connect", "Instagram is not connected: Connect it first");
  return new Graph(await open(r.token_enc, p.env.TOKEN_SECRET), fetcher);
}

/** Where a video waiting for approval with no slot of its own would go: the calendar's preview. */
async function previewSlot(p: Page, slot: string): Promise<string | null> {
  const jobs = await latestJobs(p.env.DB, p.client.id);
  const unslotted = (await posts(p.c, null)).filter((r) => !r.scheduled_at && !r.published_at && tagFor(r, jobs.get(r.slot_id))?.[1] === "need").map((r) => r.slot_id);
  if (!unslotted.includes(slot)) return null;
  return previewSlots(await takenSlots(p.c), unslotted, p.client.grants, p.now)[slot] ?? null;
}

function mediaUrl(s: Slot, name: "video" | "cover"): string {
  return `/m/${encodeURIComponent(s.p.client.id)}/${encodeURIComponent(s.slot)}/${name}`;
}

// ── cards ─────────────────────────────────────────────────────────────────────

function player(s: Slot): string {
  const cover = s.row.cover_key ? `<img src='${mediaUrl(s, "cover")}' alt=''>` : "";
  let out: string;
  if (s.row.r2_key) {
    out = `<div class=frame><video controls playsinline preload=metadata${s.row.cover_key ? ` poster='${mediaUrl(s, "cover")}'` : ""} src='${mediaUrl(s, "video")}'></video></div>`;
  } else if (s.row.permalink) {
    out = `${cover ? `<div class=frame>${cover}</div>` : ""}<p class=hint>Instagram has the file: <a class=lnk href='${esc(s.row.permalink)}' target=_blank rel=noopener>open the reel</a>.</p>`;
  } else if (s.host) {
    out = `${cover ? `<div class=frame>${cover}</div>` : ""}<p class=hint>The video is on ${esc(s.host)}; it comes here when the video is approved.</p>`;
  } else {
    out = cover ? `<div class=frame>${cover}</div><p class=hint>No video file yet.</p>` : "<div class=empty>No video file yet.</div>";
  }
  const dl = s.row.r2_key ? `<a class='btn sec' href='${mediaUrl(s, "video")}' download>${icon("download", 16)}Download reel</a>` : "";
  return `${out}<div class=pctl><span>${formatsButton(s)}</span>${dl}</div>`;
}

/** Other formats: a `formats` job for the ratios ticked (spine/formats.py make on a host). */
function formatsButton(s: Slot): string {
  const st = s.jobs.formats;
  if (open_(st)) return `<span class='tag gen'>${st!.state === "running" ? "Generating other formats…" : "Waiting for a PC…"}</span>`;
  const err = st?.state === "failed" ? `<p class=hint style='color:#b42318;margin:0'>Last run failed: ${esc(jobResult(st).slice(0, 300))}</p>` : "";
  const boxes = Object.entries(RATIOS).map(([r, lab]) => `<label class=chk><input type=checkbox name=r value=${r} checked>${lab}</label>`).join("");
  return `<details class=pop><summary class='btn plain'>Generate new version</summary><div class=box><form method=post action='${path(s.p.client.id, s.slot)}/formats'><h2>Generate other formats</h2>
<p class=muted style='margin:0 0 8px'>For posting by hand on other platforms. Each format is a new layout of this film, rendered on a PC with the files. A few minutes per format.</p>${err}
<div class=btns style='margin-top:8px'>${boxes}</div><div class=btns><button class='btn pri small'>Generate</button></div></form></div></details>`;
}

function generateBox(s: Slot): string {
  const engines = Object.entries(ENGINES).map(([k, v]) => `<label class=chk><input type=radio name=engine value=${k}${k === "html" ? " checked" : ""}>${esc(v)}</label>`).join("");
  return `<details class=pop><summary class='btn sec'>Generate New</summary><div class=box><form method=post action='${path(s.p.client.id, s.slot)}/decide'><input type=hidden name=action value=generate><h2>Generate new</h2>
<fieldset class=engines><legend>Animate with</legend>${engines}</fieldset><label>What should the video be?<textarea name=prompt rows=5 placeholder='e.g. Same message, but lead with the swell map'></textarea></label>
<p class=hint style='margin:0'>Leave it empty and Claude comes up with the idea. This video is replaced; the current cut stays under its versions on the PC.</p>
<div class=btns><button class='btn pri small'>Generate</button></div></form></div></details>`;
}

function errorCard(s: Slot, st: JobRow): string {
  const isNew = st.kind === "produce";
  const payload = parseJson(st.payload);
  const asked = typeof payload.prompt === "string" ? payload.prompt : typeof payload.notes === "string" ? payload.notes : "";
  return `<section class='card errcard' id=error><h2>${isNew ? "Making it failed" : "Re-render failed"}</h2><p class=hint>${jobLine(st, s.p.now).replace(/ — .*$/, "")}. ${
    isNew && !s.row.r2_key && !s.host ? "Nothing was made yet." : "The video here is still the previous cut, so you can approve it or send new notes."}</p>${
    asked ? `<p class=hint><b>${isNew ? "Your prompt" : "Your notes"}:</b> ${esc(asked)}</p>` : ""}<pre class=errlog>${esc(jobResult(st) || "No error text.")}</pre>
<form method=post action='${path(s.p.client.id, s.slot)}/decide'><div class=btns><button class='btn pri' name=action value=retry>${icon("redo")}Re-run</button></div><p class=hint>Runs the same job again on a PC with the files.</p></form></section>`;
}

function reviewCard(s: Slot): string {
  const act = `${path(s.p.client.id, s.slot)}/decide`;
  const engine = ((s.meta.film ?? {}) as Json).engine;
  const edit = engine === "remotion" || engine === "html" // only a film a note can edit gets the Edit box (decide's reject refuses the rest)
    ? `<details class=pop><summary class='btn sec'>${icon("edit", 16)}Edit</summary><div class=box><form method=post action='${act}'><label for=notes class=muted style='font-size:14px'>What should change?</label>
<textarea id=notes name=notes required placeholder='e.g. Lead with the advantage, not the number. Make it faster.' style='margin-top:8px'></textarea>
<div class=btns><button class='btn pri' name=action value=reject>${icon("redo")}Update</button></div></form></div></details>`
    : `<span class='muted' style='font-size:14px'>No film to edit with a note: use Generate New.</span>`;
  return `<section class=card><h2>Review</h2><div class=btns><form method=post action='${act}'><button class='btn pri' name=action value=approve>${icon("check")}Approve</button></form>
${edit}${generateBox(s)}</div></section>`;
}

function holdButton(s: Slot): string {
  const act = `${path(s.p.client.id, s.slot)}/decide`;
  if (s.row.state === "PAUSED") {
    return `<form method=post action='${act}'><button class='btn sec ico' name=action value=resume title='Release it' aria-label='Release it'>${icon("play", 18)}</button></form>`;
  }
  if (s.row.state === "APPROVED" || s.row.state === "QUEUED") {
    return `<form method=post action='${act}'><button class='btn sec ico' name=action value=pause title='Pause: hold it off Instagram' aria-label='Pause: hold it off Instagram'>${icon("pause", 18)}</button></form>`;
  }
  return "";
}

/** Publish now (approved only, behind a second tap) and Custom time (any future time, in the browser's zone). */
function whenTools(s: Slot, at: string | null): string {
  const act = `${path(s.p.client.id, s.slot)}/decide`;
  const now = ["APPROVED", "QUEUED"].includes(s.row.state)
    ? `<details class=pop><summary class='btn pri'>${icon("ext", 16)}Publish now</summary><div class=box><form method=post action='${act}'><p style='margin:0 0 8px'>Publish to Instagram now?</p><button class='btn pri' name=action value=publish_now>Yes, publish now</button></form></div></details>`
    : "";
  const utc = at ? ` data-utc='${new Date(parse(at) ?? 0).toISOString()}'` : "";
  const custom = `<details class=pop><summary class='btn sec'>${icon("clock", 16)}Custom time</summary><div class=box><form method=post action='${act}' class=btns style='margin:0'>
<input type=datetime-local name=at required aria-label='Custom time'${utc}><input type=hidden name=tz value=''><button class='btn dark' name=action value=custom>Save</button></form></div></details>`;
  return `<div class='btns whentools'>${now}${custom}</div>`;
}

async function whenCard(s: Slot, label: string, cls: string): Promise<string> {
  const { row, p } = s;
  const at = cls === "live" ? row.published_at : row.scheduled_at || (cls === "need" ? await previewSlot(p, s.slot) : null);
  let wtxt: string;
  let wh: string;
  let act = "";
  if (row.state === "REMOVED") {
    [wtxt, wh] = ["Removed from Instagram", when(at)];
  } else if (cls === "live") {
    [wtxt, wh] = ["Published", when(at)];
    act = row.permalink ? `<a class='btn sec' href='${esc(row.permalink)}' target=_blank rel=noopener>${icon("ext", 16)}Open on Instagram</a>` : "";
  } else {
    wtxt = label === "Paused" ? "On hold" : cls === "sched" ? "Goes live" : "Planned for";
    wh = at ? when(at) : "No slot yet";
    if (row.state === "PAUSED") wh = overdue(row, p.now) ? "Paused, overdue" : `Paused ${wh}`;
  }
  const busy = publishing(row, p.now);
  const hold = act || busy ? "" : holdButton(s);
  if (!act) act = busy ? `<div class='btns whentools'><button class='btn pri' disabled>${icon("ext", 16)}Publishing…</button></div>` : cls !== "live" && MOVABLE.has(row.state) ? whenTools(s, at) : "";
  const onSlot = at ? slots(p.client.grants).includes(new Date(parse(at) ?? 0).toISOString().slice(11, 16)) : false;
  const mode = cls === "live" || !at ? "" : onSlot ? "Auto" : "Custom";
  return `<section class='card whencard'><div class=row><div class=whenl><span class=wl>${wtxt}</span><p class=big>${wh}</p>${hold}${mode ? `<span class=wm>${mode}</span>` : ""}</div>${act}</div>${repliesCard(s)}${aiLabelCard(s)}</section>`;
}

/** Per-video reply override (meta.json replies), over the project's auto_reply switches. */
function repliesCard(s: Slot): string {
  const r = (s.meta.replies ?? {}) as Json;
  const custom = Boolean(r.custom);
  const g = (s.p.client.grants.auto_reply ?? {}) as Json;
  const base = `${path(s.p.client.id, s.slot)}/replies`;
  const rows = ([["comments", "Reply to comments"], ["dm", "Reply to messages"]] as const).map(([kind, lab]) => {
    const proj = Boolean(g[kind]);
    const on = custom ? Boolean(r[kind]) : proj;
    const note = custom ? "Set for this video" : `From Settings: ${proj ? "on" : "off"}`;
    const btn = `<form method=post action='${base}'><input type=hidden name=${kind} value='${on ? 0 : 1}'><button class='toggle ${on ? "on" : ""}'${custom ? "" : " disabled"} aria-pressed=${on} aria-label='${lab}'><i></i></button></form>`;
    return `<div class='rrow${custom ? "" : " inh"}'><div><b>${lab}</b><small>${note}</small></div>${btn}</div>`;
  });
  const toggle = `<form method=post action='${base}'><input type=hidden name=custom value='${custom ? 0 : 1}'><button class='toggle ${custom ? "on" : ""}' aria-pressed=${custom} aria-label='Custom for this video'><i></i></button></form>`;
  const head = `<div class='rrow rhead'><div><b>Custom replies for this video</b>${custom ? "" : `<small>Off: Settings decide (comments ${g.comments ? "on" : "off"}, messages ${g.dm ? "on" : "off"})</small>`}</div>${toggle}</div>`;
  const stop = s.p.client.emergency_stop ? "<p class=hint>Emergency stop is on: nothing replies.</p>" : "";
  return `<div id=replies class=rblock>${head}${custom ? rows.join("") : ""}${stop}</div>`;
}

/** The AI label (is_ai_generated at publish): the operator's call per video. */
function aiLabelCard(s: Slot): string {
  const on = Boolean(s.meta.is_ai_generated);
  const lock = labelLocked(s);
  const note = lock ? "Fixed: the post is out or going out" : "Sent with the post";
  const btn = `<form method=post action='${path(s.p.client.id, s.slot)}/ailabel'><input type=hidden name=value value='${on ? 0 : 1}'><button class='toggle ${on ? "on" : ""}'${lock ? " disabled" : ""} aria-pressed=${on} aria-label='AI label'><i></i></button></form>`;
  return `<div id=ailabel class=rblock><div class='rrow${lock ? " inh" : ""}'><div><b>AI label</b><small>${note}</small></div>${btn}</div></div>`;
}

async function perfCard(s: Slot, cls: string): Promise<string> {
  const [m, at] = await mediaLatest(s.p.c, s.slot);
  let perf: string;
  if (m) {
    const dv = (m._derived ?? {}) as Json;
    const avg = Number(m.ig_reels_avg_watch_time ?? 0);
    const tiles: [string, string][] = [["Views", num(m.views)], ["Accounts reached", num(m.reach)], ["Likes", num(m.likes)], ["Shares", num(m.shares)], ["Saves", num(m.saved)], ["Avg. watch", avg ? `${(avg / 1000).toFixed(1)} s` : "–"]];
    const hold = Number(dv.hold ?? 0);
    perf = `<div class=tiles>${tiles.map(([a, b]) => `<div><span>${a}</span><strong>${b}</strong></div>`).join("")}</div><p class=hint>Updated ${ago(at, s.p.now)}${hold ? hold >= 1 ? " · watched to the end on average" : ` · watched ${Math.round(hold * 100)}% on average` : ""}.</p>`;
  } else {
    perf = `<p class=muted style='margin:8px 0 0'>${cls === "live" ? "First numbers arrive within the hour." : "Numbers appear once it is live."}</p>`;
  }
  return `<section class=card><h2>Performance</h2>${perf}</section>`;
}

/** Post text and first comment: two lines, then Edit (until it goes out) or Read. `extra` goes under an empty text. */
function textCard(s: Slot, title: string, name: "caption" | "first_comment", text: string, empty: string, extra = ""): string {
  const act = `${path(s.p.client.id, s.slot)}/decide`;
  const short = text ? esc(text.split(/\s+/).join(" ")) : empty;
  if (!locked(s)) {
    return `<section class=card><h2>${title}</h2><details class=capedit><summary class=crow><p class=clamp>${short}</p><span class='btn sec'>${icon("edit", 16)}Edit</span></summary>
<form method=post action='${act}' style='margin-top:16px'><textarea name=${name} rows=${name === "caption" ? 14 : 4} maxlength=${CAPTION_MAX} aria-label='${title}'>${esc(text)}</textarea>
<div class=btns><button class='btn dark' name=action value=${name}>Save text</button></div></form></details>${text ? "" : extra}</section>`;
  }
  if (!text) return "";
  return `<section class=card><h2>${title}</h2><details class=capedit><summary class=crow><p class=clamp>${short}</p><span class='btn sec'>Read</span></summary><div class=capfull>${esc(text)}</div></details></section>`;
}

async function jobsCard(s: Slot): Promise<string> {
  const jobs = Object.values(s.jobs).sort((a, b) => b.id - a.id);
  if (!jobs.length) return "";
  const rows = jobs.map((j) => `<tr><td>${esc(j.kind)}</td><td>${jobLine(j, s.p.now).replace(/^[^:]+: /, "")}</td></tr>`).join("");
  const hosts = jobs.some((j) => j.state === "queued") ? `<p class=hint>${await hostsLine(s.p.env.DB, s.p.client.id, s.p.now)}</p>` : "";
  return `<section class=card><h2>Jobs</h2><table class=jobs>${rows}</table>${hosts}</section>`;
}

function popup(label: string, action: string, title: string, text: string, button: string): string {
  return `<details class=pop><summary class='btn sec'>${icon("x", 16)}${label}</summary><div class=box><form method=post action='${action}'><h2>${title}</h2><p class=muted style='margin:0;max-width:380px'>${text}</p>
<div class=btns><button class='btn danger small'>${button}</button></div></form></div></details>`;
}

// ── pages ─────────────────────────────────────────────────────────────────────

export async function renderVideo(p: Page, slot: string): Promise<Response> {
  const s = await load(p, slot);
  const { row, meta, jobs } = s;
  const [label, cls] = tagFor(row, jobs) ?? ["Not on the plan", "busy"];
  const st = making(jobs);
  const base = path(p.client.id, slot);
  const act = `${base}/decide`;
  const title = titleOf(row, meta);

  const whenLine = cls === "live" ? `<span class='tag live'>Live</span> &nbsp;since ${when(row.published_at)}`
    : cls === "sched" ? `<span class='tag sched'>${esc(label)}</span> &nbsp;${when(row.scheduled_at)}`
    : cls === "busy" ? `<span class='tag busy'>${esc(label)}</span>` : "<span class='tag need'>Needs approval</span>";

  const blocks: string[] = [];
  if (cls === "need" && st?.state === "failed") blocks.push(errorCard(s, st));
  const nothingYet = st?.kind === "produce" && st.state !== "done" && !row.r2_key && !s.host;
  if (cls === "need" && !nothingYet) blocks.push(reviewCard(s));
  else if (["APPROVED", "QUEUED", "PAUSED"].includes(row.state)) {
    blocks.push(`<section class=card><h2>Review</h2><form method=post action='${act}' class=crow><p>Approved. Something came up? Take the approval back and keep editing; it stays off Instagram until you approve again.</p><button class='btn sec' name=action value=revoke>${icon("edit", 16)}Edit</button></form></section>`);
  } else if (cls === "busy" && label === "In production") {
    blocks.push(`<section class=card><h2>Being made</h2><div class=prog><i></i></div><p class=hint>Planned for ${when(row.scheduled_at) || "no slot yet"}. It comes back here for approval when it is ready. This page refreshes itself.</p>${st ? `<p class=hint>${jobLine(st, p.now)}</p>` : ""}</section>`);
  } else if (cls === "busy" && st) {
    const notes = parseJson(st.payload).notes;
    blocks.push(`<section class=card><h2>${st.state === "running" ? "Rendering the new version" : "Starting"}…</h2><div class=prog><i></i></div>${typeof notes === "string" && notes ? `<div class=note>${esc(notes)}</div>` : ""}<p class=hint>${jobLine(st, p.now)}. This page refreshes itself.</p></section>`);
  }
  if (row.published_at) blocks.unshift(await perfCard(s, cls));
  blocks.push(await jobsCard(s));

  const right: string[] = [await whenCard(s, label, cls)];
  if (!row.published_at) right.push(musicCard(s));
  const gen = !s.caption && !locked(s) && (row.r2_key || s.host) && !open_(jobs.caption)
    ? `<form method=post action='${act}' class=btns style='margin-top:8px'><button class='btn sec small' name=action value=gencaption>Write the caption on a PC</button></form>` : "";
  const writing = open_(jobs.caption) && !s.caption;
  right.push(textCard(s, "Post text", "caption", s.caption, writing ? "Writing the post text…" : "No text yet.", gen));
  right.push(textCard(s, "First comment", "first_comment", s.first, "No first comment."));
  if (HAND_FROM.has(row.state)) {
    right.push(`<section class=card><h2>Posted it by hand?</h2><div class=crow><p>Want to use a song only the Instagram app has? Post manually in the app, then link the post here so it gets tracked.</p><a class='btn sec' href='${base}/byhand'>${icon("link", 16)}Link</a></div></section>`);
  }
  const links = [`<a class='btn plain' href='${base}/qa'>QA report</a>`];
  if (!NO_DELETE.has(row.state) && !open_(st)) {
    links.push(popup("Delete video", `${base}/delete`, "Delete this video?", `&ldquo;${esc(title)}&rdquo; leaves the plan, the calendar and the dashboard, with its file here. A PC that made it keeps its copy.`, "Delete"));
  } else if (LIVE.has(row.state) && row.ig_media_id) {
    links.push(popup("Remove from Instagram", `${base}/remove`, "Remove from Instagram?", `&ldquo;${esc(title)}&rdquo; is deleted from Instagram for good, with its likes, comments and views. Its numbers so far stay here. This cannot be undone.`, "Remove"));
  }
  right.push(`<div class=links>${links.join("")}</div>`);

  const body = `<a class=back href='${path(p.client.id)}'>${icon("back", 16)}Overview</a><h1>${esc(title)} <span class=hno>${esc(slotNo(slot).filter(Boolean).join(" · "))}</span></h1><p class=sub>${whenLine}</p>
<div class=vpage><div class=player>${player(s)}</div><div class='stack c2'>${blocks.join("")}</div><div class='stack c3'>${right.join("")}</div></div>`;
  const refresh = cls === "busy" || publishing(row, p.now) ? 15 : open_(jobs.formats) || writing ? 5 : null;
  return shell(p, "overview", body, title, refresh);
}

const IG_HOST = ".fbcdn.net"; // Instagram's CDN: the only place a song or a cover is taken from (in step with spine/tracks.py ig_url)

/** An https link on Instagram's CDN, or "". */
function igUrl(v: unknown): string {
  try {
    const u = new URL(String(v ?? ""));
    return u.protocol === "https:" && u.hostname.endsWith(IG_HOST) ? u.href : "";
  } catch {
    return "";
  }
}

function songLocked(s: Slot): boolean {
  return locked(s) || publishing(s.row, s.p.now);
}

/** The song in the video, the mix a PC is making, and the way to change it. */
function musicCard(s: Slot): string {
  const base = path(s.p.client.id, s.slot);
  const info = (s.meta.track_info ?? {}) as Json;
  const ig = String(s.meta.track ?? "").startsWith("ig:");
  const now = ig && info.title ? `<b>${esc(info.title)}</b>${info.artist ? ` <span class=muted>${esc(info.artist)}</span>` : ""}`
    : s.meta.audio_type ? esc(s.meta.audio_type) : "<span class=muted>No song picked.</span>";
  const j = s.jobs.track;
  const want = j ? String(((parseJson(j.payload).track ?? {}) as Json).title ?? "the song") : "";
  const status = open_(j) ? `<div class=prog><i></i></div><p class=hint>Mixing &ldquo;${esc(want)}&rdquo; into the video on a PC. ${jobLine(j!, s.p.now)}</p>`
    : j?.state === "failed" ? `<p class=hint>Could not mix &ldquo;${esc(want)}&rdquo;: ${esc(String(j.result ?? "").slice(-200))}</p>` : "";
  const change = songLocked(s) || open_(j) ? "" : `<a class='btn sec' href='${base}/music'>${icon("music", 16)}${ig || s.meta.audio_type ? "Change" : "Pick"}</a>`;
  return `<section class=card><h2>Music</h2><div class=crow><p>${now}</p>${change}</div>${status}</section>`;
}

/** Instagram's music: trending, or a search. Each row plays its preview and picks it. */
export async function renderMusic(p: Page, slot: string, fetcher: Fetcher, q: string): Promise<Response> {
  const s = await load(p, slot);
  const back = path(p.client.id, slot);
  const head = `<a class=back href='${back}'>${icon("back", 16)}${esc(titleOf(s.row, s.meta))}</a><h1>Music</h1><p class=sub>Instagram's music. A PC mixes the song you pick into the video, then the new cut replaces the old one.</p>
<form method=get action='${back}/music' class=crow><input name=q value='${esc(q)}' placeholder='Search Instagram music' aria-label='Search Instagram music' autocomplete=off style='flex:1'><button class='btn sec'>${icon("search", 16)}Search</button></form>`;
  const card = (text: string) => shell(p, "overview", `${head}<section class=card><p class=muted>${text}</p></section>`, "Music");
  if (songLocked(s)) return card(LOCKED);
  let rows: Json[];
  try {
    const params: Record<string, string> = { audio_type: "music", user_id: String(p.client.ig_user_id ?? "") };
    if (q) params.search_query = q;
    const res = await (await graphFor(p, fetcher)).get("ig_audio", params);
    rows = ((res.audio ?? res.data ?? []) as Json[]).filter((r) => /^\d+$/.test(String(r.audio_id ?? r.id ?? "")));
  } catch (e) {
    return card(`Could not reach Instagram: ${esc(e instanceof HttpError ? e.detail ?? e.message : String(e))}`);
  }
  if (!rows.length) return card(q ? `Nothing on Instagram for &ldquo;${esc(q)}&rdquo;.` : "Instagram returned no trending music.");
  const cur = String(s.meta.track ?? "");
  const items = rows.map((r) => {
    const id = String(r.audio_id ?? r.id);
    const cover = igUrl(r.cover_artwork_thumbnail_uri ?? r.profile_picture_url);
    const preview = igUrl(r.download_url);
    const ms = Number(r.duration_in_ms);
    const dur = ms > 0 ? `${Math.floor(ms / 60000)}:${String(Math.round(ms / 1000) % 60).padStart(2, "0")}` : "";
    const artist = String(r.display_artist ?? r.ig_username ?? "");
    const hidden = { audio_id: id, title: String(r.title ?? "Untitled"), artist, cover, duration: ms > 0 ? String(Math.round(ms / 100) / 10) : "", link: String(r.on_platform_audio_preview_link ?? ""), preview };
    const fields = Object.entries(hidden).map(([k, v]) => `<input type=hidden name=${k} value='${esc(v)}'>`).join("");
    const inUse = cur === `ig:${id}`;
    return `<form method=post action='${back}/track' class=cand>${cover ? `<img src='${esc(cover)}' alt='' style='width:54px;height:54px'>` : ""}<div class=t><b>${esc(hidden.title)}</b>
<div>${esc(artist)}${dur ? ` · ${dur}` : ""}</div>${preview ? `<audio controls preload=none src='${esc(preview)}' style='width:100%;height:32px;margin-top:6px'></audio>` : ""}</div>${fields}${inUse ? "<span class='tag live'>In use</span>" : "<button class='btn pri small'>Use</button>"}</form>`;
  });
  return shell(p, "overview", `${head}<section class=card>${items.join("")}</section>`, "Music");
}

/** Recent posts on the account that no slot is linked to yet, newest first. */
async function candidates(p: Page, graph: Graph): Promise<Json[]> {
  const rows = await graph.recentMedia(String(p.client.ig_user_id), FIELDS);
  const linked = new Set((await posts(p.c, null)).map((r) => r.ig_media_id).filter(Boolean));
  return rows.filter((r) => !linked.has(String(r.id)));
}

const WORDS = /[a-z]{4,}/g;

export async function renderByhand(p: Page, slot: string, fetcher: Fetcher): Promise<Response> {
  const s = await load(p, slot);
  const back = path(p.client.id, slot);
  const head = `<a class=back href='${back}'>${icon("back", 16)}${esc(titleOf(s.row, s.meta))}</a><h1>Link the Instagram post</h1><p class=sub>Pick the post you made by hand for this video. Only posts not linked to another video are shown.</p>`;
  const card = (text: string) => shell(p, "overview", `${head}<section class=card><p class=muted>${text}</p></section>`, "Link post");
  if (!HAND_FROM.has(s.row.state)) return card("This video is already published or not ready.");
  let cands: Json[];
  try {
    cands = await candidates(p, await graphFor(p, fetcher));
  } catch (e) {
    return card(`Could not reach Instagram: ${esc(e instanceof HttpError ? e.detail ?? e.message : String(e))}`);
  }
  if (!cands.length) return card("No unlinked posts on Instagram yet. Post it in the app, then reload this page.");
  const words = new Set(s.caption.toLowerCase().match(WORDS) ?? []);
  const score = (c: Json) => (String(c.caption ?? "").toLowerCase().match(WORDS) ?? []).filter((w) => words.has(w)).length;
  const best = words.size && Math.max(...cands.map(score)) ? cands.reduce((a, b) => (score(b) > score(a) ? b : a)).id : null;
  const items = cands.map((c) => {
    const img = String(c.thumbnail_url ?? c.media_url ?? "");
    const cap = String(c.caption ?? "No caption").split(/\s+/).join(" ");
    return `<form method=post action='${back}/byhand' class=cand>${img ? `<img src='${esc(img)}' alt=''>` : ""}<div class=t><b>${when(String(c.timestamp ?? ""))}</b>${c.id === best ? " <span class='tag live'>Best match</span>" : ""}
<div>${esc(cap)}</div><a class=muted style='font-size:13px' href='${esc(c.permalink ?? "#")}' target=_blank rel=noopener>Open on Instagram</a></div><input type=hidden name=media value='${esc(c.id)}'><button class='btn pri small'>This one</button></form>`;
  });
  return shell(p, "overview", `${head}<section class=card>${items.join("")}</section>`, "Link post");
}

/** qa.md stays on the PC that made the video (it is not one of the post_files). */
export async function renderQa(p: Page, slot: string): Promise<Response> {
  const s = await load(p, slot);
  const text = s.host ? `The QA report (qa.md) is on ${esc(s.host)}, next to the video.` : "No QA report.";
  return shell(p, "overview", `<a class=back href='${path(p.client.id, slot)}'>${icon("back", 16)}${esc(titleOf(s.row, s.meta))}</a><h1>QA report</h1><p class=sub>${esc(slot)}</p><section class=card><p class=muted>${text}</p></section>`, "QA report");
}

// ── the POSTs ─────────────────────────────────────────────────────────────────

export function field(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v : "";
}

/** POST /<client>/v/<slot>/<action>; null for an action that is not one. */
export async function act(p: Page, slot: string, action: string, form: FormData, fetcher: Fetcher): Promise<Response | null> {
  const back = path(p.client.id, slot);
  const s = await load(p, slot);
  const { row } = s;
  switch (action) {
    case "decide":
      return decide(s, form, back);
    case "replies": {
      const kw: Record<string, boolean> = {};
      for (const k of ["custom", "comments", "dm"]) if (form.has(k)) kw[k] = field(form, k) === "1";
      if (!Object.keys(kw).length) throw new HttpError(400, "replies", "nothing to change");
      const r = (s.meta.replies ?? {}) as Json;
      const custom = Boolean(r.custom);
      if (("comments" in kw || "dm" in kw) && !custom) throw new HttpError(400, "replies", "turn on custom for this video first");
      let next: Json = { custom, comments: Boolean(r.comments), dm: Boolean(r.dm), ...kw };
      if (kw.custom && !custom) {
        const g = (p.client.grants.auto_reply ?? {}) as Json; // start from the project's current setting
        next = { custom: true, comments: Boolean(g.comments), dm: Boolean(g.dm) };
      }
      await setMeta(s, { replies: next });
      return redirect(back);
    }
    case "ailabel":
      if (labelLocked(s)) throw new HttpError(409, "locked", "the post is out or going out");
      await setMeta(s, { is_ai_generated: field(form, "value") === "1" });
      return redirect(back);
    case "byhand": {
      const media = field(form, "media");
      if (row.ig_media_id === media) return redirect(back); // already linked (double click)
      const cand = (await candidates(p, await graphFor(p, fetcher))).find((r) => String(r.id) === media);
      if (!cand) throw new HttpError(400, "media", `${media} is not a recent, unlinked post on @${p.client.ig_username ?? p.client.id}`);
      if (!HAND_FROM.has(row.state)) throw new HttpError(400, "state", `${slot} is ${row.state}; only unpublished slots can be linked`);
      await linkByHand(p.c, slot, cand);
      return redirect(back);
    }
    case "track": {
      if (songLocked(s)) throw new HttpError(409, "locked", LOCKED);
      if (open_(s.jobs.track)) throw new HttpError(409, "busy", "a PC is mixing a song into it: wait for it to finish");
      const id = field(form, "audio_id");
      if (!/^\d+$/.test(id)) throw new HttpError(400, "track", "not an Instagram song");
      const preview = igUrl(field(form, "preview"));
      if (!preview) throw new HttpError(400, "track", "this song has no file Instagram lets us download");
      const dur = Number(field(form, "duration"));
      const track: Json = {
        audio_id: id, title: field(form, "title").slice(0, 200) || "Untitled", artist: field(form, "artist").slice(0, 200),
        cover: igUrl(field(form, "cover")), duration: dur > 0 ? dur : null, link: field(form, "link").slice(0, 500), preview,
      };
      await enqueue(s, "track", { slot: s.slot, track }); // the slot in the payload: ONCE_KINDS dedupes on it

      return redirect(back);
    }
    case "formats": {
      const ratios = form.getAll("r").filter((r): r is string => typeof r === "string" && r in RATIOS);
      if (ratios.length && !open_(s.jobs.formats)) await enqueue(s, "formats", { argv: ["spine.formats", "make", p.client.id, slot, ...ratios] });
      return redirect(back);
    }
    case "remove": {
      if (!LIVE.has(row.state) || !row.ig_media_id) throw new HttpError(409, "live", `${slot} is ${row.state}, not live`);
      const graph = await graphFor(p, fetcher);
      const j = await journal(p.c, "meta.media.delete", slot, { media: row.ig_media_id });
      let out: Json;
      try {
        out = await graph.del(row.ig_media_id);
      } catch (e) {
        if (!(e instanceof GraphError) || !(await gone(graph, row.ig_media_id))) {
          await journalOutcome(p.c, j, { error: String(e) });
          throw new HttpError(409, "graph", `Instagram refused: ${e}`);
        }
        out = { already_gone: true, error: String(e) }; // taken down by hand in the app
      }
      await journalOutcome(p.c, j, out);
      await setState(p.c, slot, "REMOVED", "removed from Instagram", {});
      return redirect(back);
    }
    case "delete": {
      if (NO_DELETE.has(row.state)) throw new HttpError(409, "live", "this video is on Instagram (or may be): it cannot be deleted here");
      if (open_(making(s.jobs))) throw new HttpError(409, "busy", "a job is running for it: wait for it to finish");
      await dropVideo(p.env, p.client.id, slot);
      if (row.cover_key) await p.env.MEDIA.delete(row.cover_key).catch(() => {});
      await p.env.DB.batch([
        p.env.DB.prepare("DELETE FROM post_files WHERE client = ? AND slot_id = ?").bind(p.client.id, slot),
        p.env.DB.prepare("DELETE FROM posts WHERE client = ? AND slot_id = ?").bind(p.client.id, slot),
      ]);
      return redirect(path(p.client.id));
    }
    default:
      return null;
  }
}

/** Meta answers 100/33, "does not exist", for a deleted reel (spine/publisher/publish.py _gone). */
async function gone(graph: Graph, mediaId: string): Promise<boolean> {
  try {
    await graph.media(mediaId);
    return false;
  } catch (e) {
    return e instanceof GraphError && e.code === 100 && e.subcode === 33;
  }
}

/** A custom time from the form: the browser's local "YYYY-MM-DDTHH:MM" plus its UTC offset in minutes. */
function customTime(form: FormData): number {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?$/.exec(field(form, "at"));
  const ms = m ? Date.parse(`${m[1]}:00Z`) : NaN;
  if (Number.isNaN(ms)) throw new HttpError(400, "at", "pick a date and time");
  const tz = Number(field(form, "tz"));
  if (field(form, "tz") === "" || !Number.isFinite(tz)) throw new HttpError(400, "tz", "the browser did not say its time zone (the page's script sets it): try again with JavaScript on");
  return ms + tz * 60_000;
}

async function decide(s: Slot, form: FormData, back: string): Promise<Response> {
  const { p, slot, row } = s;
  const action = field(form, "action");
  const notes = (field(form, "notes") || field(form, "note")).trim();
  switch (action) {
    case "retry": {
      const st = making(s.jobs);
      if (st?.state === "failed") await enqueue(s, st.kind, parseJson(st.payload));
      break;
    }
    case "generate": {
      if (open_(making(s.jobs))) throw new HttpError(409, "busy", "this video is already being made");
      if (!["NEEDS_APPROVAL", "NEEDS_INPUT"].includes(row.state)) throw new HttpError(409, "state", `only a video waiting for review can be generated again (this one is ${row.state})`);
      const engine = field(form, "engine") in ENGINES ? field(form, "engine") : "html";
      const prompt = field(form, "prompt").trim();
      if (!prompt) throw new HttpError(400, "prompt", "say what the new video should be"); // the host refuses an empty one too
      await setMeta(s, { engine_choice: engine, source: "prompt", plan: "manual" });
      await enqueue(s, "produce", { argv: ["spine.manual", "produce", p.client.id, slot], prompt, engine }); // before the states: SCRIPTED with no job would wait forever
      await setState(p.c, slot, "REJECTED", "generate new", {});
      await setState(p.c, slot, "SCRIPTED", `generate new (${engine}): ${prompt.slice(0, 150)}`, {});
      break;
    }
    case "approve": {
      if (s.meta.upload) {
        // a browser upload no PC has seen: the `spec` job's check must have passed (docs/CLOUDFLARE-PLAN.md, "Uploads")
        const sp = s.jobs.spec;
        if (sp?.state !== "done") throw new HttpError(409, "spec", sp?.state === "failed" ? `the file check failed: ${jobResult(sp).slice(0, 300)}` : "a PC has not checked the file yet: try again in a minute");
        const issues = parseJson(sp.result).issues;
        if (Array.isArray(issues) && issues.length) throw new HttpError(409, "spec", `Instagram would refuse this file: ${issues.join("; ")}`);
      }
      let at = row.scheduled_at ? null : await previewSlot(p, slot); // the slot the calendar showed
      if (!at) {
        try {
          at = slotForApproval(await takenSlots(p.c, slot), row, p.client.grants, p.now);
        } catch (e) {
          if (e instanceof HttpError && e.status === 409) throw new HttpError(409, "slot", `Not approved: ${e.detail} (${row.scheduled_at ?? ""}). Reschedule it, then approve.`);
          throw e;
        }
      }
      if (form.has("caption")) await setFiles(s, { "caption.txt": field(form, "caption") }); // only once the approve goes through
      await setState(p.c, slot, "APPROVED", notes || null, { scheduled_at: at });
      if (!row.r2_key) await enqueue(s, "upload", null); // the Worker publishes from R2: a host sends the file up
      break;
    }
    case "caption":
    case "first_comment": {
      if (locked(s)) throw new HttpError(409, "CAPTION_LOCKED", LOCKED);
      const text = field(form, action).replace(/\r\n/g, "\n").trim();
      if (text.length > CAPTION_MAX) throw new HttpError(400, "length", `Instagram allows ${CAPTION_MAX} characters at most`);
      await setFiles(s, { [`${action}.txt`]: text ? text + "\n" : "" });
      break;
    }
    case "gencaption":
      if (locked(s)) throw new HttpError(409, "CAPTION_LOCKED", LOCKED);
      if (!s.caption && !open_(s.jobs.caption)) await enqueue(s, "caption", { argv: ["spine.caption", "write", p.client.id, slot] });
      break;
    case "publish_now":
      if (!["APPROVED", "QUEUED"].includes(row.state)) throw new HttpError(409, "state", "approve it first");
      await OPS.move!(p.c, { slot_id: slot, at: iso(p.now) });
      if (row.state === "APPROVED") await setState(p.c, slot, "QUEUED", null, {}); // the cron takes a due QUEUED slot within the minute
      break;
    case "pause":
      if (row.state !== "PAUSED") await setState(p.c, slot, "PAUSED", "held off Instagram", {}); // a second click is a no-op
      break;
    case "resume": {
      if (row.state !== "PAUSED") throw new HttpError(409, "state", "it is not paused");
      const late = overdue(row, p.now);
      if (late) await OPS.move!(p.c, { slot_id: slot, at: iso(p.now) }); // its time has passed: out now, as Publish now does
      await setState(p.c, slot, "QUEUED", "released", {});
      break;
    }
    case "custom": {
      const ms = customTime(form);
      if (ms <= p.now) throw new HttpError(400, "at", "pick a time in the future");
      const at = iso(ms);
      if ((await takenSlots(p.c, slot)).has(at)) throw new HttpError(409, "taken", "another video holds that time");
      await OPS.move!(p.c, { slot_id: slot, at });
      break;
    }
    case "revoke":
      if (row.state !== "NEEDS_APPROVAL") await setState(p.c, slot, "NEEDS_APPROVAL", "approval taken back to keep editing", {});
      break;
    case "reject": {
      if (!notes) throw new HttpError(400, "notes", "a rejection needs a note: say what should change");
      const film = (s.meta.film ?? {}) as Json;
      if (film.engine !== "remotion" && film.engine !== "html") throw new HttpError(409, "film", `this video has no film a note can edit (${film.engine ?? "an upload or a template"}): use Generate New instead`);
      await setState(p.c, slot, "REJECTED", notes, {});
      await enqueue(s, "revise", { argv: ["spine.revise", "run", p.client.id, slot], notes });
      break;
    }
    default:
      throw new HttpError(400, "action", "unknown action");
  }
  return redirect(back);
}
