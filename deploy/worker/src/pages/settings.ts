// Settings (app.py render_settings and the flag, schedule and sync POSTs, port): the two reply
// switches and the emergency stop, as app.py draws them. The daily posting times live on the
// Overview as in app.py (schedule_card): scheduleCard below is that card, for overview.ts. Locally
// Sync ran pickup and sync_removed as a subprocess; here it runs the cron's pickup once for the
// client under the publish lease, inside the request's subrequest budget. Left out from app.py:
// sync_removed (a Graph call per live reel: more than one request may make), the week_prep
// auto toggle.
//
//   GET  /<client>/settings
//   POST /<client>/flag       flag, value
//   POST /<client>/schedule   t (many) | t1..tN, tz, add | remove
//   POST /<client>/sync

import { Budget, countedDB, countedFetch, countedR2 } from "../budget.ts";
import { PUBLISH_LEASE_MS, releaseLease, takeLease } from "../cron.ts";
import { open } from "../crypto.ts";
import { OPS } from "../db.ts";
import { GraphError, type Fetcher } from "../graph.ts";
import { HttpError } from "../http.ts";
import { pickup } from "../pickup.ts";
import { slots } from "./schedule.ts";
import { esc, header, icon, path, redirect, shell, type Json, type Page } from "./shell.ts";
import { field } from "./video.ts";

const FLAGS: Record<string, [string, string]> = {
  "auto_reply.comments": ["Reply to comments", "Answers comments under our own posts without asking."],
  "auto_reply.dm": ["Reply to messages", "Answers DMs that people send us."],
};
const MAX_SLOTS = 6;
const SYNC_BUDGET = 30; // of the request's 50 subrequests: the page's reads, the lease and the token take the rest
const p2 = (n: number) => String(n).padStart(2, "0");
const minutes = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hm = (m: number): string => `${p2(Math.floor(m / 60))}:${p2(m % 60)}`;
// the UTC slot times shown at today's local offset; shell's script posts the offset back in `tz`
const LOCAL_JS = `for(const i of document.querySelectorAll('input[type=time][data-utc]')){const [h,m]=i.dataset.utc.split(':'),d=new Date();d.setUTCHours(+h,+m,0,0);i.value=String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}`;

// `flag` is the attribute as app.py writes it: quoted for the reply switches, bare for the stop
function switchRow(act: string, flag: string, on: boolean, label: string, desc: string, button: string, cls: string): string {
  return `<form class=switch method=post action='${act}'><div><b>${label}</b><div class=muted style='font-size:14px'>${desc}</div></div><input type=hidden name=flag value=${flag}><input type=hidden name=value value='${on ? 0 : 1}'><button class='btn ${cls}'>${button}</button></form>`;
}

/** The daily slots as time fields (app.py schedule_card, for the Overview's side column), saved
    as UTC. Enter in a field submits the form's first button, so a hidden Save comes before the
    first remove button; `tz` carries the browser's offset back. */
// app.py names the zone the times are in (its machine's, e.g. "IST"); here the times are the
// viewer's own, so the viewer's zone: the abbreviation the PC would print where Intl has none
const TZNAME_JS = `(()=>{const z=Intl.DateTimeFormat().resolvedOptions().timeZone,d=new Date(),j=new Date(d.getFullYear(),0,1).getTimezoneOffset(),dst=d.getTimezoneOffset()<j;
const A={'Asia/Jerusalem':['IST','IDT'],'Europe/London':['GMT','BST'],'Europe/Lisbon':['WET','WEST'],'Europe/Paris':['CET','CEST'],'Europe/Berlin':['CET','CEST'],'Europe/Madrid':['CET','CEST'],'Europe/Rome':['CET','CEST'],'Europe/Amsterdam':['CET','CEST'],'Europe/Athens':['EET','EEST']};
const n=A[z]?A[z][dst?1:0]:(new Intl.DateTimeFormat('en-US',{timeZoneName:'short'}).formatToParts(d).find(p=>p.type==='timeZoneName')||{}).value;
if(n)for(const e of document.querySelectorAll('[data-tzname]'))e.textContent=n;})();`;

export function scheduleCard(p: Page): string {
  const times = slots(p.client.grants);
  const n = times.length;
  const rows = times.map((t, i) => `<div class=tfield><span>Post ${i + 1}</span><input type=time name=t value='${esc(t)}' data-utc='${esc(t)}' required aria-label='Post ${i + 1} time'><button class=x name=remove value=${i} formnovalidate ${n === 1 ? "disabled" : ""} aria-label='Remove post ${i + 1}' title='Remove'>${icon("x", 16)}</button></div>`).join("");
  const per = ({ 1: "Once a day", 2: "Twice a day", 3: "Three times a day" } as Record<number, string>)[n] ?? `${n} times a day`;
  const add = `<button class='btn sec small' name=add value=1 ${n >= MAX_SLOTS ? "disabled" : ""}>${icon("plus", 15)}Add a post</button>`;
  return `<section class=card><div class=row><h2>Publishing schedule</h2><span class=muted data-tzname>your time</span></div><p class=muted style='margin:4px 0 0;font-size:14px'>${per}, every day.</p><form method=post action='${path(p.client.id)}/schedule'><input type=hidden name=tz value=0><button name=save value=1 hidden tabindex=-1 aria-hidden=true></button><div class=times>${rows}</div><div class=btns style='margin-top:0;align-items:center;flex-wrap:nowrap;justify-content:flex-end'><button class='btn dark small' name=save value=1>Save</button>${add}</div></form><script>${LOCAL_JS}${TZNAME_JS}</script></section>`;
}

