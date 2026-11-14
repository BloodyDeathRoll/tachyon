// A new client's setup (docs/PLAYBOOK.md, "Industry study"; the Figma screens "new client · 1-4"):
// the operator tells Tachyon about the business, a PC studies the industry (a `learn` job,
// spine/learn.py), the operator reads the industry file and approves it, and only then is the
// client active. `clients.status` walks setup -> learning -> review -> active; a client that is
// not active has this page in place of its overview, and no other page (src/pages/index.ts).
//
//   GET  /<client>/setup[?view=long]   the step the client is at; an active client: its file
//   POST /<client>/setup               setup:    save | add | remove:<n> | start (any of them saves the fields,
//                                                a pasted link and a chosen file)
//                                      learning: stop | retry
//                                      review:   approve | changes | again
//
// The files: industry.md (long) and industry-short.md (the one line, six sections of points,
// the open questions) are client_files rows the PC writes; a PC pulls them with the brand text.

import { HttpError } from "../http.ts";
import { insertJob, type JobRow } from "../jobs.ts";
import { roomFor } from "../quota.ts";
import { esc, parseJson, path, redirect, shell, type Json, type Page } from "./shell.ts";

/** The stages of the study: key, name, what it is. spine/learn.py reports progress by key. */
export const STAGES: [string, string, string][] = [
  ["sources", "Read your sources", "The website, the documents and the pages you gave"],
  ["ecosystem", "Ecosystem", "How this kind of business makes money and who sells beside it"],
  ["calendar", "Buying cycle and calendar", "What makes people buy, and the dates the trade runs on"],
  ["rules", "Rules", "Claims the law and Instagram do not allow"],
  ["vocabulary", "Vocabulary", "The trade's words and the customers' words"],
  ["video", "Video practice", "The reels that win in this industry, and the ones that are worn out"],
  ["make", "What we can make", "Each winning format against the footage the client has"],
  ["file", "Write the file", "The industry file, in a short and a long version"],
];
const TYPES = ["Website", "Document", "Reviews", "Competitor", "Other"];
const MAX_SOURCES = 20;
const MAX_FILE = 25 * 1024 * 1024;
const LONG = "industry.md";
const SHORT = "industry-short.md";
const CHECK = "<svg width=14 height=14 viewBox='0 0 16 16' fill=none stroke=currentColor stroke-width=2 stroke-linecap=round stroke-linejoin=round aria-hidden=true><path d='M3.5 8.5l3 3 6-7'/></svg>";

interface Source {
  type: string;
  url?: string;
  note?: string;
  file?: string; // an uploaded file's name; `key` is its object in R2
  key?: string;
  size?: number;
}
interface Intake {
  industry: string;
  summary: string;
  notes: string;
  sources: Source[];
  answers: Record<string, string>;
}

async function intakeOf(p: Page): Promise<Intake> {
  const r = await p.env.DB.prepare("SELECT industry, summary, notes, sources, answers FROM client_intake WHERE client = ?").bind(p.client.id).first<Record<string, string>>();
  const list = (text: string | undefined): Source[] => {
    try {
      const v: unknown = JSON.parse(text ?? "[]");
      return Array.isArray(v) ? (v as Source[]) : [];
    } catch {
      return [];
    }
  };
  return { industry: r?.industry ?? "", summary: r?.summary ?? "", notes: r?.notes ?? "", sources: list(r?.sources), answers: parseJson(r?.answers) as Record<string, string> };
}

async function saveIntake(p: Page, i: Intake): Promise<void> {
  await p.env.DB.prepare(
    "INSERT INTO client_intake (client, industry, summary, notes, sources, answers, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(client) DO UPDATE SET industry = excluded.industry, summary = excluded.summary, notes = excluded.notes, sources = excluded.sources, answers = excluded.answers, updated_by = excluded.updated_by, updated_at = excluded.updated_at",
  )
    .bind(p.client.id, i.industry, i.summary, i.notes, JSON.stringify(i.sources), JSON.stringify(i.answers), p.user.id, p.now)
    .run();
}

async function learnJob(p: Page): Promise<JobRow | null> {
  return p.env.DB.prepare("SELECT * FROM jobs WHERE client = ? AND kind = 'learn' ORDER BY id DESC LIMIT 1").bind(p.client.id).first<JobRow>();
}

