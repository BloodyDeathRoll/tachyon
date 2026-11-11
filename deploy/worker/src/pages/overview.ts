// The Overview (app.py render_overview, port): the account's numbers, every video as a card
// with one tag, the schedule, next week, the followers who dropped, the sync card.
// Left out from app.py: the views chart (the Insights page has it), the live Instagram pulls
// on render (the cron measures), the schedule editor (a grants write: the Settings slice),
// the auto-prepare toggle (the same), the client-side filter script (the filter is a link),
// the upload's progress script (the form posts and comes back with the result).

import { OPS, posts, type Ctx } from "../db.ts";
import { insertJob, latestJobs, type JobRow } from "../jobs.ts";
import { metas, recsLine } from "./insights.ts";
import { slots, takenSlots } from "./schedule.ts";
import { ago, ENGINES, esc, header, icon, jobLine, mediaLatest, num, ORDER, parse, parseJson, path, redirect, shell, slotNo, tagFor, titleOf, when as whenText, whenTime, type Page, type Json } from "./shell.ts";
import type { PostRow } from "../db.ts";

const DAY_MS = 86400_000;

/** "2026-W46": the ISO week after this one (spine/week.py next_week). */
export function nextWeek(now: number): string {
  const d = new Date(now + 7 * DAY_MS);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); // Thursday decides the ISO year
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / DAY_MS + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** The week's Monday (ms) and its seven days' slot stamps. */
function weekSlots(week: string, grants: Json): { monday: number; stamps: string[] } {
  const [y, w] = week.split("-W").map(Number);
  const jan4 = Date.UTC(y ?? 1970, 0, 4);
  const monday = jan4 - ((new Date(jan4).getUTCDay() || 7) - 1) * DAY_MS + ((w ?? 1) - 1) * 7 * DAY_MS;
  const stamps: string[] = [];
  for (let d = 0; d < 7; d++) for (const t of slots(grants)) stamps.push(new Date(monday + d * DAY_MS).toISOString().slice(0, 10) + `T${t}:00+00:00`);
  return { monday, stamps };
}

function dayLabel(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}`;
}

async function accountStats(c: Ctx): Promise<string> {
  const rows = (await c.env.DB.prepare("SELECT window, metrics FROM metric_snapshots WHERE client = ? AND source = 'ig_account' ORDER BY collected_at").bind(c.client).all<{ window: string; metrics: string }>()).results;
  const days = new Map<string, Json>();
  let roll: Json | null = null;
  for (const r of rows) {
    const m = parseJson(r.metrics);
    if (r.window === "daily" && typeof m.date === "string") days.set(m.date, m);
    if (r.window === "7d") roll = m;
  }
  const week = [...days.keys()].sort().slice(-7).map((k) => days.get(k)!);
  const last = week.at(-1);
  const total = (k: string): unknown => (roll ? roll[k] : week.length ? week.reduce((a, x) => a + Number(x[k] ?? 0), 0) : null);
  const followers = roll?.followers_count ?? last?.followers_count ?? null;
  const folNote = roll?.followers_count != null ? "now" : last ? `as of ${esc(String(last.date))}` : "no data yet";
  const stats: [string, unknown, string][] = [["Views", total("views"), "last 7 days"], ["Reached", total("reach"), "last 7 days"], ["Followers", followers, folNote], ["Link taps", total("profile_links_taps"), "last 7 days"]];
  return stats.map(([lab, v, note]) => `<div class=stat><span>${lab}</span><strong>${num(v)}</strong><small>${note}</small></div>`).join("");
}

async function videoCard(p: Page, row: PostRow, tag: [string, string], meta: Json): Promise<string> {
  const slot = row.slot_id;
  const [label, cls] = tag;
  const img = row.cover_key ? `<img src='/m/${encodeURIComponent(p.client.id)}/${encodeURIComponent(slot)}/cover' alt='' loading=lazy>` : "";
  let line: string;
  if (cls === "live") {
    const [m] = await mediaLatest(p.c, slot);
    line = m ? `${num(m.views)} views · ${num(m.reach)} reached` : `Live since ${whenText(row.published_at)}`;
  } else if (label === "Paused") line = row.scheduled_at ? `Paused · was ${whenText(row.scheduled_at)}` : "Paused";
  else if (cls === "sched") line = row.scheduled_at ? `Posts ${whenText(row.scheduled_at)}` : "Waiting for a slot";
  else if (cls === "busy") line = row.scheduled_at && label === "In production" ? `For ${whenText(row.scheduled_at)}` : "New version on the way";
  else line = "Review and approve";
  const [wk, no] = slotNo(slot);
  const badge = cls === "sched"
    ? `<span class=stw title='${esc(label)}' aria-label='${esc(label)}'>${icon(label === "Paused" ? "pause" : "timer", 14)}</span>`
    : `<span class='tag ${cls}${label === "Removed" ? " gone" : ""}'>${esc(label)}</span>`;
  return `<a class=vid data-cls='${cls}' href='${path(p.client.id, slot)}'><div class=thumb>${img}<span class=no>${esc(wk ? `${wk} · ` : "")}#${esc(no)}</span>${badge}</div>
