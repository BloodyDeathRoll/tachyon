// The one Cron Trigger, every minute (docs/CLOUDFLARE-PLAN.md, "Split"): for each client
// the Worker publishes for, under one lease (D1 has no locks; a lease is one conditional
// UPDATE): a publish step, then the hour's pickup (minute 17, as the crontab ran it) or a
// few insight snapshots; then the daily R2 sweep and the daily `week auto` job per client.
// Every D1, R2 and fetch call is a subrequest (50 per invocation on the Free plan): the
// minute counts them (src/budget.ts) and stops at the budget; the clients take turns
// going first, so none starves. A publish step is up to ~20 calls, a media snapshot 5,
// pickup a list plus two per import, the sweep 3.

import { Budget, countedDB, countedFetch, countedR2 } from "./budget.ts";
import { open } from "./crypto.ts";
import { type Fetcher } from "./graph.ts";
import { step as insights } from "./insights.ts";
import { pickup } from "./pickup.ts";
import { publishClient, type ClientRow, type PublishEnv } from "./publish.ts";

export interface CronEnv extends PublishEnv {}

export const PUBLISH_LEASE_MS = 55_000; // a minute's work; a crashed minute frees it before the next
export const PUBLISH_COST = 20; // subrequests a client's step may need: the leases, the reads, the Graph calls
export const DAY_MS = 24 * 60 * 60 * 1000;
export const GRACE_MS = DAY_MS; // an object this young may belong to an upload whose row is not written yet
export const AUTO_HOUR_UTC = 7; // the crontab ran `week auto` at 07:00 local; here 07:00 UTC
export const PICKUP_MINUTE = 17; // the crontab's insights hour: `17 * * * *`
export const PICKUP_COST = 4; // the list, the posts, the captions; each link or import then checks its own cost
type Json = Record<string, unknown>;

/** Take `name` for `ttl` ms. True only if nobody holds it (a run-out lease counts as free). */
export async function takeLease(env: { DB: D1Database }, name: string, holder: string, now: number, ttl: number): Promise<boolean> {
  await env.DB.prepare("INSERT OR IGNORE INTO leases (name, until) VALUES (?, 0)").bind(name).run();
  const r = await env.DB.prepare("UPDATE leases SET holder = ?, until = ? WHERE name = ? AND until < ?").bind(holder, now + ttl, name, now).run();
  return r.meta.changes === 1;
}

export async function releaseLease(env: { DB: D1Database }, name: string, holder: string): Promise<void> {
  await env.DB.prepare("UPDATE leases SET until = 0 WHERE name = ? AND holder = ?").bind(name, holder).run();
}

/** Delete every R2 object no post names in r2_key or cover_key, once it is a day old. Any
    unpublished post keeps its file, in any state; a published one lost its r2_key at publish.
    A client's avatar (`<client>/avatar.png`, the sidebar icon) is kept. */
export async function sweep(env: { DB: D1Database; MEDIA: R2Bucket }, now: number): Promise<{ deleted: string[]; kept: number }> {
  const referenced = new Set(
    (
      await env.DB.prepare("SELECT r2_key AS k FROM posts WHERE r2_key IS NOT NULL UNION SELECT cover_key FROM posts WHERE cover_key IS NOT NULL").all<{ k: string }>()
    ).results.map((r) => r.k),
  );
  // shortcut: one list() page of 1,000 objects; past that, keep the cursor in the sweep lease row and go on next minute
  const page = await env.MEDIA.list({ limit: 1000 });
  const gone = page.objects.filter((o) => !referenced.has(o.key) && !o.key.endsWith("/avatar.png") && o.uploaded.getTime() < now - GRACE_MS).map((o) => o.key);
  if (gone.length) await env.MEDIA.delete(gone);
  await env.DB.prepare("DELETE FROM pending_connects WHERE expires < ?").bind(now).run();
  return { deleted: gone, kept: page.objects.length - gone.length };
}

