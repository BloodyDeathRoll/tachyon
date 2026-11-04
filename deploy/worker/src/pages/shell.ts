// The dashboard's page shell (spine/review/app.py, port): the sidebar with the client
// switcher and the nav, the CSS, the icons and the formatting helpers the pages share.
// Times: the rows carry UTC ISO stamps; a page renders them as <time datetime> with a UTC
// fallback text and one inline script formats them in the browser's zone (the Python used
// the machine's zone). Left out from app.py: the Inter font and the logo files (not served
// here: system-ui and a wordmark), the preview popup, the segmented-control animation, the
// scroll keeper and the date picker (all client-side polish that needs more script).

import type { Ctx, PostRow } from "../db.ts";
import type { JobRow } from "../jobs.ts";
import type { UserRow } from "../members.ts";

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
const ICONS: Record<string, string> = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  sliders: '<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  ext: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  redo: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  cal: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  edit: '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.4 2.6a1 1 0 0 1 3 3l-9 9a2 2 0 0 1-.85.5l-2.87.84a.5.5 0 0 1-.62-.62l.84-2.87a2 2 0 0 1 .5-.85z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  timer: '<line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/>',
  chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M7 16V9"/><path d="M12 16V5"/><path d="M17 16v-5"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  download: '<path d="M12 15V3"/><path d="m7 10 5 5 5-5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  briefcase: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
};