async function fileText(p: Page, name: string): Promise<{ text: string; updated_at: number } | null> {
  return p.env.DB.prepare("SELECT text, updated_at FROM client_files WHERE client = ? AND name = ?").bind(p.client.id, name).first<{ text: string; updated_at: number }>();
}

async function putFile(p: Page, name: string, text: string): Promise<void> {
  await p.env.DB.prepare(
    "INSERT INTO client_files (client, name, text, version, updated_by, updated_at) VALUES (?, ?, ?, 1, ?, ?) ON CONFLICT(client, name) DO UPDATE SET text = excluded.text, version = client_files.version + 1, updated_by = excluded.updated_by, updated_at = excluded.updated_at",
  )
    .bind(p.client.id, name, text, p.user.id, p.now)
    .run();
}

/** The job's payload: what the PC needs to study the industry. An uploaded file is its place
    in the list (GET /api/intake/<client>/<n>), never its R2 key. */
function payloadOf(i: Intake, changes?: string): string {
  const sources = i.sources.map((s, n) => (s.key ? { type: s.type, file: s.file, n } : { type: s.type, url: s.url, note: s.note }));
  return JSON.stringify({ industry: i.industry, summary: i.summary, notes: i.notes, sources, answers: i.answers, ...(changes ? { changes } : {}) });
}

async function enqueue(p: Page, i: Intake, from: string, changes?: string): Promise<void> {
  const r = await p.env.DB.prepare("UPDATE clients SET status = 'learning' WHERE id = ? AND status = ?").bind(p.client.id, from).run();
  if (r.meta.changes !== 1) throw new HttpError(409, "changed", "this client moved on; open the page again");
  await insertJob(p.env.DB, "learn", p.client.id, null, payloadOf(i, changes), p.user.id, p.now);
}

// ── the short file ────────────────────────────────────────────────────────────

interface Short {
  line: string;
  tiles: { title: string; points: string[] }[];
  questions: string[];
}

/** industry-short.md: the first paragraph is the one line; `## Title` then `- point`s; the
    section "Open questions" is the questions. */
export function parseShort(text: string): Short {
  const out: Short = { line: "", tiles: [], questions: [] };
  let cur: string[] | null = null;
  for (const raw of text.split("\n")) {
    const l = raw.trim();
    if (!l || l.startsWith("# ")) continue;
    if (l.startsWith("## ")) {
      const title = l.slice(3).trim();
      if (/^open questions$/i.test(title)) cur = out.questions;
      else {
        out.tiles.push({ title, points: [] });
        cur = out.tiles[out.tiles.length - 1]!.points;
      }
    } else if (/^[-*] /.test(l)) cur?.push(l.slice(2).trim());
    else if (!cur) out.line += (out.line ? " " : "") + l;
  }
  return out;
}

const slug = (s: string): string => s.toLowerCase().replace(/^\d+\s+/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const linked = (s: string): string => esc(s).replace(/https?:\/\/[^\s<]+[^\s<.,)]/g, (u) => `<a class=lnk href='${u}' target=_blank rel='noreferrer noopener'>${u}</a>`);

/** industry.md as the long view: `## ` sections with a contents list, paragraphs, `- ` points,
    `[n] source` lines. Everything else in the text is shown as it is, escaped. */
function longView(text: string): string {
  const toc: string[] = [];
  const body: string[] = [];
  let list = false;
  let para: string[] = [];
  const flush = () => {
    if (para.length) body.push(`<p>${linked(para.join(" "))}</p>`);
    para = [];
    if (list) body.push("</ul>");
    list = false;
  };
  for (const raw of text.split("\n")) {
    const l = raw.trim();
    if (!l) flush();
    else if (l.startsWith("## ")) {
      flush();
      const t = l.slice(3).trim();
      toc.push(`<a href='#s-${slug(t)}'>${esc(t)}</a>`);
      body.push(`<h3 id='s-${slug(t)}'>${esc(t)}</h3>`);
    } else if (l.startsWith("#")) {
      flush(); // the file's own title: the card has one
    } else if (/^[-*] /.test(l)) {
      if (para.length) flush();
      if (!list) body.push("<ul>");
      list = true;
      body.push(`<li>${linked(l.slice(2))}</li>`);
    } else if (/^\[\d+\]/.test(l)) {
      flush();
      body.push(`<p class=src>${linked(l)}</p>`);
    } else {
      if (list) flush();
      para.push(l);
    }
  }
  flush();
  return `<div class=doc><nav class=toc><small>Contents</small>${toc.join("")}</nav><article>${body.join("")}</article></div>`;
}

