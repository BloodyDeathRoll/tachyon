// Station 6, the Instagram part (spine/measure/insights.py, port), run from the cron a few
// media per minute: a snapshot at 24 h, 72 h and 7 d after publish, one cumulative snapshot
// per live video per hour for 30 days, the account's daily row and its rolling 7-day row,
// the permalink backfill. Every row is keyed (UNIQUE on client, post, source, window), so a
// minute that stops at its budget leaves nothing half-done and the next minute carries on.
//
// Media metrics for REELS (Meta reference, verified 2026-10-24): views, reach, likes,
// comments, shares, saved, reposts, total_interactions, ig_reels_avg_watch_time,
// ig_reels_video_view_total_time; reels_skip_rate, profile_visits and follows asked one by
// one, a refusal recorded as null.

import { Budget } from "./budget.ts";
import { files, iso, posts, setState, type Ctx, type PostRow } from "./db.ts";
import { Graph, GraphError, type Fetcher } from "./graph.ts";

type Json = Record<string, unknown>;
export const WINDOWS: Record<string, number> = { "24h": 24 * 3600_000, "72h": 72 * 3600_000, "7d": 7 * 24 * 3600_000 };
export const MEDIA_METRICS = ["views", "reach", "likes", "comments", "shares", "saved", "reposts", "total_interactions", "ig_reels_avg_watch_time", "ig_reels_video_view_total_time"];
export const OPTIONAL_METRICS = ["reels_skip_rate", "profile_visits", "follows"];
export const ACCOUNT_METRICS = ["views", "reach", "accounts_engaged", "total_interactions", "follows_and_unfollows", "profile_links_taps"];
export const HOURLY_DAYS = 30; // an hourly views history for videos published in the last 30 days
export const PER_MINUTE = 6; // media snapshots per minute at most; the subrequest budget may stop it sooner
export const MEDIA_COST = 6; // four Graph calls, the meta read, the row
export const ACCOUNT_COST = 4;

export type Work = { kind: "media"; slot: string; window: string } | { kind: "hourly"; slot: string } | { kind: "account" } | { kind: "account7d" };

export function derived(m: Record<string, number | null>, durationS: number | null): Json {
  const reach = m.reach ?? 0;
  const r = (k: string) => (reach ? (m[k] ?? 0) / reach : null); // a refused metric counts as 0, as spine/measure/insights.py has it
  const out: Json = { sends_per_reach: r("shares"), likes_per_reach: r("likes"), saves_per_reach: r("saved"), follows_per_reach: r("follows"), comments_per_reach: r("comments") };
  const avg = m.ig_reels_avg_watch_time;
  if (avg != null && durationS) out.hold = avg / 1000 / durationS; // Meta returns milliseconds
  return out;
}

export async function fetchMedia(graph: Graph, mediaId: string): Promise<Record<string, number | null>> {
  const metrics = await graph.mediaInsights(mediaId, MEDIA_METRICS);
  for (const opt of OPTIONAL_METRICS) {
    try {
      Object.assign(metrics, await graph.mediaInsights(mediaId, [opt]));
    } catch (e) {
      if (!(e instanceof GraphError)) throw e;
      metrics[opt] = null;
    }
  }
  return metrics;
}

export function hourKey(now: number): string {
  return "h:" + new Date(now).toISOString().slice(0, 13);
}

function parse(ts: string | null): number {
  return Date.parse((ts ?? "").replace(/Z$/, "+00:00")) || 0;
}

