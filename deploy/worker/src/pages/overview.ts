// The Overview (app.py render_overview, port): the account's numbers and the views chart, every
// video as a card with one tag and the client-side filter, the schedule, next week, the
// followers who dropped, the sync card. The markup is app.py's; what differs:
// - the views chart buckets in the browser (app.py bucketed in the machine's zone): the page
//   carries the view gains, a script draws app.py's SVG. Live (a per-minute Graph poll held in
//   app.py's memory) has no Worker route: the tab says so.
// - no live Instagram pulls on render (the cron measures), so no Updating tag.
// - the week's progress comes from the `plan` job and the week's posts (app.py read the PC's
//   week status file).
// - the schedule card is settings.ts's; the upload posts the JSON file (no zip).

import { OPS, posts, type Ctx } from "../db.ts";
import { insertJob, latestJobs, type JobRow } from "../jobs.ts";
import { metas, recsLine } from "./insights.ts";
import { scheduleCard } from "./settings.ts";
import { slots, takenSlots } from "./schedule.ts";
import { ENGINES, esc, header, icon, jobLine, mediaLatest, num, ORDER, parse, parseJson, path, redirect, shell, slotNo, tagFor, titleOf, when as whenText, type Page, type Json } from "./shell.ts";
import type { PostRow } from "../db.ts";

const DAY_MS = 86400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const GRANS = ["live", "hour", "day", "month", "custom"];
// app.py's icons that shell.ts does not carry
const svg = (d: string, size: number) => icon("x", size).replace(/<path.*<\/svg>/, `${d}</svg>`);
const plus = (size: number) => svg('<path d="M5 12h14"/><path d="M12 5v14"/>', size);

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
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** A stamp the page script shows as app.py's "%-d %b" (dm) or "%-d %b, %H:%M" (dmhm) in the browser's zone. */
function local(ts: string | null | undefined, fmt: "dm" | "dmhm"): string {
  const ms = parse(ts);
  return ms === null ? "" : whenText(ts).replace("<time ", `<time data-fmt=${fmt} `);
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
  const asOf = last && /^\d{4}-\d\d-\d\d$/.test(String(last.date)) ? dayLabel(Date.parse(`${String(last.date)}T00:00:00Z`)) : "";
  const folNote = roll?.followers_count != null ? "now" : last ? `as of ${esc(asOf)}` : "no data yet";
  const stats: [string, unknown, string][] = [["Views", total("views"), "last 7 days"], ["Reached", total("reach"), "last 7 days"], ["Followers", followers, folNote], ["Link taps", total("profile_links_taps"), "last 7 days"]];
  return stats.map(([lab, v, note]) => `<div class=stat><span>${lab}</span><strong>${num(v)}</strong><small>${note}</small></div>`).join("");
}

/** Views gained per snapshot step, summed over every published video (app.py views_series):
    [unix seconds, gain], from `since` on. The browser buckets them. */
async function viewGains(c: Ctx, all: PostRow[], since: number): Promise<[number, number][]> {
  if (all.length !== 1) { // every video: the hourly sums putSnapshot keeps, ~one row an hour
    const g = (await c.env.DB.prepare("SELECT hour, gain FROM view_gains WHERE client = ? AND hour >= ? ORDER BY hour")
      .bind(c.client, new Date(since).toISOString().slice(0, 13)).all<{ hour: string; gain: number }>()).results;
    return g.map((r) => [Math.round(Date.parse(`${r.hour}:00:00Z`) / 1000), r.gain]);
  }
  // a video page: that video's whole history (snaps_post, at most ~730 rows: hourly for 30 days), so every point has its base
  const one = all[0]!.slot_id;
  const rows = (await c.env.DB.prepare("SELECT post_id, collected_at, json_extract(metrics, '$.views') AS v FROM metric_snapshots WHERE client = ? AND post_id = ? AND source = 'ig_media' ORDER BY collected_at").bind(c.client, one)
    .all<{ post_id: string; collected_at: string; v: number | null }>()).results;
  const by = new Map<string, [number, number][]>();
  for (const r of rows) {
    const t = parse(r.collected_at);
    if (t !== null) (by.get(r.post_id) ?? by.set(r.post_id, []).get(r.post_id)!).push([t, Number(r.v) || 0]);
  }
  const out: [number, number][] = [];
  for (const p of all) {
    const pub = parse(p.published_at);
    if (pub === null) continue;
    const pts: [number, number][] = [[pub, 0], ...(by.get(p.slot_id) ?? []).sort((a, b) => a[0] - b[0] || a[1] - b[1])];
    for (let i = 1; i < pts.length; i++) if (pts[i]![1] > pts[i - 1]![1] && pts[i]![0] >= since) out.push([Math.round(pts[i]![0] / 1000), pts[i]![1] - pts[i - 1]![1]]);
  }
  return out;
}

