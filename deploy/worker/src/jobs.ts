// A jobs row: local work for a PC that holds the client's files (docs/CLOUDFLARE-PLAN.md,
// "Jobs and routing"). The API (src/index.ts) and the dashboard pages insert through here.
// A job's payload carries the exact `python -m` argv spine/worker.py ARGV allows for its kind.

export const JOB_KINDS = new Set(["plan", "auto", "produce", "revise", "formats", "caption", "voice", "upload", "spec", "track"]); // track: mix an Instagram song picked online (spine/worker.py)
export const ONCE_KINDS = new Set(["plan", "auto", "produce", "revise", "track"]); // the same command already waiting or running is the same job (a double click)
export const ONCE_MS = 7 * 24 * 60 * 60 * 1000;

export interface JobRow {
  id: number;
  kind: string;
  client: string;
  slot_id: string | null;
  state: string;
  holder: string | null;
  until: number | null;
  payload: string | null;
  result: string | null;
  by: number | null;
  created_at: number;
  updated_at: number;
}

/** The row, or for a once-only kind the open job that already asks for the same thing. A done
    one does not count: the operator may plan the same week again on purpose. */
export async function insertJob(
  db: D1Database, kind: string, client: string, slot: string | null, payload: string | null, by: number | null, now: number,
): Promise<{ id: number; same?: true }> {
  if (ONCE_KINDS.has(kind)) {
    const same = await db.prepare("SELECT id FROM jobs WHERE kind = ? AND client = ? AND payload IS ? AND state IN ('queued', 'running') AND created_at > ? ORDER BY id DESC LIMIT 1")
      .bind(kind, client, payload, now - ONCE_MS)
      .first<{ id: number }>();
    if (same) return { id: same.id, same: true };
  }
  const r = await db.prepare("INSERT INTO jobs (kind, client, slot_id, payload, by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(kind, client, slot, payload, by, now, now)
    .run();
  return { id: r.meta.last_row_id };
}

/** The newest job per kind for one slot. */
export async function slotJobs(db: D1Database, client: string, slot: string): Promise<Record<string, JobRow>> {
  const rows = (await db.prepare("SELECT * FROM jobs WHERE client = ?1 AND slot_id = ?2 AND id IN (SELECT max(id) FROM jobs WHERE client = ?1 AND slot_id = ?2 GROUP BY kind)").bind(client, slot).all<JobRow>()).results;
  return Object.fromEntries(rows.map((j) => [j.kind, j]));
}

/** The newest job per (slot, kind) for a client: {slot: {kind: job}}; the client-wide jobs under "". */
export async function latestJobs(db: D1Database, client: string): Promise<Map<string, Record<string, JobRow>>> {
  const rows = (await db.prepare("SELECT * FROM jobs WHERE client = ?1 AND id IN (SELECT max(id) FROM jobs WHERE client = ?1 GROUP BY slot_id, kind)").bind(client).all<JobRow>()).results;
  const out = new Map<string, Record<string, JobRow>>();
  for (const j of rows) {
    const key = j.slot_id ?? "";
    const per = out.get(key) ?? {};
    per[j.kind] = j;
    out.set(key, per);
  }
  return out;
}
