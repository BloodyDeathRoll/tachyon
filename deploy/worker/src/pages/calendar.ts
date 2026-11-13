// The calendar (app.py render_calendar, render_month and their helpers, port): the same markup,
// so the same CSS lays it out. The week as rows of slot times by seven days, the month as days
// of mini cells, a video waiting for approval on the slot approve would give it (the video page
// shows the same), "+ Add new" on an open publishing slot (add_new_box). Moving is app.py's drag
// and drop (CAL_JS): a video onto another swaps them, onto an open slot or a day moves it. The
// grid is laid out in the viewer's zone: the `tz` cookie shell.ts's script sets from the browser,
// else the client's (grants `timezone`), else UTC; days, rows, today and a drop on a day all
// follow it. The `cal_<client>` cookie brings the last view back.
//
//   GET  /<client>/calendar[?w=YYYY-Www | ?view=month&m=YYYY-MM][&hl=<slot>]
//   POST /<client>/move     slot, swap | at | day

import { iso, OPS, posts, type PostRow } from "../db.ts";
import { HttpError } from "../http.ts";
import { latestJobs } from "../jobs.ts";
import { ADD_JS, CAL_JS } from "./calendar-js.ts";
import { nextWeek, prepareForm } from "./overview.ts";
import { ACTIVE, previewSlots, slots, takenSlots } from "./schedule.ts";
import { ENGINES, esc, header, icon, MOVABLE, parse, parseJson, path, redirect, shell, slotNo, tagFor, titleOf, type Json, type Page } from "./shell.ts";
import { field } from "./video.ts";
import { wall, zoneOf } from "./insights.ts";

const DAY_MS = 86400_000;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ID = /^[\w-]{1,64}$/;
const weekOf = (ms: number): string => nextWeek(ms - 7 * DAY_MS); // nextWeek is the ISO week of a week ahead
const ym = (ms: number): string => new Date(ms).toISOString().slice(0, 7);
const hm = (ms: number): string => new Date(ms).toISOString().slice(11, 16);
const minutes = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const dayOf = (ms: number): number => Math.floor(ms / DAY_MS) * DAY_MS;
// the grid's clock: `wall` moves an instant to the zone's wall clock (its UTC fields read as local
// time), `back` returns a wall-clock time to the instant (twice, so a DST edge lands right)
interface Clock { w: (ms: number) => number; back: (ms: number) => number; zone: string }
function clock(zone: string): Clock {
  const w = (ms: number) => wall(ms, zone);
  const back = (lw: number) => { const g = lw - (w(lw) - lw); return lw - (w(g) - g); };
  return { w, back, zone };
}
/** The viewer's zone: the browser's (`tz` cookie, set by shell.ts), else the client's, else UTC. */
export function viewZone(p: Page, req: Request): string {
  const ok = (z: string): boolean => {
    try {
      return !!z && !!new Intl.DateTimeFormat("en-US", { timeZone: z });
    } catch {
      return false;
    }
  };
  let z = "";
  try {
    z = decodeURIComponent(/(?:^|;\s*)tz=([^;]*)/.exec(req.headers.get("Cookie") ?? "")?.[1] ?? "");
  } catch {
    z = "";
  }
  return ok(z) ? z : ok(zoneOf(p)) ? zoneOf(p) : "UTC";
}
/** The daily slots (UTC "HH:MM") that fall on the wall-clock day `day`, as instants. */
function slotsOn(p: Page, k: Clock, day: number): number[] {
  const from = k.back(day), to = k.back(day + DAY_MS);
  const utc0 = dayOf(from);
  return [0, 1, 2].flatMap((i) => slots(p.client.grants).map((t) => utc0 + i * DAY_MS + minutes(t) * 60_000)).filter((ms) => ms >= from && ms < to).sort((a, b) => a - b);
}
const time = (ms: number): string => `<time datetime='${new Date(ms).toISOString()}' data-fmt=time>${hm(ms)} UTC</time>`;
// app.py's icons shell.ts does not have
const PATHS: Record<string, string> = {
  next: '<path d="m9 18 6-6-6-6"/>',
  prev: '<path d="m15 18-6-6 6-6"/>',
  grip: '<circle cx="9" cy="5" r="1.4"/><circle cx="15" cy="5" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="19" r="1.4"/><circle cx="15" cy="19" r="1.4"/>',
};
const ic = (name: string, size: number): string => icon("", size).replace("</svg>", `${PATHS[name]}</svg>`);
// a mini cell's title starts with its time (app.py: "08:30 · Title", "Open slot 08:30"): the
// time is only known in the browser, after shell.ts has formatted the <time>s
const MINI_JS = `addEventListener('DOMContentLoaded',()=>document.querySelectorAll('.cell.mini').forEach(c=>{const t=c.querySelector('time');if(t)c.title=c.classList.contains('open')?'Open slot '+t.textContent:t.textContent+' · '+c.title;}));`;

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
  // app.py W.status: the week was prepared (a plan job here, or on a PC: its videos are in, 2026-w47-03 is 2026-W47)
  const planned = new Set([...plans.map((j) => String((parseJson(j.payload).argv as string[] | undefined)?.[3])), ...all.map((r) => r.slot_id.slice(0, 8).toUpperCase())]);
  return { items, metas, planned };
}