<h3>${esc(titleOf(row, meta))}</h3>${cls === "need" ? "" : `<p>${line}</p>`}</a>`;
}

/** The daily slots, read-only here: the editor is a grants write (the Settings slice). */
function scheduleCard(p: Page): string {
  const times = slots(p.client.grants);
  const per = ({ 1: "Once a day", 2: "Twice a day", 3: "Three times a day" } as Record<number, string>)[times.length] ?? `${times.length} times a day`;
  const rows = times.map((t, i) => `<div class=tfield><span>Post ${i + 1}</span><b>${whenTime(t)}</b></div>`).join("");
  return `<section class=card><div class=row><h2>Publishing schedule</h2><span class=muted>your time</span></div><p class=muted style='margin:4px 0 0;font-size:14px'>${per}, every day.</p><div class=times>${rows}</div><p class=hint>Change the times in Settings.</p></section>`;
}

/** The Prepare popup: a `plan` job for `wk` (the calendar shows it on next week too). */
export function prepareForm(base: string, wk: string, label: string): string {
  const engines = Object.entries(ENGINES).map(([k, v]) => `<label class=chk><input type=radio name=engine value=${k}${k === "html" ? " checked" : ""}>${esc(v)}</label>`).join("");
  return `<details class=pop><summary class='btn pri small'>${esc(label)}</summary><div class=box>
