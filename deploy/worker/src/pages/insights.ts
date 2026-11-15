// Insights (app.py render_insights and spine/review/insights.py, port): every published video
// judged on its 24 h snapshot, the groups by topic, engine and time of day with how certain a
// gap is, the three recommendations (the Overview's line too), the weeks. No LLM, no writes.
// Left out from app.py: the account refresh on render (the cron measures). The time of day
// and the week are in the client's zone (grants `timezone`, as the PC's machine zone was
// for app.py), UTC when the grants name none.

import { posts, type Ctx, type PostRow } from "../db.ts";
import { esc, header, num, parse, parseJson, path, shell, titleOf, type Json, type Page } from "./shell.ts";

/** The client's zone (grants `timezone`, an IANA name), else UTC. */
export function zoneOf(p: Page): string {
  return typeof p.client.grants.timezone === "string" && p.client.grants.timezone ? p.client.grants.timezone : "UTC";
}

export const MIN_N = 3; // PLAN §7: fewer samples than this on a side is a hint, not a result
const ITER = 2000; // shortcut: at most 2000 seeded draws per test, fewer past 30 ranks a draw (draws × ranks ≤ 60000), never the exact enumeration insights.py does up to 20000 groups; raise both if a page's CPU time allows
const OPS_PER_TEST = 60_000;
const draws = (m: number): number => Math.min(ITER, Math.ceil(OPS_PER_TEST / Math.max(1, m)));
type Key = "pillar" | "engine" | "part";
type Label = "Topic" | "How it was made" | "Time of day";
const KEY: Record<Label, Key> = { Topic: "pillar", "How it was made": "engine", "Time of day": "part" };
const PICKS: [string, Label, string][] = [["Publish in the morning", "Time of day", "Morning"], ["Publish manually", "How it was made", "instagram"], ["Show swell map", "Topic", "Swell map"]];
const MON = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

export interface Video {
  slot: string;
  title: string;
  at: number;
  local?: number; // `at` on the client's wall clock (wall()): the time of day and the week; absent, UTC
  pillar: string;
  engine: string;
  part: string;
  views: number;
  reach: number;
  skip: number | null;
  inter: number;
}
export interface Group {
  name: string;
  n: number;
  views: number;
  skip: number | null;
  vs: number | null;
}
export type Tables = Record<Label, Group[]>;

const mean = (xs: number[]): number => xs.reduce((a, x) => a + x, 0) / xs.length;

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** posts/<slot>/meta.json for every slot of the client. */
export async function metas(c: Ctx): Promise<Map<string, Json>> {
  const rows = (await c.env.DB.prepare("SELECT slot_id, text FROM post_files WHERE client = ? AND name = 'meta.json'").bind(c.client).all<{ slot_id: string; text: string }>()).results;
  return new Map(rows.map((r) => [r.slot_id, parseJson(r.text)]));
}

