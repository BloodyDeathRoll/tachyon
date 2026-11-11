// Slot picking for approved posts (spine/schedule.py, port): the client's daily UTC slots
// from its grants, the next free one, the planned one kept while it is still ahead.

import { iso, OPS, type Ctx, type PostRow } from "../db.ts";
import { HttpError } from "../http.ts";
import { parse, type Json } from "./shell.ts";

export const DEFAULT_SLOTS = ["06:30", "18:30"]; // UTC, clients/<name>/strategy.md
export const ACTIVE = ["IDEA", "BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL", "NEEDS_INPUT", "APPROVED", "QUEUED", "PAUSED", "PUBLISHING"];
const DAY_MS = 86400_000;

/** The daily "HH:MM" slots, sorted. */
export function slots(grants: Json): string[] {
  const raw = Array.isArray(grants.slots) && grants.slots.length ? grants.slots.map(String) : DEFAULT_SLOTS;
  return [...raw].sort();
}

/** First slot still ahead of `at` whose ISO timestamp is not in `taken`. */
export function nextFree(taken: Set<string>, grants: Json, at: number): string {
  const day = new Date(at);
  day.setUTCHours(0, 0, 0, 0);
  for (let i = 0; i < 366; i++) {
    for (const t of slots(grants)) {
      const [h, m] = t.split(":").map(Number);
      const ms = day.getTime() + i * DAY_MS + (h ?? 0) * 3600_000 + (m ?? 0) * 60_000;
      const s = iso(ms);
      if (ms > at && !taken.has(s)) return s;
    }
  }
  throw new Error("no free slot within a year");
}

/** Slots held by anything not yet published (planned videos hold theirs). */
export async function takenSlots(c: Ctx, exclude: string | null = null): Promise<Set<string>> {
  const rows = (await OPS.scheduled_times!(c, { states: ACTIVE })) as { slot_id: string; scheduled_at: string }[];
  return new Set(rows.filter((r) => r.slot_id !== exclude).map((r) => r.scheduled_at));
}

/** Keep the planned slot while it is still ahead, however close; a 409 once it is gone (the
    operator picks a new one, never us). Only a video with no slot yet gets the next free one. */
export function slotForApproval(taken: Set<string>, row: PostRow, grants: Json, at: number): string {
  const planned = row.scheduled_at;
  if (planned) {
    if ((parse(planned) ?? 0) <= at) throw new HttpError(409, "slot", "its slot has passed");
    if (taken.has(planned)) throw new HttpError(409, "slot", "its slot is taken");
    return planned;
  }
  return nextFree(taken, grants, at);
}

/** Where videos waiting for approval with no slot of their own would go if approved now: the
    next free slots, handed out in slot order so two of them never share one. The video page and
    the calendar both show this, so they agree. */
export function previewSlots(taken: Set<string>, unslotted: string[], grants: Json, at: number): Record<string, string> {
  const held = new Set(taken);
  const out: Record<string, string> = {};
  for (const s of [...unslotted].sort()) {
    out[s] = nextFree(held, grants, at);
    held.add(out[s]);
  }
  return out;
}
