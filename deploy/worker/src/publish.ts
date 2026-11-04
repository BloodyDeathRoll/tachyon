// The publisher: one client's due slot, one step per cron minute (docs/CLOUDFLARE-PLAN.md,
// "Video lifecycle" and "Publish safety"). spine/publisher/publish.py's publish_slot with
// the upload replaced by `video_url` (Instagram fetches the public R2 object) and the poll
// loop spread over the cron's minutes: a PUBLISHING post with a container id is waiting
// for Instagram. Nothing here sleeps, and nothing publishes twice: before media_publish
// the container's own status decides.

import { open } from "./crypto.ts";
import { failCount, files, iso, journal, journalOutcome, post, posts, setState, type Ctx, type PostRow } from "./db.ts";
import { Graph, GraphError, type Fetcher } from "./graph.ts";
import { HttpError } from "./http.ts";

export interface PublishEnv {
  DB: D1Database;
  MEDIA: R2Bucket;
  MEDIA_PUBLIC_URL: string; // the bucket's public base: Instagram fetches `${MEDIA_PUBLIC_URL}/${r2_key}`
  TOKEN_SECRET: string;
  VERCEL_TOKEN?: string; // the bio link (spine/publisher/links.py); without it the link is left alone
}

export interface ClientRow {
  id: string;
  name: string;
  ig_user_id: string | null;
  page_id: string | null;
  ig_username: string | null;
  token_enc: string | null;
  token_expires: number | null;
  grants: string;
  emergency_stop: number;
  publisher: string;
}

export const QUOTA = 100;
export const STUCK_MS = 5 * 60 * 1000; // IN_PROGRESS this long after PUBLISHING began: publish.py's five polls
// a URL or bare domain in a comment (rosa.surf, www.x.com, https://…): never clickable there
const URLISH = /https?:\/\/|www\.|\b[a-z0-9-]+\.[a-z]{2,}\b/i;
type Json = Record<string, unknown>;

interface Slot {
  c: Ctx;
  env: PublishEnv;
  client: ClientRow;
  grants: Json;
  graph: Graph;
  row: PostRow;
  caption: string;
  first: string;
  meta: Json;
  log: string[];
}

export function containerParams(meta: Json, caption: string, videoUrl: string): Record<string, string> {
  const p: Record<string, string> = {
    media_type: "REELS",
    video_url: videoUrl,
    caption,
    share_to_feed: meta.share_to_feed === false ? "false" : "true",
  };
  if (meta.thumb_offset != null) p.thumb_offset = String(Math.trunc(Number(meta.thumb_offset)));
  if (meta.trial) p.trial_params = JSON.stringify({ graduation_strategy: "SS_PERFORMANCE" });
  // never audio_configuration: the picked Instagram song is baked into the file (spine/tracks.py)
  if (Array.isArray(meta.collaborators) && meta.collaborators.length) p.collaborators = JSON.stringify(meta.collaborators);
  if (meta.location_id) p.location_id = String(meta.location_id);
  if (meta.is_ai_generated) p.is_ai_generated = "true";
  return p;
}