/** app.py pv_button: the play button for the quick preview (shell.ts PV_JS). */
function pvButton(p: Page, row: PostRow): string {
  if (!row.r2_key) return "";
  return `<button type=button class=pvb data-pv='/m/${encodeURIComponent(p.client.id)}/${encodeURIComponent(row.slot_id)}/video' data-href='${path(p.client.id, row.slot_id)}' aria-label='Quick preview'>${icon("play", 14)}</button>`;
}

/** app.py _cell: a video's cell, draggable while it can still move. */
function cell(p: Page, it: Item, meta: Json, past: boolean, hl: string | null, mini = false): string {
  const [label, cls] = it.tag;
  const slot = it.row.slot_id;
  const img = it.row.cover_key ? `<img src='/m/${encodeURIComponent(p.client.id)}/${encodeURIComponent(slot)}/cover' alt='' loading=lazy>` : "";
  const movable = MOVABLE.has(it.row.state) && !past;
  const dnd = movable ? ` draggable=true data-slot='${esc(slot)}'` : "";
  const grip = movable ? `<span class=grip title='Drag to move or swap'>${ic("grip", 14)}</span>` : "";
  const no = esc(slotNo(slot)[1]);
  const t = esc(titleOf(it.row, meta));
  const href = path(p.client.id, slot);
  const badge = cls === "sched"
    ? `<span class=stw title='${esc(label)}' aria-label='${esc(label)}'>${icon(label === "Paused" ? "pause" : "timer", 12)}</span>`
    : `<span class='tag ${cls}${label === "Removed" ? " gone" : ""}'>${esc(label)}</span>`;
  if (mini) {
    return `<a class='cell mini${slot === hl ? " hl" : ""}' data-cls='${cls}' href='${href}' title='${t}'${dnd}>${img}<span class=chips><span class=no>#${no}</span></span><span class='mdot ${cls}'></span><span class=mt>${time(it.at)}</span>${pvButton(p, it.row)}</a>`;
  }
  const vo = meta.voiceover ? "<span class=vo title='Has a voice-over'>VO</span>" : "";
  return `<a class='cell${slot === hl ? " hl" : ""}' data-cls='${cls}' href='${href}' title='${t}'${dnd}>${img}<span class=chips><span class=no>#${no}</span>${vo}</span><span class=tools>${grip}${pvButton(p, it.row)}</span><span class=cb><span class=ct>${t}</span>${badge}</span></a>`;
}

/** app.py _cal_head: the title, Week | Month, the status filter, the nav and the hint. */
function head(p: Page, k: Clock, view: string, title: string, prev: string, today: string, next: string, label: string): string {
  const base = `${path(p.client.id)}/calendar`;
  const seg = `<div class=seg><a href='${base}?w=${weekOf(k.w(p.now))}' class='${view === "week" ? "on" : ""}'>Week</a><a href='${base}?view=month&m=${ym(k.w(p.now))}' class='${view === "month" ? "on" : ""}'>Month</a></div>`;
  const filt = [["all", "All"], ["need", "Needs approval"], ["busy", "In production"], ["sched", "Scheduled"], ["live", "Live"]].map(([k, lab]) => `<button type=button data-f='${k}' class='${k === "all" ? "on" : ""}'>${lab}</button>`).join("");
  return `<div class=row style='margin-bottom:12px;flex-wrap:wrap'><div class=row style='gap:16px;flex-wrap:wrap'><h2>${title}</h2>${seg}<div class='seg filt calfilt' role=group aria-label='Show'>${filt}</div></div><div class=calnav>`
    + `<a href='${base}?${prev}' aria-label='Previous'>${ic("prev", 16)}</a><a class=txt href='${base}?${today}' title='Back to today'>${esc(label)}</a><a href='${base}?${next}' aria-label='Next'>${ic("next", 16)}</a></div></div>`
    + "<p class=hint style='margin:0 0 16px'>Grab a video by its dots and drop it on another to swap them, or on an open slot to move it. Press play for a quick look. Live videos stay put.</p>";
}