const FMT = new Map<string, Intl.DateTimeFormat>(); // one formatter per zone: the calendar calls wall() per cell
/** `ms` moved by `zone`'s offset at that instant: its UTC fields read as the zone's wall clock. */
export function wall(ms: number, zone: string): number {
  try {
    let f = FMT.get(zone);
    if (!f) FMT.set(zone, (f = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" })));
    const q = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return Date.UTC(+q.year!, +q.month! - 1, +q.day!, +q.hour!, +q.minute!, +q.second!) + (ms % 1000);
  } catch {
    return ms; // no such zone: UTC
  }
}

/** One Video per published post with a 24 h snapshot, oldest first (insights.py videos). `zone`: the client's (grants timezone). */
export async function videos(c: Ctx, all: PostRow[], meta: Map<string, Json>, zone = "UTC"): Promise<Video[]> {
  const rows = (await c.env.DB.prepare("SELECT post_id, metrics FROM metric_snapshots WHERE client = ? AND source = 'ig_media' AND window = '24h'").bind(c.client).all<{ post_id: string; metrics: string }>()).results;
  const snaps = new Map(rows.map((r) => [r.post_id, parseJson(r.metrics)]));
  const out: Video[] = [];
  for (const r of all) {
    const at = parse(r.published_at);
    const m = snaps.get(r.slot_id);
    if (at === null || !m) continue;
    const local = wall(at, zone);
    const hour = new Date(local).getUTCHours();
    const n = (k: string) => Number(m[k]) || 0;
    out.push({
      slot: r.slot_id, title: titleOf(r, meta.get(r.slot_id) ?? {}), at, local,
      pillar: (typeof r.pillar === "string" && r.pillar) || "No pillar", engine: (typeof r.engine === "string" && r.engine) || "Unknown",
      part: hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening",
      views: n("views"), reach: n("reach"), skip: typeof m.reels_skip_rate === "number" ? m.reels_skip_rate : null, inter: n("total_interactions"),
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** xorshift32 from a fixed seed: the same draws every render, as insights.py's Random(0). */
function rng(): () => number {
  let s = 2463534242;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** 1-based ranks, ties sharing their average rank. */
function ranks(xs: number[]): number[] {
  const order = [...xs].sort((a, b) => a - b);
  const rank = new Map<number, number>();
  for (let i = 0; i < order.length; i++) {
    let j = i;
    while (order[j + 1] === order[i]) j++;
    rank.set(order[i]!, (i + j) / 2 + 1);
    i = j;
  }
  return xs.map((x) => rank.get(x)!);
}

/** How sure we are that a group gets more (lower: fewer) views than the other videos, 0-99 %:
    a permutation test on ranks, times the number of groups compared (the more we look, the
    more luck we find). Seeded Monte Carlo (insights.py certainty); a group past half the
    videos is drawn as its complement, so a draw never takes more than n/2 ranks. */
export function certainty(vs: Video[], key: Key, name: string, groupsTested: number, lower = false): number | null {
  const rank = ranks(vs.map((v) => v.views));
  const inn = vs.flatMap((v, i) => (v[key] === name ? [i] : []));
  const k = inn.length;
  const n = vs.length;
  if (!(k > 0 && k < n)) return null;
  const obs = inn.reduce((a, i) => a + rank[i]!, 0);
  const flip = k > n - k;
  const m = flip ? n - k : k;
  const total = rank.reduce((a, x) => a + x, 0);
  const iter = draws(m);
  const next = rng();
  const idx = rank.map((_, i) => i);
  let hit = 0;
  for (let t = 0; t < iter; t++) {
    let sum = 0;
    for (let j = 0; j < m; j++) { // m draws without replacement: a partial Fisher-Yates
      const r = j + Math.floor(next() * (n - j));
      [idx[j], idx[r]] = [idx[r]!, idx[j]!];
      sum += rank[idx[j]!]!;
    }
    if (flip) sum = total - sum;
    if (lower ? sum <= obs : sum >= obs) hit++;
  }
  return Math.min(99, Math.round((1 - Math.min(1, (hit / iter) * groupsTested)) * 100));
}

/** Same idea for "better videos lose fewer viewers": shuffle the skip rates. */
export function skipCertainty(vs: Video[]): number | null {
  const sk = vs.filter((v) => v.skip !== null).sort((a, b) => b.views - a.views).map((v) => v.skip!);
  if (sk.length < 2 * MIN_N) return null;
  const diff = (a: number[]) => mean(a.slice(-MIN_N)) - mean(a.slice(0, MIN_N)); // weakest minus best
  const obs = diff(sk);
  const iter = draws(sk.length);
  const next = rng();
  let hit = 0;
  for (let t = 0; t < iter; t++) {
    for (let i = sk.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [sk[i], sk[j]] = [sk[j]!, sk[i]!];
    }
    if (diff(sk) >= obs) hit++;
  }
  return Math.min(99, Math.round((1 - hit / iter) * 100));
}

export function groups(vs: Video[], key: Key, typical: number): Group[] {
  const by = new Map<string, Video[]>();
  for (const v of vs) by.set(v[key], [...(by.get(v[key]) ?? []), v]);
  return [...by].map(([name, g]): Group => {
    const views = median(g.map((x) => x.views));
    const skips = g.flatMap((x) => (x.skip === null ? [] : [x.skip]));
    return { name, n: g.length, views, skip: skips.length ? median(skips) : null, vs: typical ? views / typical : null };
  }).sort((a, b) => b.views - a.views);
}

export function tablesOf(vs: Video[], typical: number): Tables {
  return { Topic: groups(vs, "pillar", typical), "How it was made": groups(vs, "engine", typical), "Time of day": groups(vs, "part", typical) };
}

/** "2026-W44" for the ISO week of a UTC instant. */
function isoWeek(ms: number): string {
  const d = new Date(ms);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); // Thursday decides the ISO year
  const y = d.getUTCFullYear();
  return `${y}-W${String(Math.ceil(((d.getTime() - Date.UTC(y, 0, 1)) / 86400_000 + 1) / 7)).padStart(2, "0")}`;
}

export function weeks(vs: Video[]): { week: string; n: number; views: number; total: number }[] {
  const by = new Map<string, number[]>();
  for (const v of vs) {
    const w = isoWeek(v.local ?? v.at);
    by.set(w, [...(by.get(w) ?? []), v.views]);
  }
  return [...by].sort(([a], [b]) => (a < b ? -1 : 1)).map(([week, g]) => ({ week, n: g.length, views: mean(g), total: g.reduce((a, x) => a + x, 0) }));
}

function subject(label: Label, name: string): string {
  if (label === "How it was made") return name === "instagram" ? "Videos posted by hand in Instagram" : `Videos made with ${name}`;
  return label === "Time of day" ? `${name} posts` : `${name} videos`;
}

/** Plain sentences for gaps of 1.5x or more, each with how certain we are (percent). */
export function findings(vs: Video[], tables: Partial<Tables>): { text: string; pct: number | null }[] {
  const out: [number, { text: string; pct: number | null }][] = [];
  for (const [label, rows] of Object.entries(tables) as [Label, Group[]][]) {
    for (const r of rows) {
      if (r.vs === null || r.n < 2 || r.name === "No pillar" || r.name === "Unknown" || !(r.vs >= 1.5 || r.vs <= 0.67)) continue;
      const pct = certainty(vs, KEY[label], r.name, rows.length, r.vs < 1);
      out.push([Math.abs(r.vs - 1) * r.n, { text: `${subject(label, r.name)}: ${fixed(r.vs, 1)}x the views of a typical video, over ${r.n} videos.`, pct }]);
    }
  }
  const skips = vs.filter((v) => v.skip !== null);
  if (skips.length >= 2 * MIN_N) {
    const lo = [...skips].sort((a, b) => a.views - b.views).slice(0, MIN_N);
    const hi = [...skips].sort((a, b) => b.views - a.views).slice(0, MIN_N);
    out.push([1, { text: `The ${MIN_N} best videos lost ${fixed(mean(hi.map((v) => v.skip!)), 0)}% of viewers straight away; the ${MIN_N} weakest lost ${fixed(mean(lo.map((v) => v.skip!)), 0)}%.`, pct: skipCertainty(vs) }]);
  }
  return out.sort((a, b) => b[0] - a[0]).slice(0, 5).map(([, t]) => t);
}

/** Sum of `key` over the last 7 days and over the 7 days before (the daily account rows). */
export function accountWeek(days: Json[], key: string, now: number): [number | null, number | null] {
  const day = (back: number) => new Date(now - back * 86400_000).toISOString().slice(0, 10);
  const span = (a: number, b: number): number | null => {
    const xs = days.filter((d) => day(b) < String(d.date) && String(d.date) <= day(a)).map((d) => Number(d[key]) || 0);
    return xs.length ? xs.reduce((s, x) => s + x, 0) : null;
  };
  return [span(0, 7), span(7, 14)];
}

/** The three moves we recommend, each with how the matching videos did against the typical video. */
export function recommendations(vs: Video[], tables: Tables): { title: string; vs: number; n: number; pct: number | null }[] {
  const out = [];
  for (const [title, t, name] of PICKS) {
    const r = tables[t].find((x) => x.name === name);
    if (r && r.vs && r.vs > 1) out.push({ title, vs: r.vs, n: r.n, pct: certainty(vs, KEY[t], name, tables[t].length) }); // only moves that beat the typical video
  }
  return out;
}

/** One row per day from the daily account snapshots, oldest first, the latest row of a day winning. */
async function accountDays(c: Ctx): Promise<Json[]> {
  const rows = (await c.env.DB.prepare("SELECT metrics FROM metric_snapshots WHERE client = ? AND source = 'ig_account' AND window = 'daily' ORDER BY collected_at").bind(c.client).all<{ metrics: string }>()).results;
  const days = new Map<string, Json>();
  for (const r of rows) {
    const m = parseJson(r.metrics);
    if (typeof m.date === "string") days.set(m.date, m);
  }
  return [...days.keys()].sort().map((k) => days.get(k)!);
}

// ── html ──────────────────────────────────────────────────────────────────────

/** x with d decimals as Python's format(x, ".df"): toFixed rounds an exact tie up, Python to even (36.5 is "36"). */
export function fixed(x: number, d: number): string {
  const e = Math.abs(x).toFixed(100).split(".")[1]!.slice(d); // the exact decimal digits past the d-th
  if (!/^50*$/.test(e)) return x.toFixed(d);
  const t = Math.trunc(x * 10 ** d); // exact: a tie is k + 0.5
  return t % 2 ? x.toFixed(d) : (t / 10 ** d).toFixed(d);
}

const day = (ms: number): string => `${new Date(ms).getUTCDate()} ${MON[new Date(ms).getUTCMonth()]}`;

function delta(nowV: number | null, before: number | null): string {
  if (nowV === null || !before) return "";
  const p = ((nowV - before) / before) * 100;
  if (Math.abs(p) > 500) return `${p > 0 ? "up" : "down"} from ${num(before)} the week before`;
  return `<span class='${p >= 0 ? "up" : "down"}'>${p >= 0 ? "+" : ""}${fixed(p, 0)}%</span> vs the week before`;
}

function chart(vs: Video[], typical: number, width = 600, H = 170): string {
  const n = vs.length;
  const top = Math.max(1, ...vs.map((v) => v.views));
  const [L, B, T] = [30, 24, 10];
  const bw = (width - L) / n;
  const y = (v: number) => H - B - ((H - B - T) * v) / top;
  const f = (x: number) => fixed(x, 1);
  let out = `<svg viewBox='0 0 ${width} ${H}' role=img aria-label='Views in the first day, per video' font-size='11' fill='#888'><line x1=${L} x2=${width} y1=${f(y(typical))} y2=${f(y(typical))} stroke='#111' stroke-dasharray='4 4'/><text x=0 y=${f(y(typical) + 4)}>${num(typical)}</text>`;
  vs.forEach((v, i) => {
    const x = L + i * bw;
    const h = H - B - y(v.views);
    out += `<rect x=${f(x + bw * 0.15)} y=${f(y(v.views))} width=${f(bw * 0.7)} height=${f(Math.max(h, 1))} rx=4 fill='${v.views >= typical ? "#8DF000" : "#D9D9D9"}'><title>${esc(v.title)} · ${day(v.at)}: ${v.views} views, ${v.reach} reached</title></rect>`;
    if (i % Math.max(1, Math.floor(n / 8)) === 0 || i === n - 1) out += `<text x=${f(x + bw / 2)} y=${H - 6} text-anchor=middle>${day(v.at)}</text>`;
  });
  return out + "</svg>";
}

function groupTable(rows: Group[]): string {
  const body = rows.map((r) => `<tr><td>${esc(r.name)}${r.n >= MIN_N ? "" : " <span class=few>few videos</span>"}</td><td>${r.n}</td><td>${fixed(r.views, 0)}</td><td>${
    r.vs === null ? "" : `<span class=${r.vs >= 1 ? "up" : "down"}>${fixed(r.vs, 1)}x</span>`}</td><td>${r.skip === null ? "–" : `${fixed(r.skip, 0)}%`}</td></tr>`).join("");
  return `<table class=ins-tab><tr><th></th><th>Videos</th><th>Avg views</th><th>vs typical</th><th>Skipped</th></tr>${body}</table>`;
}

const vidLi = (v: Video): string =>
  `<li><span>${esc(v.title)}<small>${day(v.at)} · ${v.reach} reached${v.skip === null ? "" : ` · ${fixed(v.skip, 0)}% skipped`} · ${v.inter} interaction${v.inter === 1 ? "" : "s"}</small></span><b>${v.views}</b></li>`;

const pct = (p: number | null): string => (p === null ? "<b>–</b>" : `<b class='${p >= 90 ? "hi" : ""}'>${p}%</b>`);

function rows(items: [string, string, number | null][], empty: string, plain = false): string {
  if (!items.length) return `<p class=muted>${empty}</p>`;
  return "<div class='irow head'><span></span><em>Certainty</em></div>" + items.map(([t, r, p]) => `<div class='irow'><span>${plain ? esc(t) : `<strong>${esc(t)}</strong>`}${r ? `<small>${esc(r)}</small>` : ""}</span>${pct(p)}</div>`).join("");
}

function recsCard(recs: ReturnType<typeof recommendations>): string {
  return `<section class=card><h2>Recommendations</h2>${rows(recs.map((r) => [r.title, `${fixed(r.vs, 1)}x views`, r.pct]), "Nothing beats the typical video yet.")}</section>`;
}

function patternsCard(found: ReturnType<typeof findings>): string {
  return `<section class=card><h2>Patterns</h2>${rows(found.map((f) => [f.text, "", f.pct]), "No clear gaps between groups yet.", true)}</section>`;
}

/** The Overview's line under the numbers (app.py recs_line): the recommendations, then the link. */
export async function recsLine(p: Page, all: PostRow[], meta: Map<string, Json>): Promise<string> {
  const vs = await videos(p.c, all, meta, zoneOf(p));
  const recs = vs.length >= 3 ? recommendations(vs, tablesOf(vs, median(vs.map((v) => v.views)))) : [];
  return `<p class=recsline>${[...recs.map((r) => esc(r.title)), `<a href='${path(p.client.id)}/insights'>View full insights</a>`].join(" <i>|</i> ")}</p>`;
}

export async function renderInsights(p: Page): Promise<Response> {
  const vs = await videos(p.c, await posts(p.c, null), await metas(p.c), zoneOf(p));
  const days = await accountDays(p.c);
  const [viewsW, viewsP] = accountWeek(days, "views", p.now);
  const [reachW, reachP] = accountWeek(days, "reach", p.now);
  const count = (d: Json | undefined): number | null => (typeof d?.followers_count === "number" ? d.followers_count : null);
  const fol = count(days.at(-1));
  const weekAgo = new Date(p.now - 7 * 86400_000).toISOString().slice(0, 10);
  const folThen = count([...days].reverse().find((d) => String(d.date) <= weekAgo));
  const typical = vs.length ? median(vs.map((v) => v.views)) : 0;
  const stats = ([
    ["Views", viewsW, delta(viewsW, viewsP) || "last 7 days"],
    ["Reached", reachW, delta(reachW, reachP) || "last 7 days"],
    ["Followers", fol, fol !== null && folThen !== null ? `${fol - folThen >= 0 ? "+" : ""}${fol - folThen} this week` : "now"],
    ["Typical video", vs.length ? typical : null, "views in the first day"],
  ] as [string, number | null, string][]).map(([lab, v, note]) => `<div class=stat><span>${lab}</span><strong>${num(v)}</strong><small>${note || "&nbsp;"}</small></div>`).join("");
  if (vs.length < 3) {
    return shell(p, "insights", `${header(p)}<section class=card><div class=stats>${stats}</div><p class=muted>Not enough videos with a full first day yet. This page fills in as videos are measured.</p></section>`, "Insights");
  }
  const ranked = [...vs].sort((a, b) => b.views - a.views);
  const k = Math.min(3, Math.floor(vs.length / 2));
  const tables = tablesOf(vs, typical);
  const wk = weeks(vs).reverse().map((w) => `<tr><td>${w.week}</td><td>${w.n}</td><td>${fixed(w.views, 0)}</td><td>${w.total}</td></tr>`).join("");
  const perf = `<section class='card perf'><div class=perfin><div><h2>Performance</h2><div class=stats>${stats}</div></div><div><h3>First day, per video</h3><p class=muted style='margin:2px 0 8px;font-size:13px'>Green beats the typical video (dashed). Every video is judged on its first 24 hours.</p>${chart(vs, typical)}</div></div></section>`;
  const list = (xs: Video[]) => `<div class='irow head'><span></span><em>Views, first day</em></div><ul class=ins-list>${xs.map(vidLi).join("")}</ul>`;
  const main = `${perf}<div class=ins-cols><section class=card><h3>What works</h3>${list(ranked.slice(0, k))}</section><section class=card><h3>What does not</h3>${list([...ranked].reverse().slice(0, k))}</section></div>
<div class=ins-cols>${(Object.entries(tables) as [Label, Group[]][]).map(([t, r]) => `<section class=card><h3>${esc(t)}</h3>${groupTable(r)}</section>`).join("")}<section class=card><h3>Week by week</h3><table class=ins-tab><tr><th></th><th>Videos</th><th>Avg views</th><th>Total</th></tr>${wk}</table></section></div>`;
  const side = `${recsCard(recommendations(vs, tables))}${patternsCard(findings(vs, tables))}`;
  return shell(p, "insights", `${header(p)}<div class=ovgrid><div class=maincol>${main}</div><div class=side>${side}</div></div>`, "Insights");
}
