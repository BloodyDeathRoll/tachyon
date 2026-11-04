// Reels posted straight to Instagram join the dashboard (spine/pickup.py, port), from the
// cron once an hour. A recent reel no slot is linked to: its caption matches a slot that is
// not live yet (posted by hand from a video made here) and that slot is linked to it; or a
// new slot is made for it, with its caption and meta in post_files and its cover in R2.
// No video is downloaded: after publish the permalink is the player. Runs in the same
// minute as the publisher, under its lease, so a reel being posted right now is never taken.

import { Budget } from "./budget.ts";
import { iso, journalIfChanged, post, posts, type Ctx } from "./db.ts";
import { Graph, type Fetcher } from "./graph.ts";
import { HttpError } from "./http.ts";

type Json = Record<string, unknown>;
export const FIELDS = "id,caption,timestamp,permalink,media_product_type,media_url,thumbnail_url";
export const PER_RUN = 5; // new imports per run
export const FIRST_LOOK_MS = 7 * 24 * 3600_000; // an account with nothing linked yet: only the last week
export const HAND_FROM = new Set(["NEEDS_APPROVAL", "APPROVED", "QUEUED", "PAUSED", "FAILED", "MANUAL_HANDOFF"]);
// subrequests, as test/insights.test.mjs counts them: the state walks are one batch each, not
// one setState per step (three calls each)
export const IMPORT_COST = 8; // the id read, the row, the cover fetch and put, the rest in one batch
export const LINK_COST = 4;
const MAX_COVER = 10 * 1024 * 1024;
// the states a reel posted by hand walks through, journaled as if it had been made here
const WALK = ["BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL", "MANUAL_HANDOFF", "PUBLISHED", "MEASURING"];

/** Meta's `2026-11-04T10:00:00+0000` as unix ms (0 when unreadable). */
export function ms(ts: unknown): number {
  return Date.parse(String(ts ?? "").replace(/([+-]\d\d)(\d\d)$/, "$1:$2")) || 0;
}

export function key(text: unknown): string {
  return String(text ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** The caption's first sentence when it is short, else its first words (quotes kept whole). */
export function title(caption: string): string {
  const first = (caption || "").trim().split("\n")[0]!.trim();
  const sentence = first.split(/(?<=[.?!])\s/)[0]!.replace(/\.+$/, "");
  if (sentence.length > 0 && sentence.length <= 64) return sentence;
  const out = first.split(/\s+/).filter(Boolean).slice(0, 6).join(" ");
  return ((out.split('"').length - 1) % 2 ? out.replace(/"/g, "") : out).slice(0, 64) || "Posted on Instagram";
}

/** Meta's `2026-11-04T10:00:00+0000` as ISO seconds, the form the Python tables hold. */
export function when(ts: string): string {
  return iso(ms(ts));
}

function isoWeek(ms: number): string {
  const d = new Date(ms);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); // Thursday decides the ISO year
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / 86400_000 + 1) / 7);
  return `${year}-w${String(week).padStart(2, "0")}`;
}

/** <year>-w<week>-<n>, n one past the highest number used that week (spine/manual.py new_slot). */
export async function newSlotId(c: Ctx, at: string): Promise<string> {
  const prefix = isoWeek(Date.parse(at));
  const used = (await c.env.DB.prepare("SELECT slot_id FROM posts WHERE client = ? AND slot_id LIKE ?").bind(c.client, `${prefix}-%`).all<{ slot_id: string }>()).results;
  const nums = used.map((r) => Number(r.slot_id.slice(prefix.length + 1))).filter((n) => Number.isInteger(n));
  return `${prefix}-${String(Math.max(0, ...nums) + 1).padStart(2, "0")}`;
}

/** The journal rows of a state walk, each applied only if the UPDATE before them in the batch
    held (`changes()` stays 1 through the inserts: a journal insert changes one row too). */
function walked(c: Ctx, slot: string, from: string, states: string[], note: string | null, extra: Json): D1PreparedStatement[] {
  return states.map((to, i) => journalIfChanged(c, "post.state", slot, { from: i ? states[i - 1] : from, to, note: to === "MANUAL_HANDOFF" ? note : null, ...(to === "PUBLISHED" ? extra : {}) }));
}

/** The slot waiting for this reel: MANUAL_HANDOFF (if not there yet), PUBLISHED with the reel's
    id, MEASURING, in one batch guarded by the row's version. */
async function linkByHand(c: Ctx, slot: string, r: Json): Promise<void> {
  const row = await post(c, slot);
  if (row.ig_media_id === r.id) return;
  if (!HAND_FROM.has(row.state)) throw new Error(`${slot} is ${row.state}; only unpublished slots can be linked`);
  const published = { ig_media_id: String(r.id), permalink: (r.permalink as string) ?? null, published_at: when(String(r.timestamp)) };
  const steps = [...(row.state === "MANUAL_HANDOFF" ? [] : ["MANUAL_HANDOFF"]), "PUBLISHED", "MEASURING"];
  const res = await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE posts SET state = 'MEASURING', ig_media_id = ?, permalink = ?, published_at = ?, updated_at = ?, version = version + 1 WHERE client = ? AND slot_id = ? AND version = ? AND ig_media_id IS NULL",
    ).bind(published.ig_media_id, published.permalink, published.published_at, iso(c.now), c.client, slot, row.version),
    journalIfChanged(c, "meta.link_by_hand", slot, { media: r.id, outcome: r }),
    ...walked(c, slot, row.state, steps, "posted by hand in the Instagram app", published),
  ]);
  if (res[0]!.meta.changes !== 1) throw new HttpError(409, "changed", `${slot} changed under the link`);
}