<form method=post action='${base}/week'><input type=hidden name=week value='${esc(wk)}'><h2>${esc(label)}</h2><fieldset class=engines><legend>Animate with</legend>${engines}</fieldset>
<label>Instructions for this batch<textarea name=instructions rows=5 placeholder='e.g. Add our Rosa app particles to the empty dark areas.'></textarea></label>
<p class=hint style='margin:0'>Applies to every video in the batch. Leave it empty and Claude comes up with the idea.</p>
<div class=btns><button class='btn pri small'>Start</button></div></form></div></details>`;
}

/** Next week: how many videos it holds, the plan job's state, the Prepare button (a `plan` job). */
async function weekCard(p: Page, jobs: Map<string, Record<string, JobRow>>): Promise<string> {
  const wk = nextWeek(p.now);
  const { monday, stamps } = weekSlots(wk, p.client.grants);
  const taken = await takenSlots(p.c);
  const total = stamps.filter((s) => !taken.has(s)).length;
  const span = `${dayLabel(monday)} – ${dayLabel(monday + 6 * DAY_MS)}`;
  const base = path(p.client.id);
  const plan = jobs.get("")?.plan;
  const mine = plan && (parseJson(plan.payload).argv as string[] | undefined)?.[3] === wk ? plan : undefined;
  let body: string;
  if (mine?.state === "running" || mine?.state === "queued") {
    body = `<p class=big>${mine.state === "running" ? "Planning the week…" : "Waiting for a PC with the files…"}</p><div class=prog><i></i></div><p class=hint>${jobLine(mine, p.now)}</p><p class=hint>Each one lands in Needs approval when it is ready.</p>`;
  } else if (mine?.state === "done") {
    body = `<div class=crow><p><b>The week is planned.</b> The videos land in Needs approval as they are made.</p><a class='btn sec' href='${base}/calendar?w=${esc(wk)}'>Open the week</a></div>`;
  } else {
    const err = mine?.state === "failed" ? `<div class=note>Last run failed: ${esc(mine.result ?? "")}</div>` : "";
    body = `${err}<div class=crow><p>${total} videos</p>${prepareForm(base, wk, "Prepare next week")}</div>`;
  }
  const prep = (p.client.grants.week_prep ?? {}) as Json;
  const auto = `<div class=autorow><span>Prepare automatically every ${esc(String(prep.day ?? "Thursday"))}: ${prep.auto ? "on" : "off"} (Settings)</span></div>`;
  return `<section class=card><div class=row><h2>Next week</h2><span class=muted>${span}</span></div><div style='margin-top:16px'>${body}</div>${auto}</section>`;
}

/** Followers who dropped between the last two Instagram exports (the follower_dropped op); the
    upload form (src/pages/audience.ts) and, back from it, the result (`up`). */
async function droppedCard(p: Page, up: string | null): Promise<string> {
  const r = (await OPS.follower_dropped!(p.c, {})) as { snapshots: number; since: string | null; at: string | null; followers: number | null; dropped: string[] };
  const form = `<form method=post enctype=multipart/form-data action='${path(p.client.id)}/audience/upload' class=btns style='margin:0'><input type=file name=file accept='.json,application/json' required aria-label='Export file'><button class='btn sec small'>Upload export</button></form>`;
  let body: string;
  if (!r.snapshots) body = `<div class=crow><p>Upload your Instagram export (the followers JSON file inside it) to start.</p>${form}</div>`;
  else if (r.snapshots === 1) body = `<div class=crow><p><b class=dnum>0</b> dropped.</p>${form}</div>`;
  else {
    const n = r.dropped.length;
    const names = r.dropped.map((u) => `<li><a href='https://www.instagram.com/${encodeURIComponent(u)}/' target=_blank rel=noopener>@${esc(u)}</a></li>`).join("");
    const list = n ? `<details><summary class=lnk>View</summary><ul class=drops>${names}</ul></details>` : "";
    body = `<div class=crow><p><b class=dnum>${n}</b> dropped since ${whenText(r.since)}.</p>${list}${form}</div>`;
  }
  const note = up === "same" ? "This export was already in: nothing changed." : up === "ok" ? `Export read: ${num(r.followers)} followers${r.snapshots < 2 ? "" : `, ${r.dropped.length} dropped`}.` : "";
  const done = note ? `<p class=upok>${icon("check", 15)}${note}</p>` : "";
  const last = r.at ? `<p class=hint>Last export ${whenText(r.at)} · ${num(r.followers)} followers.</p>` : "";
  return `<section class=card id=dropped><h2>Followers who dropped</h2>${body}${done}${last}</section>`;
}

/** Sync: the cron picks reels up at :17 every hour (src/pickup.ts); the button runs it now
    (settings.ts sync). `synced` is its answer, "<added>-<not checked>" or "err". */
async function syncCard(p: Page, synced: string | null): Promise<string> {
  const last = await p.c.env.DB.prepare("SELECT ts, intent FROM journal WHERE client = ? AND action = 'meta.link_by_hand' AND by IS NULL ORDER BY id DESC LIMIT 1").bind(p.c.client).first<{ ts: string }>();
  const note = last ? `<p class=hint>Last pickup ${ago(last.ts, p.now)}.</p>` : "<p class=hint>Nothing picked up yet.</p>";
  let res = "";
  if (synced === "err") res = "<p class=hint style='color:#b42318'>Could not reach Instagram. Try again later.</p>";
  else if (synced && /^\d+-\d+$/.test(synced)) {
    const [a, f] = synced.split("-").map(Number) as [number, number];
    res = `<p class=upok>${icon("check", 15)}${a ? `${a} ${a === 1 ? "video" : "videos"} added.` : "Nothing new."}</p>${f ? `<p class=hint>${f} could not be checked. Try again later.</p>` : ""}`;
  }
  return `<section class=card id=sync><h2>Sync</h2><form method=post action='${path(p.client.id)}/sync' class=crow><p>Reels posted straight to Instagram join the dashboard every hour at :17.</p><button class='btn sec'>${icon("redo", 16)}Sync now</button></form>${note}${res}</section>`;
}

export async function renderOverview(p: Page, q: URLSearchParams): Promise<Response> {
  const jobs = await latestJobs(p.c.env.DB, p.client.id);
  const all = await posts(p.c, null);
  const meta = await metas(p.c);
  let rows = all.map((r): [PostRow, [string, string] | null] => [r, tagFor(r, jobs.get(r.slot_id))]).filter((x): x is [PostRow, [string, string]] => x[1] !== null);
  const key = (r: PostRow) => parse(r.published_at || r.scheduled_at || String(r.updated_at)) ?? 0;
  rows.sort((a, b) => ORDER[a[1][1]]! - ORDER[b[1][1]]! || (["sched", "busy"].includes(a[1][1]) ? key(a[0]) - key(b[0]) : key(b[0]) - key(a[0])));
  const cnt = (c: string) => rows.filter((x) => x[1][1] === c).length;
  const busy = cnt("busy");
  rows = [...rows.filter((x) => x[1][1] !== "live"), ...rows.filter((x) => x[1][1] === "live").slice(0, 8)];
  const f = q.get("f") ?? "all";
  const base = path(p.client.id);
  const filt = ([["all", "All", rows.length], ["need", "Needs approval", cnt("need")], ["busy", "In production", busy], ["sched", "Scheduled", cnt("sched")], ["live", "Live", cnt("live")]] as [string, string, number][])
    .filter(([k, , n]) => k === "all" || n)
    .map(([k, lab, n]) => `<a href='${base}?f=${k}' class='${k === f ? "on" : ""}'>${lab}<i>${n}</i></a>`)
    .join("");
  const cards = (await Promise.all(rows.filter((x) => f === "all" || x[1][1] === f).map(([r, t]) => videoCard(p, r, t, meta.get(r.slot_id) ?? {})))).join("")
    || "<div class=empty>No videos yet. Prepare next week to fill this.</div>";
  const perf = `<section class='card perf'><h2>Performance</h2><div class=stats>${await accountStats(p.c)}</div>${await recsLine(p, all, meta)}</section>`;
  const need = cnt("need");
  const vids = `<div class='row vhead'><h2>Videos${need ? ` <span class=tdo>${need} to approve</span>` : ""}</h2><div class=seg role=group aria-label='Show'>${filt}</div></div><div class=grid>${cards}</div>`;
  const side = `${scheduleCard(p)}${await weekCard(p, jobs)}${await droppedCard(p, q.get("up"))}${await syncCard(p, q.get("synced"))}`;
  const body = `${header(p, "Overview")}<div class=ovgrid><div class=maincol>${perf}${vids}</div><div class=side>${side}</div></div>`;
  const planning = jobs.get("")?.plan?.state === "running";
  return shell(p, "overview", body, "Overview", busy || planning ? 30 : null);
}

/** POST /<client>/week: Prepare next week as a `plan` job (spine/week.py prepare on a host). */
export async function prepareWeek(p: Page, form: FormData): Promise<Response> {
  const week = String(form.get("week") || nextWeek(p.now));
  if (!/^\d{4}-W\d{2}$/.test(week)) return redirect(path(p.client.id));
  const engine = String(form.get("engine") ?? "");
  const payload = { argv: ["spine.week", "prepare", p.client.id, week], instructions: String(form.get("instructions") ?? ""), ...(engine in ENGINES ? { engine } : {}) };
  await insertJob(p.c.env.DB, "plan", p.client.id, null, JSON.stringify(payload), p.user.id, p.now);
  return redirect(path(p.client.id));
}
