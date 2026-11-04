// The calendar (app.py render_calendar, render_month and their helpers, port): the week as
// seven days of slots, the month as days of mini cells, a video waiting for approval on the
// slot approve would give it (the video page shows the same), "+ Add new" on an open slot
// (newvideo.ts). Moving: no drag here (a phone), so `?move=<slot>` shows a Swap button on every
// other movable video and a Move-here button on every open slot. The grid is UTC and the times
// reformat in the browser's zone, as everywhere in shell.ts (the Python laid the grid out in
// the machine's zone). The `cal_<client>` cookie brings the last view back. Left out from
// app.py: drag and drop and the day drop (every open slot has its own button), the status
// filter, the preview popup, `hl`.
//
//   GET  /<client>/calendar[?w=YYYY-Www | ?view=month&m=YYYY-MM][&move=<slot>][&add=<iso>]
//   POST /<client>/move     slot, swap | at

import { iso, OPS, posts, type PostRow } from "../db.ts";
import { HttpError } from "../http.ts";
import { latestJobs } from "../jobs.ts";
import { addBox } from "./newvideo.ts";
import { nextWeek, prepareForm } from "./overview.ts";
import { ACTIVE, previewSlots, slots, takenSlots } from "./schedule.ts";
import { esc, header, icon, MOVABLE, parse, parseJson, path, redirect, shell, slotNo, tagFor, titleOf, type Json, type Page } from "./shell.ts";
import { field } from "./video.ts";

const DAY_MS = 86400_000;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ID = /^[\w-]{1,64}$/;
const weekOf = (ms: number): string => nextWeek(ms - 7 * DAY_MS); // nextWeek is the ISO week of a week ahead
const ym = (ms: number): string => new Date(ms).toISOString().slice(0, 7);
const hm = (ms: number): string => new Date(ms).toISOString().slice(11, 16);
const minutes = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const time = (ms: number): string => `<time datetime='${new Date(ms).toISOString()}' data-fmt=time>${hm(ms)} UTC</time>`;

interface Item {
  row: PostRow;
  tag: [string, string];
  at: number;
}

function mondayOf(week: string): number {
  const [y, w] = week.split("-W").map(Number);
  const jan4 = Date.UTC(y ?? 1970, 0, 4);
  return jan4 - ((new Date(jan4).getUTCDay() || 7) - 1) * DAY_MS + ((w ?? 1) - 1) * 7 * DAY_MS;
}

/** Every video with a place on the calendar: live at published_at, scheduled at scheduled_at,
    waiting with no slot of its own at the slot approve would give it. */
async function placed(p: Page): Promise<{ items: Item[]; metas: Map<string, Json>; planned: Set<string> }> {
  const jobs = await latestJobs(p.env.DB, p.client.id);
  const all = await posts(p.c, null);
  const metas = new Map((await p.env.DB.prepare("SELECT slot_id, text FROM post_files WHERE client = ? AND name = 'meta.json'").bind(p.client.id).all<{ slot_id: string; text: string }>()).results.map((r) => [r.slot_id, parseJson(r.text)]));
  const taken = new Set(all.filter((r) => ACTIVE.includes(r.state) && r.scheduled_at).map((r) => r.scheduled_at!));
  const tagged = all.map((r): [PostRow, [string, string] | null] => [r, tagFor(r, jobs.get(r.slot_id))]).filter((x): x is [PostRow, [string, string]] => x[1] !== null);
  const unslotted = tagged.filter(([r, t]) => !r.scheduled_at && !r.published_at && t[1] === "need").map(([r]) => r.slot_id);
  const preview = previewSlots(taken, unslotted, p.client.grants, p.now);
  const items = tagged.map(([row, tag]) => ({ row, tag, at: parse(row.published_at || row.scheduled_at || preview[row.slot_id]) })).filter((i): i is Item => i.at !== null);
  const plans = Object.values(jobs.get("") ?? {}).filter((j) => j.kind === "plan");
  return { items, metas, planned: new Set(plans.map((j) => String((parseJson(j.payload).argv as string[] | undefined)?.[3]))) };
}