/** One `auto` job per client (the host runs `spine.week auto`, which decides whether it is
    the prep day). Skipped for a client that got one in the last 20 h. */
export async function enqueueAuto(env: { DB: D1Database }, clients: ClientRow[], now: number): Promise<string[]> {
  const out: string[] = [];
  for (const client of clients) {
    const recent = await env.DB.prepare("SELECT 1 FROM jobs WHERE kind = 'auto' AND client = ? AND created_at > ?").bind(client.id, now - 20 * 60 * 60 * 1000).first();
    if (recent) continue;
    await env.DB.prepare("INSERT INTO jobs (kind, client, slot_id, payload, by, created_at, updated_at) VALUES ('auto', ?, NULL, ?, NULL, ?, ?)")
      .bind(client.id, JSON.stringify({ argv: ["spine.week", "auto", client.id] }), now, now)
      .run();
    out.push(client.id);
  }
  return out;
}

function nextAutoAt(now: number): number {
  const d = new Date(now);
  d.setUTCHours(AUTO_HOUR_UTC, 0, 0, 0);
  if (d.getTime() <= now) d.setUTCDate(d.getUTCDate() + 1);
  return d.getTime();
}

export async function tick(raw: CronEnv, now: number, fetcher: Fetcher = fetch, budget = new Budget()): Promise<Json> {
  const env: CronEnv = { ...raw, DB: countedDB(raw.DB, budget), MEDIA: countedR2(raw.MEDIA, budget) };
  const counted = countedFetch(fetcher, budget);
  const out: Json = {};
  const holder = `cron-${now}-${Math.random().toString(36).slice(2, 8)}`;
  const all = (await env.DB.prepare("SELECT * FROM clients WHERE publisher = 'worker' ORDER BY id").all<ClientRow>()).results;
  const first = all.length ? Math.floor(now / 60_000) % all.length : 0; // whose turn to go first
  const clients = [...all.slice(first), ...all.slice(0, first)];
  for (const client of clients) {
    if (!budget.has(PUBLISH_COST)) {
      out[client.id] = "budget"; // next minute, and it goes earlier then
      continue;
    }
    const name = `publish:${client.id}`;
    if (!(await takeLease(env, name, holder, now, PUBLISH_LEASE_MS))) {
      out[client.id] = "busy";
      continue;
    }
    const lines: string[] = [];
    try {
      lines.push(...(await publishClient(env, client, now, counted)));
      if (client.token_enc && client.ig_user_id) {
        // measuring and pickup share the lease: a reel being posted this minute is never picked up
        const token = await open(client.token_enc, env.TOKEN_SECRET);
        if (new Date(now).getUTCMinutes() === PICKUP_MINUTE) {
          if (budget.has(PICKUP_COST)) for (const r of await pickup(env, client, token, now, counted, budget)) lines.push(`pickup ${JSON.stringify(r)}`);
          else lines.push("pickup: budget"); // next hour
        } else {
          lines.push(...(await insights(env, client, token, now, counted, budget)).map((l) => `insights ${l}`));
        }
      }
      out[client.id] = lines;
    } catch (e) {
      out[client.id] = [...lines, `error: ${e}`];
      console.error("cron", client.id, e);
    } finally {
      await releaseLease(env, name, holder);
    }
  }
  if (budget.has(6) && (await takeLease(env, "sweep", holder, now, DAY_MS))) {
    // held for a day: the next sweep is tomorrow's, whatever happens here
    try {
      out.sweep = await sweep(env, now);
    } catch (e) {
      out.sweep = `error: ${e}`;
    }
  }
  if (budget.has(2 + all.length * 2) && new Date(now).getUTCHours() >= AUTO_HOUR_UTC && (await takeLease(env, "week-auto", holder, now, nextAutoAt(now) - now))) {
    try {
      out.auto = await enqueueAuto(env, all, now);
    } catch (e) {
      await releaseLease(env, "week-auto", holder); // not done: the next minute tries again
      out.auto = `error: ${e}`;
    }
  }
  out.subrequests = budget.used;
  return out;
}