function key(text: unknown): string {
  return String(text ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function parseJson(text: string | undefined): Json {
  try {
    const v: unknown = JSON.parse(text || "{}");
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : {};
  } catch {
    return {};
  }
}

/** For bookkeeping after the reel is live: it must never turn a live post into an error. */
async function quiet<T>(p: Promise<T>): Promise<T | undefined> {
  try {
    return await p;
  } catch {
    return undefined;
  }
}

async function load(c: Ctx, env: PublishEnv, client: ClientRow, graph: Graph, row: PostRow, log: string[]): Promise<Slot> {
  const f = await files(c, row.slot_id);
  return {
    c, env, client, graph, row, log,
    grants: parseJson(client.grants),
    meta: parseJson(f["meta.json"]),
    caption: (f["caption.txt"] ?? "").trim(),
    first: (f["first_comment.txt"] ?? "").trim(),
  };
}

/** PUBLISHING -> FAILED with the reason; the second failure hands the slot off. */
async function fail(s: Slot, reason: string): Promise<void> {
  const slot = s.row.slot_id;
  if ((await post(s.c, slot)).state !== "PUBLISHING") return;
  await setState(s.c, slot, "FAILED", reason, {});
  if ((await failCount(s.c, slot)) >= 2) await setState(s.c, slot, "MANUAL_HANDOFF", reason, {});
  s.log.push(`${slot}: failed: ${reason}`);
}

async function createContainer(s: Slot): Promise<void> {
  const slot = s.row.slot_id;
  const params = containerParams(s.meta, s.caption, `${s.env.MEDIA_PUBLIC_URL}/${s.row.r2_key}`);
  const j = await journal(s.c, "meta.container.create", slot, { ...params, caption: s.caption.slice(0, 80) + "…" });
  let container: Json;
  try {
    container = await s.graph.write(`${s.client.ig_user_id}/media`, params);
  } catch (e) {
    await journalOutcome(s.c, j, { error: String(e) });
    await fail(s, String(e));
    return;
  }
  await journalOutcome(s.c, j, container);
  await s.env.DB.prepare("UPDATE posts SET container_id = ? WHERE client = ? AND slot_id = ?").bind(String(container.id), s.c.client, slot).run();
  s.log.push(`${slot}: container ${container.id}`);
}

/** The slot's R2 video object, deleted, and r2_key cleared. Also for a deleted or replaced slot. */
export async function dropVideo(env: { DB: D1Database; MEDIA: R2Bucket }, client: string, slot: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT r2_key FROM posts WHERE client = ? AND slot_id = ?").bind(client, slot).first<{ r2_key: string | null }>();
  if (!row?.r2_key) return false;
  await env.MEDIA.delete(row.r2_key);
  await env.DB.prepare("UPDATE posts SET r2_key = NULL WHERE client = ? AND slot_id = ? AND r2_key = ?").bind(client, slot, row.r2_key).run();
  return true;
}

/** The bio redirect's target (spine/publisher/links.py): a Vercel Edge Config item, through
    the REST API with VERCEL_TOKEN instead of the CLI's login. */
export async function setBioLink(b: Json, url: string, token: string, fetcher: Fetcher): Promise<Json> {
  for (const k of ["edge_config_id", "team_id", "key", "public_url"]) if (!b[k]) throw new Error(`grants.bio_link.${k} missing`);
  const host = String(b.public_url).split("/")[2];
  if (!url.startsWith(`https://${host}/`)) throw new Error(`refusing to point ${b.public_url} at a foreign host: ${url}`);
  const r = await fetcher(`https://api.vercel.com/v1/edge-config/${b.edge_config_id}/items?teamId=${b.team_id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ items: [{ operation: "upsert", key: b.key, value: url }] }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`vercel ${r.status}: ${text.slice(0, 300)}`);
  return text ? (JSON.parse(text) as Json) : {};
}

/** Instagram has it: record it, drop the R2 object, the bio link, the first comment, MEASURING. */
async function live(s: Slot, mediaId: string): Promise<void> {
  const slot = s.row.slot_id;
  let info: Json = {};
  try {
    info = await s.graph.media(mediaId);
  } catch (e) {
    await quiet(journal(s.c, "meta.media.lookup", slot, { media: mediaId, error: String(e) })); // permalink is cosmetic; the id is what matters
  }
  try {
    await setState(s.c, slot, "PUBLISHED", null, {
      ig_media_id: mediaId,
      permalink: typeof info.permalink === "string" ? info.permalink : null,
      published_at: typeof info.timestamp === "string" ? info.timestamp : iso(s.c.now),
    });
  } catch (e) {
    // live but not recorded: park it where nothing retries it
    const reason = `live as ${mediaId} but could not be recorded (${e instanceof HttpError ? e.detail ?? e.message : e}); link it on the video page`;
    await quiet(setState(s.c, slot, "MANUAL_HANDOFF", reason, {}));
    s.log.push(`${slot}: ${reason}`);
    return;
  }
  await quiet(dropVideo(s.env, s.c.client, slot)); // Instagram has the file now
  const bio = s.meta.bio_link_while_live;
  if (typeof bio === "string" && s.grants.bio_link && s.env.VERCEL_TOKEN) {
    const b = s.grants.bio_link as Json;
    const j = await journal(s.c, "bio_link.set", slot, { url: bio, via: b.public_url });
    try {
      await journalOutcome(s.c, j, await setBioLink(b, bio, s.env.VERCEL_TOKEN, s.graph.fetcher));
    } catch (e) {
      await quiet(journalOutcome(s.c, j, { error: String(e) })); // logged, never fatal
    }
  }
  if (s.first) {
    const j = await journal(s.c, "meta.comment.create", slot, { media: mediaId, text: s.first });
    try {
      await journalOutcome(s.c, j, await s.graph.write(`${mediaId}/comments`, { message: s.first }));
    } catch (e) {
      await quiet(journalOutcome(s.c, j, { error: String(e) })); // the reel is live; the dashboard shows the comment as not posted
    }
  }
  await setState(s.c, slot, "MEASURING", null, {});
  s.log.push(`${slot}: published ${typeof info.permalink === "string" ? info.permalink : mediaId}`);
}

async function publishFinished(s: Slot): Promise<void> {
  const slot = s.row.slot_id;
  const cid = s.row.container_id;
  // media_publish: an error answer from Meta means nothing was posted (FAILED, retried as usual).
  // No answer (timeout, dropped connection) or no id means the reel may be live anyway: never
  // retry automatically (it could post twice); hand off, and the operator links it on the video
  // page if it is up.
  const j = await journal(s.c, "meta.media_publish", slot, { container: cid });
  let pub: Json;
  try {
    pub = await s.graph.write(`${s.client.ig_user_id}/media_publish`, { creation_id: String(cid) });
  } catch (e) {
    if (e instanceof GraphError && !e.ambiguous) {
      await journalOutcome(s.c, j, { error: String(e) });
      await fail(s, String(e));
      return;
    }
    pub = { error: String(e) };
  }
  await quiet(journalOutcome(s.c, j, pub)); // the journal must not decide whether a live reel counts
  const mediaId = pub.id == null ? null : String(pub.id);
  if (!mediaId) {
    const reason = `media_publish gave no id (${String(pub.error ?? JSON.stringify(pub))}); it may be live: check Instagram and link it on the video page`;
    await setState(s.c, slot, "MANUAL_HANDOFF", reason, {});
    s.log.push(`${slot}: ${reason}`);
    return;
  }
  await live(s, mediaId);
}

/** The container says PUBLISHED but the post does not: a previous minute died after
    media_publish. The one recent reel with this caption, posted since PUBLISHING began, is
    ours; none or several is a hand-off (never a retry: that could post twice). */
async function recover(s: Slot): Promise<void> {
  const slot = s.row.slot_id;
  const since = Date.parse(s.row.publishing_at ?? "") || 0;
  let rows: Json[];
  try {
    rows = await s.graph.recentMedia(String(s.client.ig_user_id), "id,caption,timestamp,permalink,media_product_type");
  } catch (e) {
    s.log.push(`${slot}: container published, media list failed (${e}); next minute`);
    return;
  }
  const mine = rows.filter((r) => key(r.caption) === key(s.caption) && (Date.parse(String(r.timestamp ?? "")) || 0) >= since - 60_000);
  if (mine.length === 1) {
    await live(s, String(mine[0]!.id));
    return;
  }
  const reason = `published on Instagram (container ${s.row.container_id}) but not linked: ${mine.length} recent reels match the caption; link it on the video page`;
  await setState(s.c, slot, "MANUAL_HANDOFF", reason, {});
  s.log.push(`${slot}: ${reason}`);
}

/** A PUBLISHING post: where Instagram is with its container. */
async function advance(s: Slot): Promise<void> {
  const slot = s.row.slot_id;
  if (!s.row.container_id) {
    await createContainer(s); // died between PUBLISHING and saving the id; the orphan expires on its own
    return;
  }
  let st: Json;
  try {
    st = await s.graph.containerStatus(s.row.container_id);
  } catch (e) {
    s.log.push(`${slot}: status failed (${e}); next minute`);
    return;
  }
  switch (st.status_code) {
    case "FINISHED":
      await publishFinished(s);
      return;
    case "PUBLISHED":
      await recover(s);
      return;
    case "IN_PROGRESS": {
      const began = Date.parse(s.row.publishing_at ?? "") || s.c.now;
      if (s.c.now - began > STUCK_MS) await fail(s, `container ${s.row.container_id} still IN_PROGRESS after 5 min: stuck in Instagram`);
      else s.log.push(`${slot}: in progress`);
      return;
    }
    default:
      await fail(s, `container ${s.row.container_id} ${String(st.status_code)}: ${String(st.status ?? "")}`);
  }
}

/** QUEUED -> PUBLISHING with a container. What a retry cannot fix goes back to approval with the reason. */
async function start(s: Slot): Promise<void> {
  const slot = s.row.slot_id;
  if (!s.caption) {
    await setState(s.c, slot, "NEEDS_APPROVAL", "no caption: write one and approve again", {});
    s.log.push(`${slot}: no caption`);
    return;
  }
  if (URLISH.test(s.first)) {
    await setState(s.c, slot, "NEEDS_APPROVAL", "first comment contains a URL; comments are not clickable (decision 13)", {});
    s.log.push(`${slot}: first comment has a URL`);
    return;
  }
  let used: number;
  try {
    used = await s.graph.publishingQuota(String(s.client.ig_user_id));
  } catch (e) {
    s.log.push(`${slot}: quota check failed (${e}); next minute`);
    return;
  }
  if (used >= QUOTA) {
    s.log.push(`${slot}: publishing quota used ${used}/${QUOTA}`);
    return;
  }
  // the old container (a retry after FAILED) is cleared before the state changes: a crash
  // between the two leaves a QUEUED row with a stamp, never a PUBLISHING row with a stale container
  await s.env.DB.prepare("UPDATE posts SET publishing_at = ?, container_id = NULL WHERE client = ? AND slot_id = ? AND state = 'QUEUED'").bind(iso(s.c.now), s.c.client, slot).run();
  try {
    await setState(s.c, slot, "PUBLISHING", null, {}); // refused if an ig_media_id exists: never twice
  } catch (e) {
    s.log.push(`${slot}: ${e instanceof HttpError ? e.detail ?? e.message : String(e)}`);
    return;
  }
  s.row = await post(s.c, slot);
  await createContainer(s);
}

/** One minute's work for one client: the queue promotion, then one step for the slot in
    flight or the earliest due one. The lines say what happened. */
export async function publishClient(env: PublishEnv, client: ClientRow, now: number, fetcher: Fetcher = fetch): Promise<string[]> {
  const c: Ctx = { env, client: client.id, by: null, now };
  const log: string[] = [];
  // approved in the dashboard with a slot -> into the queue (spine/schedule.py)
  for (const p of await posts(c, "APPROVED")) {
    if (!p.scheduled_at) continue;
    try {
      await setState(c, p.slot_id, "QUEUED", null, {});
    } catch (e) {
      log.push(`${p.slot_id}: ${e}`); // one bad row must not stop the others
    }
  }
  if (!client.token_enc || !client.ig_user_id) {
    log.push("not connected");
    return log;
  }
  const flying = (await posts(c, "PUBLISHING"))[0];
  const due = flying ? [] : (await posts(c, "QUEUED")).filter((p) => p.scheduled_at && p.scheduled_at <= iso(now));
  const row = flying ?? due.find((p) => p.r2_key);
  if (!row) {
    if (due.length) log.push(`${due[0]!.slot_id}: waiting for upload`);
    return log;
  }
  if (!flying && client.emergency_stop) {
    log.push("emergency_stop is on");
    return log;
  }
  const graph = new Graph(await open(client.token_enc, env.TOKEN_SECRET), fetcher);
  const s = await load(c, env, client, graph, row, log);
  if (flying) await advance(s);
  else await start(s);
  return log;
}