/** app.py add_new_box: one popup for every open slot's Add new: upload a video, or describe one. */
function addNewBox(p: Page): string {
  const c = esc(encodeURIComponent(p.client.id));
  const engines = Object.entries(ENGINES).map(([k, v]) => `<label class=chk><input type=radio name=engine value=${k}${k === "html" ? " checked" : ""}>${esc(v)}</label>`).join("");
  return `<div class=rgm id=addnew hidden><div class='rgbox wide'><h2>Add a video <span class=muted id=addat style='font-weight:500;font-size:15px'></span></h2>`
    + "<div class='seg sm' id=addtabs><a href='#' data-tab=up class=on>Upload</a><a href='#' data-tab=gen>Generate</a></div>"
    + `<form id=addup data-c='${c}'><label>Your video<input type=file name=file accept='video/*' required></label>`
    // app.py: "Fitted to 9:16 and kept on this computer": the Worker keeps the file as it is, in R2 (newvideo.ts)
    + "<p class=hint style='margin:0'>Goes to Instagram as it is (9:16, H.264). A PC checks the file before it can be approved.</p>"
    + "<div class=btns><button class='btn pri small'>Upload</button><button type=button class='btn sec small' data-close>Cancel</button><span class=muted id=addprog style='align-self:center'></span></div></form>"
    + `<form id=addgen method=post action='/${c}/new' hidden><input type=hidden name=at><fieldset class=engines><legend>Animate with</legend>${engines}</fieldset>`
    + "<label>What should the video be?<textarea name=prompt rows=6 placeholder='e.g. A light, airy reel on the swell chart: the particles rising behind the phone, ending on rosa.surf'></textarea></label>"
    + "<p class=hint style='margin:0'>Leave it empty and Claude comes up with the idea. Claude plans it, then makes it like a week video. A few minutes; it lands in Needs approval.</p>"
    + "<div class=btns><button class='btn pri small'>Generate</button><button type=button class='btn sec small' data-close>Cancel</button></div></form>"
    + `</div></div><script>${ADD_JS}</script>`;
}