// ── the pages ─────────────────────────────────────────────────────────────────

function stepper(cur: number): string {
  const li = ["Business", "Learning", "Approve", "Active"].map((n, i) => `<li class='${i + 1 < cur ? "done" : i + 1 === cur ? "now" : ""}'><i>${i + 1 < cur ? CHECK : i + 1}</i>${n}</li>`);
  return `<ol class=steps>${li.join("")}</ol>`;
}

function head(p: Page, sub: string, step: number): string {
  return `<h1>New client · ${esc(p.client.name)}</h1><p class=sub>${sub}</p>${stepper(step)}`;
}

function formPage(p: Page, i: Intake): string {
  const base = `${path(p.client.id)}/setup`;
  const rows = i.sources.map((s, n) => `<tr><td>${esc(s.type)}</td><td>${s.url ? linked(s.url) : esc(s.file ?? "")}</td><td class=muted>${esc(s.note ?? (s.size ? `${Math.max(1, Math.round(s.size / 1024))} KB` : ""))}</td><td class=act><button class='rm red' name=action value='remove:${n}'>Remove</button></td></tr>`).join("");
  const table = rows ? `<div class=tw><table class='full src'><tr><th>Type</th><th>Source</th><th>What it is</th><th class=act></th></tr>${rows}</table></div>` : "";
  const dot = (ok: boolean) => `<i class='cd${ok ? " ok" : ""}'>${ok ? CHECK : ""}</i>`;
  const connect = `<a class=lnk href='/connect/${encodeURIComponent(p.client.id)}'>Connect</a>`;
  const ig = p.client.ig_username ? `@${esc(p.client.ig_username)}` : p.client.connected ? "Connected" : `Not connected. ${connect}`;
  const next = ["Tachyon reads your sources.", "It studies the industry: the players, the seasons, the rules, the words, the videos that work.", "You read the result and approve it.", "The client becomes active and the first week is planned."];
  return `${head(p, "Tell Tachyon about the business. It studies the industry before it makes any video.", 1)}
<form method=post action='${base}' enctype='multipart/form-data' class=cols><button name=action value=save hidden></button><div class=col>
<section class=card><h2>The business</h2><label class=fl>Industry<input type=text name=industry maxlength=120 class=w520 value='${esc(i.industry)}' placeholder='e.g. Specialty coffee roaster and café'></label>
<label class=fl>Summary<textarea name=summary rows=4 maxlength=2000 placeholder='What the business sells, to whom and how. Who is on camera.'>${esc(i.summary)}</textarea></label></section>
<section class=card><h2>Other sources</h2><p class=hint>Websites, documents and pages that are not on the Facebook Page, or only partly there.</p>${table}
<div class=addsrc><select name=type class=dd aria-label=Type>${TYPES.map((t) => `<option>${t}</option>`).join("")}</select><input type=text name=url placeholder='Paste a link' aria-label=Link><input type=text name=note maxlength=120 placeholder='What it is (optional)' aria-label='What it is'><button class='btn sec' name=action value=add>Add link</button></div>
<label class=drop>Drop a file here, or <span class=addnew>Choose a file</span><input type=file name=file onchange='this.form.submit()' aria-label='A file'></label></section>
<section class=card><h2>Anything else</h2><textarea name=notes rows=3 maxlength=4000 placeholder='Red lines, claims the business may not make, who the customers are, what the owner will film.'>${esc(i.notes)}</textarea></section>
<div class=btns><button class='btn pri' name=action value=start>Start learning</button><button class='btn sec' name=action value=save>Save for later</button><span class=hint>Learning takes a few minutes. Nothing is generated before you approve the result.</span></div></div>
<div class=side><section class=card><h2>Already connected</h2><ul class=conn><li>${dot(Boolean(p.client.page_id))}<span><b>Facebook Page</b><small>${p.client.page_id ? "Connected" : `Not connected. ${connect}`}</small></span></li><li>${dot(p.client.connected)}<span><b>Instagram</b><small>${ig}</small></span></li></ul><p class=hint>Tachyon reads these by itself. Add only what they do not cover.</p></section>
<section class=card><h2>What happens next</h2><ol class=next>${next.map((t, n) => `<li><i>${n + 1}</i>${t}</li>`).join("")}</ol></section></div></form>`;
}