// app.py view_window, _bucket, _next and views_chart, in the browser's zone
const CHART_JS = `(()=>{const v=document.currentScript.closest('.views'),b=v.querySelector('.vbody'),g=b.dataset.g,W=+b.dataset.w,H=+b.dataset.h,ev=JSON.parse(b.dataset.ev);
const M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],p2=n=>String(n).padStart(2,'0');
const num=n=>Number.isInteger(n)?(n>=10000?(n/1000).toFixed(1)+'k':n.toLocaleString('en-US')):n.toLocaleString('en-US',{minimumFractionDigits:1,maximumFractionDigits:1});
const bk=(t,g)=>{const d=new Date(t);if(g==='hour')d.setMinutes(0,0,0);else{d.setHours(0,0,0,0);if(g==='month')d.setDate(1);}return d;};
const nx=(t,g)=>{const d=new Date(t);if(g==='hour')d.setHours(d.getHours()+1);else if(g==='day')d.setDate(d.getDate()+1);else d.setMonth(d.getMonth()+1,1);return d;};
const ymd=d=>d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate()),day=s=>{const d=new Date(s+'T00:00');return isNaN(d)?null:d;};
const fmt=(d,f)=>f==='hour'?p2(d.getHours())+':'+p2(d.getMinutes()):f==='day'?d.getDate()+' '+M[d.getMonth()]:f==='month'?M[d.getMonth()]+' '+String(d.getFullYear()).slice(2):d.getDate()+' '+M[d.getMonth()]+' '+p2(d.getHours())+':'+p2(d.getMinutes());
const now=new Date(),fr=v.querySelector('input[name=from]'),to=v.querySelector('input[name=to]');
if(!fr.value){const d=new Date(now);d.setDate(d.getDate()-13);fr.value=ymd(d);}if(!to.value)to.value=ymd(now);
let eg=g,a,e=now;const f0=day(b.dataset.from),t0=day(b.dataset.to);
if(g==='custom'&&f0&&t0){a=f0;let z=new Date(t0);z.setDate(z.getDate()+1);if(z<=a){const a0=a;a=new Date(z);a.setDate(a.getDate()-1);z=new Date(a0);z.setDate(z.getDate()+1);}
 const s=Math.round((z-a)/864e5);eg=s<=3?'hour':s<=120?'day':'month';e=new Date(Math.min(z,+now+36e5));}
else if(g==='hour')a=bk(now-47*36e5,'hour');
else if(g==='month'){const s=new Date(now);s.setDate(1);for(let i=0;i<11;i++){s.setDate(0);s.setDate(1);}a=bk(s,'month');}
else{eg='day';a=bk(now-29*864e5,'day');}
const gain={};for(const[t,n]of ev){const k=+bk(t*1000,eg);gain[k]=(gain[k]||0)+n;}
const se=[];for(let t=bk(a,eg);t<e;t=nx(t,eg))se.push([t,gain[+t]||0]);
const tot=se.reduce((x,y)=>x+y[1],0);v.querySelector('.vhd strong').textContent=num(tot);
if(!tot){b.innerHTML="<p class=muted style='margin:14px 0 4px'>No views in this period yet.</p>";return;}
const n=se.length||1;let top=Math.max(1,...se.map(x=>x[1]));const step=10**Math.max(0,String(Math.trunc(top)).length-1);top=(Math.trunc(top/step)+1)*step;
const L=34,B=22,T=8,bw=(W-L)/n,o=["<svg viewBox='0 0 "+W+" "+H+"' role=img aria-label='Views per "+eg+"'>"];
for(let i=0;i<3;i++){const y=T+(H-B-T)*i/2;o.push("<line x1="+L+" x2="+W+" y1="+y.toFixed(1)+" y2="+y.toFixed(1)+" stroke='#E8E8E8'/><text x=0 y="+(y+4).toFixed(1)+">"+num(top*(1-i/2))+"</text>");}
const every=Math.max(1,Math.floor(n/5));
se.forEach(([t,c],i)=>{const x=L+i*bw;
 if(c){const h=(H-B-T)*c/top;o.push("<rect x="+(x+bw*.15).toFixed(1)+" y="+(H-B-h).toFixed(1)+" width="+Math.max(bw*.7,1).toFixed(1)+" height="+h.toFixed(1)+" rx="+Math.min(3,bw*.3).toFixed(1)+" fill='#8DF000'><title>"+fmt(t,eg==='hour'?'hm':eg)+": "+num(c)+" views</title></rect>");}
 if(i%every===0)o.push("<text x="+(x+bw/2).toFixed(1)+" y="+(H-5)+" text-anchor=middle>"+fmt(t,eg)+"</text>");});
b.innerHTML="<div class=chart>"+o.join('')+"</svg></div>";})();`;

