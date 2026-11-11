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
import { viewsBlock } from "./overview.ts";
import { previewSlots, slots, slotForApproval, takenSlots } from "./schedule.ts";
import {
  ago, CAPTION_LOCKED, display, ENGINES, esc, icon, jobLine, jobResult, LIVE, mediaLatest, MOVABLE, NO_DELETE, num, overdue, page, parse, parseJson, path,
  publishing, redirect, shell, slotNo, tagFor, titleOf, when, type Json, type Page,
} from "./shell.ts";
import { AUDIO_JS, EMPTY_HINT, GEN_BTN, MOTION_STYLES } from "./ui.gen.ts";

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

// ── cards (app.py's, markup for markup) ──────────────────────────────────────

/** app.py popup(): a trigger that opens a centred box; Esc, Cancel or a click outside closes it. */
function popup(trigger: string, box: string): string {
  return `<div class=pop>${trigger}<div class=rgm hidden>${box}</div><script>(()=>{const w=document.currentScript.parentElement,m=w.querySelector('.rgm');w.querySelector('[data-open]').addEventListener('click',e=>{e.preventDefault();m.hidden=false;const f=m.querySelector('textarea,input:not([type=hidden]),button');if(f)f.focus();});m.addEventListener('click',e=>{if(m.querySelector('.busy'))return;if(e.target===m||e.target.closest('[data-close]'))m.hidden=true;});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!m.querySelector('.busy'))m.hidden=true;});})();</script></div>`;
}

const RATIO_ORDER = ["1x1", "4x5", "2x3", "16x9"]; // spine/formats.py RATIOS

/** app.py formats_button(): Generate new version, the other formats a PC lays out and renders. */
function formatsButton(s: Slot): string {
  const st = s.jobs.formats;
  if (open_(st)) return `<span class='tag gen'>${st!.state === "running" ? "Generating" : "Waiting to make"} …</span>`;
  const err = st?.state === "failed" ? `<p class=hint style='color:#b42318;margin:0'>Last run failed: ${esc(jobResult(st))}</p>` : "";
  const boxes = RATIO_ORDER.map((r) => `<label class=chk style='flex-direction:row;gap:8px;color:var(--ink)'><input type=checkbox name=r value=${r} checked>${RATIOS[r]}</label>`).join("");
  const box = `<form method=post action='${path(s.p.client.id, s.slot)}/formats' class=rgbox><h2>Generate other formats</h2><p class=muted style='margin:0;max-width:400px'>For posting by hand on other platforms. Each format is a new layout of this film (same words, beats and footage, placed for that size), rendered with the reel's sound. A few minutes per format. A video with an Instagram track comes out without that music.</p>${err}${boxes}<div class=btns><button class='btn pri small'>Generate</button><button type=button class='btn sec small' data-close>Cancel</button></div></form>`;
  return popup(`<button type=button class='btn plain' data-open>Generate new version</button>`, box);
}