/** A running learn job's progress, as spine/learn.py sends it with each heartbeat. */
interface Progress {
  done: string[];
  notes: Record<string, string>;
  now: string;
  log: { t: number; text: string }[];
}

function progressOf(job: JobRow | null): Progress {
  const v = job?.state === "running" ? parseJson(job.result) : {};
  return {
    done: Array.isArray(v.done) ? v.done.map(String) : [],
    notes: v.notes && typeof v.notes === "object" ? (v.notes as Record<string, string>) : {},
    now: typeof v.now === "string" ? v.now : "",
    log: Array.isArray(v.log) ? (v.log as Json[]).filter((l) => typeof l.t === "number" && typeof l.text === "string").map((l) => ({ t: l.t as number, text: l.text as string })) : [],
  };
}

function learningPage(p: Page, i: Intake, job: JobRow | null): string {
  const base = `${path(p.client.id)}/setup`;
  const top = head(p, "Tachyon is studying the industry. You can leave this page; learning continues.", 2);
  if (!job || job.state === "failed" || job.state === "done") {
    // done with the client still learning cannot be (the done report moves it on); shown as a failure to retry
    let why = job?.result ?? "The job is gone.";
    try {
      const v: unknown = JSON.parse(job?.result ?? "null");
      if (typeof v === "string") why = v;
    } catch {
      /* the text as it is */
    }
    return `${top}<section class='card errcard'><h2>Learning stopped</h2><pre class=errlog>${esc(why)}</pre><form method=post action='${base}' class=btns><button class='btn pri' name=action value=retry>Try again</button><button class='btn sec' name=action value=stop>Change the business info</button></form></section>`;
  }
  const pr = progressOf(job);
  const done = new Set(pr.done);
  const current = job.state === "running" ? STAGES.find(([k]) => !done.has(k))?.[0] : undefined;
  const stages = STAGES.map(([k, name, what]) => {
    const st = done.has(k) ? "done" : k === current ? "now" : "";
    const note = pr.notes[k] ?? "";
    const right = st === "done" ? `<em class=upok>${CHECK}Done${note ? ` · ${esc(note)}` : ""}</em>` : st === "now" ? `<em>${esc(note || "now")}</em>` : "<em>waiting</em>";
    return `<li class='${st}'><i>${st === "done" ? CHECK : st === "now" ? "<b class=spin></b>" : ""}</i><span><b>${name}</b><small>${what}</small></span>${right}</li>`;
  }).join("");
  const now = job.state === "queued" ? "Waiting for a PC that runs Tachyon to pick this up." : `Now: ${esc(pr.now || STAGES.find(([k]) => k === current)?.[1] || "finishing")}`;
  const log = pr.log.length
    ? pr.log.slice().reverse().map((l) => `<p><time datetime='${new Date(l.t).toISOString()}' data-fmt=time>${new Date(l.t).toISOString().slice(11, 16)}</time>${esc(l.text)}</p>`).join("")
    : "<p>Nothing yet.</p>";
  return `${top}<div class=cols><div class=col><section class=card><div class=row><h2>Learning the ${esc(i.industry || "client's")} industry</h2><span class=muted>${pr.done.length} of ${STAGES.length} done</span></div>
<div class=lbar><i style='width:${Math.round((pr.done.length / STAGES.length) * 100)}%'></i></div><p class=nowl><b class=spin></b>${now}</p><ul class=stages>${stages}</ul></section>
<form method=post action='${base}' class=btns><button class='btn sec' name=action value=stop>Stop learning</button><span class=hint>The file opens here when all ${STAGES.length} stages are done.</span></form></div>
<div class=side><section class=card><h2>Live</h2><div class=log>${log}</div></section></div></div>`;
}