async function week(p: Page, k: Clock, wk: string, hl: string | null): Promise<string> {
  const monday = mondayOf(wk); // on the wall clock, as every day below
  const today = dayOf(k.w(p.now));
  const { items, metas, planned } = await placed(p);
  const days = [...Array(7).keys()].map((d) => monday + d * DAY_MS);
  const times = new Set(days.flatMap((day) => slotsOn(p, k, day)).map((ms) => iso(ms)));
  const rows = new Set([...times].map((s) => hm(k.w(parse(s)!))));
  const droppable = new Set(rows);
  const cells = new Map<string, Item>();
  for (const it of items) {
    const d = Math.floor((k.w(it.at) - monday) / DAY_MS);
    if (d < 0 || d > 6) continue;
    rows.add(hm(k.w(it.at))); // published or scheduled off-slot: its own row
    if (!it.row.published_at) droppable.add(hm(k.w(it.at))); // a row only a published video made takes no drop
    if (!cells.has(`${d}|${hm(k.w(it.at))}`)) cells.set(`${d}|${hm(k.w(it.at))}`, it);
  }
  const g = ["<div class=cal style='grid-template-columns:56px repeat(7,minmax(0,1fr))'><div></div>"];
  for (const [d, day] of days.entries()) {
    const drop = day >= today ? ` data-day='${iso(day).slice(0, 10)}'` : "";
    g.push(`<div class='dh${day === today ? " today" : ""}'${drop}>${DAYS[d]}<b>${new Date(day).getUTCDate()}</b></div>`);
  }
  for (const t of [...rows].sort()) {
    g.push(`<div class=th>${time(k.back(monday + minutes(t) * 60_000))}</div>`);
    for (const [d, day] of days.entries()) {
      const ms = k.back(day + minutes(t) * 60_000);
      const past = ms <= p.now;
      const it = cells.get(`${d}|${t}`);
      if (it) g.push(cell(p, it, metas.get(it.row.slot_id) ?? {}, past, hl));
      else if (past || !droppable.has(t)) g.push("<div class='cell open past'></div>");
      else g.push(`<div class='cell open' data-at='${iso(ms)}'><span>Open slot</span>${times.has(iso(ms)) ? `<button type=button class=addnew data-add='${iso(ms)}'>+ Add new</button>` : ""}</div>`);
    }
  }
  g.push("</div>");
  const dm = (ms: number) => `${new Date(ms).getUTCDate()} ${MONTHS[new Date(ms).getUTCMonth()]}`;
  const h = head(p, k, "week", `${dm(monday)} – ${dm(monday + 6 * DAY_MS)} ${new Date(monday + 6 * DAY_MS).getUTCFullYear()}`, `w=${weekOf(monday - 7 * DAY_MS)}`, `w=${weekOf(k.w(p.now))}`, `w=${weekOf(monday + 7 * DAY_MS)}`, `${DAYS[0]} ${dm(monday)}`);
  const note = wk === nextWeek(p.now) && !planned.has(wk) ? `<div style='margin-top:20px'>${prepareForm(path(p.client.id), wk, "Prepare this week")}</div>` : "";
  return `${h}${g.join("")}${note}`;
}

async function month(p: Page, k: Clock, m: string, hl: string | null): Promise<string> {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  const first = Date.UTC(y, mo - 1, 1);
  const nextM = Date.UTC(y, mo, 1);
  const start = first - ((new Date(first).getUTCDay() || 7) - 1) * DAY_MS;
  const end = nextM - DAY_MS + (7 - (new Date(nextM - DAY_MS).getUTCDay() || 7)) * DAY_MS;
  const today = dayOf(k.w(p.now));
  const { items, metas } = await placed(p);
  const byDay = new Map<number, Map<string, Item>>();
  for (const it of items) {
    const day = Math.floor((k.w(it.at) - start) / DAY_MS) * DAY_MS + start; // floor, not %: a video before the grid must not land on its first day
    if (day < start || day > end) continue;
    const got = byDay.get(day) ?? new Map<string, Item>();
    if (!got.has(hm(k.w(it.at)))) got.set(hm(k.w(it.at)), it);
    byDay.set(day, got);
  }
  const g = ["<div class=month>", ...DAYS.map((d) => `<div class=mh>${d}</div>`)];
  for (let day = start; day <= end; day += DAY_MS) {
    const got = byDay.get(day) ?? new Map<string, Item>();
    const times = slotsOn(p, k, day).map((ms) => hm(k.w(ms)));
    const cs = [...new Set([...times, ...got.keys()])].sort().map((t) => {
      const ms = k.back(day + minutes(t) * 60_000);
      const it = got.get(t);
      if (it) return cell(p, it, metas.get(it.row.slot_id) ?? {}, ms <= p.now, hl, true);
      if (ms <= p.now) return "";
      return `<div class='cell mini open' data-at='${iso(ms)}'${times.includes(t) ? ` data-add='${iso(ms)}'` : ""} title='Open slot'>${time(ms)}</div>`;
    });
    const drop = day >= today ? ` data-day='${iso(day).slice(0, 10)}'` : "";
    g.push(`<div class='mday${new Date(day).getUTCMonth() !== mo - 1 ? " out" : ""}${day === today ? " today" : ""}'${drop}><b>${new Date(day).getUTCDate()}</b><div class=mcells>${cs.join("")}</div></div>`);
  }
  g.push("</div>");
  const h = head(p, k, "month", `${MONTHS_LONG[mo - 1]} ${y}`, `view=month&m=${ym(Date.UTC(y, mo - 2, 1))}`, `view=month&m=${ym(k.w(p.now))}`, `view=month&m=${ym(nextM)}`, `${MONTHS[mo - 1]} ${y}`);
  return `${h}${g.join("")}`;
}