/** A video's cell: the cover, its number and time, the title and tag; Move (or, moving another, Swap). */
function cell(p: Page, it: Item, title: string, past: boolean, move: string | null, q: string, mini: boolean): string {
  const [label, cls] = it.tag;
  const slot = it.row.slot_id;
  const base = path(p.client.id);
  const img = it.row.cover_key ? `<img src='/m/${encodeURIComponent(p.client.id)}/${encodeURIComponent(slot)}/cover' alt='' loading=lazy>` : "";
  const movable = MOVABLE.has(it.row.state) && !past;
  let tool = "";
  if (move && move !== slot && movable) tool = `<form method=post action='${base}/move'><input type=hidden name=slot value='${esc(move)}'><input type=hidden name=swap value='${esc(slot)}'><button class='btn pri small'>Swap</button></form>`;
  else if (!move && movable) tool = `<a class=mv href='${base}/calendar?${q}&move=${encodeURIComponent(slot)}'>Move</a>`;
  const badge = cls === "sched"
    ? `<span class=stw title='${esc(label)}' aria-label='${esc(label)}'>${icon(label === "Paused" ? "pause" : "timer", 12)}</span>`
    : `<span class='tag ${cls}${label === "Removed" ? " gone" : ""}'>${esc(label)}</span>`;
  const body = mini ? `<span class='mdot ${cls}'></span><span class=mt>${time(it.at)}</span>` : `<span class=mt>${time(it.at)}</span><span class=cb><span class=ct>${esc(title)}</span>${badge}</span>`;
  return `<div class='cell${mini ? " mini" : ""}${move === slot ? " hl" : ""}' data-cls='${cls}'>${img}<a class=cov href='${path(p.client.id, slot)}' title='${esc(title)}'></a><span class=no>#${esc(slotNo(slot)[1])}</span>${body}${tool}</div>`;
}

/** An open slot: Add new on a publishing slot, Move here while moving; a past one is only a gap. */
function openCell(p: Page, ms: number, onSlot: boolean, move: string | null, q: string, mini: boolean): string {
  const base = path(p.client.id);
  if (ms <= p.now) return `<div class='cell open past${mini ? " mini" : ""}'></div>`;
  const at = iso(ms);
  let act = "";
  if (move) act = `<form method=post action='${base}/move'><input type=hidden name=slot value='${esc(move)}'><input type=hidden name=at value='${at}'><button class='btn pri small'>Move here</button></form>`;
  else if (onSlot) act = `<a class=addnew href='${base}/calendar?${q}&add=${encodeURIComponent(at)}#addnew'>+ Add new</a>`;
  return `<div class='cell open${mini ? " mini" : ""}'>${mini ? "" : "<span>Open slot</span>"}<span class=mt>${time(ms)}</span>${act}</div>`;
}

function head(p: Page, view: string, title: string, prev: string, today: string, next: string, label: string, q: string, move: string | null): string {
  const base = `${path(p.client.id)}/calendar`;
  const seg = `<div class=seg><a href='${base}?w=${weekOf(p.now)}' class='${view === "week" ? "on" : ""}'>Week</a><a href='${base}?view=month&m=${ym(p.now)}' class='${view === "month" ? "on" : ""}'>Month</a></div>`;
  const nav = `<div class=calnav><a href='${base}?${prev}' aria-label='Previous'>&lsaquo;</a><a class=txt href='${base}?${today}' title='Back to today'>${esc(label)}</a><a href='${base}?${next}' aria-label='Next'>&rsaquo;</a></div>`;
  const hint = move
    ? `Moving <b>#${esc(slotNo(move)[1])}</b>: tap Swap on another video, or Move here on an open slot. <a class=lnk href='${base}?${q}'>Cancel</a>`
    : "Tap Move on a video to swap it with another or put it on an open slot. Live videos stay put.";
  return `<div class=row style='margin-bottom:12px'><div class=row style='gap:16px'><h2>${title}</h2>${seg}</div>${nav}</div><p class=hint style='margin:0 0 16px'>${hint}</p>`;
}

async function week(p: Page, wk: string, move: string | null): Promise<string> {
  const monday = mondayOf(wk);
  const { items, metas, planned } = await placed(p);
  const times = new Set(slots(p.client.grants));
  const rows = new Set(times);
  const cells = new Map<string, Item>();
  for (const it of items) {
    const d = Math.floor((it.at - monday) / DAY_MS);
    if (d < 0 || d > 6) continue;
    rows.add(hm(it.at)); // published or scheduled off-slot: its own row
    if (!cells.has(`${d}|${hm(it.at)}`)) cells.set(`${d}|${hm(it.at)}`, it);
  }
  const q = `w=${wk}`;
  const g = [...Array(7).keys()].map((d) => {
    const day = monday + d * DAY_MS;
    const cs = [...rows].sort().map((t) => {
      const ms = day + minutes(t) * 60_000;
      const it = cells.get(`${d}|${t}`);
      return it ? cell(p, it, titleOf(it.row, metas.get(it.row.slot_id) ?? {}), ms <= p.now, move, q, false) : openCell(p, ms, times.has(t), move, q, false);
    });
    return `<div class=day><div class='dh${Math.floor(day / DAY_MS) === Math.floor(p.now / DAY_MS) ? " today" : ""}'>${DAYS[d]}<b>${new Date(day).getUTCDate()}</b></div>${cs.join("")}</div>`;
  });
  const dm = (ms: number) => `${new Date(ms).getUTCDate()} ${MONTHS[new Date(ms).getUTCMonth()]}`;
  const h = head(p, "week", `${dm(monday)} – ${dm(monday + 6 * DAY_MS)} ${new Date(monday + 6 * DAY_MS).getUTCFullYear()}`, `w=${weekOf(monday - 7 * DAY_MS)}`, `w=${weekOf(p.now)}`, `w=${weekOf(monday + 7 * DAY_MS)}`, `${DAYS[0]} ${dm(monday)}`, q, move);
  const note = wk === nextWeek(p.now) && !planned.has(wk) ? `<div style='margin-top:20px'>${prepareForm(path(p.client.id), wk, "Prepare this week")}</div>` : "";
  return `${h}<div class=cal>${g.join("")}</div>${note}`;
}