async function filePage(p: Page, i: Intake, view: string): Promise<string> {
  const base = `${path(p.client.id)}/setup`;
  const [long, short] = await Promise.all([fileText(p, LONG), fileText(p, SHORT)]);
  const review = p.client.status === "review";
  const top = review ? head(p, "This is what Tachyon learned. Approve it and the client becomes active.", 3) : `<h1>Industry file</h1><p class=sub>What Tachyon learned about ${esc(p.client.name)}'s industry. Every plan reads it.</p>`;
  if (!long) return `${top}<section class=card><h2>No industry file yet</h2>${review ? `<form method=post action='${base}' class=btns><button class='btn pri' name=action value=again>Learn again</button></form>` : ""}</section>`;
  const s = parseShort(short?.text ?? "");
  const sources = new Set(long.text.split("\n").map((l) => /^\[(\d+)\]/.exec(l.trim())?.[1]).filter(Boolean)).size;
  const seg = `<div class='seg sm'><a href='${base}'${view === "long" ? "" : " class=on"}>Short</a><a href='${base}?view=long'${view === "long" ? " class=on" : ""}>Long</a></div>`;
  const actions = review
    ? `<div class=btns><button class='btn sec' form=fa name=action value=again>Learn again</button><button type=button class='btn sec' onclick='document.getElementById("chg").showModal()'>Ask for changes</button><button class='btn pri' form=fa name=action value=approve>Approve and activate</button></div>`
    : "";
  const body = view === "long"
    ? longView(long.text)
    : `<div class=oneline><small>In one line</small><p>${esc(s.line)}</p></div><div class=sum>${s.tiles.map((t) => `<div class=tile><div class=row><b>${esc(t.title)}</b><a href='${base}?view=long#s-${slug(t.title)}'>Read more</a></div><ul>${t.points.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("")}</div>`;
  const qs = review && s.questions.length
    ? `<section class=card><h2>${s.questions.length === 1 ? "One thing" : `${s.questions.length} things`} Tachyon could not find</h2><p class=hint>Answer now, or approve and answer later. Marked as assumed in the file until then.</p>${s.questions.map((q, n) => `<label class=q><span>${esc(q)}</span><input type=text form=fa name=a${n} maxlength=300 value='${esc(i.answers[q] ?? "")}' placeholder='Your answer'></label>`).join("")}</section>`
    : "";
  const dialog = review
    ? `<dialog class=dlg id=chg><form method=post action='${base}' class=rgbox><input type=hidden name=action value=changes><h2>Ask for changes</h2><label>What should Tachyon look at again?<textarea name=changes rows=5 required maxlength=2000 placeholder='e.g. The rules section misses alcohol advertising. Look at wine bars, not cafés.'></textarea></label><div class=btns><button class='btn pri'>Learn again with this</button><button type=button class='btn sec' onclick='this.closest("dialog").close()'>Cancel</button></div></form></dialog>`
    : "";
  return `${top}<form id=fa method=post action='${base}'></form><section class=card><div class=fhead><div><h2>Industry file · ${esc(i.industry || p.client.name)}</h2><p class=hint>${sources} source${sources === 1 ? "" : "s"} · learned <time datetime='${new Date(long.updated_at).toISOString()}'>${new Date(long.updated_at).toISOString().slice(0, 16).replace("T", " ")}</time> · every line has a link and a date</p></div>${seg}${actions}</div>${body}</section>${qs}${dialog}`;
}

export async function renderSetup(p: Page, q: URLSearchParams): Promise<Response> {
  const i = await intakeOf(p);
  const st = p.client.status;
  const title = st === "active" ? "Industry file" : "New client";
  if (st === "learning") return shell(p, "setup", `<div class='adm setup'>${learningPage(p, i, await learnJob(p))}</div>`, title, 5);
  const body = st === "setup" ? formPage(p, i) : await filePage(p, i, q.get("view") === "long" ? "long" : "short");
  return shell(p, "setup", `<div class='adm setup'>${body}</div>`, title);
}

// ── the forms ─────────────────────────────────────────────────────────────────

const text = (form: FormData, name: string, max: number): string => {
  const v = form.get(name);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
};

/** The setup form: the fields, a pasted link, a chosen file, a removed row. */
async function applyForm(p: Page, form: FormData, i: Intake, action: string): Promise<void> {
  i.industry = text(form, "industry", 120);
  i.summary = text(form, "summary", 2000);
  i.notes = text(form, "notes", 4000);
  const type = TYPES.includes(text(form, "type", 20)) ? text(form, "type", 20) : "Other";
  const url = text(form, "url", 500);
  if (url) {
    let u: URL;
    try {
      u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    } catch {
      throw new HttpError(400, "url", `not a link: ${url}`);
    }
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) throw new HttpError(400, "url", `not a link: ${url}`);
    if (i.sources.length >= MAX_SOURCES) throw new HttpError(400, "sources", `at most ${MAX_SOURCES} sources`);
    i.sources.push({ type, url: u.href, note: text(form, "note", 120) });
  }
  const file = form.get("file") as unknown;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_FILE) throw new HttpError(413, "size", "a file may be 25 MB at most");
    if (i.sources.length >= MAX_SOURCES) throw new HttpError(400, "sources", `at most ${MAX_SOURCES} sources`);
    if (!(await roomFor(p.env.MEDIA, file.size))) throw new HttpError(507, "storage", "the file store is full");
    const name = file.name.replace(/[^\w. -]+/g, "_").slice(-120) || "file";
    const key = `${p.client.id}/intake/${[...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
    await p.env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type || "application/octet-stream" } });
    i.sources.push({ type: "Document", file: name, key, size: file.size });
  }
  const rm = /^remove:(\d{1,3})$/.exec(action);
  if (rm) {
    const [gone] = i.sources.splice(Number(rm[1]), 1);
    if (gone?.key) await p.env.MEDIA.delete(gone.key).catch(() => {}); // the daily sweep does not: intake/ is kept
  }
}

