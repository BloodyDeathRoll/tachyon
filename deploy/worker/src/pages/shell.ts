// The dashboard's page shell (spine/review/app.py, port): the sidebar with the client
// switcher and the nav, the CSS, the icons and the formatting helpers the pages share.
// Times: the rows carry UTC ISO stamps; a page renders them as <time datetime> with a UTC
// fallback text and one inline script formats them in the browser's zone (the Python used
// the machine's zone). The CSS, the page scripts, the font and the logo are app.py's own
// (ui.gen.ts and public/static, written by `python -m spine.review.export_ui`).

import type { Ctx, PostRow } from "../db.ts";
import type { JobRow } from "../jobs.ts";
import type { UserRow } from "../members.ts";
import { CSS as LOCAL_CSS, DTP_JS, ICONS as LOCAL_ICONS, LOCK_JS, PV_JS, SEG_JS } from "./ui.gen.ts";

export type Json = Record<string, unknown>;

export interface ClientInfo {
  id: string;
  name: string;
  ig_user_id: string | null;
  page_id: string | null;
  ig_username: string | null;
  connected: boolean;
  token_expires: number | null;
  grants: Json;
  emergency_stop: number;
  publisher: string;
  status: string; // setup | learning | review | active (src/pages/setup.ts)
}

/** What every page handler gets: the client, its grants, the DB context for the user. */
export interface Page {
  env: { DB: D1Database; MEDIA: R2Bucket; TOKEN_SECRET: string };
  c: Ctx;
  user: UserRow;
  client: ClientInfo;
  nav: { id: string; name: string }[]; // the switcher: the user's clients only
  now: number;
}

export const CAPTION_LOCKED = new Set(["PUBLISHING", "PUBLISHED", "MEASURING", "ANALYZED", "MANUAL_HANDOFF"]);
export const NO_DELETE = CAPTION_LOCKED; // live, or maybe live
export const LIVE = new Set(["PUBLISHED", "MEASURING", "ANALYZED"]);
export const MOVABLE = new Set(["IDEA", "BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL", "NEEDS_INPUT", "APPROVED", "QUEUED", "PAUSED", "REJECTED"]);
export const ENGINES: Record<string, string> = { html: "Claude", remotion: "Remotion", templates: "Templates", random: "Random" };

// state -> [label, css class]
export const TAG: Record<string, [string, string]> = {
  NEEDS_APPROVAL: ["Needs approval", "need"],
  NEEDS_INPUT: ["Needs approval", "need"],
  APPROVED: ["Scheduled", "sched"], QUEUED: ["Scheduled", "sched"], PUBLISHING: ["Scheduled", "sched"],
  PAUSED: ["Paused", "sched"], // still a scheduled video, held off Instagram
  PUBLISHED: ["Live", "live"], MEASURING: ["Live", "live"], ANALYZED: ["Live", "live"],
  REMOVED: ["Removed", "live"],
  MANUAL_HANDOFF: ["Needs approval", "need"],
  BRIEFED: ["In production", "busy"], SCRIPTED: ["In production", "busy"],
  RENDERED: ["In production", "busy"], QA: ["In production", "busy"],
};
export const ORDER: Record<string, number> = { need: 0, busy: 1, sched: 2, live: 3 };

/** The tag for a row given the slot's newest job per kind (app.py read revise.json for this).
    A queued job counts as running: app.py wrote "running" the moment it forked. */
export function tagFor(row: PostRow, jobs: Record<string, JobRow> | undefined): [string, string] | null {
  const st = [jobs?.produce, jobs?.revise].filter((j): j is JobRow => Boolean(j)).sort((a, b) => b.id - a.id)[0];
  if (st?.state === "running" || st?.state === "queued") return st.kind === "produce" ? ["In production", "busy"] : ["Re-rendering", "busy"];
  if (["REJECTED", "BRIEFED", "SCRIPTED", "NEEDS_APPROVAL"].includes(row.state) && st?.state === "failed") return ["Needs approval", "need"];
  return TAG[row.state] ?? null;
}

// ── formatting ────────────────────────────────────────────────────────────────

export function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

export function parseJson(text: string | null | undefined): Json {
  try {
    const v: unknown = JSON.parse(text || "{}");
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : {};
  } catch {
    return {};
  }
}