export async function renderCalendar(p: Page, req: Request, url: URL): Promise<Response> {
  const base = `${path(p.client.id)}/calendar`;
  const q = url.searchParams;
  // no query: the view the cookie remembers (app.py's GET router); a malformed cookie counts as none
  let saved = "";
  try {
    saved = decodeURIComponent(new RegExp(`(?:^|;\\s*)cal_${p.client.id}=([^;]*)`).exec(req.headers.get("Cookie") ?? "")?.[1] ?? "");
  } catch {
    saved = "";
  }
  if (!url.search && saved.startsWith("?") && saved.length > 1) return redirect(base + saved);
  const hl = ID.test(q.get("hl") ?? "") ? q.get("hl") : null;
  const isMonth = q.get("view") === "month";
  const k = clock(viewZone(p, req));
  const m = /^\d{4}-(0[1-9]|1[0-2])$/.test(q.get("m") ?? "") ? q.get("m")! : ym(k.w(p.now));
  const w = /^\d{4}-W\d{2}$/.test(q.get("w") ?? "") ? q.get("w")! : weekOf(k.w(p.now));
  const body = isMonth ? await month(p, k, m, hl) : await week(p, k, w, hl);
  const js = CAL_JS.replaceAll("__C__", encodeURIComponent(p.client.id)) + (isMonth ? MINI_JS : "");
  const res = shell(p, "calendar", `${header(p, "Calendar")}<section class=card data-zone='${esc(k.zone)}'>${body}</section><div class=toast id=toast></div><script>${js}</script>${addNewBox(p)}`, "Calendar");
  res.headers.append("Set-Cookie", `cal_${p.client.id}=${encodeURIComponent(isMonth ? `?view=month&m=${m}` : `?w=${w}`)}; Path=/; Max-Age=31536000; SameSite=Lax`);
  return res;
}

/** app.py _first_free_on: a drop on a day takes its first open future slot: a daily slot, or a
    time the week view shows a row for (any video's time that week). */
async function firstFreeOn(p: Page, k: Clock, day: string, exclude: string): Promise<string | null> {
  const d0 = parse(`${day}T00:00:00Z`); // the day on the viewer's wall clock
  if (d0 === null || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new HttpError(400, "day", "not a day");
  const taken = await takenSlots(p.c, exclude);
  const monday = d0 - ((new Date(d0).getUTCDay() || 7) - 1) * DAY_MS;
  // never a published video's time: a late publish (02:01) is not a slot to schedule the next ones on
  const wk = (await posts(p.c, null)).map((r) => (r.published_at ? null : parse(r.scheduled_at))).filter((ms): ms is number => ms !== null).map(k.w).filter((lw) => lw >= monday && lw < monday + 7 * DAY_MS).map((lw) => k.back(d0 + minutes(hm(lw)) * 60_000));
  const cands = [...new Set([...slotsOn(p, k, d0), ...wk])].sort((a, b) => a - b);
  const ms = cands.find((x) => x > p.now && !taken.has(iso(x)));
  return ms === undefined ? null : iso(ms);
}

/** POST /<client>/move: swap two videos' times, or put one on an open future slot (OPS.move);
    the calendar's script sends it and reloads on a success. */
export async function move(p: Page, req: Request, form: FormData): Promise<Response> {
  const slot = field(form, "slot");
  const swap = field(form, "swap");
  if (swap) await OPS.move!(p.c, { slot_id: slot, swap_with: swap });
  else {
    const at = field(form, "at") || (field(form, "day") ? await firstFreeOn(p, clock(viewZone(p, req)), field(form, "day"), slot) : "");
    if (at === null) throw new HttpError(400, "day", "no open slot left that day");
    const ms = parse(at);
    if (ms === null) throw new HttpError(400, "at", "no slot given");
    if (ms <= p.now) throw new HttpError(400, "at", "that slot has already passed");
    if ((await takenSlots(p.c, slot)).has(iso(ms))) throw new HttpError(400, "taken", "that slot is taken");
    await OPS.move!(p.c, { slot_id: slot, at: iso(ms) });
  }
  return redirect(`${path(p.client.id)}/calendar`);
}
