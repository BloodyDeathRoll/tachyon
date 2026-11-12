// The calendar (src/pages/calendar.ts) over HTTP with the `s` cookie: the week and month
// views, the slot a waiting video is shown on, the remembered view, Add new on open slots,
// and the move (swap, an open slot, the refusals tests/test_dashboard_v3.py pins).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { iso, OPS, setState } from "../src/db.ts";
import { mint } from "../src/session.ts";
import { NOW, SECRET, start } from "./harness.mjs";

let mf;
let env;

before(async () => {
  ({ mf, env } = await start());
});
after(() => mf.dispose());

const tokenFor = (id) => mint({ sub: String(id), exp: NOW + 3600_000, ep: 0 }, SECRET);
const ctx = () => ({ env, client: "rosa", by: 1, now: Date.now() });
const post = (slot) => env.DB.prepare("SELECT * FROM posts WHERE slot_id = ?").bind(slot).first();

async function call(method, path, { form, headers = {} } = {}) {
  headers.Cookie = `s=${await tokenFor(1)}${headers.Cookie ? `; ${headers.Cookie}` : ""}`;
  let body;
  if (form) {
    body = new URLSearchParams(form).toString();
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }
  const res = await mf.dispatchFetch(`http://t${path}`, { method, headers, body, redirect: "manual" });
  return { status: res.status, text: await res.text(), headers: res.headers };
}

/** A slot waiting for approval, with a title. */
async function waiting(slot, scheduled_at = null) {
  await OPS.create_post(ctx(), { slot_id: slot, fields: scheduled_at ? { scheduled_at } : {} });
  for (const s of ["BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL"]) await setState(ctx(), slot, s, null, {});
  await OPS.set_files(ctx(), { slot_id: slot, files: { "meta.json": JSON.stringify({ title: `Video ${slot}` }) } });
}

const A = "2099-01-05T06:30:00+00:00"; // Mon of 2099-W02
const B = "2099-01-06T18:30:00+00:00";
const FREE = "2099-01-07T06:30:00+00:00";

test("the week view: the video on its slot, open slots with Add new, the nav, the remembered view", async () => {
  await waiting("c1", A);
  const r = await call("GET", "/rosa/calendar?w=2099-W02");
  assert.equal(r.status, 200);
  assert.match(r.text, /href='\/rosa\/v\/c1'/);
  assert.match(r.text, /Video c1/);
  assert.match(r.text, /Open slot/);
  assert.match(r.text, /5 Jan – 11 Jan 2099/);
  assert.match(r.text, /title='Back to today'>Mon 5 Jan<\/a>/);
  assert.match(r.text, new RegExp(`data-add='${FREE.replace(/\+/g, "\\+")}'>\\+ Add new`));
  assert.match(r.text, /draggable=true data-slot='c1'/);
  assert.match(r.text, /href='\/rosa\/calendar\?w=2099-W01'/);
  assert.match(r.text, /href='\/rosa\/calendar\?w=2099-W03'/);
  assert.equal(r.text.match(/class='dh/g).length, 7);
  assert.match(r.headers.get("Content-Security-Policy"), /connect-src 'self'/); // the drag's fetch to /move
  assert.match(r.headers.get("Content-Security-Policy"), /media-src 'self' https:\/\/\*\.fbcdn\.net;/); // Instagram song previews (shared page header)
  assert.match(r.headers.get("Set-Cookie"), /^cal_rosa=%3Fw%3D2099-W02; Path=\/; Max-Age=31536000; SameSite=Lax$/);
  // no query: the cookie's view
  const back = await call("GET", "/rosa/calendar", { headers: { Cookie: "cal_rosa=%3Fw%3D2099-W02" } });
  assert.equal(back.status, 303);
  assert.equal(back.headers.get("Location"), "/rosa/calendar?w=2099-W02");
  assert.equal((await call("GET", "/rosa/calendar")).status, 200); // no cookie: this week
  assert.equal((await call("GET", "/rosa/calendar", { headers: { Cookie: "cal_rosa=%E0%A4%A" } })).status, 200); // a malformed cookie: as none
  // a time off the daily slots gets its own row, on every day
  await waiting("c2", "2099-01-08T12:00:00+00:00");
  const off = await call("GET", "/rosa/calendar?w=2099-W02");
  assert.equal(off.text.match(/data-at='2099-01-\d\dT12:00:00\+00:00'/g).length, 6); // the 7th is c2
  assert.doesNotMatch(off.text, /data-add='2099-01-0\dT12:00/); // Add new only on a publishing slot
});

test("a video waiting with no slot of its own sits on the slot the video page says", async () => {
  await waiting("c3");
  const shown = /datetime="([^"]+)"/.exec((await call("GET", "/rosa/v/c3")).text)[1];
  const d = new Date(shown);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); // the slot's ISO week: Thursday decides the year
  const y = d.getUTCFullYear();
  const w = Math.ceil(((d.getTime() - Date.UTC(y, 0, 1)) / 86400_000 + 1) / 7);
  const r = await call("GET", `/rosa/calendar?w=${y}-W${String(w).padStart(2, "0")}`);
  assert.match(r.text, /href='\/rosa\/v\/c3'/);
  assert.match(r.text, /data-cls='need'/);
});