/** app.py views_block (Number | Views + period, the range selector, the chart). `base`: the page the selector links to. */
export async function viewsBlock(p: Page, all: PostRow[], q: URLSearchParams, W: number, H: number, dflt: string, base = path(p.client.id)): Promise<string> {
  const g = GRANS.includes(q.get("g") ?? "") ? q.get("g")! : dflt;
  const seg = GRANS.map((x) => (x !== "custom"
    ? `<a href='${base}?g=${x}' class='${g === x ? "on" : ""}'>${x[0]!.toUpperCase()}${x.slice(1)}</a>`
    : `<a href='#' data-range class='${g === x ? "on" : ""}' title='Custom range' aria-label='Custom range'>${icon("cal", 16)}</a>`)).join("");
  const head = (n: string, per: string) => `<div class=row style='flex-wrap:wrap;gap:10px'><div class=vhd><strong${g === "live" ? " id=lvnew" : ""}>${n}</strong><div><span>Views</span><small>${per}</small></div></div><div class='seg sm'>${seg}</div></div>`;
  const from = /^\d{4}-\d\d-\d\d$/.test(q.get("from") ?? "") ? q.get("from")! : "";
  const to = /^\d{4}-\d\d-\d\d$/.test(q.get("to") ?? "") ? q.get("to")! : "";
  const custom = `<div class=rgm hidden><form method=get action='${base}' class=rgbox><input type=hidden name=g value=custom><h2>Custom range</h2><label>From<input type=date name=from value='${from}'></label><label>To<input type=date name=to value='${to}'></label><div class=btns><button class='btn dark small'>Show</button><button type=button class='btn sec small' data-rgclose>Cancel</button></div></form></div>`;
  const keep = "<script>(()=>{const v=document.currentScript.closest('.views'),m=v.querySelector('.rgm');v.querySelector('[data-range]').addEventListener('click',e=>{e.preventDefault();m.hidden=false;m.querySelector('.dtf,input[type=date]').focus();});m.addEventListener('click',e=>{if(e.target===m||e.target.closest('[data-rgclose]'))m.hidden=true;});document.addEventListener('keydown',e=>{if(e.key==='Escape')m.hidden=true;});})();</script>";
  if (g === "live") return `<div id=views class=views>${head("…", "last 30 min")}${custom}<div class=vbody><p class=muted style='margin:14px 0 4px'>Live views run on the PC dashboard only.</p></div>${keep}</div>`;
  // the gains the browser may bucket: the window plus a day either side for its zone
  const since = g === "hour" ? p.now - 50 * 3600_000 : g === "day" ? p.now - 32 * DAY_MS : g === "month" ? p.now - 400 * DAY_MS : g === "custom" && from && to ? Math.min(Date.parse(from), Date.parse(to)) - 2 * DAY_MS : p.now - 32 * DAY_MS;
  const ev = JSON.stringify(await viewGains(p.c, all, since));
  const span = ({ hour: "last 48 hr", day: "last 30 days", month: "last 12 mon" } as Record<string, string>)[g] ?? "custom";
  return `<div id=views class=views>${head("", span)}${custom}<div class=vbody data-g='${g}' data-w=${W} data-h=${H} data-from='${from}' data-to='${to}' data-ev='${ev}'><script>${CHART_JS}</script></div>${keep}</div>`;
}