async function newSlot(c: Ctx, env: { MEDIA: R2Bucket }, r: Json, fetcher: Fetcher): Promise<string> {
  const at = when(String(r.timestamp));
  const slot = await newSlotId(c, at);
  const caption = String(r.caption ?? "").trim();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO posts (client, slot_id, state, scheduled_at, angle, engine, created_at, updated_at) VALUES (?, ?, 'IDEA', ?, ?, 'instagram', ?, ?)").bind(
      c.client, slot, at, title(caption), iso(c.now), iso(c.now),
    ),
    c.env.DB.prepare("INSERT INTO journal (client, ts, action, target, intent, by) VALUES (?, ?, 'post.create', ?, ?, NULL)").bind(
      c.client, iso(c.now), slot, JSON.stringify({ client: c.client, scheduled_at: at, angle: title(caption), engine: "instagram" }),
    ),
  ]);
  let coverKey: string | null = null;
  try {
    if (typeof r.thumbnail_url === "string") {
      const res = await fetcher(r.thumbnail_url);
      const bytes = res.ok ? await res.arrayBuffer() : null;
      if (bytes && bytes.byteLength <= MAX_COVER) {
        coverKey = `${c.client}/${slot}/${[...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, "0")).join("")}.jpg`;
        await env.MEDIA.put(coverKey, bytes, { httpMetadata: { contentType: "image/jpeg" } });
      }
    }
    const meta = { slot_id: slot, title: title(caption), source: "instagram", plan: "pickup", story: false, permalink: r.permalink ?? null, duration_s: null };
    const published = { ig_media_id: String(r.id), permalink: (r.permalink as string) ?? null, published_at: at };
    // the files, then the whole walk to MEASURING with its journal, one batch
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO post_files (client, slot_id, name, text, updated_by, updated_at) VALUES (?, ?, 'caption.txt', ?, NULL, ?), (?, ?, 'meta.json', ?, NULL, ?)").bind(
        c.client, slot, caption ? caption + "\n" : "", c.now, c.client, slot, JSON.stringify(meta, null, 2) + "\n", c.now,
      ),
      c.env.DB.prepare(
        "UPDATE posts SET cover_key = ?, state = 'MEASURING', ig_media_id = ?, permalink = ?, published_at = ?, updated_at = ?, version = version + 1 WHERE client = ? AND slot_id = ? AND state = 'IDEA'",
      ).bind(coverKey, published.ig_media_id, published.permalink, published.published_at, iso(c.now), c.client, slot),
      ...walked(c, slot, "IDEA", WALK, "posted straight to Instagram, picked up", published),
    ]);
  } catch (e) {
    const live = ["PUBLISHED", "MEASURING"].includes((await post(c, slot)).state);
    if (!live) {
      // nothing half-made stays behind: the rows, their history, the cover
      await c.env.DB.batch([
        c.env.DB.prepare("DELETE FROM posts WHERE client = ? AND slot_id = ?").bind(c.client, slot),
        c.env.DB.prepare("DELETE FROM post_files WHERE client = ? AND slot_id = ?").bind(c.client, slot),
        c.env.DB.prepare("DELETE FROM journal WHERE client = ? AND target = ?").bind(c.client, slot),
      ]);
      if (coverKey) await env.MEDIA.delete(coverKey).catch(() => {}); // the sweep gets it otherwise
    }
    throw e;
  }
  return slot;
}