async function addSnapshot(c: Ctx, postId: string | null, source: string, window: string, metrics: unknown): Promise<void> {
  await c.env.DB.prepare("INSERT OR REPLACE INTO metric_snapshots (client, post_id, source, window, collected_at, metrics) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(c.client, postId, source, window, iso(c.now), JSON.stringify(metrics))
    .run();
}

/** What is due now: the windows (the measures the dashboard reads) before the hourly rows,
    then the account rows. The reads are narrow: this hour's rows, the three windows' rows,
    today's daily row. `all` is the client's posts, read once by the caller. */
export async function due(c: Ctx, now: number, all?: PostRow[]): Promise<Work[]> {
  const db = c.env.DB;
  const live = (all ?? (await posts(c, null))).filter((p) => p.ig_media_id && p.published_at && p.state !== "REMOVED");
  const have = new Set(
    (await db.prepare("SELECT post_id || '|' || window AS k FROM metric_snapshots WHERE client = ? AND source = 'ig_media' AND window IN ('24h', '72h', '7d')").bind(c.client).all<{ k: string }>()).results.map((r) => r.k),
  );
  const hour = hourKey(now);
  const hourly = new Set((await db.prepare("SELECT post_id FROM metric_snapshots WHERE client = ? AND window = ?").bind(c.client, hour).all<{ post_id: string }>()).results.map((r) => r.post_id));
  const windows: Work[] = [];
  const hours: Work[] = [];
  for (const p of live) {
    const pub = parse(p.published_at);
    for (const [w, delta] of Object.entries(WINDOWS)) if (!have.has(`${p.slot_id}|${w}`) && now >= pub + delta) windows.push({ kind: "media", slot: p.slot_id, window: w });
    if (now - pub <= HOURLY_DAYS * 24 * 3600_000 && !hourly.has(p.slot_id)) hours.push({ kind: "hourly", slot: p.slot_id });
  }
  const out: Work[] = [...windows, ...hours];
  const today = new Date(now).toISOString().slice(0, 10);
  const daily = await db.prepare("SELECT 1 FROM metric_snapshots WHERE client = ? AND post_id IS NULL AND source = 'ig_account' AND window = 'daily' AND json_extract(metrics, '$.date') = ?").bind(c.client, today).first();
  if (!daily) out.push({ kind: "account" });
  const rolling = await db.prepare("SELECT json_extract(metrics, '$.as_of') AS at FROM metric_snapshots WHERE client = ? AND post_id IS NULL AND source = 'ig_account' AND window = '7d'").bind(c.client).first<{ at: string | null }>();
  if (!rolling || (rolling.at ?? "").slice(0, 13) !== iso(now).slice(0, 13)) out.push({ kind: "account7d" }); // replaced every hour: the overview tiles are never a day stale
  return out;
}

async function duration(c: Ctx, slot: string): Promise<number | null> {
  try {
    const d = (JSON.parse((await files(c, slot))["meta.json"] ?? "{}") as Json).duration_s;
    return typeof d === "number" ? d : null;
  } catch {
    return null;
  }
}

async function one(c: Ctx, graph: Graph, igUserId: string, w: Work, bySlot: Map<string, { ig_media_id: string; state: string }>): Promise<void> {
  if (w.kind === "media" || w.kind === "hourly") {
    const p = bySlot.get(w.slot);
    if (!p) return;
    const m = await fetchMedia(graph, p.ig_media_id);
    if (w.kind === "media") {
      await addSnapshot(c, w.slot, "ig_media", w.window, { ...m, _derived: derived(m, await duration(c, w.slot)) });
      if (w.window === "7d" && p.state === "MEASURING") await setState(c, w.slot, "ANALYZED", null, {});
    } else {
      await addSnapshot(c, w.slot, "ig_media", hourKey(c.now), m);
    }
    return;
  }
  if (w.kind === "account") {
    const metrics: Json = await graph.accountInsights(igUserId, ACCOUNT_METRICS);
    const prof = await graph.get(igUserId, { fields: "followers_count,media_count" });
    Object.assign(metrics, { date: new Date(c.now).toISOString().slice(0, 10), followers_count: prof.followers_count ?? null, media_count: prof.media_count ?? null });
    await addSnapshot(c, null, "ig_account", "daily", metrics); // NULL post_id rows are distinct: one row per day
    return;
  }
  const since = Math.floor((c.now - WINDOWS["7d"]!) / 1000);
  const metrics: Json = await graph.accountInsights(igUserId, ACCOUNT_METRICS, { since: String(since), until: String(Math.floor(c.now / 1000)) });
  metrics.followers_count = (await graph.get(igUserId, { fields: "followers_count" })).followers_count ?? null;
  metrics.as_of = iso(c.now);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM metric_snapshots WHERE client = ? AND post_id IS NULL AND source = 'ig_account' AND window = '7d'").bind(c.client),
    c.env.DB.prepare("INSERT INTO metric_snapshots (client, post_id, source, window, collected_at, metrics) VALUES (?, NULL, 'ig_account', '7d', ?, ?)").bind(c.client, iso(c.now), JSON.stringify(metrics)),
  ]);
}

/** A post whose permalink lookup failed at publish time gets it on a later run (one call
    each), for HOURLY_DAYS after publish: a reel deleted on Instagram would otherwise cost a
    call every minute forever. */
export async function backfillPermalinks(c: Ctx, graph: Graph, budget: number, all?: PostRow[]): Promise<string[]> {
  const done: string[] = [];
  for (const p of all ?? (await posts(c, null))) {
    if (done.length >= budget) break;
    if (!p.ig_media_id || p.permalink || p.state === "REMOVED") continue;
    if (p.published_at && c.now - parse(p.published_at) > HOURLY_DAYS * 24 * 3600_000) continue; // no date at all: still worth the call
    try {
      const link = (await graph.media(p.ig_media_id)).permalink;
      if (typeof link !== "string") continue;
      await c.env.DB.prepare("UPDATE posts SET permalink = ? WHERE client = ? AND slot_id = ? AND permalink IS NULL").bind(link, c.client, p.slot_id).run();
      done.push(p.slot_id);
    } catch {
      continue; // try again next run
    }
  }
  return done;
}

/** One minute's measuring for one client: up to PER_MINUTE media snapshots plus the account
    rows, as far as the subrequest budget goes; the rest waits for the next minute. */
export async function step(
  env: { DB: D1Database },
  client: { id: string; ig_user_id: string | null },
  token: string,
  now: number,
  fetcher: Fetcher = fetch,
  budget = new Budget(Number.POSITIVE_INFINITY),
): Promise<string[]> {
  const c: Ctx = { env, client: client.id, by: null, now };
  const graph = new Graph(token, fetcher);
  const log: string[] = [];
  if (!client.ig_user_id) return log;
  const all = await posts(c, null); // once a minute, shared by every step below
  const bySlot = new Map(all.filter((p) => p.ig_media_id).map((p) => [p.slot_id, { ig_media_id: String(p.ig_media_id), state: p.state }]));
  const work = await due(c, now, all);
  const media = work.filter((w) => w.kind === "media" || w.kind === "hourly").slice(0, PER_MINUTE);
  const account = work.filter((w) => w.kind === "account" || w.kind === "account7d");
  for (const w of [...media, ...account]) {
    if (!budget.has(w.kind === "media" || w.kind === "hourly" ? MEDIA_COST : ACCOUNT_COST)) {
      log.push("budget");
      break;
    }
    try {
      await one(c, graph, client.ig_user_id, w, bySlot);
      log.push(w.kind === "media" ? `${w.slot} ${w.window}` : w.kind === "hourly" ? `${w.slot} hourly` : w.kind);
    } catch (e) {
      log.push(`${w.kind}${"slot" in w ? " " + w.slot : ""}: ${e}`); // next minute again
    }
  }
  const links = await backfillPermalinks(c, graph, Math.max(0, Math.min(PER_MINUTE - media.length, Math.floor(budget.left / 2))), all);
  if (links.length) log.push(`permalinks: ${links.join(", ")}`);
  return log;
}
