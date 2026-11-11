// spine/db.py on D1: one op per request, POST /api/db/<client>/<op> with the method's
// arguments as JSON (docs/CLOUDFLARE-PLAN.md, "Local code changes"). The route scopes
// every op to one client, so a row of another client is unreachable from here. The
// Worker's own pages use the same functions later.
//
// Atomicity without locks: a post carries `version`; a state change is one UPDATE
// guarded by the version read first, and its journal row is inserted in the same
// batch (a transaction) only if that UPDATE applied: `changes()` is SQLite's row count
// of the statement before it, on the one connection a batch runs on. A lost race is a
// 409 `changed`; the PC reads the row again and retries.
//
// Times in the Python tables stay ISO-8601 seconds with +00:00, as spine/db.py writes
// them: callers compare them as strings.

import { HttpError } from "./http.ts";
import { check, IllegalTransition } from "./state.ts";

export interface Ctx {
  env: { DB: D1Database };
  client: string;
  by: number | null; // users.id, null for the cron
  now: number;
}
type Args = Record<string, unknown>;
type Bindable = string | number | null;

const ID = /^[\w-]{1,64}$/;
const CREATE_FIELDS = new Set(["scheduled_at", "pillar", "angle", "hook_formula", "length_target", "cta", "audio_type", "experiment_id", "trial", "engine", "note"]);
const UPDATE_FIELDS = new Set(["ig_media_id", "permalink", "published_at", "qa_verdict", "qa_rounds", "engine", "scheduled_at"]);
const MOVABLE = new Set(["IDEA", "BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL", "NEEDS_INPUT", "APPROVED", "QUEUED", "PAUSED", "REJECTED"]);
const PARAMS_MAX = 100; // bound parameters per D1 statement

export interface PostRow {
  client: string;
  slot_id: string;
  state: string;
  scheduled_at: string | null;
  ig_media_id: string | null;
  permalink: string | null;
  published_at: string | null;
  qa_rounds: number;
  version: number;
  r2_key: string | null;
  cover_key: string | null;
  container_id: string | null;
  publishing_at: string | null;
  [k: string]: unknown;
}

/** spine/db.py's now(): ISO seconds, +00:00. */
export function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19) + "+00:00";
}

function bindable(v: unknown, name: string): Bindable {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number" || typeof v === "string") return v;
  throw new HttpError(400, "value", `${name} must be a string, number, boolean or null`);
}

function str(v: unknown, name: string): string {
  if (typeof v !== "string") throw new HttpError(400, name, `${name} must be a string`);
  return v;
}

function optStr(v: unknown, name: string): string | null {
  return v == null ? null : str(v, name);
}

function slotId(v: unknown, name = "slot_id"): string {
  const s = str(v, name);
  if (!ID.test(s)) throw new HttpError(400, name, `${name} must match ${ID}`);
  return s;
}

function num(v: unknown, name: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new HttpError(400, name, `${name} must be a number`);
  return v;
}

function obj(v: unknown, name: string): Args {
  if (v == null) return {};
  if (typeof v !== "object" || Array.isArray(v)) throw new HttpError(400, name, `${name} must be an object`);
  return v as Args;
}

function list(v: unknown, name: string): string[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) throw new HttpError(400, name, `${name} must be a list of strings`);
  return v;
}

function fieldsOf(v: unknown, allowed: Set<string>, what: string): Record<string, Bindable> {
  const given = obj(v, "fields");
  const bad = Object.keys(given).filter((k) => !allowed.has(k)).sort();
  if (bad.length) throw new HttpError(400, "fields", `unknown ${what} fields ${JSON.stringify(bad)}`);
  return Object.fromEntries(Object.entries(given).map(([k, x]) => [k, bindable(x, k)]));
}

function dumps(v: unknown): string | null {
  return v == null ? null : JSON.stringify(v);
}

/** The journal INSERT, applied only if the statement before it in the batch changed one row. */
export function journalIfChanged(c: Ctx, action: string, slot: string, intent: unknown): D1PreparedStatement {
  return c.env.DB.prepare("INSERT INTO journal (client, ts, action, target, intent, by) SELECT ?, ?, ?, ?, ?, ? WHERE changes() = 1").bind(
    c.client, iso(c.now), action, slot, dumps(intent), c.by,
  );
}

function journalStmt(c: Ctx, action: string, target: string | null, intent: unknown): D1PreparedStatement {
  return c.env.DB.prepare("INSERT INTO journal (client, ts, action, target, intent, by) VALUES (?, ?, ?, ?, ?, ?)").bind(
    c.client, iso(c.now), action, target, dumps(intent), c.by,
  );
}