export function renderSettings(p: Page): Response {
  const act = `${path(p.client.id)}/flag`;
  const ar = (p.client.grants.auto_reply ?? {}) as Json;
  const rows = Object.entries(FLAGS).map(([flag, [lab, desc]]) => {
    const on = Boolean(ar[flag.split(".")[1]!]);
    return switchRow(act, `'${flag}'`, on, lab, desc, on ? "On" : "Off", on ? "pri" : "sec");
  });
  const stop = Boolean(p.client.emergency_stop);
  rows.push(switchRow(act, "emergency_stop", stop, "Emergency stop", "Stops every publish and reply for this project. Any video can override the two reply switches on its own page (Replies, Custom for this video).", stop ? "Resume" : "Stop everything", stop ? "sec" : "pri"));
  return shell(p, "settings", `${header(p)}<section class=card>${rows.join("")}</section>`, "Settings");
}

/** POST /<client>/flag: one reply switch or the emergency stop, into the grants (clients.set_flag). */
export async function flag(p: Page, form: FormData): Promise<Response> {
  const name = field(form, "flag");
  const on = field(form, "value") === "1";
  const grants: Json = { ...p.client.grants };
  if (name in FLAGS) grants.auto_reply = { ...((grants.auto_reply ?? {}) as Json), [name.split(".")[1]!]: on };
  else if (name !== "emergency_stop") throw new HttpError(400, "flag", `not a switch: ${name}`);
  await OPS.set_grants!(p.c, { grants, ...(name === "emergency_stop" ? { emergency_stop: on } : {}) });
  return redirect(`${path(p.client.id)}/settings`);
}

/** A sensible new slot: the middle of the longest gap in the day (app.py _free_time). */
export function freeTime(ts: string[]): string {
  const mins = ts.length ? ts.map(minutes).sort((a, b) => a - b) : [390];
  let best: [number, number] = [0, 0]; // the longest gap, then the latest start (Python's max over (gap, start))
  mins.forEach((m, i) => {
    const gap = (mins[(i + 1) % mins.length]! - m + 1440) % 1440 || 1440;
    if (gap > best[0] || (gap === best[0] && m > best[1])) best = [gap, m];
  });
  let m = (best[1] + Math.floor(best[0] / 2)) % 1440;
  m -= m % 15;
  while (ts.includes(hm(m))) m = (m + 15) % 1440;
  return hm(m);
}

/** POST /<client>/schedule: the times as the browser showed them (local, `tz` minutes behind UTC), stored UTC. */
export async function schedule(p: Page, form: FormData): Promise<Response> {
  // the fields as rendered, empties included: `remove` indexes the rows on the page
  let raw = form.getAll("t").map(String);
  if (!raw.length) raw = [...form.keys()].filter((k) => /^t\d+$/.test(k)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))).map((k) => field(form, k));
  if (form.has("remove") && raw.filter(Boolean).length > 1) {
    const i = Number(field(form, "remove"));
    if (i >= 0 && i < raw.length) raw.splice(i, 1);
  }
  const ts = raw.filter(Boolean);
  if (ts.some((t) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))) throw new HttpError(400, "t", "a time is HH:MM");
  if (form.has("add")) {
    if (ts.length >= MAX_SLOTS) throw new HttpError(400, "slots", `at most ${MAX_SLOTS} posts a day`);
    ts.push(freeTime(ts));
  }
  if (!ts.length) throw new HttpError(400, "slots", "keep at least one post a day");
  if (new Set(ts).size !== ts.length) throw new HttpError(400, "slots", "two posts cannot share a time");
  const tz = Number(field(form, "tz") || 0);
  const utc = ts.map((t) => hm((minutes(t) + (Number.isFinite(tz) ? tz : 0) + 2 * 1440) % 1440)).sort();
  await OPS.set_grants!(p.c, { grants: { ...p.client.grants, slots: utc } });
  return redirect(path(p.client.id)); // app.py: back to the Overview, where the card is
}

/** POST /<client>/sync: the cron's pickup now, once, under the publish lease (a reel being
    published this minute is never picked up) and within the request's subrequests. */
export async function sync(p: Page, fetcher: Fetcher): Promise<Response> {
  const r = await p.env.DB.prepare("SELECT token_enc FROM clients WHERE id = ?").bind(p.client.id).first<{ token_enc: string | null }>();
  if (!r?.token_enc || !p.client.ig_user_id) throw new HttpError(409, "connect", "Instagram is not connected: Connect it first");
  const token = await open(r.token_enc, p.env.TOKEN_SECRET); // a token that does not open is a 500, not "Meta down"
  const lease = `publish:${p.client.id}`;
  const holder = `sync-${p.user.id}-${p.now}`;
  if (!(await takeLease(p.env, lease, holder, p.now, PUBLISH_LEASE_MS))) throw new HttpError(409, "busy", "the publisher is running for this client: try again in a minute");
  let synced: string;
  try {
    const b = new Budget(SYNC_BUDGET);
    const out = await pickup({ DB: countedDB(p.env.DB, b), MEDIA: countedR2(p.env.MEDIA, b) }, p.client, token, p.now, countedFetch(fetcher, b), b);
    synced = `${out.filter((x) => "slot_id" in x).length}-${out.filter((x) => !("slot_id" in x)).length}`;
  } catch (e) {
    if (!(e instanceof GraphError)) console.error("sync", p.client.id, e); // Meta refusing is expected; anything else is in the log
    synced = "err";
  } finally {
    await releaseLease(p.env, lease, holder);
  }
  return redirect(`${path(p.client.id)}?synced=${synced}#sync`);
}