async function videoCard(p: Page, row: PostRow, tag: [string, string], meta: Json): Promise<string> {
  const slot = row.slot_id;
  const [label, cls] = tag;
  const href = path(p.client.id, slot);
  const file = `/m/${encodeURIComponent(p.client.id)}/${encodeURIComponent(slot)}`;
  const img = row.cover_key ? `<img src='${file}/cover' alt='' loading=lazy>` : "";
  let line: string;
  if (cls === "live") {
    const [m] = await mediaLatest(p.c, slot);
    line = m ? `${num(m.views)} views · ${num(m.reach)} reached` : `Live since ${whenText(row.published_at)}`;
  } else if (label === "Paused") line = row.scheduled_at ? `Paused · was ${whenText(row.scheduled_at)}` : "Paused";
  else if (cls === "sched") line = row.scheduled_at ? `Posts ${whenText(row.scheduled_at)}` : "Waiting for a slot";
  else if (cls === "busy") line = row.scheduled_at && label === "In production" ? `For ${whenText(row.scheduled_at)}` : "New version on the way";
  else line = "Review and approve";
  const [wk, no] = slotNo(slot);
  const vo = meta.voiceover ? "<span class=vo title='Has a voice-over'>VO</span>" : "";
  const pv = row.r2_key
    ? `<button type=button class=pvb data-pv='${file}/video' data-href='${href}' aria-label='Quick preview'>${icon("play", 14)}</button><button type=button class=dlb data-dl='${file}/video' aria-label='Download the video' title='Download'>${icon("download", 15)}</button>`
    : "";
  const badge = cls === "sched"
    ? `<span class=stw title='${esc(label)}' aria-label='${esc(label)}'>${icon(label === "Paused" ? "pause" : "timer", 14)}</span>`
    : `<span class='tag ${cls}${label === "Removed" ? " gone" : ""}'>${esc(label)}</span>`;
  return `<a class=vid data-cls='${cls}' href='${href}'><div class=thumb>${img}<span class=chips><span class=no title='${esc(wk)} video ${esc(no)}'>${esc(wk ? `${wk} · ` : "")}#${esc(no)}</span>${vo}</span>${pv}${badge}</div>`
    + `<h3>${esc(titleOf(row, meta))}</h3>${cls === "need" ? "" : `<p>${line}</p>`}</a>`;
}

// app.py popup(): Esc, Cancel or a click outside closes it
const POPUP_JS = "<script>(()=>{const w=document.currentScript.parentElement,m=w.querySelector('.rgm');w.querySelector('[data-open]').addEventListener('click',e=>{e.preventDefault();m.hidden=false;const f=m.querySelector('textarea,input:not([type=hidden]),button');if(f)f.focus();});m.addEventListener('click',e=>{if(m.querySelector('.busy'))return;if(e.target===m||e.target.closest('[data-close]'))m.hidden=true;});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!m.querySelector('.busy'))m.hidden=true;});})();</script>";

/** The Prepare popup (app.py prepare_button): a `plan` job for `wk`; `last` prefills the instructions. */
export function prepareForm(base: string, wk: string, label: string, last = ""): string {
  const engines = Object.entries(ENGINES).map(([k, v]) => `<label class=chk><input type=radio name=engine value=${k}${k === "html" ? " checked" : ""}>${esc(v)}</label>`).join("");
  const box = `<form method=post action='${base}/week' class='rgbox wide'><input type=hidden name=action value=prepare><input type=hidden name=week value='${esc(wk)}'>`
    + `<h2>${esc(label)}</h2><fieldset class=engines><legend>Animate with</legend>${engines}</fieldset>`
    + `<label>Instructions for this batch<textarea name=instructions rows=6 placeholder='e.g. Add our Rosa app particles to the empty dark areas. Try a light, airy style with new layouts.'>${esc(last)}</textarea></label>`
    + `<p class=hint style='margin:0'>Applies to every video in the batch. Leave it empty and Claude comes up with the idea. ${last ? "Prefilled with the last batch&#39;s instructions." : ""}</p>`
    + `<div class=btns><button class='btn pri small'>Start</button><button type=button class='btn sec small' data-close>Cancel</button></div></form>`;
  return `<div class=pop><button type=button class='btn pri small' data-open>${esc(label)}</button><div class=rgm hidden>${box}</div>${POPUP_JS}</div>`;
}