test("the month view: the days, mini cells, open future slots, the nav", async () => {
  const r = await call("GET", "/rosa/calendar?view=month&m=2099-01");
  assert.equal(r.status, 200);
  assert.match(r.text, /January 2099/);
  assert.match(r.text, /title='Back to today'>Jan 2099<\/a>/);
  assert.match(r.text, /cell mini/);
  assert.match(r.text, /href='\/rosa\/v\/c1'/);
  assert.match(r.text, /view=month&m=2098-12'/);
  assert.match(r.text, /view=month&m=2099-02'/);
  assert.match(r.text, /cell mini open' data-at='2099-01-07T06:30:00\+00:00' data-add=/);
  assert.equal(r.text.match(/class='mday/g).length, 35); // 29 Dec – 1 Feb
  assert.match(r.headers.get("Set-Cookie"), /^cal_rosa=%3Fview%3Dmonth%26m%3D2099-01;/);
  assert.equal((await call("GET", "/rosa/calendar?view=month&m=nope")).status, 200); // this month
  // a video the night before the grid's first day belongs to the month before, not to that day
  await waiting("c6", "2098-12-28T23:00:00+00:00");
  assert.doesNotMatch((await call("GET", "/rosa/calendar?view=month&m=2099-01")).text, /href='\/rosa\/v\/c6'/);
  assert.match((await call("GET", "/rosa/calendar?view=month&m=2098-12")).text, /href='\/rosa\/v\/c6'/);
});

test("move: a swap, an open slot, a day; taken, past and live refused", async () => {
  await waiting("c4", B);
  const r = await call("GET", "/rosa/calendar?w=2099-W02&hl=c1");
  assert.match(r.text, /class='cell hl' data-cls='need' href='\/rosa\/v\/c1'/);
  assert.match(r.text, /draggable=true data-slot='c4'/);
  assert.match(r.text, new RegExp(`class='cell open' data-at='${FREE.replace(/\+/g, "\\+")}'`));
  assert.match(r.text, /fetch\('\/rosa\/move'/);
  let m = await call("POST", "/rosa/move", { form: { slot: "c1", swap: "c4" } });
  assert.equal(m.status, 303);
  assert.equal(m.headers.get("Location"), "/rosa/calendar");
  assert.equal((await post("c1")).scheduled_at, B);
  assert.equal((await post("c4")).scheduled_at, A);
  m = await call("POST", "/rosa/move", { form: { slot: "c1", at: FREE } });
  assert.equal(m.status, 303);
  assert.equal((await post("c1")).scheduled_at, FREE);
  // a drop on a day: its first open future slot; 06:30 is c1's, the 12:00 row (c2's time that week) is next
  m = await call("POST", "/rosa/move", { form: { slot: "c4", day: "2099-01-07" } });
  assert.equal(m.status, 303);
  assert.equal((await post("c4")).scheduled_at, "2099-01-07T12:00:00+00:00");
  assert.match((await call("POST", "/rosa/move", { form: { slot: "c4", day: "2001-01-01" } })).text, /no open slot left that day/);
  const taken = await call("POST", "/rosa/move", { form: { slot: "c4", at: FREE } });
  assert.equal(taken.status, 400);
  assert.match(taken.text, /that slot is taken/);
  assert.match(taken.text, /href='\/rosa\/calendar'/);
  assert.equal((await call("POST", "/rosa/move", { form: { slot: "c4", at: "2001-01-01T06:30:00+00:00" } })).status, 400);
  assert.equal((await call("POST", "/rosa/move", { form: { slot: "c4" } })).status, 400);
  // minutes away is fine: no lead
  const soon = iso(Date.now() + 5 * 60_000);
  assert.equal((await call("POST", "/rosa/move", { form: { slot: "c4", at: soon } })).status, 303);
  assert.equal((await post("c4")).scheduled_at, soon);
  // live videos stay put
  await waiting("c5", "2099-01-09T06:30:00+00:00");
  for (const s of ["APPROVED", "QUEUED", "PUBLISHING"]) await setState(ctx(), "c5", s, null, {});
  await setState(ctx(), "c5", "PUBLISHED", null, { ig_media_id: "m5", published_at: "2099-01-09T06:30:00+00:00" });
  assert.equal((await call("POST", "/rosa/move", { form: { slot: "c5", at: "2099-01-10T06:30:00+00:00" } })).status, 400);
  assert.equal((await call("POST", "/rosa/move", { form: { slot: "c1", swap: "c5" } })).status, 400);
  assert.doesNotMatch((await call("GET", "/rosa/calendar?w=2099-W02")).text, /data-slot='c5'/);
  assert.equal((await call("POST", "/rosa/move", { form: { slot: "zzz", at: "2099-01-11T06:30:00+00:00" } })).status, 404);
});

test("the grid in the viewer's zone (the tz cookie): days, rows and a drop on a day are local", async () => {
  // 22:30 UTC on Mon 2099-W03 is 00:30 Tuesday in Jerusalem (UTC+2 in January)
  await waiting("z1", "2099-01-12T22:30:00+00:00");
  const tz = { headers: { Cookie: "tz=Asia%2FJerusalem" } };
  const cols = (t) => t.slice(t.indexOf("class=cal")).split(/<div class=th>/).slice(1).map((r) => r.split(/<(?:a|div) class='cell/).slice(1).map((c) => (/href='\/rosa\/v\/(\w+)'/.exec(c) ?? [])[1] ?? null));
  const local = await call("GET", "/rosa/calendar?w=2099-W03", tz);
  assert.match(local.text, /data-zone='Asia\/Jerusalem'/);
  const row = cols(local.text).find((r) => r.includes("z1"));
  assert.equal(row.indexOf("z1"), 1); // Tuesday
  assert.equal(cols(local.text)[0].indexOf("z1"), 1); // 00:30 is the first row
  // the 06:30 UTC slot is 08:30 local on the same day: an open cell for it on Wednesday
  assert.match(local.text, /class='cell open' data-at='2099-01-14T06:30:00\+00:00'/);
  const utc = await call("GET", "/rosa/calendar?w=2099-W03", { headers: { Cookie: "tz=UTC" } });
  assert.equal(cols(utc.text).find((r) => r.includes("z1")).indexOf("z1"), 0); // Monday in UTC
  assert.match((await call("GET", "/rosa/calendar?w=2099-W03", { headers: { Cookie: "tz=Nope%2FNope" } })).text, /data-zone='UTC'/); // a bad zone: the client's (none here: UTC)
  // the month: z1 on the 13th, local
  const mo = await call("GET", "/rosa/calendar?view=month&m=2099-01", tz);
  assert.match(mo.text, /<b>13<\/b><div class=mcells>(?:(?!<b>).)*href='\/rosa\/v\/z1'/s);
  assert.doesNotMatch((await call("GET", "/rosa/calendar?view=month&m=2099-01", { headers: { Cookie: "tz=UTC" } })).text, /<b>13<\/b><div class=mcells>(?:(?!<b>).)*href='\/rosa\/v\/z1'/s);
  // a drop on Thursday 15 Jan (local): its first open row is 00:30 local (z1's row that week),
  // 22:30 UTC the day before
  await call("POST", "/rosa/move", { form: { slot: "z1", day: "2099-01-15" }, ...tz });
  assert.equal((await post("z1")).scheduled_at, "2099-01-14T22:30:00+00:00");
});

test("a DST week: one daily slot falls on two local rows; a bad grants zone falls back to UTC", async () => {
  // Jerusalem leaves DST on Sun 25 Oct 2099: 06:30 UTC is 09:30 until Saturday, 08:30 on Sunday
  const r = await call("GET", "/rosa/calendar?w=2099-W43", { headers: { Cookie: "tz=Asia%2FJerusalem" } });
  assert.equal(r.text.match(/<div class=th>/g).length, 4); // 08:30, 09:30, 20:30, 21:30
  assert.match(r.text, /data-at='2099-10-24T06:30:00\+00:00'/);
  assert.match(r.text, /data-at='2099-10-25T06:30:00\+00:00'/);
  await env.DB.prepare("UPDATE clients SET grants = json_set(grants, '$.timezone', 'Nope/Nope') WHERE id = 'rosa'").run();
  try {
    assert.match((await call("GET", "/rosa/calendar?w=2099-W43")).text, /data-zone='UTC'/);
  } finally {
    await env.DB.prepare("UPDATE clients SET grants = json_remove(grants, '$.timezone') WHERE id = 'rosa'").run();
  }
});