async function month(p: Page, m: string, move: string | null): Promise<string> {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  const first = Date.UTC(y, mo - 1, 1);
  const nextM = Date.UTC(y, mo, 1);
  const start = first - ((new Date(first).getUTCDay() || 7) - 1) * DAY_MS;
  const end = nextM - DAY_MS + (7 - (new Date(nextM - DAY_MS).getUTCDay() || 7)) * DAY_MS;
  const { items, metas } = await placed(p);
  const byDay = new Map<number, Map<string, Item>>();
  for (const it of items) {
    const day = it.at - ((it.at - start) % DAY_MS);
    if (day < start || day > end) continue;
    const got = byDay.get(day) ?? new Map<string, Item>();
    if (!got.has(hm(it.at))) got.set(hm(it.at), it);
    byDay.set(day, got);
  }
  const times = slots(p.client.grants);
  const q = `view=month&m=${m}`;
  const g = DAYS.map((d) => `<div class=mh>${d}</div>`);
  for (let day = start; day <= end; day += DAY_MS) {
    const got = byDay.get(day) ?? new Map<string, Item>();
    const cs = [...new Set([...times, ...got.keys()])].sort().map((t) => {
      const ms = day + minutes(t) * 60_000;
      const it = got.get(t);
      if (it) return cell(p, it, titleOf(it.row, metas.get(it.row.slot_id) ?? {}), ms <= p.now, move, q, true);
      return ms <= p.now ? "" : openCell(p, ms, times.includes(t), move, q, true);
    });
    const cls = `mday${new Date(day).getUTCMonth() !== mo - 1 ? " out" : ""}${Math.floor(day / DAY_MS) === Math.floor(p.now / DAY_MS) ? " today" : ""}`;
    g.push(`<div class='${cls}'><b>${new Date(day).getUTCDate()}</b><div class=mcells>${cs.join("")}</div></div>`);
  }
  const h = head(p, "month", `${MONTHS_LONG[mo - 1]} ${y}`, `view=month&m=${ym(Date.UTC(y, mo - 2, 1))}`, `view=month&m=${ym(p.now)}`, `view=month&m=${ym(nextM)}`, `${MONTHS[mo - 1]} ${y}`, q, move);
  return `${h}<div class=month>${g.join("")}</div>`;
}

export async function renderCalendar(p: Page, req: Request, url: URL): Promise<Response> {
  const base = `${path(p.client.id)}/calendar`;
  const q = url.searchParams;
  // no query: the view the cookie remembers (app.py's GET router)
  const saved = decodeURIComponent(new RegExp(`(?:^|;\\s*)cal_${p.client.id}=([^;]*)`).exec(req.headers.get("Cookie") ?? "")?.[1] ?? "");
  if (!url.search && saved.startsWith("?") && saved.length > 1) return redirect(base + saved);
  const move = ID.test(q.get("move") ?? "") ? q.get("move") : null;
  const isMonth = q.get("view") === "month";
  const m = /^\d{4}-(0[1-9]|1[0-2])$/.test(q.get("m") ?? "") ? q.get("m")! : ym(p.now);
  const w = /^\d{4}-W\d{2}$/.test(q.get("w") ?? "") ? q.get("w")! : weekOf(p.now);
  const body = isMonth ? await month(p, m, move) : await week(p, w, move);
  const res = shell(p, "calendar", `${header(p, "Calendar")}<section class=card>${body}</section>${addBox(p, q.get("add"))}`, "Calendar");
  res.headers.append("Set-Cookie", `cal_${p.client.id}=${encodeURIComponent(isMonth ? `?view=month&m=${m}` : `?w=${w}`)}; Path=/; Max-Age=31536000; SameSite=Lax`);
  return res;
}

/** POST /<client>/move: swap two videos' times, or put one on an open future slot (OPS.move). */
export async function move(p: Page, form: FormData): Promise<Response> {
  const slot = field(form, "slot");
  const swap = field(form, "swap");
  if (swap) await OPS.move!(p.c, { slot_id: slot, swap_with: swap });
  else {
    const ms = parse(field(form, "at"));
    if (ms === null) throw new HttpError(400, "at", "no slot given");
    if (ms <= p.now) throw new HttpError(400, "at", "that slot has already passed");
    const at = iso(ms);
    if ((await takenSlots(p.c, slot)).has(at)) throw new HttpError(400, "taken", "that slot is taken");
    await OPS.move!(p.c, { slot_id: slot, at });
  }
  return redirect(`${path(p.client.id)}/calendar`);
}
