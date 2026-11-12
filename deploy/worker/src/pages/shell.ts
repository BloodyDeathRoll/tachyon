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
.mixspin i{width:56px;height:56px;border:5px solid var(--lime);border-top-color:transparent;border-radius:50%;animation:spin .8s linear infinite}`;

// the times in the browser's zone; the custom-time form's local value and the offset it posts back
// the browser's zone in the `tz` cookie, for the calendar's grid (one reload if it was laid out in another)
// the browser's zone in app.py's formats: when() "%a %-d %b, %H:%M", a slot time "%H:%M"
const TIME_JS = `(()=>{const p=n=>String(n).padStart(2,'0'),D=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
for(const t of document.querySelectorAll('time[datetime]')){const d=new Date(t.dateTime),hm=p(d.getHours())+':'+p(d.getMinutes());t.textContent=t.dataset.fmt==='time'?hm:D[d.getDay()]+' '+d.getDate()+' '+M[d.getMonth()]+', '+hm;}
for(const i of document.querySelectorAll('input[type=datetime-local][data-utc]')){const d=new Date(i.dataset.utc);i.value=d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes());}
for(const i of document.querySelectorAll('input[name=tz]'))i.value=new Date().getTimezoneOffset();
try{const z=Intl.DateTimeFormat().resolvedOptions().timeZone;if(z){document.cookie='tz='+encodeURIComponent(z)+';path=/;max-age=31536000;samesite=lax';const c=document.querySelector('[data-zone]');if(c&&c.dataset.zone!==z&&!sessionStorage.tzr){sessionStorage.tzr=1;location.reload();}}}catch(e){}})();`;

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
  const adminNav = p.user.admin ? [["members", "users", "Members"], ["clients", "briefcase", "Clients"]].map(([key, ic, label]) => `<a href='/admin/${key}' class='${key === active ? "on" : ""}'>${icon(ic!)}${label}</a>`).join("") : "";
  const status = d.stop ? "<span class='dot off'></span>Emergency stop is on" : "<span class=dot></span>Running";
  const html = `<!doctype html><html lang=en><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>
<link rel=manifest href=/manifest.webmanifest>
<meta name=theme-color content='#111'>
${refresh ? `<meta http-equiv=refresh content=${refresh}>` : ""}<title>${esc(title)} · ${esc(d.name)} · Tachyon</title><link rel=icon href='/static/icon.svg'><style>${CSS}</style>
<div class=shell><aside><a class=brand href='/app'><img src='/static/logo.svg' alt='Tachyon'></a>
<details class=proj><summary>${avatar(p.client.id)}<span><b>${esc(d.name)}</b>${d.handle ? `<small>@${esc(d.handle)}</small>` : ""}</span><span class=chev>${icon("chev", 16)}</span></summary><ul>${others}</ul></details>
<nav>${nav}${adminNav}</nav><div class=foot>${status}</div></aside><main>${body}</main></div>
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