/** app.py's player block: the reel, the safe-zone overlay, Generate new version, Download, Show what Instagram covers. */
function player(s: Slot): string {
  const ui = "<div class=ui><i style='top:0;height:14%'></i><i style='bottom:0;height:35%'></i><b style='left:0;right:0;top:14.84%;bottom:14.84%'></b><span style='top:15.4%'>Feed 4:5 crop</span><span style='top:1%'>Reel UI</span><span style='bottom:1%'>Caption · buttons</span></div>";
  const poster = s.row.cover_key ? ` poster='${mediaUrl(s, "cover")}'` : "";
  let frame: string;
  if (s.row.r2_key) {
    frame = `<div class=frame id=frame><video controls playsinline preload=metadata${poster} style='aspect-ratio:9/16' src='${mediaUrl(s, "video")}'></video>${ui}</div>`;
  } else if (s.row.cover_key && (s.meta.source === "instagram" || s.row.published_at)) {
    frame = `<div class=frame id=frame><img src='${mediaUrl(s, "cover")}' alt='' style='aspect-ratio:9/16;width:100%;object-fit:cover;display:block'>${s.row.published_at ? "" : "<p class=muted style='margin:8px 0 0;font-size:13px'>Instagram does not share this reel's file (licensed song): cover only.</p>"}</div>`;
  } else if (s.row.cover_key && s.host) {
    frame = `<div class=frame id=frame><img src='${mediaUrl(s, "cover")}' alt='' style='aspect-ratio:9/16;width:100%;object-fit:cover;display:block'><p class=muted style='margin:8px 0 0;font-size:13px'>The video is on ${esc(s.host)}; it comes here when it is approved.</p></div>`;
  } else {
    // the file is on a PC until it is approved (app.py had it on disk): say where
    frame = `<div class=empty>${s.host ? `The video is on ${esc(s.host)}; it comes here when it is approved.` : "No video file yet."}</div>`;
  }
  const dls = s.row.r2_key ? `<a class='btn sec' href='${mediaUrl(s, "video")}' download>${icon("download", 16)}Download reel</a>` : "";
  const canFmt = !(s.meta.upload && !((s.meta.film ?? {}) as Json).source); // an upload until its first edit
  return `${frame}<div class=pctl><span>${canFmt ? formatsButton(s) : ""}</span>${dls}</div><hr class=pdiv><label class='chk big'><input type=checkbox onchange="document.getElementById('frame').classList.toggle('showui',this.checked)">Show what Instagram covers</label>`;
}

/** app.py motion_pill(): the reel's motion style by name. */
function motionPill(s: Slot): string {
  const m = MOTION_STYLES[String(s.meta.motion ?? "")];
  const [name, tip] = m ? [m.style || m.title || "", `${m.title} · ${m.url}`] : ["House look", "The house motion language (Showreel, Favorites)"];
  return `<span class=mpill title='${esc(tip)}'>${esc(name)}</span>`;
}

function enginePick(): string {
  return `<fieldset class=engines><legend>Animate with</legend>${Object.entries(ENGINES).map(([k, v]) => `<label class=chk><input type=radio name=engine value=${k}${k === "html" ? " checked" : ""}>${esc(v)}</label>`).join("")}</fieldset>`;
}

/** app.py generate_box(): the Generate New dialog. */
function generateBox(s: Slot): string {
  return `<dialog class=dlg id=gennew><form method=post action='${path(s.p.client.id, s.slot)}/decide' class=rgbox onsubmit="return confirm('Replace this video with a new one? The current cut stays under its versions.')"><input type=hidden name=action value=generate><h2>Generate new</h2>${enginePick()}<label>What should the video be?<textarea name=prompt rows=5 placeholder='e.g. Same message, but lead with the swell map'></textarea></label><p class=hint style='margin:0'>${EMPTY_HINT} This video is replaced; the current cut stays under its versions.</p><div class=btns><button class='btn pri small'>Generate</button><button type=button class='btn sec small' onclick="this.closest('dialog').close()">Cancel</button></div></form></dialog>`;
}

function errorCard(s: Slot, st: JobRow): string {
  const isNew = st.kind === "produce";
  const payload = parseJson(st.payload);
  const asked = typeof payload.prompt === "string" ? payload.prompt : typeof payload.notes === "string" ? payload.notes : "";
  return `<section class='card errcard' id=error><h2>${isNew ? "Making it failed" : "Re-render failed"}</h2><p class=hint>Failed ${esc(ago(iso(st.updated_at), s.p.now))}. ${
    isNew && !s.row.r2_key && !s.host ? "Nothing was made yet.</p>" : "The video here is still the previous cut, so you can approve it or send new notes.</p>"}${
    asked ? `<p class=hint><b>${isNew ? "Your prompt" : "Your notes"}:</b> ${esc(asked)}</p>` : ""}<pre class=errlog>${esc(jobResult(st) || "No error text.")}</pre><form method=post action='${path(s.p.client.id, s.slot)}/decide'><div class=btns><button class='btn pri' name=action value=retry>${icon("redo")}Re-run</button></div><p class=hint>${isNew ? "Tries again from where it stopped, with the same prompt." : "Runs the edit and the render again with the same notes."}</p></form></section>`;
}