/** Next week (app.py week_card): the plan job while it runs, then the week's videos, else Prepare. */
async function weekCard(p: Page, jobs: Map<string, Record<string, JobRow>>, all: PostRow[]): Promise<string> {
  const wk = nextWeek(p.now);
  const { monday, stamps } = weekSlots(wk, p.client.grants);
  const taken = await takenSlots(p.c);
  const total = stamps.filter((s) => !taken.has(s)).length;
  const span = `${dayLabel(monday)} – ${dayLabel(monday + 6 * DAY_MS)}`;
  const base = path(p.client.id);
  const plan = jobs.get("")?.plan;
  const payload = parseJson(plan?.payload);
  const mine = plan && (payload.argv as string[] | undefined)?.[3] === wk ? plan : undefined;
  const planned = all.filter((r) => r.slot_id.startsWith(`${wk.toLowerCase()}-`) && r.state !== "REJECTED");
  let body: string;
  if (mine?.state === "running" || mine?.state === "queued") {
    body = `<p class=big>${mine.state === "running" ? "Planning the week…" : "Waiting for a PC with the files…"}</p><div class=prog><i></i></div><p class=hint>${jobLine(mine, p.now)}</p><p class=hint>Each one lands in Needs approval when it is ready.</p>`;
  } else if (mine?.state !== "failed" && planned.length) {
    const tot = planned.length;
    const bad = planned.filter((r) => tagFor(r, jobs.get(r.slot_id))?.[1] === "busy").length;
    body = `<div class=crow><p><b>${tot - bad} of ${tot} videos ready.</b> ${bad ? `${bad} still in production; see the calendar.` : "Approve them before Monday."}</p><a class='btn sec' href='${base}/calendar?w=${esc(wk)}'>Open the week</a></div>`;
  } else {
    const err = mine?.state === "failed" ? `<div class=note>Last run failed: ${esc(mine.result ?? "")}</div>` : "";
    body = `${err}<div class=crow><p>${total} videos</p>${prepareForm(base, wk, "Prepare next week", typeof payload.instructions === "string" ? payload.instructions : "")}</div>`;
  }
  const prep = (p.client.grants.week_prep ?? {}) as Json;
  const auto = `<form method=post action='${base}/week' class=autorow><input type=hidden name=action value=auto><input type=hidden name=value value='${prep.auto ? 0 : 1}'>`
    + `<span>Prepare automatically every ${esc(String(prep.day ?? "Thursday"))}</span>`
    + `<button class='toggle ${prep.auto ? "on" : ""}' aria-pressed=${prep.auto ? "true" : "false"} aria-label='Prepare automatically'><i></i></button></form>`;
  return `<section class=card><div class=row><h2>Next week</h2><span class=muted>${span}</span></div><div style='margin-top:16px'>${body}</div>${auto}</section>`;
}

// app.py UPLOAD_JS, posting the form: the redirect's page brings the card back with its note
const UPLOAD_JS = `window.tUp=window.tUp||function(inp){const f=inp.files[0];if(!f)return;
const c=inp.closest('.card'),st=c.querySelector('.upst'),bar=st.querySelector('i'),t=st.querySelector('span'),lab=inp.closest('label'),fm=inp.form,fd=new FormData(fm);inp.value='';
const fail=m=>{st.className='upst err';t.textContent=m;lab.classList.remove('off');};
st.hidden=false;st.className='upst';bar.style.width='0';t.textContent='Uploading… 0%';lab.classList.add('off');
const x=new XMLHttpRequest();x.open('POST',fm.action);
x.upload.onprogress=e=>{if(e.lengthComputable){const p=Math.round(e.loaded/e.total*100);bar.style.width=p+'%';t.textContent='Uploading… '+p+'%';}};
x.upload.onload=()=>{st.className='upst busy';t.textContent='Reading the export…';};
x.onload=()=>{const d=new DOMParser().parseFromString(x.responseText,'text/html'),n=d.getElementById('dropped');
 if(x.status===200&&n){c.replaceWith(document.adoptNode(n));for(const s of n.querySelectorAll('time[datetime]'))s.textContent=s.dateTime;document.dispatchEvent(new Event('ovtime'));}
 else fail((d.querySelector('.card p')||{}).textContent||'The upload failed. Try again.');};
x.onerror=()=>fail('The upload failed: check the connection and try again.');x.send(fd);};`;

/** Followers who dropped between the last two Instagram exports (app.py dropped_card; the
    follower_dropped op); the upload (src/pages/audience.ts) and, back from it, the result (`up`). */
