// Content-item state machine: spine/state.py, port. Code enforces the transitions;
// the dashboard and the PCs only ask for them. Keep the two files identical in substance.

export const MAIN = [
  "IDEA", "BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL",
  "APPROVED", "QUEUED", "PUBLISHING", "PUBLISHED", "MEASURING", "ANALYZED",
];
export const EXCEPTIONS = ["PAUSED", "REJECTED", "FAILED", "NEEDS_INPUT", "MANUAL_HANDOFF", "REMOVED"];
export const STATES = new Set([...MAIN, ...EXCEPTIONS]);

export const MAX_QA_ROUNDS = 2; // after this, QA sends the slot to NEEDS_INPUT

// from -> set(to). Anything not listed is illegal.
export const TRANSITIONS: Record<string, Set<string>> = {
  IDEA: new Set(["BRIEFED", "REJECTED"]),
  BRIEFED: new Set(["SCRIPTED", "REJECTED"]),
  SCRIPTED: new Set(["RENDERED", "REJECTED"]),
  RENDERED: new Set(["QA"]),
  QA: new Set(["NEEDS_APPROVAL", "SCRIPTED", "NEEDS_INPUT"]), // approved / revision / 2 rounds failed
  NEEDS_APPROVAL: new Set(["APPROVED", "REJECTED", "MANUAL_HANDOFF"]),
  APPROVED: new Set(["QUEUED", "PAUSED", "REJECTED", "MANUAL_HANDOFF", "NEEDS_APPROVAL"]), // operator revokes to keep editing
  QUEUED: new Set(["PUBLISHING", "PAUSED", "REJECTED", "MANUAL_HANDOFF", "NEEDS_APPROVAL"]), // posted by hand (music only the app has)
  PAUSED: new Set(["QUEUED", "REJECTED", "MANUAL_HANDOFF", "NEEDS_APPROVAL"]), // held off Instagram until played
  PUBLISHING: new Set(["PUBLISHED", "FAILED", "MANUAL_HANDOFF"]), // media_publish unclear: maybe live, never retried
  PUBLISHED: new Set(["MEASURING", "REMOVED"]),
  MEASURING: new Set(["ANALYZED", "REMOVED"]),
  ANALYZED: new Set(["REMOVED"]), // taken down from Instagram (dashboard or by hand)
  REJECTED: new Set(["SCRIPTED", "NEEDS_APPROVAL"]), // note goes back to Script / re-render failed: previous cut stands
  FAILED: new Set(["QUEUED", "MANUAL_HANDOFF"]),
  NEEDS_INPUT: new Set(["SCRIPTED", "REJECTED", "APPROVED"]), // QA failed, the operator approves it anyway
  MANUAL_HANDOFF: new Set(["PUBLISHED", "REJECTED"]), // operator posted by hand and entered the id
  REMOVED: new Set(),
};

export const TERMINAL = new Set(["ANALYZED", "REMOVED"]);
export const WAITING_ON_HUMAN = new Set(["NEEDS_APPROVAL", "NEEDS_INPUT", "MANUAL_HANDOFF"]);

export class IllegalTransition extends Error {}

export function check(frm: string, to: string): void {
  if (!(frm in TRANSITIONS)) throw new IllegalTransition(`unknown state '${frm}'`);
  if (!STATES.has(to)) throw new IllegalTransition(`unknown state '${to}'`);
  if (!TRANSITIONS[frm]!.has(to)) throw new IllegalTransition(`${frm} -> ${to} is not allowed`);
}

/** Map a QA verdict line to the next state. `roundsSoFar` counts revisions already sent. */
export function nextAfterQa(verdict: string, roundsSoFar: number): string {
  const v = verdict.trim().toUpperCase();
  if (v.endsWith("APPROVED")) return "NEEDS_APPROVAL";
  if (v.endsWith("NEEDS_REVISION")) return roundsSoFar < MAX_QA_ROUNDS ? "SCRIPTED" : "NEEDS_INPUT";
  throw new Error(`unrecognised verdict '${verdict}'`);
}