/** app.py's Review card: Approve | Edit (notes) | Generate New. */
function reviewCard(s: Slot): string {
  const act = `${path(s.p.client.id, s.slot)}/decide`;
  return `<section class=card><div class=row><h2>Review</h2>${motionPill(s)}</div><form method=post action='${act}' style='margin-top:16px'><div class=ask0><div class=btns><button class='btn pri' name=action value=approve>${icon("check")}Approve</button><button type=button class='btn sec' onclick="const f=this.form;f.querySelector('.ask0').hidden=true;f.querySelector('.ask1').hidden=false;f.notes.focus()">${icon("edit", 16)}Edit</button>${GEN_BTN}</div></div><div class=ask1 hidden><label for=notes class=muted style='font-size:14px'>What should change?</label><textarea id=notes name=notes placeholder='e.g. Lead with the advantage, not the number. Make it faster.' style='margin-top:8px' oninput="this.form.querySelector('[value=reject]').disabled=!this.value.trim()"></textarea><div class=btns><button class='btn pri' name=action value=reject disabled>${icon("redo")}Update</button><button type=button class='btn sec' onclick="const f=this.form;f.notes.value='';f.querySelector('[value=reject]').disabled=true;f.querySelector('.ask1').hidden=true;f.querySelector('.ask0').hidden=false">${icon("x", 16)}Cancel</button>${GEN_BTN}</div></div></form>${generateBox(s)}</section>`;
}

function holdButton(s: Slot): string {
  const act = `${path(s.p.client.id, s.slot)}/decide`;
  if (s.row.state === "PAUSED") {
    const late = overdue(s.row, s.p.now) ? ` onsubmit="return confirm('Its time has passed: publish to Instagram now?')"` : "";
    return `<form method=post action='${act}'${late}><button class='btn sec ico' name=action value=resume title='Release it' aria-label='Release it'>${icon("play", 18)}</button></form>`;
  }
  if (s.row.state === "APPROVED" || s.row.state === "QUEUED") {
    return `<form method=post action='${act}'><button class='btn sec ico' name=action value=pause title='Pause: hold it off Instagram' aria-label='Pause: hold it off Instagram'>${icon("pause", 18)}</button></form>`;
  }
  return "";
}

/** app.py when_tools(): Publish now (approved only), Swap slot (the calendar), Custom time. */
function whenTools(s: Slot, cal: string, at: string | null): string {
  const act = `${path(s.p.client.id, s.slot)}/decide`;
  const now = ["APPROVED", "QUEUED"].includes(s.row.state)
    ? `<form method=post action='${act}' onsubmit="return confirm('Publish to Instagram now?')"><button class='btn pri' name=action value=publish_now>${icon("ext", 16)}Publish now</button></form>` : "";
  const swap = cal ? `<a class='btn sec' href='${cal}'>${icon("cal", 16)}Swap slot</a>` : "";
  const utc = at ? ` data-utc='${new Date(parse(at) ?? 0).toISOString()}'` : "";
  const custom = `<details class=cust><summary class='btn sec'>${icon("clock", 16)}Custom time</summary><form method=post action='${act}' class=btns><input type=datetime-local name=at required aria-label='Custom time'${utc}><input type=hidden name=tz value=''><button class='btn dark' name=action value=custom>Save</button></form></details>`;
  return `<div class='btns whentools'>${now}${swap}${custom}</div>`;
}