export function icon(name: string, size = 18): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ""}</svg>`;
}

// ── page shell ────────────────────────────────────────────────────────────────
const CSS = `
:root{--ground:#F8F8F8;--card:#fff;--ink:#111;--ink2:#4A4A4A;--ink3:#6B6B6B;--rule:#E8E8E8;--side:#111;--sideink:#888;
--lime:#8DF000;--lime-h:#7ED800;--lime-bg:#F2FCE0;--lime-ink:#3D6B00;--green:#22C55E;--amber:#E0A100;--blue:#3B82F6;--grey-bg:#EFEFEF;--r:16px}
*{box-sizing:border-box;min-width:0}
html,body{margin:0;background:var(--ground);color:var(--ink);font:15px/1.5 system-ui,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
button,textarea,input,select{font:inherit}
img,video{max-width:100%}
.shell{display:grid;grid-template-columns:240px minmax(0,1fr);min-height:100vh}
aside{background:var(--side);color:#fff;padding:20px 16px;display:flex;flex-direction:column;gap:12px;position:sticky;top:0;height:100vh}
.brand{display:block;padding:8px 16px 16px;font-weight:800;font-size:18px;letter-spacing:-.02em}
.proj{position:relative}
.proj summary{list-style:none;display:flex;align-items:center;gap:10px;padding:12px 16px;background:#222;border-radius:10px;cursor:pointer;min-height:56px}
.proj summary::-webkit-details-marker{display:none}
.av{width:36px;height:36px;border-radius:50%;background:var(--lime);color:var(--ink);display:grid;place-items:center;font-weight:700;flex:none}
.proj b{display:block;font-size:14px;font-weight:600;color:#fff}.proj small{color:var(--sideink);font-size:12px}
.proj .chev{margin-left:auto;color:var(--sideink)}
.proj ul{position:absolute;left:0;right:0;top:calc(100% + 6px);background:#222;border-radius:10px;list-style:none;margin:0;padding:6px;z-index:5}
.proj li a{display:flex;gap:10px;align-items:center;padding:8px 10px;border-radius:8px;color:#fff;min-height:40px}
.proj li a:hover{background:#2A2A2A}
nav{display:flex;flex-direction:column;gap:4px;padding:8px 0}
nav a{display:flex;align-items:center;gap:14px;min-height:44px;padding:0 16px;border-radius:8px;color:var(--sideink);font-size:14px}
nav a:hover{color:#fff;background:#1C1C1C}
nav a.on{background:#fff;color:var(--ink);font-weight:600}
.foot{margin-top:auto;font-size:12px;color:var(--sideink);padding:0 4px}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--lime);margin-right:8px;vertical-align:-1px}
.dot.off{background:#EF4444}
main{padding:18px 40px 64px;width:100%}
h1{font-size:28px;line-height:1.2;margin:0;font-weight:700;letter-spacing:-.02em}
h2{font-size:19px;margin:0;font-weight:700;letter-spacing:-.01em}
.hno{font-size:16px;font-weight:400;color:#999;margin-left:12px}
.sub{color:var(--ink3);margin:8px 0 26px;font-size:14px}.sub b{color:var(--ink);font-weight:600}
.sub .tag.sched{background:#e8f5e9;color:#2e7d32;font-weight:500}.sub .tag.sched:before{background:#2e7d32}
.card{background:var(--card);border-radius:18px;border:1px solid #e5e7eb;padding:28px 24px}
.row{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.muted{color:var(--ink3)}
.hint{color:var(--ink3);font-size:13px;margin-top:10px}
.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin:16px 0 0}
.stat{padding:0 14px;border-left:1px solid var(--rule);text-align:center}.stat:first-child{padding-left:0;border-left:0}
.stat span{display:block;color:var(--ink3);font-size:13px}
.stat strong{display:block;font-size:32px;font-weight:800;letter-spacing:-.03em;line-height:1.2}
.stat small{color:var(--ink3);font-size:12px}
.recsline{margin:16px 0 0;font-size:12.5px;color:#11111173;text-align:center}.recsline a{color:var(--ink);font-weight:600;text-decoration:underline}
.ovgrid{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,460px);gap:28px;align-items:start}
.side{display:grid;gap:20px}
.maincol .perf{margin-bottom:28px}
.vhead{margin:0 0 16px}
.seg{display:inline-flex;background:var(--grey-bg);border-radius:999px;padding:3px;flex-wrap:wrap}
.seg a{padding:8px 14px;border-radius:999px;font-size:13.5px;font-weight:600;color:var(--ink3);min-height:36px;display:inline-flex;align-items:center;gap:6px}
.seg a.on{background:#2d2d2d;color:#fff}
.seg a i{font-style:normal;font-size:11.5px;background:#E2E2E2;color:var(--ink2);border-radius:999px;padding:0 6px;min-width:18px;text-align:center}
.seg a.on i{background:var(--lime);color:var(--ink)}
.tdo{font-size:14px;font-weight:600;color:var(--ink3);margin-left:6px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:20px}
.vid{display:block}
.thumb{position:relative;aspect-ratio:1/1;border-radius:16px;overflow:hidden;background:#111}
.thumb img{width:100%;height:100%;object-fit:cover;object-position:50% 30%;display:block}
.thumb:after{content:"";position:absolute;inset:70% 0 0;background:linear-gradient(transparent,rgba(0,0,0,.78));pointer-events:none}
.thumb .tag,.thumb .stw{position:absolute;left:12px;bottom:12px;z-index:1}
.stw{width:26px;height:26px;border-radius:50%;background:#000;color:var(--blue);display:grid;place-items:center}
.no{position:absolute;left:10px;top:10px;z-index:2;font:700 11.5px system-ui;color:#fff;background:rgba(0,0,0,.55);padding:3px 8px;border-radius:7px}
.vid h3{font-size:15px;margin:10px 2px 0;font-weight:600}
.vid p{margin:1px 2px 0;color:var(--ink3);font-size:13px}
.tag{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;background:#000;color:#fff;white-space:nowrap}
.tag:before{content:"";width:6px;height:6px;border-radius:50%;background:#fff}
.tag.need{background:var(--lime);color:var(--ink);font-weight:700}.tag.need:before{display:none}
.tag.sched{background:#fff;color:var(--ink)}.tag.sched:before{background:var(--blue)}
.tag.live:before{background:var(--lime)}
.tag.gone:before{background:#E5484D}
.tag.busy{background:rgba(0,0,0,.6)}.tag.busy:before{background:var(--amber)}
.tag.gen{background:#FEF3C7;color:#92400E}.tag.gen:before{display:none}
.empty{border:1.5px dashed var(--rule);border-radius:16px;display:grid;place-items:center;text-align:center;color:var(--ink3);padding:40px 20px;font-size:14px}
.back{display:inline-flex;align-items:center;gap:8px;color:var(--ink3);font-weight:500;margin:0 0 24px;min-height:40px}
.vpage{display:grid;grid-template-columns:minmax(260px,400px) minmax(0,1fr) minmax(0,1fr);gap:24px;align-items:start}
.player{position:sticky;top:24px}
.frame{border-radius:14px;overflow:hidden;background:#000}
.frame video,.frame img{width:100%;aspect-ratio:9/16;display:block;object-fit:cover}
.pctl{display:flex;gap:12px;align-items:center;justify-content:space-between;margin-top:16px;flex-wrap:wrap}
.stack{display:flex;flex-direction:column;gap:24px}
textarea{width:100%;min-height:110px;border:1px solid var(--rule);border-radius:12px;padding:14px 16px;resize:vertical;color:var(--ink);background:#fff;font-size:15px}
textarea:focus,input:focus{outline:none;border-color:var(--ink);box-shadow:0 0 0 3px rgba(0,0,0,.06)}
input[type=datetime-local],input[type=text]{border:1px solid #d1d5db;border-radius:9px;padding:10px 12px;font:inherit;min-height:40px}
.btns{display:flex;gap:12px;flex-wrap:wrap;margin-top:16px;align-items:center}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;border:1px solid transparent;border-radius:9px;padding:9px 15px;min-height:40px;font-size:15px;font-weight:500;cursor:pointer;background:#fff;color:#374151}
.btn.pri{background:var(--lime);color:#111827;font-weight:700}.btn.pri:hover{background:var(--lime-h)}
.btn.sec{border-color:#d1d5db}.btn.sec:hover{border-color:#9ca3af}
.btn.dark{background:var(--ink);color:#fff}
.btn.danger{background:#d92d20;color:#fff}
.btn.plain{background:none}.btn.plain:hover{background:#f3f4f6}
.btn:disabled{opacity:.6;cursor:default}
.btn.ico{padding:0;width:44px;height:44px}
.btn.small{padding:7px 12px;font-size:13.5px}
.linkbtn{background:none;border:0;padding:0;cursor:pointer;color:inherit;font:inherit;font-weight:600;text-decoration:underline}
summary{list-style:none;cursor:pointer}summary::-webkit-details-marker{display:none}
details.pop>summary{display:inline-flex}
details.pop[open]>summary{display:none}
details.pop .box{margin-top:16px;border:1px solid var(--rule);border-radius:14px;padding:20px}
details.pop .box h2{margin-bottom:8px}
.crow{display:flex;gap:14px;align-items:center;margin-top:16px;flex-wrap:wrap}
.crow p{flex:1;min-width:0;margin:0;color:#333}
.crow p.clamp{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
details.capedit[open]>summary{display:none}
.capfull{white-space:pre-line;color:var(--ink2);margin-top:12px}
.whenl{display:grid;grid-template-columns:1fr auto;align-items:center;gap:8px 16px;flex:1 1 100%}
.whenl>.wl,.whenl>.wm{grid-column:1/-1}.whenl>form{margin:0;grid-column:2}
.whenl .wl{font-size:15px;color:#9ca3af}
.whenl .big{font-size:22px;line-height:1.3;font-weight:700;color:#111827;margin:0}
.whenl .wm{font-size:15px;color:#6b7280}
.whentools{margin:0;gap:12px}
.rblock{margin-top:20px;border-top:1px solid #e5e7eb;padding-top:18px}
.rrow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0}
.rrow b{display:block;font-size:16px;font-weight:700;color:#111827}.rrow small{display:block;margin-top:4px;font-size:14px;color:#9ca3af}
.rrow.inh .toggle{opacity:.45;cursor:not-allowed}
.toggle{width:48px;height:28px;border-radius:14px;border:0;background:#D4D4D4;position:relative;cursor:pointer;flex:none;padding:0}
.toggle i{position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:left .15s}
.toggle.on{background:var(--lime)}.toggle.on i{left:23px}
.tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:var(--rule);border-radius:12px;overflow:hidden;margin-top:16px;border:1px solid var(--rule)}
.tiles div{background:#fff;padding:14px 16px}
.tiles span{display:block;font-size:13px;color:var(--ink3)}
.tiles strong{display:block;font-size:22px;font-weight:800;letter-spacing:-.02em;margin-top:2px}
.links{display:flex;gap:16px;flex-wrap:wrap;justify-content:flex-end;align-items:center;font-size:14px;font-weight:600}
.banner{display:flex;gap:12px;align-items:center;padding:14px 18px;border-radius:12px;background:#FFF4D6;color:#8A4B00;font-weight:600;margin-bottom:24px}
.banner a{text-decoration:underline}
.banner.stop{background:#EF4444;color:#fff}
.errcard{border-color:#f0b4b4}.errcard h2{color:#b42318}
pre.errlog{background:var(--ground);border-radius:12px;padding:14px 16px;margin:14px 0 16px;font-size:12.5px;line-height:1.5;white-space:pre-wrap;word-break:break-all;max-height:220px;overflow:auto;color:var(--ink2)}
.note{background:var(--ground);border-radius:12px;padding:14px 16px;margin-top:14px;white-space:pre-line;color:var(--ink2)}
.prog{height:6px;background:var(--grey-bg);border-radius:6px;overflow:hidden;margin-top:16px}
.prog i{display:block;height:100%;background:var(--lime);border-radius:6px;animation:pg 1.6s ease-in-out infinite;width:40%}
@keyframes pg{0%{margin-left:-40%}100%{margin-left:100%}}
pre{white-space:pre-wrap;font:13px/1.55 ui-monospace,monospace;color:var(--ink2);margin:0}
.big{font-size:16px;font-weight:600;margin:0}
.times{display:flex;flex-direction:column;gap:8px;margin:14px 0 0}
.tfield{display:flex;align-items:center;gap:10px}.tfield span{font-size:13px;color:var(--ink3);width:52px;flex:none}.tfield b{font-size:17px}
.autorow{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px;font-size:12px;color:var(--ink2)}
.chk{display:inline-flex;align-items:center;gap:8px;font-size:13.5px;color:var(--ink2);cursor:pointer;min-height:40px}
.chk input{accent-color:var(--ink);width:18px;height:18px}
.engines{border:0;margin:0 0 12px;padding:0;display:flex;flex-wrap:wrap;gap:4px 18px}.engines legend{font-size:13.5px;font-weight:600;padding:0;margin-bottom:4px}
.jobs{width:100%;border-collapse:collapse;font-size:13.5px;margin-top:12px}
.jobs td{padding:8px 0;border-top:1px solid var(--rule);vertical-align:top}.jobs td:first-child{font-weight:600;white-space:nowrap;padding-right:12px}
.cand{display:flex;gap:14px;align-items:center;padding:12px 0;border-top:1px solid var(--rule)}
.cand img{width:54px;height:96px;object-fit:cover;border-radius:8px;flex:none}
.cand .t{flex:1;min-width:0}.cand .t div{color:var(--ink3);font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.upok{display:flex;align-items:center;gap:8px;margin:14px 0 0;color:#2e7d32;font-weight:600;font-size:14px}
.dnum{font-size:inherit;font-weight:400}
.drops{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:6px;max-height:320px;overflow:auto}
.drops a{font-weight:600}
.lnk{font-weight:600;text-decoration:underline;text-underline-offset:3px}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
@media (max-width:1400px){.vpage{grid-template-columns:minmax(240px,340px) minmax(0,1fr)}.vpage .c3{grid-column:2}.vpage>.player{grid-row:span 2}}
@media (max-width:1100px){.ovgrid{grid-template-columns:1fr}}
@media (max-width:900px){.shell{grid-template-columns:1fr}aside{position:static;height:auto;flex-direction:row;flex-wrap:wrap;align-items:center;padding:12px 16px;gap:8px}
 .brand{padding:0 8px 0 0}.proj{flex:1 1 200px}.proj summary{min-height:48px;padding:6px 12px}.foot{display:none}
 nav{flex-direction:row;overflow-x:auto;max-width:100%;flex:1 1 100%;padding:4px 0 0}nav a{padding:0 12px;white-space:nowrap;min-height:40px}
 main{padding:16px 16px 48px}.vpage{grid-template-columns:1fr}.player{position:static}.vpage .c3{grid-column:auto}
 .stats{grid-template-columns:repeat(2,1fr);row-gap:18px}.stat:nth-child(3){border-left:0;padding-left:0}
 .grid{grid-template-columns:repeat(2,1fr);gap:12px}.card{padding:20px 16px}h1{font-size:24px}.tiles{grid-template-columns:repeat(2,1fr)}}
.recsline i{font-style:normal;color:#bbb;margin:0 6px}
.irow{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:14px 0;border-top:1px solid var(--rule);font-size:15px}.irow:first-of-type{margin-top:12px}.irow.head{border-top:0;padding:0 0 4px}.irow.head em{font-style:normal;font-weight:400;color:var(--ink3);font-size:12px}.irow>span{flex:1}.irow strong{display:block;font-size:16px;font-weight:600}.irow small{display:block;color:var(--ink3);font-size:14px}.irow b{font-size:17px;padding:3px 10px;border-radius:8px;border:1px solid transparent}.irow b.hi{background:rgba(141,240,0,.2);border-color:#8DF000}
.ins-cols{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;margin-top:20px}.ins-cols h3{margin:0 0 4px;font-size:16px}
.ins-list{list-style:none;margin:10px 0 0;padding:0}.ins-list li{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--rule);font-size:14.5px}.ins-list li:first-child{border-top:0}.ins-list small{display:block;color:var(--ink3);font-size:12.5px}.ins-list b{white-space:nowrap}
.ins-tab{width:100%;border-collapse:collapse;font-size:14px;margin-top:8px}.ins-tab th{color:var(--ink3);font-weight:500;text-align:right;font-size:12.5px;padding:6px 0}.ins-tab td{text-align:right;padding:9px 0;border-top:1px solid var(--rule)}.ins-tab th:first-child,.ins-tab td:first-child{text-align:left}.ins-tab .few{color:var(--ink3);font-size:12px}
.up{color:#2e7d32}.down{color:#c62828}
.perfin{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:36px;align-items:stretch}.perfin>div:first-child{display:flex;flex-direction:column}.perfin>div:first-child .stats{margin:auto 0}.perfin svg{width:100%;height:auto}.perfin h3{margin:0 0 4px;font-size:16px}
.wide{overflow-x:auto}.jobs th{text-align:left;font-weight:500;color:var(--ink3);font-size:12.5px;padding:0 12px 4px 0}.jobs td{padding-right:12px}.jobs select{font:inherit;min-height:32px}
@media (max-width:1900px){.perfin{grid-template-columns:1fr;gap:24px}}
@media (max-width:800px){.ins-cols{grid-template-columns:1fr}}
`;

// the times in the browser's zone; the custom-time form's local value and the offset it posts back
const TIME_JS = `(()=>{const o={weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'},p=n=>String(n).padStart(2,'0');
for(const t of document.querySelectorAll('time[datetime]')){const d=new Date(t.dateTime);t.textContent=t.dataset.fmt==='time'?d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):d.toLocaleString([],o);}
for(const i of document.querySelectorAll('input[type=datetime-local][data-utc]')){const d=new Date(i.dataset.utc);i.value=d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes());}
for(const i of document.querySelectorAll('input[name=tz]'))i.value=new Date().getTimezoneOffset();})();`;

const NAV: [string, string, string, string][] = [["overview", "", "grid", "Overview"], ["calendar", "/calendar", "cal", "Calendar"], ["insights", "/insights", "chart", "Insights"], ["settings", "/settings", "sliders", "Settings"]];

export function display(client: ClientInfo): { name: string; handle: string | null; stop: boolean } {
  const g = client.grants;
  return {
    name: (typeof g.display_name === "string" && g.display_name) || client.name || client.id,
    handle: client.ig_username || (typeof g.ig_username === "string" ? g.ig_username : null),
    stop: Boolean(client.emergency_stop),
  };
}

function avatar(name: string): string {
  return `<span class=av>${esc(name.slice(0, 1))}</span>`;
}

export function shell(p: Page, active: string, body: string, title: string, refresh: number | null = null): Response {
  const d = display(p.client);
  const base = path(p.client.id);
  const others = p.nav.map((c) => `<li><a href='${path(c.id)}'>${avatar(c.name)}${esc(c.name)}</a></li>`).join("");
  const nav = NAV.map(([key, href, ic, label]) => `<a href='${base}${href}' class='${key === active ? "on" : ""}'>${icon(ic)}${label}</a>`).join("");
  const adminNav = p.user.admin ? [["members", "users", "Members"], ["clients", "briefcase", "Clients"]].map(([key, ic, label]) => `<a href='/admin/${key}' class='${key === active ? "on" : ""}'>${icon(ic!)}${label}</a>`).join("") : "";
  const status = d.stop ? "<span class='dot off'></span>Emergency stop is on" : "<span class=dot></span>Running";
  const html = `<!doctype html><html lang=en><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>
<link rel=manifest href=/manifest.webmanifest>
<meta name=theme-color content='#111'>
${refresh ? `<meta http-equiv=refresh content=${refresh}>` : ""}<title>${esc(title)} · ${esc(d.name)} · Tachyon</title><style>${CSS}</style>
<div class=shell><aside><a class=brand href='/app'>Tachyon</a>
<details class=proj><summary>${avatar(d.name)}<span><b>${esc(d.name)}</b>${d.handle ? `<small>@${esc(d.handle)}</small>` : ""}</span><span class=chev>${icon("chev", 16)}</span></summary><ul>${others}</ul></details>
<nav>${nav}${adminNav}</nav><div class=foot>${status}</div></aside><main>${body}</main></div>
<script>${TIME_JS}</script></html>`;
  return page(html, 200);
}

export function page(html: string, status: number): Response {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; img-src 'self' https: data:; media-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
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