async function droppedCard(p: Page, up: string | null): Promise<string> {
  const r = (await OPS.follower_dropped!(p.c, {})) as { snapshots: number; since: string | null; at: string | null; followers: number | null; dropped: string[] };
  const form = `<form method=post enctype=multipart/form-data action='${path(p.client.id)}/audience/upload'><label class='btn sec'>${plus(16)}Upload export<input type=file name=file accept='.json,application/json' hidden onchange='tUp(this)'></label></form>`;
  const status = "<div class=upst hidden><div class=upbar><i></i></div><span></span></div>";
  let body: string;
  if (!r.snapshots) body = `<div class=crow><p>Upload your Instagram export (JSON, Followers and following) to start.</p>${form}</div>`;
  else if (r.snapshots === 1) body = `<div class=crow><p><b class=dnum>0</b> dropped.</p>${form}</div>`;
  else {
    const n = r.dropped.length;
    const names = r.dropped.map((u) => `<li><a href='https://www.instagram.com/${encodeURIComponent(u)}/' target=_blank rel=noopener>@${esc(u)}</a></li>`).join("");
    const lst = n ? ` <a href='#' class=lnk onclick='event.preventDefault();document.getElementById("droplist").showModal()'>View</a>` : "";
    const dlg = n ? `<dialog class=dlg id=droplist><div class=row><h2>${n} followers dropped since ${local(r.since, "dm")}</h2><button class=x onclick='this.closest("dialog").close()' aria-label='Close'>${icon("x", 16)}</button></div><ul class=drops>${names}</ul></dialog>` : "";
    body = `<div class=crow><p><b class=dnum>${n}</b> dropped.${lst}</p>${form}</div>${dlg}`;
  }
  const note = up === "same" ? "This export was already in: nothing changed." : up === "ok" ? `Export read: ${num(r.followers)} followers${r.snapshots < 2 ? "" : `, ${r.dropped.length} dropped`}.` : "";
  const done = note ? `<p class=upok>${icon("check", 15)}${note}</p>` : "";
  const last = r.at ? `<p class=hint>Last export ${local(r.at, "dmhm")} · ${num(r.followers)} followers.</p>` : "";
  return `<section class=card id=dropped><h2>Followers who dropped</h2>${body}${status}${done}${last}<script>${UPLOAD_JS}</script></section>`;
}

/** Sync (app.py sync_card): the cron's pickup now (settings.ts sync). `synced` is its answer,
    "<added>-<not checked>" or "err". The Worker does not look for removed reels. */
function syncCard(p: Page, synced: string | null): string {
  let res = "";
  if (synced === "err") res = "<p class=hint style='color:#b42318'>Could not reach Instagram. Try again later.</p>";
  else if (synced && /^\d+-\d+$/.test(synced)) {
    const [a, f] = synced.split("-").map(Number) as [number, number];
    res = `<p class=upok>${icon("check", 15)}${a ? `${a} ${a === 1 ? "video" : "videos"} added.` : "Nothing new."}</p>${f ? `<p class=hint>${f} could not be checked. Try again later.</p>` : ""}`;
  }
  return `<section class=card id=sync><h2>Sync</h2><form method=post action='${path(p.client.id)}/sync' class=crow><p>Find manual uploads</p><button class='btn sec'>${icon("redo", 16)}Sync videos</button></form>${res}`
    + (res ? "<script>history.replaceState(null,'',location.pathname+location.hash)</script>" : "") + "</section>";
}

// the page's own formats, after shell's TIME_JS: app.py's "%-d %b" stamps
const PAGE_JS = `<script>(()=>{const M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],p2=n=>String(n).padStart(2,'0');
const go=()=>{for(const t of document.querySelectorAll('time[data-fmt=dm],time[data-fmt=dmhm]')){const d=new Date(t.dateTime);t.textContent=d.getDate()+' '+M[d.getMonth()]+(t.dataset.fmt==='dmhm'?', '+p2(d.getHours())+':'+p2(d.getMinutes()):'');}};
addEventListener('DOMContentLoaded',go);document.addEventListener('ovtime',go);})();</script>`;