/** One journal row (written before an act); its id for the outcome. */
export async function journal(c: Ctx, action: string, target: string | null, intent: unknown): Promise<number> {
  return (await journalStmt(c, action, target, intent).run()).meta.last_row_id;
}

export async function journalOutcome(c: Ctx, id: number, outcome: unknown): Promise<void> {
  await c.env.DB.prepare("UPDATE journal SET outcome = ? WHERE client = ? AND id = ? AND outcome IS NULL").bind(dumps(outcome), c.client, id).run(); // write-once
}

/** How many times the slot went to FAILED (the publisher hands off after the second). */
export async function failCount(c: Ctx, slot: string): Promise<number> {
  const r = await c.env.DB.prepare(
    "SELECT count(*) AS n FROM journal WHERE client = ? AND target = ? AND action = 'post.state' AND json_extract(intent, '$.to') = 'FAILED'",
  )
    .bind(c.client, slot)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

export async function post(c: Ctx, slot: string): Promise<PostRow> {
  const row = await c.env.DB.prepare("SELECT * FROM posts WHERE client = ? AND slot_id = ?").bind(c.client, slot).first<PostRow>();
  if (!row) throw new HttpError(404, "slot", `no post ${slot}`);
  return row;
}

export async function posts(c: Ctx, state: string | null): Promise<PostRow[]> {
  const q = state
    ? c.env.DB.prepare("SELECT * FROM posts WHERE client = ? AND state = ? ORDER BY scheduled_at, slot_id").bind(c.client, state)
    : c.env.DB.prepare("SELECT * FROM posts WHERE client = ? ORDER BY scheduled_at, slot_id").bind(c.client);
  return (await q.all<PostRow>()).results;
}

function changed(): HttpError {
  return new HttpError(409, "changed", "the post changed under you; read it again");
}

export async function setState(c: Ctx, slot: string, to: string, note: string | null, given: Record<string, Bindable>): Promise<PostRow> {
  const updates = { ...given };
  const row = await post(c, slot);
  const frm = row.state;
  try {
    check(frm, to);
  } catch (e) {
    if (e instanceof IllegalTransition) throw new HttpError(409, "transition", e.message);
    throw e;
  }
  if (frm === "QUEUED" && to === "PUBLISHING" && row.ig_media_id) {
    throw new HttpError(409, "transition", `${slot} already published as ${row.ig_media_id}`);
  }
  if (to === "PUBLISHED" && !(updates.ig_media_id || row.ig_media_id)) {
    throw new HttpError(409, "transition", "PUBLISHED requires an ig_media_id from Meta");
  }
  if (frm === "QA" && to === "SCRIPTED") updates.qa_rounds = row.qa_rounds + 1;
  const sets = ["state = ?", "updated_at = ?", "version = version + 1"];
  const vals: Bindable[] = [to, iso(c.now)];
  if (note !== null) {
    sets.push("note = ?");
    vals.push(note);
  }
  for (const [k, v] of Object.entries(updates)) {
    sets.push(`${k} = ?`);
    vals.push(v);
  }
  let r: D1Result[];
  try {
    r = await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE posts SET ${sets.join(", ")} WHERE client = ? AND slot_id = ? AND version = ?`).bind(...vals, c.client, slot, row.version),
      journalIfChanged(c, "post.state", slot, { from: frm, to, note, ...updates }),
    ]);
  } catch (e) {
    if (String(e).includes("UNIQUE")) throw new HttpError(409, "exists", `ig_media_id ${updates.ig_media_id} is another post's`);
    throw e;
  }
  if (r[0]!.meta.changes !== 1) throw changed();
  return post(c, slot);
}

async function move(c: Ctx, slot: string, at: string | null, swap: string | null): Promise<void> {
  const a = await post(c, slot);
  if (!MOVABLE.has(a.state)) throw new HttpError(400, "move", `${slot} is ${a.state} and cannot move`);
  const stamp = iso(c.now);
  const stmts: D1PreparedStatement[] = [];
  if (swap) {
    const b = await post(c, swap);
    if (!MOVABLE.has(b.state)) throw new HttpError(400, "move", `${swap} is ${b.state} and cannot move`);
    at = b.scheduled_at;
    // all or nothing: the first UPDATE needs b untouched too, the second needs the first applied
    stmts.push(
      c.env.DB.prepare(
        "UPDATE posts SET scheduled_at = ?, updated_at = ?, version = version + 1 WHERE client = ? AND slot_id = ? AND version = ? AND EXISTS (SELECT 1 FROM posts WHERE client = ? AND slot_id = ? AND version = ?)",
      ).bind(b.scheduled_at, stamp, c.client, slot, a.version, c.client, swap, b.version),
      c.env.DB.prepare("UPDATE posts SET scheduled_at = ?, updated_at = ?, version = version + 1 WHERE client = ? AND slot_id = ? AND version = ? AND changes() = 1").bind(
        a.scheduled_at, stamp, c.client, swap, b.version,
      ),
    );
  } else {
    stmts.push(
      c.env.DB.prepare("UPDATE posts SET scheduled_at = ?, updated_at = ?, version = version + 1 WHERE client = ? AND slot_id = ? AND version = ?").bind(
        at, stamp, c.client, slot, a.version,
      ),
    );
  }
  stmts.push(journalIfChanged(c, "post.move", slot, { from: a.scheduled_at, to: at, swap_with: swap }));
  const r = await c.env.DB.batch(stmts);
  if (r.slice(0, -1).some((x) => x.meta.changes !== 1)) throw changed();
}

/** One Instagram data export as a snapshot with its members, or null when that exact
    export is already in. One batch: the snapshot row and its members land together. */
async function importFollowers(c: Ctx, a: Args): Promise<number | null> {
  const sha = str(a.sha, "sha");
  if (await c.env.DB.prepare("SELECT 1 FROM follower_snapshots WHERE client = ? AND file_sha = ?").bind(c.client, sha).first()) return null;
  const followers = list(a.followers, "followers");
  const following = a.following == null ? null : list(a.following, "following");
  const members: [string, string][] = [...followers.map((u): [string, string] => ["follower", u]), ...(following ?? []).map((u): [string, string] => ["following", u])];
  const stmts = [
    c.env.DB.prepare(
      "INSERT OR IGNORE INTO follower_snapshots (client, taken_at, file_sha, source, n_followers, n_following) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(c.client, str(a.taken_at, "taken_at"), sha, optStr(a.source, "source"), followers.length, following === null ? null : following.length),
  ];
  // shortcut: one batch per import, untested past a few thousand members; split it if D1 refuses the batch
  const per = Math.floor((PARAMS_MAX - 2) / 2);
  for (let i = 0; i < members.length; i += per) {
    const chunk = members.slice(i, i + per);
    stmts.push(
      c.env.DB.prepare(
        `INSERT OR IGNORE INTO follower_members (snapshot_id, kind, username) SELECT s.id, v.column1, v.column2 FROM follower_snapshots s, (VALUES ${chunk.map(() => "(?, ?)").join(", ")}) AS v WHERE s.client = ? AND s.file_sha = ?`,
      ).bind(...chunk.flat(), c.client, sha),
    );
  }
  const r = await c.env.DB.batch(stmts);
  return r[0]!.meta.changes === 1 ? r[0]!.meta.last_row_id : null;
}

/** Followers in the previous export who are gone from the newest one (spine/audience.py dropped()). */
async function followerDropped(c: Ctx): Promise<Args> {
  const snaps = (
    await c.env.DB.prepare("SELECT * FROM follower_snapshots WHERE client = ? ORDER BY taken_at DESC, id DESC LIMIT 2").bind(c.client).all<Args>()
  ).results;
  const out: Args = {
    snapshots: snaps.length,
    since: null,
    at: snaps[0]?.taken_at ?? null,
    followers: snaps[0]?.n_followers ?? null,
    dropped: [],
  };
  if (snaps.length === 2) {
    const [fresh, old] = snaps as [Args, Args];
    out.since = old.taken_at;
    out.dropped = (
      await c.env.DB.prepare(
        "SELECT username FROM follower_members WHERE snapshot_id = ? AND kind = 'follower' AND username NOT IN (SELECT username FROM follower_members WHERE snapshot_id = ? AND kind = 'follower') ORDER BY username",
      )
        .bind(old.id, fresh.id)
        .all<{ username: string }>()
    ).results.map((r) => r.username);
  }
  return out;
}

const POST_FILES = new Set(["caption.txt", "first_comment.txt", "meta.json"]); // posts/<slot>/ text the publisher reads

/** posts/<slot>/'s text files from post_files: {name: text}. */
export async function files(c: Ctx, slot: string): Promise<Record<string, string>> {
  const rows = (await c.env.DB.prepare("SELECT name, text FROM post_files WHERE client = ? AND slot_id = ?").bind(c.client, slot).all<{ name: string; text: string }>()).results;
  return Object.fromEntries(rows.map((r) => [r.name, r.text]));
}

/** The clients row without its token. */
export async function clientRow(c: Ctx): Promise<Record<string, unknown>> {
  const row = await c.env.DB.prepare(
    "SELECT id, name, ig_user_id, page_id, ig_username, token_enc IS NOT NULL AS connected, token_expires, grants, emergency_stop, publisher FROM clients WHERE id = ?",
  )
    .bind(c.client)
    .first<Record<string, unknown>>();
  if (!row) throw new HttpError(404, "client", `no client ${c.client}`);
  return { ...row, connected: Boolean(row.connected), grants: JSON.parse(String(row.grants ?? "{}")) as unknown };
}

export const OPS: Record<string, (c: Ctx, a: Args) => Promise<unknown>> = {
  async journal(c, a) {
    const action = str(a.action, "action");
    if (action.startsWith("post.")) throw new HttpError(400, "action", "post.* entries are written by the ops themselves"); // fail_count reads them
    return journal(c, action, optStr(a.target, "target"), a.intent ?? null);
  },
  async journal_outcome(c, a) {
    await journalOutcome(c, num(a.id, "id"), a.outcome);
    return true;
  },
  async fail_count(c, a) {
    return failCount(c, slotId(a.slot_id));
  },
  async files(c, a) {
    return files(c, slotId(a.slot_id));
  },
  /** posts/<slot>/caption.txt, first_comment.txt, meta.json as the PC has them; a missing name is left alone. */
  async set_files(c, a) {
    const slot = slotId(a.slot_id);
    await post(c, slot);
    const given = obj(a.files, "files");
    const stmts = Object.entries(given).map(([name, text]) => {
      if (!POST_FILES.has(name)) throw new HttpError(400, "files", `${name} is not one of ${[...POST_FILES].join(", ")}`);
      return c.env.DB.prepare(
        "INSERT INTO post_files (client, slot_id, name, text, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(client, slot_id, name) DO UPDATE SET text = excluded.text, updated_by = excluded.updated_by, updated_at = excluded.updated_at",
      ).bind(c.client, slot, name, str(text, name), c.by, c.now);
    });
    if (stmts.length) await c.env.DB.batch(stmts);
    return true;
  },
  async client(c) {
    return clientRow(c);
  },
  async set_permalink(c, a) {
    await c.env.DB.prepare("UPDATE posts SET permalink = ? WHERE client = ? AND slot_id = ? AND ig_media_id IS NOT NULL AND permalink IS NULL")
      .bind(str(a.permalink, "permalink"), c.client, slotId(a.slot_id))
      .run();
    return true;
  },
  async create_post(c, a) {
    const slot = slotId(a.slot_id);
    const fields = fieldsOf(a.fields, CREATE_FIELDS, "post");
    const cols = ["client", "slot_id", "state", "created_at", "updated_at", ...Object.keys(fields)];
    const vals: Bindable[] = [c.client, slot, "IDEA", iso(c.now), iso(c.now), ...Object.values(fields)];
    try {
      await c.env.DB.batch([
        c.env.DB.prepare(`INSERT INTO posts (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).bind(...vals),
        journalStmt(c, "post.create", slot, { client: c.client, ...fields }),
      ]);
    } catch (e) {
      if (String(e).includes("UNIQUE")) throw new HttpError(409, "exists", `post ${slot} exists`);
      throw e;
    }
    return post(c, slot);
  },
  async post(c, a) {
    return post(c, slotId(a.slot_id));
  },
  async delete_post(c, a) {
    await c.env.DB.prepare("DELETE FROM posts WHERE client = ? AND slot_id = ?").bind(c.client, slotId(a.slot_id)).run();
    return true;
  },
  async posts(c, a) {
    return posts(c, optStr(a.state, "state"));
  },
  async set_state(c, a) {
    return setState(c, slotId(a.slot_id), str(a.to, "to"), optStr(a.note, "note"), fieldsOf(a.updates, UPDATE_FIELDS, "update"));
  },
  async move(c, a) {
    await move(c, slotId(a.slot_id), optStr(a.at, "at"), a.swap_with == null ? null : slotId(a.swap_with, "swap_with"));
    return true;
  },
  async scheduled_times(c, a) {
    const states = list(a.states, "states");
    if (states.length === 0) return [];
    return (
      await c.env.DB.prepare(
        `SELECT slot_id, scheduled_at FROM posts WHERE client = ? AND state IN (${states.map(() => "?").join(", ")}) AND scheduled_at IS NOT NULL`,
      )
        .bind(c.client, ...states)
        .all()
    ).results;
  },
  async set_scheduled(c, a) {
    const slot = slotId(a.slot_id);
    const at = str(a.at, "at");
    const row = await post(c, slot);
    const r = await c.env.DB.batch([
      c.env.DB.prepare("UPDATE posts SET scheduled_at = ?, updated_at = ?, version = version + 1 WHERE client = ? AND slot_id = ? AND version = ?").bind(
        at, iso(c.now), c.client, slot, row.version,
      ),
      journalIfChanged(c, "post.scheduled_now", slot, { scheduled_at: at }),
    ]);
    if (r[0]!.meta.changes !== 1) throw changed();
    return true;
  },
  async add_snapshot(c, a) {
    await c.env.DB.prepare(
      "INSERT OR REPLACE INTO metric_snapshots (client, post_id, source, window, collected_at, metrics) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(c.client, optStr(a.post_id, "post_id"), str(a.source, "source"), str(a.window, "window"), iso(c.now), JSON.stringify(a.metrics ?? {}))
      .run();
    return true;
  },
  async snapshots(c, a) {
    const pid = optStr(a.post_id, "post_id");
    const q = pid
      ? c.env.DB.prepare("SELECT * FROM metric_snapshots WHERE client = ? AND post_id = ? ORDER BY collected_at").bind(c.client, pid)
      : c.env.DB.prepare("SELECT * FROM metric_snapshots WHERE client = ? ORDER BY collected_at").bind(c.client);
    return (await q.all<{ metrics: string }>()).results.map((r) => ({ ...r, metrics: JSON.parse(r.metrics) as unknown }));
  },
  async delete_snapshots(c, a) {
    await c.env.DB.prepare("DELETE FROM metric_snapshots WHERE client = ? AND post_id IS ? AND source = ? AND window = ?")
      .bind(c.client, optStr(a.post_id, "post_id"), str(a.source, "source"), str(a.window, "window"))
      .run();
    return true;
  },
  async add_experiment(c, a) {
    await c.env.DB.prepare(
      "INSERT INTO experiments (client, id, week, variable, hypothesis, primary_metric, guardrail_metric, window_days, min_samples, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        c.client, str(a.id, "id"), str(a.week, "week"), str(a.variable, "variable"), str(a.hypothesis, "hypothesis"),
        str(a.primary_metric, "primary_metric"), str(a.guardrail_metric, "guardrail_metric"), num(a.window_days, "window_days"),
        a.min_samples == null ? 3 : num(a.min_samples, "min_samples"), iso(c.now),
      )
      .run();
    return true;
  },
  async decide_experiment(c, a) {
    await c.env.DB.prepare("UPDATE experiments SET status = 'decided', verdict = ?, directional_only = ? WHERE client = ? AND id = ?")
      .bind(str(a.verdict, "verdict"), a.directional_only ? 1 : 0, c.client, str(a.id, "id"))
      .run();
    return true;
  },
  async add_conversion(c, a) {
    await c.env.DB.prepare("INSERT INTO conversions (client, post_id, source, event, value, utm_campaign, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(c.client, optStr(a.post_id, "post_id"), str(a.source, "source"), str(a.event, "event"), a.value == null ? null : num(a.value, "value"), optStr(a.utm_campaign, "utm_campaign"), str(a.occurred_at, "occurred_at"))
      .run();
    return true;
  },
  async add_engage(c, a) {
    const r = await c.env.DB.prepare("INSERT INTO engage_log (client, date, account, post_url, planned_at, comment) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(c.client, str(a.date, "date"), str(a.account, "account"), optStr(a.post_url, "post_url"), optStr(a.planned_at, "planned_at"), str(a.comment, "comment"))
      .run();
    return r.meta.last_row_id;
  },
  async tick_engage(c, a) {
    await c.env.DB.prepare("UPDATE engage_log SET posted = 1, posted_at = ? WHERE client = ? AND id = ?").bind(iso(c.now), c.client, num(a.id, "id")).run();
    return true;
  },
  async add_cost(c, a) {
    await c.env.DB.prepare("INSERT INTO costs (client, post_id, kind, amount, unit, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(c.client, optStr(a.post_id, "post_id"), str(a.kind, "kind"), num(a.amount, "amount"), str(a.unit, "unit"), iso(c.now))
      .run();
    return true;
  },
  import_followers: importFollowers,
  follower_dropped: followerDropped,
};