/** Link or import every unlinked recent reel posted since the oldest linked one, at most
    PER_RUN imports. One entry per reel. */
export async function pickup(
  env: { DB: D1Database; MEDIA: R2Bucket },
  client: { id: string; ig_user_id: string | null },
  token: string,
  now: number,
  fetcher: Fetcher = fetch,
  budget = new Budget(Number.POSITIVE_INFINITY),
): Promise<Json[]> {
  const c: Ctx = { env, client: client.id, by: null, now };
  const out: Json[] = [];
  if (!client.ig_user_id) return out;
  const graph = new Graph(token, fetcher);
  const rows = await graph.recentMedia(client.ig_user_id, FIELDS, 25);
  const all = await posts(c, null);
  const linked = new Set(all.filter((p) => p.ig_media_id).map((p) => p.ig_media_id));
  const stamps = all.filter((p) => p.ig_media_id && p.published_at).map((p) => ms(p.published_at));
  const since = stamps.length ? Math.min(...stamps) : now - FIRST_LOOK_MS; // never older reels (made before, or deleted here)
  // the captions of the slots not live yet, one read
  const handOff = new Set(all.filter((p) => HAND_FROM.has(p.state)).map((p) => p.slot_id));
  const waiting = new Map<string, string>();
  const captions = (await c.env.DB.prepare("SELECT slot_id, text FROM post_files WHERE client = ? AND name = 'caption.txt' ORDER BY slot_id").bind(c.client).all<{ slot_id: string; text: string }>()).results;
  for (const cap of captions) {
    const k = key(cap.text);
    if (handOff.has(cap.slot_id) && k && !waiting.has(k)) waiting.set(k, cap.slot_id);
  }
  let imports = 0;
  for (const r of [...rows].reverse()) {
    // oldest first: slot numbers follow posting order
    if (linked.has(String(r.id)) || r.media_product_type !== "REELS" || ms(r.timestamp) < since) continue;
    try {
      const slot = waiting.get(key(r.caption));
      if (slot) {
        if (!budget.has(LINK_COST)) {
          out.push({ media: r.id, skipped: "budget" }); // next hour
          continue;
        }
        waiting.delete(key(r.caption));
        await linkByHand(c, slot, r);
        out.push({ media: r.id, slot_id: slot, linked: true });
      } else if (imports < PER_RUN) {
        if (!budget.has(IMPORT_COST)) {
          out.push({ media: r.id, skipped: "budget" });
          continue;
        }
        imports++;
        out.push({ media: r.id, slot_id: await newSlot(c, env, r, fetcher), linked: false });
      }
    } catch (e) {
      out.push({ media: r.id, error: String(e).slice(0, 300) }); // one bad reel must not stop the others
    }
  }
  return out;
}