export async function renderOverview(p: Page, q: URLSearchParams): Promise<Response> {
  const jobs = await latestJobs(p.c.env.DB, p.client.id);
  const all = await posts(p.c, null);
  const meta = await metas(p.c);
  let rows = all.map((r): [PostRow, [string, string] | null] => [r, tagFor(r, jobs.get(r.slot_id))]).filter((x): x is [PostRow, [string, string]] => x[1] !== null);
  const key = (r: PostRow) => parse(r.published_at || r.scheduled_at || String(r.updated_at)) ?? 0;
  rows.sort((a, b) => ORDER[a[1][1]]! - ORDER[b[1][1]]! || (["sched", "busy"].includes(a[1][1]) ? key(a[0]) - key(b[0]) : key(b[0]) - key(a[0])));
  const busy = rows.filter((x) => x[1][1] === "busy").length;
  rows = [...rows.filter((x) => x[1][1] !== "live"), ...rows.filter((x) => x[1][1] === "live").slice(0, 8)];
  const shown = (c: string) => rows.filter((x) => x[1][1] === c).length;
  const filt = ([["all", "All", rows.length], ["need", "Needs approval", shown("need")], ["busy", "In production", shown("busy")], ["sched", "Scheduled", shown("sched")], ["live", "Live", shown("live")]] as [string, string, number][])
    .filter(([k, , n]) => k === "all" || n)
    .map(([k, lab, n]) => `<button type=button data-f='${k}' class='${k === "all" ? "on" : ""}'>${lab}<i>${n}</i></button>`)
    .join("");
  const cards = (await Promise.all(rows.map(([r, t]) => videoCard(p, r, t, meta.get(r.slot_id) ?? {})))).join("")
    || "<div class=empty>No videos yet. Prepare next week to fill this.</div>";
  const chart = await viewsBlock(p, all, q, 600, 170, "hour"); // the wide column: keep text at its size
  const perf = `<section class='card perf'><div class=perfin><div><h2>Performance</h2><div class=stats>${await accountStats(p.c)}</div></div><div>${chart}</div></div>${await recsLine(p, all, meta)}</section>`;
  const need = shown("need");
  const vids = `<div class='row vhead' style='flex-wrap:wrap'><h2>Videos${need ? ` <span class=tdo>${need} to approve</span>` : ""}</h2><div class='seg filt' role=group aria-label='Show'>${filt}</div></div>`
    + `<div class=grid id=vgrid>${cards}</div><p class='muted fempty' hidden>Nothing here right now.</p>`
    + "<script>(()=>{const K='tachyon.ovfilter',g=document.getElementById('vgrid'),e=document.querySelector('.fempty');"
    + "const set=f=>{let n=0;g.querySelectorAll('.vid').forEach(v=>{const s=f==='all'||v.dataset.cls===f;v.hidden=!s;n+=s;});"
    + "document.querySelectorAll('.filt button').forEach(b=>b.classList.toggle('on',b.dataset.f===f));e.hidden=n>0;"
    + "try{localStorage.setItem(K,f)}catch(_){}};"
    + "document.querySelectorAll('.filt button').forEach(b=>b.addEventListener('click',()=>set(b.dataset.f)));"
    + "let f='all';try{f=localStorage.getItem(K)||'all'}catch(_){}if(!document.querySelector(`.filt [data-f='${f}']`))f='all';set(f);})();</script>";
  const side = `${scheduleCard(p)}${await weekCard(p, jobs, all)}${await droppedCard(p, q.get("up"))}${syncCard(p, q.get("synced"))}`;
  const body = `${header(p)}<div class=ovgrid><div class=maincol>${perf}${vids}</div><div class=side>${side}</div></div>${PAGE_JS}`;
  const planning = jobs.get("")?.plan?.state === "running";
  return shell(p, "overview", body, "Overview", busy || planning ? 30 : null);
}

/** POST /<client>/week: Prepare next week as a `plan` job (spine/week.py prepare on a host), or
    action=auto: the "Prepare automatically" switch (grants.week_prep.auto, as app.py stored it). */
export async function prepareWeek(p: Page, form: FormData): Promise<Response> {
  if (form.get("action") === "auto") {
    const prep = (p.client.grants.week_prep ?? {}) as Json;
    await OPS.set_grants!(p.c, { grants: { ...p.client.grants, week_prep: { ...prep, auto: String(form.get("value")) === "1" } } });
    return redirect(path(p.client.id));
  }
  const week = String(form.get("week") || nextWeek(p.now));
  if (!/^\d{4}-W\d{2}$/.test(week)) return redirect(path(p.client.id));
  const engine = String(form.get("engine") ?? "");
  const payload = { argv: ["spine.week", "prepare", p.client.id, week], instructions: String(form.get("instructions") ?? ""), ...(engine in ENGINES ? { engine } : {}) };
  await insertJob(p.c.env.DB, "plan", p.client.id, null, JSON.stringify(payload), p.user.id, p.now);
  return redirect(path(p.client.id));
}