/** The ISO week a UTC stamp falls in, in UTC (the browser's week may differ by a day at the edge). */
function isoWeek(ms: number): string {
  const d = new Date(ms);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, "0")}`;
}

async function whenCard(s: Slot, label: string, cls: string): Promise<string> {
  const { row, p } = s;
  const at = cls === "live" ? row.published_at : row.scheduled_at || (cls === "need" ? await previewSlot(p, s.slot) : null);
  const cal = at ? `${path(p.client.id)}/calendar?w=${isoWeek(parse(at) ?? 0)}&hl=${encodeURIComponent(s.slot)}` : "";
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
  if (!act) act = busy ? `<div class='btns whentools'><button class='btn pri' disabled>${icon("ext", 16)}Publishing…</button></div>` : cls !== "live" && MOVABLE.has(row.state) ? whenTools(s, cal, at) : "";
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

async function perfCard(s: Slot, cls: string, q: URLSearchParams): Promise<string> {
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
  if (s.row.published_at) perf += await viewsBlock(s.p, [s.row], q, 600, 200, "day", path(s.p.client.id, s.slot));
  return `<section class=card><h2>Performance</h2>${perf}</section>`;
}

/** app.py's Post text card: two lines, then Edit (until it goes out) or Read; Copy in the head. */
function captionCard(s: Slot): string {
  const act = `${path(s.p.client.id, s.slot)}/decide`;
  const cap = s.caption;
  const writing = open_(s.jobs.caption) && !cap;
  const short = writing ? "Writing the post text…" : cap ? esc(cap.split(/\s+/).join(" ")) : `No text yet.${s.row.r2_key || s.host ? " <button class='lnk linkbtn' form=gencap name=action value=gencaption>Generate</button>" : ""}`;
  const head = cap ? `<div class=row><h2>Post text</h2><button type=button class='x' title='Copy the post text' aria-label='Copy the post text' data-t='${esc(cap)}' onclick="navigator.clipboard.writeText(this.dataset.t);this.title='Copied'">${icon("copy", 16)}</button></div>` : "<h2>Post text</h2>";
  if (!CAPTION_LOCKED.has(s.row.state) && !s.row.published_at) {
    return `<section class=card>${head}<details class=capedit><summary class=crow><p class=clamp>${short}</p><span class='btn sec' title='Read the full text and edit'>${icon("edit", 16)}Edit</span></summary><form method=post action='${act}' style='margin-top:16px'><textarea name=caption rows=14 maxlength=${CAPTION_MAX} aria-label='Post text'>${esc(cap)}</textarea><div class=btns><button class='btn dark' name=action value=caption>Save text</button><button type=button class='btn sec' onclick="this.closest('details').open=false">Cancel</button></div></form></details><form id=gencap method=post action='${act}'></form></section>`;
  }
  if (!cap) return "";
  return `<section class=card>${head}<details class=capedit><summary class=crow><p class=clamp>${short}</p><span class='btn sec' title='Read the full text'>Read</span></summary><div class=capfull>${esc(cap)}</div></details></section>`;
}

function deleteCard(s: Slot, title: string): string {
  const box = `<form method=post action='${path(s.p.client.id, s.slot)}/delete' class=rgbox onsubmit="const b=this.querySelector('.danger');b.classList.add('busy');b.textContent='Deleting…';this.querySelectorAll('button').forEach(x=>x.disabled=true)"><h2>Delete this video?</h2><p class=muted style='margin:0;max-width:380px'>&ldquo;${esc(title)}&rdquo; leaves the plan, the calendar and the dashboard. A PC that made it keeps its files.</p><div class=btns><button class='btn danger small'>Delete</button><button type=button class='btn sec small' data-close>Cancel</button></div></form>`;
  return popup(`<button type=button class='btn sec' data-open>${icon("x", 16)}Delete video</button>`, box);
}

function removeCard(s: Slot, title: string): string {
  const box = `<form method=post action='${path(s.p.client.id, s.slot)}/remove' class=rgbox><h2>Remove from Instagram?</h2><p class=muted style='margin:0;max-width:380px'>&ldquo;${esc(title)}&rdquo; is deleted from Instagram for good, with its likes, comments and views. Its numbers so far stay here. This cannot be undone.</p><div class=btns><button class='btn danger small'>Remove</button><button type=button class='btn sec small' data-close>Cancel</button></div></form>`;
  return popup(`<button type=button class='btn sec' data-open>${icon("x", 16)}Remove from Instagram</button>`, box);
}

// ── pages ─────────────────────────────────────────────────────────────────────

export async function renderVideo(p: Page, slot: string, q: URLSearchParams = new URLSearchParams(), fetcher: Fetcher | null = null): Promise<Response> {
  const s = await load(p, slot);
  const { row, meta, jobs } = s;
  const [label, cls] = tagFor(row, jobs) ?? ["Not on the plan", "busy"];
  const music = q.get("music") ?? "file";
  const mq = (q.get("q") ?? "").trim().slice(0, 100);
  if (q.get("rows") === "1") return page(await musicCard(s, cls, music, mq, false, fetcher), 200); // the Instagram rows, fetched after the page (AUDIO_JS)
  const st = making(jobs);
  const title = titleOf(row, meta);

  const whenLine = cls === "live" ? `<span class='tag live'>Live</span> &nbsp;since ${when(row.published_at)}`
    : cls === "sched" ? `<span class='tag sched'>${esc(label)}</span> &nbsp;${when(row.scheduled_at)}`
    : cls === "busy" ? `<span class='tag busy'>${esc(label)}</span>` : "<span class='tag need'>Needs approval</span>";

  const blocks: string[] = [];
  if (cls === "need" && st?.state === "failed") blocks.push(errorCard(s, st));
  const nothingYet = st?.kind === "produce" && st.state !== "done" && !row.r2_key && !s.host;
  if (cls === "need" && !nothingYet) blocks.push(reviewCard(s));
  else if (["APPROVED", "QUEUED", "PAUSED"].includes(row.state)) {
    blocks.push(`<section class=card><div class=row><h2>Review</h2>${motionPill(s)}</div><form method=post action='${path(p.client.id, slot)}/decide' class=crow><p>Approved. Something came up? Take the approval back and keep editing; it stays off Instagram until you approve again.</p><button class='btn sec' name=action value=revoke>${icon("edit", 16)}Edit</button></form></section>`);
  } else if (cls === "busy" && label === "In production") {
    blocks.push(`<section class=card><h2>Being made</h2><div class=prog><i></i></div><p class=hint>Planned for ${when(row.scheduled_at)}. It comes back here for approval when it is ready. This page refreshes itself.</p></section>`);
  } else if (cls === "busy") {
    const notes = st ? parseJson(st.payload).notes : "";
    blocks.push(`<section class=card><h2>${st?.state === "running" ? "Rendering the new version" : "Starting"}…</h2><div class=prog><i></i></div><div class=note>${esc(typeof notes === "string" ? notes : "")}</div><p class=hint>${st?.state === "queued" ? `${jobLine(st, p.now)}.` : `Started ${st ? ago(iso(st.created_at), p.now) : ""}.`} This page refreshes itself.</p></section>`);
  }
  blocks.push(await musicCard(s, cls, music, mq, true, fetcher));
  if (row.published_at) blocks.unshift(await perfCard(s, cls, q)); // published: performance leads the middle column

  const right: string[] = [await whenCard(s, label, cls)];
  right.push(captionCard(s));
  if (HAND_FROM.has(row.state)) {
    right.push(`<section class=card><h2>Posted it by hand?</h2><div class=crow><p>Want to use a song only the Instagram app has? Post manually in the app, then link the post here so it gets tracked.</p><a class='btn sec' href='${path(p.client.id, slot)}/byhand'>${icon("link", 16)}Link</a></div></section>`);
  }
  const links = [`<a class='btn plain' href='${path(p.client.id, slot)}/qa'>QA report</a>`];
  if (!NO_DELETE.has(row.state) && st?.state !== "running") links.push(deleteCard(s, title));
  else if (LIVE.has(row.state) && row.ig_media_id) links.push(removeCard(s, title));
  right.push(`<div class=links>${links.join("")}</div>`);

  const body = `<a class=back href='${path(p.client.id)}'>${icon("back", 16)}Overview</a><h1>${esc(title)} <span class=hno>${esc(slotNo(slot).filter(Boolean).join(" · "))}</span></h1><p class=sub>${whenLine}</p><div class=vpage><div class=player>${player(s)}</div><div class='stack c2'>${blocks.join("")}</div><div class='stack c3'>${right.join("")}</div></div>`;
  const writing = open_(jobs.caption) && !s.caption;
  const refresh = cls === "busy" || publishing(row, p.now) ? 15 : open_(jobs.formats) || writing || open_(jobs.track) ? 5 : null;
  return shell(p, "overview", body, title, refresh);
}

const IG_HOST = ".fbcdn.net"; // Instagram's CDN: the only place a song or a cover is taken from (in step with spine/tracks.py ig_url)
const IG_TTL_MS = 6 * 3600_000; // spine/tracks.py IG_TTL
const IG = "ig:"; // spine/tracks.py IG_PREFIX

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

/** One row of the picker, spine/tracks.py's shape. */
interface Track { id: string; title: string; artist?: string | null; mood?: string | null; duration?: number | null; cover?: string | null; preview?: string | null; file?: string | null; audio_id?: string; link?: string | null }

/** The PC's library as it sent it up (spine/worker.py sync_music): tracks.json in R2. */
async function library(p: Page): Promise<{ tracks: Track[]; ig_queries: string[] }> {
  const o = await p.env.MEDIA.get(`${p.client.id}/music/tracks.json`);
  if (!o) return { tracks: [], ig_queries: [] };
  try {
    const j = JSON.parse(await o.text()) as { tracks?: Track[]; ig_queries?: string[] };
    return { tracks: Array.isArray(j.tracks) ? j.tracks : [], ig_queries: Array.isArray(j.ig_queries) ? j.ig_queries.map(String) : [] };
  } catch {
    return { tracks: [], ig_queries: [] };
  }
}

/** spine/tracks.py _ig_parse(). */
function igParse(rows: Json[]): Track[] {
  const out: Track[] = [];
  for (const r of rows) {
    const aid = String(r.audio_id ?? r.id ?? "");
    if (!/^\d+$/.test(aid)) continue;
    const ms = Number(r.duration_in_ms);
    out.push({ id: IG + aid, audio_id: aid, title: String(r.title || "Untitled"), artist: String(r.display_artist ?? r.ig_username ?? "") || null, mood: null,
      cover: igUrl(r.cover_artwork_thumbnail_uri ?? r.profile_picture_url) || null, duration: ms > 0 ? Math.round(ms / 100) / 10 : null,
      preview: igUrl(r.download_url) || null, link: String(r.on_platform_audio_preview_link ?? "") || null });
  }
  return out;
}

type IgCache = Record<string, { at: number; tracks: Track[] }>;

async function igCache(p: Page): Promise<IgCache> {
  const o = await p.env.MEDIA.get(`${p.client.id}/music/ig-cache.json`);
  try {
    return o ? (JSON.parse(await o.text()) as IgCache) : {};
  } catch {
    return {};
  }
}

/** spine/tracks.py ig_tracks(): trending (no query) or a search, cached IG_TTL. */
async function igTracks(p: Page, graph: Graph, cache: IgCache, query: string | null): Promise<Track[]> {
  const key = (query ?? "").trim().toLowerCase() || "trending:";
  const hit = cache[key];
  if (hit && p.now - hit.at < IG_TTL_MS) return hit.tracks;
  const params: Record<string, string> = { audio_type: "music", user_id: String(p.client.ig_user_id ?? "") };
  if (query) params.search_query = query;
  const res = await graph.get("ig_audio", params);
  const tracks = igParse(((res.audio ?? res.data ?? []) as Json[]) || []);
  cache[key] = { at: p.now, tracks };
  return tracks;
}

/** The picker's Instagram list: a search, else the client's searches interleaved (ig_picks), else trending. */
async function igList(p: Page, graph: Graph, q: string, queries: string[]): Promise<Track[]> {
  const cache = await igCache(p);
  let out: Track[];
  if (q) out = await igTracks(p, graph, cache, q);
  else if (!queries.length) out = await igTracks(p, graph, cache, null);
  else {
    const lists = [];
    for (const one of queries) lists.push(await igTracks(p, graph, cache, one));
    const seen = new Map<string, Track>();
    for (let i = 0; i < Math.max(...lists.map((l) => l.length)); i++) for (const l of lists) if (l[i] && !seen.has(l[i]!.id)) seen.set(l[i]!.id, l[i]!);
    out = [...seen.values()];
  }
  await p.env.MEDIA.put(`${p.client.id}/music/ig-cache.json`, JSON.stringify(cache), { httpMetadata: { contentType: "application/json" } });
  return out;
}

/** An Instagram song seen in any cached list (for the pick: the form carries only its id). */
async function igKnown(p: Page, id: string): Promise<Track | null> {
  for (const v of Object.values(await igCache(p))) for (const t of v.tracks ?? []) if (t.id === id) return t;
  return null;
}

/** spine/tracks.py current_track(). */
function currentTrack(s: Slot, lib: Track[]): string | null {
  if (s.meta.track) return String(s.meta.track);
  const music = String(((s.meta.film ?? {}) as Json).music ?? "");
  return lib.find((t) => t.file && music.endsWith(t.file))?.id ?? null;
}

/** app.py music_card(): Library | Instagram, the rows, In use. `wait`: the Instagram rows load after the page (?rows=1). */
async function musicCard(s: Slot, cls: string, src: string, q: string, wait: boolean, fetcher: Fetcher | null): Promise<string> {
  if (cls === "live") return "";
  const ig = src === "ig" || src === "instagram";
  const base = path(s.p.client.id, s.slot);
  const { tracks: lib, ig_queries } = await library(s.p);
  const cur = currentTrack(s, lib);
  const mix = s.jobs.track;
  const seg = `<div class=seg><a href='${base}' class='${ig ? "" : "on"}'>Library</a><a href='${base}?music=ig' class='${ig ? "on" : ""}'>Instagram</a></div>`;
  let search = "";
  if (ig) {
    const picked = ig_queries.length ? `Picked for ${esc(display(s.p.client).name)}: ${esc(ig_queries.join(", "))}` : "Trending on Instagram";
    search = `<form method=get action='${base}' class=srch id=igq><input type=hidden name=music value=ig>${icon("search", 16)}<input name=q value='${esc(q)}' placeholder='Search Instagram music' autocomplete=off aria-label='Search Instagram music'></form><p class=hint style='margin:8px 0 0'>${q ? `Results for “${esc(q)}”` : picked}. The track is attached on Instagram when it publishes; here it plays with the video so you can hear the mix.</p>`;
  }
  let list: Track[] = [];
  let err = "";
  if (!ig) list = lib.map((t) => ({ ...t, preview: t.file ? `/${encodeURIComponent(s.p.client.id)}/track/${encodeURIComponent(t.id)}` : null }));
  else if (!wait && fetcher) {
    try {
      list = await igList(s.p, await graphFor(s.p, fetcher), q, ig_queries);
    } catch (e) {
      err = e instanceof HttpError ? e.detail ?? e.message : String(e);
    }
  }
  const locked_ = songLocked(s) || open_(mix);
  const rows = list.map((t) => {
    const on = t.id === cur;
    const prev = t.preview ? `<button type=button class=pl data-src='${esc(t.preview)}' aria-label='Play ${esc(t.title)}'>${icon("play", 16)}</button>` : `<span class='pl off' title='No preview available'>${icon("music", 14)}</span>`;
    const art = t.cover ? `<img class=art src='${esc(t.cover)}' alt=''>` : "";
    const mood = t.mood ? ` · ${esc(t.mood)}` : "";
    const dur = t.duration ? ` · ${Math.floor(t.duration / 60)}:${String(Math.floor(t.duration) % 60).padStart(2, "0")}` : "";
    const btn = on ? "<span class='btn sec inuse'><i></i>In use</span>" : `<button class='btn sec' name=track value='${esc(t.id)}'${locked_ ? " disabled" : ""}>Use</button>`;
    return `<div class='trk${on ? " on" : ""}'>${prev}${art}<div class=tn><b>${esc(t.title)}</b><small>${esc(t.artist ?? "")}${mood}${dur}</small></div>${btn}</div>`;
  });
  if (wait && ig) rows.push("<p class='muted igwait' role=status><i class=spin></i>Loading Instagram music…</p>");
  else if (!rows.length) rows.push(`<p class=muted style='margin:6px 0 0'>${err ? `Instagram music is not reachable right now: ${esc(err)}` : ig ? "Nothing found." : "The library is not here yet: a PC sends it up when its host loop runs."}</p>`);
  const want = mix ? String(((parseJson(mix.payload).track ?? {}) as Json).title ?? "the song") : "";
  const status = open_(mix) ? `<p class=hint style='margin:12px 0 0'><i class=spin></i>Mixing &ldquo;${esc(want)}&rdquo; into the video on a PC.</p>`
    : mix?.state === "failed" ? `<p class=hint style='margin:12px 0 0;color:#b42318'>Could not mix &ldquo;${esc(want)}&rdquo;: ${esc(jobResult(mix).slice(-200))}</p>` : "";
  const icons = `<template id=i-play>${icon("play", 16)}</template><template id=i-pause>${icon("pause", 16)}</template>`;
  return `<section class=card id=music><div class=row><h2>Music</h2>${seg}</div>${search}<form method=post action='${base}/track' class=tracks${wait && ig ? " data-wait" : ""}><input type=hidden name=src value='${ig ? "instagram" : "file"}'>${rows.join("")}</form>${status}${icons}<script>${AUDIO_JS}</script></section>`;
}

/** GET /<client>/track/<id>: a library track's file, from R2 (the PC sent it up). */
export async function trackFile(p: Page, id: string, req: Request): Promise<Response> {
  const t = (await library(p)).tracks.find((x) => x.id === id);
  if (!t?.file) throw new HttpError(404, "track", "no such track");
  const o = await p.env.MEDIA.get(`${p.client.id}/music/${t.file}`, { range: req.headers });
  if (!o) throw new HttpError(404, "track", "the file is not here yet");
  const h = new Headers({ "Content-Type": "audio/mpeg", "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" });
  if (req.headers.has("Range") && o.range && "offset" in o.range) { // R2 reports a range even when none was asked
    const off = o.range.offset ?? 0;
    const len = o.range.length ?? o.size - off;
    h.set("Content-Range", `bytes ${off}-${off + len - 1}/${o.size}`);
    h.set("Content-Length", String(len));
    return new Response(o.body, { status: 206, headers: h });
  }
  h.set("Content-Length", String(o.size));
  return new Response(o.body, { headers: h });
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
      const id = field(form, "track");
      let track: Json;
      if (id.startsWith(IG)) {
        const t = await igKnown(p, id);
        if (!t || !t.audio_id) throw new HttpError(400, "track", "that Instagram song is no longer in the list: search for it again");
        if (!t.preview) throw new HttpError(400, "track", "this song has no file Instagram lets us download");
        track = { id: t.id, audio_id: t.audio_id, title: t.title, artist: t.artist ?? "", cover: t.cover ?? "", duration: t.duration ?? null, link: t.link ?? "", preview: t.preview };
      } else {
        const t = (await library(p)).tracks.find((x) => x.id === id);
        if (!t) throw new HttpError(400, "track", "no such track in the library");
        track = { id: t.id, title: t.title, artist: t.artist ?? "" };
      }
      await enqueue(s, "track", { slot: s.slot, track }); // the slot in the payload: ONCE_KINDS dedupes on it
      return redirect(`${back}${id.startsWith(IG) ? "?music=ig" : ""}`);
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