/** An ISO stamp as unix ms; a naive one counts as UTC, as app.py's parse() did. */
export function parse(ts: string | null | undefined): number | null {
  if (!ts) return null;
  let s = ts.trim().replace(/([+-]\d\d)(\d\d)$/, "$1:$2");
  if (!/[zZ]$|[+-]\d\d:\d\d$/.test(s)) s += "Z";
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? null : ms;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const p2 = (n: number) => String(n).padStart(2, "0");

/** "Sat 1 Nov, 18:30 UTC" inside a <time> the browser reformats in its own zone. */
export function when(ts: string | null | undefined): string {
  const ms = parse(ts);
  if (ms === null) return "";
  const d = new Date(ms);
  return `<time datetime="${d.toISOString()}">${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())} UTC</time>`;
}

/** A daily slot time ("06:30", UTC) the browser shows at today's local offset. */
export function whenTime(hm: string): string {
  return `<time datetime="${new Date().toISOString().slice(0, 10)}T${esc(hm)}:00Z" data-fmt="time">${esc(hm)} UTC</time>`;
}

export function ago(ts: string | null | undefined, now: number): string {
  const ms = parse(ts);
  if (ms === null) return "";
  const s = (now - ms) / 1000;
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/** Seconds as "1 h 05 min" or "12 min". */
export function dur(s: number): string {
  const m = Math.max(1, Math.round(s / 60));
  return m >= 60 ? `${Math.floor(m / 60)} h ${p2(m % 60)} min` : `${m} min`;
}

export function num(v: unknown): string {
  if (v === null || v === undefined) return "–";
  const n = Number(v);
  if (!Number.isFinite(n)) return "–";
  if (!Number.isInteger(n)) return n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString("en-US");
}

/** ["W44", "03"] for 2026-w44-03; ["", slot] for anything else. */
export function slotNo(slot: string): [string, string] {
  const m = /^\d{4}-w(\d+)-(\d+)$/.exec(slot);
  return m ? [`W${Number(m[1])}`, p2(Number(m[2]))] : ["", slot];
}

export function titleOf(row: PostRow, meta: Json): string {
  return (typeof meta.title === "string" && meta.title) || (typeof row.pillar === "string" && row.pillar) || "Untitled video";
}

/** The publisher has it, or will on its next run (queued and due). */
export function publishing(row: PostRow, now: number): boolean {
  const due = row.state === "QUEUED" && (parse(row.scheduled_at) ?? Infinity) <= now;
  return row.state === "PUBLISHING" || due;
}

export function overdue(row: PostRow, now: number): boolean {
  return (parse(row.scheduled_at) ?? -Infinity) <= now;
}

export function path(client: string, slot?: string): string {
  return `/${encodeURIComponent(client)}${slot ? `/v/${encodeURIComponent(slot)}` : ""}`;
}

// ── icons (Lucide, inline) ────────────────────────────────────────────────────
// app.py's icons, plus the two the admin pages use
const ICONS: Record<string, string> = {
  ...LOCAL_ICONS,
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  briefcase: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
};

export function icon(name: string, size = 18): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ""}</svg>`;
}

// ── page shell ────────────────────────────────────────────────────────────────
// app.py's CSS, then the phone layout of the sidebar and main (the Worker is opened on a phone;
// the local dashboard never was): below 900px only, so a desktop page is app.py's exactly
export const CSS = LOCAL_CSS + `
@media (max-width:900px){.shell{grid-template-columns:1fr}aside{position:static;height:auto;flex-direction:row;flex-wrap:wrap;align-items:center;padding:12px 16px;gap:8px}
 .brand{padding:0 8px 0 0}.proj{flex:1 1 200px}.proj summary{min-height:48px;padding:6px 12px}.foot{display:none}
 nav{flex-direction:row;overflow-x:auto;max-width:100%;flex:1 1 100%;padding:4px 0 0}nav a{padding:0 12px;white-space:nowrap;min-height:40px}
 main{padding:16px 16px 48px}.vpage{grid-template-columns:1fr}.player{position:static}.vpage .c3{grid-column:auto}
 .stats{grid-template-columns:repeat(2,1fr);row-gap:18px}.stat:nth-child(3){border-left:0;padding-left:0}
 .grid{grid-template-columns:repeat(2,1fr);gap:12px}.card{padding:20px 16px}h1{font-size:24px}.tiles{grid-template-columns:repeat(2,1fr)}}
.frame.mixing video{opacity:.2}.mixspin{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none}
/* Members and Clients (the Figma screens "members screen" and "clients screen") */
.adm .card{padding:30px;border-radius:18px;border-color:#E5E7EB}@media (max-width:900px){.adm .card{padding:20px 16px}}.adm .card>h2+*{margin-top:16px}.adm .card>.hint{margin:16px 0 0}
.adm .tw{overflow-x:auto}.adm table.full{width:100%;border-collapse:collapse;font-size:14px}.adm table.full th,.adm table.full td{text-align:left;padding:14px 12px 14px 0;vertical-align:middle;border-bottom:1px solid #DEDEDE;white-space:nowrap}.adm table.full th{padding-top:8px;padding-bottom:8px;color:var(--ink3);font-weight:500;font-size:12.5px}.adm table.full :is(th,td):last-child{padding-right:0}.adm table.full .act{text-align:right}.adm table.full .muted{color:var(--ink3)}
.adm table.cli td{padding-top:16px;padding-bottom:16px}.adm table.cli td:first-child{font-weight:500}.adm table.cli th:nth-child(1){width:420px}.adm table.cli th:nth-child(2){width:300px}.adm table.cli th:nth-child(3){width:420px}.adm table.cli th:nth-child(5){width:300px}.adm table.cli th:nth-child(6){width:240px}.adm table.cli a.tag:hover{filter:brightness(.96)}
.adm table.mem th:nth-child(1){width:520px}.adm table.mem th:nth-child(2),.adm table.mem th:nth-child(3){width:260px}.adm table.mem th:nth-child(5){width:140px}
.adm .em{display:inline-block;padding:12px 16px;font-size:18px;line-height:22px;vertical-align:middle}.adm .em+.tag{margin-left:8px;vertical-align:middle}
.adm input[type=text],.adm input[type=email]{height:48px;padding:12px 16px;border:1px solid rgba(0,0,0,.1);border-radius:12px;box-shadow:0 0 2px rgba(0,0,0,.25);background:#fff;color:var(--ink);font:inherit;font-size:18px;line-height:22px;max-width:100%}.adm input::placeholder{color:rgba(17,17,17,.7)}.adm input.w567{width:567px}.adm input.w280{width:280px}.adm input[type=text]:focus,.adm input[type=email]:focus{outline:none;border-color:var(--ink)}
.adm .chk{font-size:14px;color:#4A4A4A}.adm .chk input{appearance:none;-webkit-appearance:none;margin:0;width:16px;height:16px;border:1.5px solid #9CA3AF;border-radius:4px;background:#fff;cursor:pointer}.adm .chk input:checked{background:#111 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23fff' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E") no-repeat center;border-color:#111}.adm .chk input:focus-visible{outline:2px solid var(--lime);outline-offset:2px}
.adm form.btns{align-items:center;gap:12px}.adm form.btns .btn{height:40px;padding:0 16px;border-radius:10px;font-size:14.5px}
.adm .clis{display:inline-flex;align-items:center;gap:8px;vertical-align:middle}.adm td form{margin:0;display:inline-flex}
.adm .chip,.adm .rm{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 12px 0 14px;border:1px solid rgba(0,0,0,.1);border-radius:10px;background:#fff;box-shadow:0 0 2px rgba(0,0,0,.25);color:#111;font:inherit;font-size:14px}.adm .chip i{width:6px;height:6px;border-radius:50%;background:var(--blue)}.adm .chip button{all:unset;display:grid;place-items:center;cursor:pointer;border-radius:4px}.adm .chip button:focus-visible{outline:2px solid var(--lime)}.adm .rm{cursor:pointer}.adm .rm.red{color:#C62828;border-color:rgba(34,34,34,.1)}.adm .rm:hover,.adm .chip:hover{border-color:rgba(0,0,0,.25)}
.adm select.dd{appearance:none;-webkit-appearance:none;width:54px;height:36px;padding:0 12px 0 14px;border:0;border-radius:10px;background:#222;color:#fff;font:inherit;font-size:14px;cursor:pointer}.adm select.dd:hover{background:#2A2A2A}.adm select.dd:focus-visible{outline:2px solid var(--lime);outline-offset:2px}
/* a new client's setup (the Figma screens "new client · 1-4"; src/pages/setup.ts) */
.banner.ok{background:var(--lime-bg);color:var(--lime-ink);margin-bottom:20px}.banner.ok span{flex:1;font-weight:400}.banner.ok b{display:block;font-weight:600}
.setup h1+.sub{margin-bottom:20px}.setup .card+.card,.setup .card+.btns,.setup .card+form{margin-top:20px}.setup .card>h2+*{margin-top:16px}
.steps{display:flex;flex-wrap:wrap;align-items:center;gap:12px;list-style:none;margin:0 0 20px;padding:0;font-size:14px;font-weight:500;color:#9CA3AF}.steps li{display:flex;align-items:center;gap:8px}.steps li+li:before{content:"";width:48px;height:1px;background:#DEDEDE;margin-right:4px}
.steps i{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-size:13px;border:1px solid #DEDEDE;background:#fff}.steps .done{color:var(--ink)}.steps .done i{background:var(--ink);border-color:var(--ink);color:#fff}.steps .now{color:var(--ink);font-weight:600}.steps .now i{background:var(--lime);border-color:var(--lime);color:var(--ink);font-weight:700}
.setup .cols{display:grid;grid-template-columns:minmax(0,1fr) 560px;gap:20px;align-items:start;margin:0}@media (max-width:1300px){.setup .cols{grid-template-columns:1fr}}
.setup .fl,.setup .q,.setup .drop{display:flex}.setup .fl{flex-direction:column;gap:6px;margin-top:16px;font-size:12.5px;font-weight:500}.setup input.w520{width:520px}.setup textarea{font-size:14.5px;line-height:22px;min-height:88px;border-color:#E8E8E8;border-radius:10px;padding:12px 14px}
.setup .addsrc{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:16px}.setup .addsrc input{flex:1 1 220px;min-width:0}.setup select.dd{width:auto;height:48px;padding:0 16px}.setup .addsrc .btn{height:48px}
.setup table.src{table-layout:fixed}.setup table.src td:first-child{font-weight:500}.setup table.src th:first-child{width:140px}.setup table.src th:nth-child(4){width:120px}.setup table.src td:nth-child(2){white-space:normal;word-break:break-all}.setup table.src td:nth-child(3){white-space:normal}
.setup .drop{position:relative;flex-direction:row;justify-content:center;align-items:center;gap:6px;margin-top:16px;padding:22px;border:1.5px dashed #D4D4D4;border-radius:10px;font-size:12.5px;color:var(--ink3);cursor:pointer}.setup .drop:hover{border-color:var(--ink3)}.setup .drop input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.setup .btns{align-items:center}.setup .btns .hint{margin:0}
.setup .conn,.setup .next,.setup .stages{list-style:none;margin:16px 0 0;padding:0}.setup .conn li,.setup .next li{display:flex;gap:10px;align-items:center;margin-top:12px;font-size:14px;line-height:22px}.setup .next li{align-items:flex-start}
.setup .conn b,.setup .conn small{display:block}.setup .conn small{color:var(--ink3);font-size:13px}.setup .cd,.setup .next i,.setup .stages>li>i{flex:none;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;border:1px solid #DEDEDE;background:#fff;font-style:normal;font-size:12px;color:#9CA3AF}.setup .cd.ok{background:var(--ink);border-color:var(--ink);color:#fff}
.lbar{height:6px;background:var(--grey-bg);border-radius:6px;overflow:hidden}.lbar i{display:block;height:100%;background:var(--lime);border-radius:6px;transition:width .2s}
.setup .nowl{display:flex;align-items:center;gap:10px;margin:16px 0 0;font-size:14px}.setup .stages{margin-top:8px}
.setup .stages>li{display:flex;align-items:center;gap:14px;padding:14px 0;border-bottom:1px solid #DEDEDE;color:#9CA3AF}.setup .stages>li>i{width:24px;height:24px}.setup .stages span{flex:1;min-width:0}.setup .stages span b{display:block;font-weight:500;font-size:14px}.setup .stages small{font-size:13px}.setup .stages em{font-style:normal;font-size:13px;white-space:nowrap}
.setup .stages .done,.setup .stages .now{color:var(--ink3)}.setup .stages .done span b,.setup .stages .now span b{color:var(--ink)}.setup .stages .now span b{font-weight:600}.setup .stages .now em{color:var(--ink);font-weight:500}.setup .stages .done>i{background:var(--ink);border-color:var(--ink);color:#fff}.setup .stages .now>i{background:var(--lime);border-color:var(--lime);color:var(--ink)}
.setup .stages em.upok{margin:0;font-size:14px}.setup .stages .spin{width:12px;height:12px}
.setup .log{margin-top:16px;background:var(--ground);border-radius:12px;padding:14px 16px;font-size:12.5px;line-height:19px;color:var(--ink2);max-height:420px;overflow:auto}.setup .log p{margin:0 0 6px;display:flex;gap:12px}.setup .log p:first-child{color:var(--ink);font-weight:500}.setup .log time{color:#9CA3AF;font-weight:400;flex:none}
.setup .fhead{display:flex;flex-wrap:wrap;align-items:center;gap:20px}.setup .fhead>div:first-child{flex:1;min-width:240px}.setup .fhead .hint{margin:6px 0 0}.setup .fhead .btns{margin:0}.setup .fhead .btn{height:40px;padding:0 16px;border-radius:10px;font-size:14.5px}
.setup .oneline{margin-top:24px;background:var(--ink);color:#fff;border-radius:12px;padding:20px 24px}.setup .oneline small{color:#A3A3A3;font-size:12.5px;font-weight:500}.setup .oneline p{margin:6px 0 0;font-size:20px;line-height:28px;font-weight:600}
.setup .sum{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:16px}@media (max-width:1100px){.setup .sum{grid-template-columns:1fr}}.setup .tile{background:var(--ground);border-radius:12px;padding:22px 24px}.setup .tile b{font-size:15px;font-weight:600}.setup .tile .row a{font-size:13px;font-weight:500;color:var(--ink3)}
.setup .tile ul,.setup .doc ul{list-style:none;margin:0;padding:0}.setup .tile li,.setup .doc li{position:relative;padding-left:15px;margin-top:12px;font-size:14.5px;line-height:22px}.setup .tile li:before,.setup .doc li:before{content:"";position:absolute;left:0;top:9px;width:5px;height:5px;border-radius:50%;background:var(--lime)}
.setup .q{flex-direction:row;align-items:center;gap:20px;margin-top:16px;font-size:14.5px;font-weight:500;color:var(--ink)}.setup .q span{flex:1}.setup .q input{width:min(640px,50%)}@media (max-width:900px){.setup .q{flex-direction:column;align-items:stretch}.setup .q input{width:100%}}
.setup .doc{display:grid;grid-template-columns:300px minmax(0,1040px);gap:48px;margin-top:24px;align-items:start}@media (max-width:1100px){.setup .doc{grid-template-columns:1fr;gap:20px}}.setup .toc{display:flex;flex-direction:column;gap:4px;position:sticky;top:20px}.setup .toc small{font-size:12.5px;font-weight:500;color:var(--ink3)}.setup .toc a{padding:9px 12px;border-radius:8px;font-size:14px;color:var(--ink2)}.setup .toc a:hover{background:#F3F3F3;color:var(--ink)}
.setup .doc h3{font-size:20px;line-height:26px;margin:32px 0 12px;scroll-margin-top:20px}.setup .doc h3:first-child{margin-top:0}.setup .doc p{margin:0 0 12px;font-size:15px;line-height:25px}.setup .doc p.src{margin:0 0 4px;font-size:13px;line-height:19px;color:var(--ink3);word-break:break-all}.setup .doc ul{margin-bottom:12px}.setup .doc li{font-size:15px;line-height:25px}.setup .doc li:before{top:10px}
.accts{list-style:none;margin:14px 0 0;padding:0}.accts li{display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid var(--rule)}.accts li:first-child{border-top:0}
.accts li>span{flex:1;min-width:0}.accts b,.accts small{display:block}.accts small{color:var(--ink3);font-size:13px}.accts .btns{margin:0}.acctpage form{margin:0}.acctpage .card>.btns{margin-top:14px}
aside a.me{margin-top:auto;display:flex;align-items:center;gap:10px;padding:10px 12px;background:#222;border-radius:10px;color:#fff;font-weight:600;font-size:14px;min-width:0}aside a.me:hover,aside a.me.on{background:#2A2A2A}aside a.me span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}aside a.me .av{width:28px;height:28px;border-radius:50%;font-size:13px}
@media (max-width:900px){aside a.me{margin-top:0}}
.mixspin i{width:56px;height:56px;border:5px solid var(--lime);border-top-color:transparent;border-radius:50%;animation:spin .8s linear infinite}`;

// the times in the browser's zone in app.py's formats: when() "%a %-d %b, %H:%M", a slot time "%H:%M"
// the custom-time form's local value and the offset it posts back; the browser's zone in the `tz`
// cookie for the calendar's grid (one reload if it was laid out in another)
const TIME_JS = `(()=>{const p=n=>String(n).padStart(2,'0'),D=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
for(const t of document.querySelectorAll('time[datetime]')){const d=new Date(t.dateTime),hm=p(d.getHours())+':'+p(d.getMinutes());t.textContent=t.dataset.fmt==='time'?hm:D[d.getDay()]+' '+d.getDate()+' '+M[d.getMonth()]+', '+hm;}
for(const i of document.querySelectorAll('input[type=datetime-local][data-utc]')){const d=new Date(i.dataset.utc);i.value=d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes());}
for(const i of document.querySelectorAll('input[name=tz]'))i.value=new Date().getTimezoneOffset();
try{const z=Intl.DateTimeFormat().resolvedOptions().timeZone;if(z){document.cookie='tz='+encodeURIComponent(z)+';path=/;max-age=31536000;samesite=lax';const c=document.querySelector('[data-zone]');if(c&&c.dataset.zone!==z&&sessionStorage.tzr!==z){sessionStorage.tzr=z;location.reload();}}}catch(e){}})();`;

const NAV: [string, string, string, string][] = [["overview", "", "grid", "Overview"], ["calendar", "/calendar", "cal", "Calendar"], ["insights", "/insights", "chart", "Insights"], ["settings", "/settings", "sliders", "Settings"]];

export function display(client: ClientInfo): { name: string; handle: string | null; stop: boolean } {
  const g = client.grants;
  return {
    name: (typeof g.display_name === "string" && g.display_name) || client.name || client.id,
    handle: client.ig_username || (typeof g.ig_username === "string" ? g.ig_username : null),
    stop: Boolean(client.emergency_stop),
  };
}

/** app.py's avatar: the client's icon (GET /static/avatar/<id>.png answers its first letter when none was sent up). */
function avatar(id: string): string {
  return `<img class=av src='/static/avatar/${encodeURIComponent(id)}.png' alt=''>`;
}

export function shell(p: Page, active: string, body: string, title: string, refresh: number | null = null): Response {
  const d = display(p.client);
  const base = path(p.client.id);
  const others = p.nav.map((c) => `<li><a href='${path(c.id)}'>${avatar(c.id)}${esc(c.name)}</a></li>`).join("");
  const nav = NAV.map(([key, href, ic, label]) => `<a href='${base}${href}' class='${key === active ? "on" : ""}'>${icon(ic)}${label}</a>`).join("");
  // the signed-in user at the bottom (the Figma): their Google picture, else their first letter
  const me = p.user.picture ? `<img class=av src='${esc(p.user.picture)}' alt='' referrerpolicy=no-referrer>` : `<span class=av>${esc((p.user.name?.trim() || p.user.email).slice(0, 1).toUpperCase())}</span>`;
  const html = `<!doctype html><html lang=en><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>
<link rel=manifest href=/manifest.webmanifest>
<meta name=theme-color content='#111'>
${refresh ? `<meta http-equiv=refresh content=${refresh}>` : ""}<title>${esc(title)} · ${esc(d.name)} · Tachyon</title><link rel=icon href='/static/icon.svg'><style>${CSS}</style>
<div class=shell><aside><a class=brand href='/app'><img src='/static/logo.svg' alt='Tachyon'></a>
<details class=proj><summary>${avatar(p.client.id)}<span><b>${esc(d.name)}</b>${d.handle ? `<small>@${esc(d.handle)}</small>` : ""}</span><span class=chev>${icon("chev", 16)}</span></summary><ul>${others}</ul></details>
<nav>${nav}</nav><a class='me${active === "account" ? " on" : ""}' href='/account' title='Your account'>${me}<span>${esc(p.user.name?.trim() || p.user.email.split("@")[0]!)}</span></a></aside><main>${body}</main></div>
<div class=pvm id=pvm hidden><div class=pvbox><video controls playsinline></video><div class=pvbar><a class='btn sec small' id=pvopen href='#'>Open the video page</a><button class='btn dark small' id=pvx>Close</button></div></div></div>
<script>${TIME_JS}${PV_JS}${SEG_JS}${LOCK_JS}${DTP_JS}</script></html>`;
  return page(html, 200);
}

export function page(html: string, status: number): Response {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; img-src 'self' https: data:; media-src 'self' https://*.fbcdn.net; style-src 'unsafe-inline'; font-src 'self'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'",
    },
  });
}

/** The title line and the banners: emergency stop, an Instagram connection missing or about to lapse. */
export function header(p: Page, title: string): string {
  const d = display(p.client);
  const bits = [`<b>${esc(d.name)}</b>`];
  if (d.handle) bits.push(`@${esc(d.handle)}`);
  if (typeof p.client.grants.tagline === "string") bits.push(esc(p.client.grants.tagline));
  let banners = d.stop ? "<div class='banner stop'>Emergency stop is on. Nothing publishes until it is turned off in Settings.</div>" : "";
  const connect = `<a href='/connect/${encodeURIComponent(p.client.id)}'>Connect Instagram</a>`;
  if (!p.client.connected) banners += `<div class=banner>Not connected to Instagram: nothing publishes. ${connect}.</div>`;
  else if (p.client.token_expires && p.client.token_expires - p.now <= 14 * 24 * 3600_000) {
    banners += `<div class=banner>Meta data access ends ${when(new Date(p.client.token_expires).toISOString())}. ${connect} again before then.</div>`;
  }
  return `${banners}<h1>${esc(title)}</h1><p class=sub>${bits.join(" · ")}</p>`;
}

/** A small page for a refused action: the message and a way back (app.py sent text/plain). */
export function errorPage(status: number, message: string, back: string): Response {
  return page(
    `<!doctype html><html lang=en><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Tachyon</title><style>${CSS}</style>
<main style='max-width:40rem;margin:3rem auto'><section class=card><h2>${status >= 500 ? "Something broke" : "Not done"}</h2><p>${esc(message)}</p><a class='btn sec' href='${esc(back)}'>${icon("back", 16)}Back</a></section></main></html>`,
    status,
  );
}

export function redirect(to: string): Response {
  return new Response(null, { status: 303, headers: { Location: to } });
}

/** A job's result column: the text of a failure, or the JSON a done job reported. */
export function jobResult(j: JobRow): string {
  try {
    const v: unknown = JSON.parse(j.result ?? "null");
    return v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    return j.result ?? "";
  }
}

/** One line on a job where app.py read revise.json / formats.json: kind, state, host, when, the error. */
export function jobLine(j: JobRow, now: number): string {
  const at = ago(new Date(j.updated_at).toISOString(), now);
  const host = j.holder ? ` on ${esc(j.holder)}` : "";
  const what = ({ queued: "waiting for a PC with the files", running: `running${host}`, done: `done${host}`, failed: `failed${host}` } as Record<string, string>)[j.state] ?? esc(j.state);
  const err = j.state === "failed" ? ` — ${esc(jobResult(j).slice(0, 300))}` : "";
  return `${esc(j.kind)}: ${what}, ${at}${err}`;
}

/** The PCs registered for this client and when they last polled. */
export async function hostsLine(db: D1Database, client: string, now: number): Promise<string> {
  const rows = (await db.prepare("SELECT name, last_seen FROM hosts WHERE clients LIKE ? ORDER BY last_seen DESC").bind(`%${JSON.stringify(client)}%`).all<{ name: string; last_seen: number }>()).results;
  if (!rows.length) return `No PC has registered with ${esc(client)}'s files yet.`;
  return "PCs: " + rows.map((h) => `${esc(h.name)} (seen ${ago(new Date(h.last_seen).toISOString(), now)})`).join(", ");
}

/** The newest ig_media snapshot of a slot: [metrics, collected_at]. */
export async function mediaLatest(c: Ctx, slot: string): Promise<[Json | null, string | null]> {
  const r = await c.env.DB.prepare("SELECT metrics, collected_at FROM metric_snapshots WHERE client = ? AND post_id = ? AND source = 'ig_media' ORDER BY collected_at DESC LIMIT 1")
    .bind(c.client, slot)
    .first<{ metrics: string; collected_at: string }>();
  return r ? [parseJson(r.metrics), r.collected_at] : [null, null];
}