/** The answers typed under the open questions: kept with the intake; on approval written
    into both files, so every plan reads them. */
async function answer(p: Page, form: FormData, i: Intake, write: boolean): Promise<void> {
  const short = await fileText(p, SHORT);
  const qs = parseShort(short?.text ?? "").questions;
  const given = qs.map((q, n) => [q, text(form, `a${n}`, 300)] as const).filter(([, a]) => a);
  for (const [q, a] of given) i.answers[q] = a;
  if (given.length) await saveIntake(p, i);
  if (!write || !given.length) return;
  const long = await fileText(p, LONG);
  const block = `\n\n## Answers from the operator\n\n${given.map(([q, a]) => `- ${q} ${a}`).join("\n")}\n`;
  if (long) await putFile(p, LONG, long.text.trimEnd() + block);
  const asked = new Set(given.map(([q]) => q));
  if (short) await putFile(p, SHORT, short.text.split("\n").filter((l) => !asked.has(l.trim().replace(/^[-*] /, ""))).join("\n"));
}

export async function setupPost(p: Page, req: Request): Promise<Response> {
  // an unreadable body is refused: read as an empty form it would save every field empty
  const form = await req.formData().catch(() => {
    throw new HttpError(400, "form", "the form did not arrive whole; send it again");
  });
  const action = text(form, "action", 20) || "save";
  const back = `${path(p.client.id)}/setup`;
  const st = p.client.status;
  const i = await intakeOf(p);
  if (st === "setup" && (["save", "add", "start"].includes(action) || action.startsWith("remove:"))) {
    await applyForm(p, form, i, action);
    await saveIntake(p, i);
    if (action === "start") {
      if (!i.industry || !i.summary) throw new HttpError(400, "business", "add the industry and a summary first");
      await enqueue(p, i, "setup");
    }
    return redirect(back);
  }
  if (st === "learning" && (action === "stop" || action === "retry")) {
    // an open job is closed: its PC's report is refused (the lease is gone) and dropped
    await p.env.DB.prepare("UPDATE jobs SET state = 'failed', result = ?, until = NULL, updated_at = ? WHERE client = ? AND kind = 'learn' AND state IN ('queued', 'running')").bind(JSON.stringify("stopped"), p.now, p.client.id).run();
    if (action === "retry") await insertJob(p.env.DB, "learn", p.client.id, null, payloadOf(i), p.user.id, p.now);
    else await p.env.DB.prepare("UPDATE clients SET status = 'setup' WHERE id = ? AND status = 'learning'").bind(p.client.id).run();
    return redirect(back);
  }
  if (st === "review" && action === "approve") {
    if (!(await fileText(p, LONG))) throw new HttpError(400, "file", "there is no industry file to approve: learn again");
    await answer(p, form, i, true);
    await p.env.DB.prepare("UPDATE clients SET status = 'active' WHERE id = ? AND status = 'review'").bind(p.client.id).run();
    return redirect(p.user.admin ? `/admin/clients?active=${encodeURIComponent(p.client.id)}` : path(p.client.id));
  }
  if (st === "review" && action === "again") {
    await answer(p, form, i, false);
    await enqueue(p, i, "review");
    return redirect(back);
  }
  if (st === "review" && action === "changes") {
    const changes = text(form, "changes", 2000);
    if (!changes) throw new HttpError(400, "changes", "say what to look at again");
    await enqueue(p, i, "review", changes);
    return redirect(back);
  }
  throw new HttpError(400, "action", `not possible while the client is ${st === "review" ? "waiting for approval" : st}`);
}
