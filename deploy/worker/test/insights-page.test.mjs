// The Insights page (src/pages/insights.ts): the numbers as tests/test_insights.py pins them
// for the Python, then the page over HTTP against the harness D1, and the Overview's line.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { iso, OPS, setState } from "../src/db.ts";
import { accountWeek, certainty, findings, groups, recommendations, skipCertainty, tablesOf, weeks } from "../src/pages/insights.ts";
import { mint } from "../src/session.ts";
import { NOW, SECRET, start } from "./harness.mjs";

const DAY = 86400_000;
const T0 = Date.parse("2026-10-26T07:00:00Z"); // a Monday, ISO week 44
const vid = (i, views, pillar = "A", at = T0 + i * DAY) => ({ slot: `s${i}`, title: `v${i}`, at, pillar, engine: "remotion", part: "Morning", views, reach: views, skip: 50, inter: 0 });

let mf;
let env;
before(async () => {
  ({ mf, env } = await start());
});
after(() => mf.dispose());

const tokenFor = (id) => mint({ sub: String(id), exp: NOW + 3600_000, ep: 0 }, SECRET);
const ctx = () => ({ env, client: "rosa", by: 1, now: Date.now() });
async function get(path, as = 1) {
  const res = await mf.dispatchFetch(`http://t${path}`, { headers: { Cookie: `s=${await tokenFor(as)}` }, redirect: "manual" });
  return { status: res.status, text: await res.text() };
}

/** A reel live since `at` with its first-day snapshot. */
async function live(slot, views, { pillar = null, engine = null, at, skip = null }) {
  await OPS.create_post(ctx(), { slot_id: slot, fields: { pillar, engine } });
  for (const s of ["BRIEFED", "SCRIPTED", "RENDERED", "QA", "NEEDS_APPROVAL", "APPROVED", "QUEUED", "PUBLISHING"]) await setState(ctx(), slot, s, null, {});
  await setState(ctx(), slot, "PUBLISHED", null, { ig_media_id: `m-${slot}`, published_at: at });
  await setState(ctx(), slot, "MEASURING", null, {});
  await OPS.set_files(ctx(), { slot_id: slot, files: { "meta.json": JSON.stringify({ title: `Video ${slot}` }) } });
  await OPS.add_snapshot(ctx(), { post_id: slot, source: "ig_media", window: "24h", metrics: { views, reach: views * 2, total_interactions: 3, reels_skip_rate: skip } });
}

test("groups compare to the typical video; findings skip small samples and the placeholders", () => {
  let vs = [vid(0, 10, "A"), vid(1, 10, "A"), vid(2, 40, "B"), vid(3, 40, "B")];
  const g = Object.fromEntries(groups(vs, "pillar", 20).map((r) => [r.name, r]));
  assert.equal(g.B.vs, 2);
  assert.equal(g.A.vs, 0.5);
  vs = [vid(0, 10, "A"), vid(1, 40, "B"), vid(2, 40, "B"), vid(3, 10, "No pillar"), vid(4, 90, "No pillar")];
  const out = findings(vs, { Topic: groups(vs, "pillar", 20) });
  assert.ok(out.some((f) => f.text.includes("B videos: 2.0x the views") && f.pct !== null));
  assert.ok(!out.some((f) => f.text.includes("No pillar")));
  assert.deepEqual(weeks([vid(0, 10), vid(1, 30), vid(7, 5)]), [{ week: "2026-W44", n: 2, views: 20, total: 40 }, { week: "2026-W45", n: 1, views: 5, total: 5 }]);
});

test("recommendations only include picks that beat typical", () => {
  const vs = [vid(0, 10, "A"), vid(1, 10, "A"), vid(2, 40, "Swell map"), vid(3, 40, "Swell map")];
  const r = recommendations(vs, { Topic: groups(vs, "pillar", 20), "How it was made": [], "Time of day": [] });
  assert.deepEqual(r.map((x) => [x.title, x.vs]), [["Show swell map", 2]]);
  assert.ok(r[0].pct >= 0 && r[0].pct <= 99);
});

test("account_week sums this and the previous seven days", () => {
  const now = Date.parse("2026-11-02T00:00:00Z");
  const days = Array.from({ length: 14 }, (_, i) => ({ date: new Date(now - i * DAY).toISOString().slice(0, 10), views: i < 7 ? 1 : 10 }));
  assert.deepEqual(accountWeek(days, "views", now), [7, 70]);
  assert.deepEqual(accountWeek([], "views", now), [null, null]);
});

test("certainty: high for a clear gap, low for noise, null for everyone, the same every time, bounded on many videos", () => {
  const vs = [...Array.from({ length: 8 }, (_, i) => vid(i, 10 + i, "A")), ...Array.from({ length: 4 }, (_, i) => vid(8 + i, 100 + i, "B"))];
  assert.ok(certainty(vs, "pillar", "B", 1) >= 98);
  assert.ok(certainty(vs, "pillar", "A", 1) < 20);
  assert.ok(certainty(vs, "pillar", "A", 1, true) > 90);
  assert.equal(certainty(vs, "pillar", "Z", 1), null);
  assert.equal(certainty(vs, "pillar", "B", 1), certainty(vs, "pillar", "B", 1)); // seeded
  assert.ok(certainty(vs, "pillar", "B", 3) <= certainty(vs, "pillar", "B", 1)); // more groups looked at: less sure
  const many = Array.from({ length: 60 }, (_, i) => vid(i, i, i % 2 ? "A" : "B"));
  const t = performance.now();
  assert.notEqual(certainty(many, "pillar", "A", 1), null);
  assert.ok(performance.now() - t < 50, "one test must stay far inside the 10 ms CPU budget");
  const more = Array.from({ length: 400 }, (_, i) => vid(i, i, i % 10 ? "A" : "B")); // a big group is drawn as its complement, fewer draws past 30 ranks
  const t2 = performance.now();
  assert.ok([certainty(more, "pillar", "A", 1), certainty(more, "pillar", "B", 1)].every((c) => c !== null && c >= 0 && c <= 99));
  assert.ok(performance.now() - t2 < 50, "two tests on 400 videos");
  // the best three lose few viewers, the weakest three many: one arrangement in 20 does that by luck
  const sk = [vid(0, 100, "A"), vid(1, 90, "A"), vid(2, 80, "A"), vid(3, 10, "A"), vid(4, 9, "A"), vid(5, 8, "A")].map((v, i) => ({ ...v, skip: i < 3 ? 10 : 60 }));
  assert.ok(skipCertainty(sk) >= 90 && skipCertainty(sk) <= 99);
  assert.equal(skipCertainty(sk.slice(0, 5)), null);
});

test("the page waits for three measured videos; the Overview's line is the link alone", async () => {
  await live("a1", 400, { pillar: "Swell map", engine: "remotion", at: "2026-10-26T06:30:00+00:00" });
  await live("a2", 400, { pillar: "Swell map", engine: "remotion", at: "2026-10-27T06:30:00+00:00" });
  const r = await get("/rosa/insights");
  assert.equal(r.status, 200);
  assert.match(r.text, /Not enough videos with a full first day yet/);
  assert.match(r.text, /Typical video/);
  assert.equal((await get("/rosa/insights", 2)).status, 403);
  const ov = await get("/rosa");
  assert.match(ov.text, /<p class=recsline><a href='\/rosa\/insights'>View full insights<\/a><\/p>/);
});

test("the page: the stats with their deltas, the chart, the lists, the tables, the recommendations and patterns", async () => {
  await live("b1", 50, { pillar: "Spots", engine: "html", at: "2026-10-28T18:30:00+00:00", skip: 60 });
  await live("b2", 50, { pillar: "Spots", engine: "html", at: "2026-10-29T18:30:00+00:00", skip: 55 });
  await live("b3", 50, { pillar: "Spots", at: "2026-11-02T18:30:00+00:00" });
  const today = new Date(Date.now());
  const day = (back) => new Date(today.getTime() - back * DAY).toISOString().slice(0, 10);
  await OPS.add_snapshot(ctx(), { post_id: null, source: "ig_account", window: "daily", metrics: { date: day(8), views: 50, reach: 20, followers_count: 990 } });
  await OPS.add_snapshot(ctx(), { post_id: null, source: "ig_account", window: "daily", metrics: { date: day(1), views: 100, reach: 20, followers_count: 1000 } });
  const r = await get("/rosa/insights");
  assert.equal(r.status, 200);
  assert.match(r.text, /<strong>100<\/strong><small><span class='up'>\+100%<\/span> vs the week before/);
  assert.match(r.text, /<strong>20<\/strong><small><span class='up'>\+0%<\/span> vs the week before/);
  assert.match(r.text, /<strong>1,000<\/strong><small>\+10 this week/);
  assert.match(r.text, /<span>Typical video<\/span><strong>50<\/strong>/);
  assert.match(r.text, /<svg viewBox='0 0 600 170'/);
  assert.match(r.text, /<title>Video a1 · 26 Oct: 400 views, 800 reached<\/title>/);
  assert.match(r.text, /What works[\s\S]*Video a1[\s\S]*Video a2[\s\S]*What does not[\s\S]*Video b3[\s\S]*Video b2/); // k = 2 of 5: the top two, the bottom two weakest first
  assert.match(r.text, /<td>Swell map <span class=few>few videos<\/span><\/td><td>2<\/td><td>400<\/td><td><span class=up>8\.0x<\/span><\/td><td>–<\/td>/);
  assert.match(r.text, /<td>Spots<\/td><td>3<\/td><td>50<\/td><td><span class=up>1\.0x<\/span><\/td><td>58%<\/td>/);
  assert.match(r.text, /<td>Unknown <span class=few>few videos<\/span><\/td><td>1<\/td>/); // b3 has no engine
  assert.match(r.text, /<td>2026-W45<\/td><td>1<\/td><td>50<\/td><td>50<\/td>[\s\S]*<td>2026-W44<\/td><td>4<\/td><td>225<\/td><td>900<\/td>/);
  // the two Swell map videos are the top two of five: one pair in ten does that by luck, times the two topics compared = 80 %
  assert.match(r.text, /<strong>Show swell map<\/strong><small>8\.0x views<\/small><\/span><b class=''>(7[6-9]|8[0-4])%<\/b>/);
  assert.match(r.text, /<strong>Publish in the morning<\/strong>/);
  assert.doesNotMatch(r.text, /Publish manually/);
  assert.match(r.text, /Swell map videos: 8\.0x the views of a typical video, over 2 videos\./);
  assert.match(r.text, /Morning posts: 8\.0x the views/);
  assert.doesNotMatch(r.text, /Unknown: /); // placeholders never make a finding
  assert.match(r.text, /nav>[\s\S]*class='on'>[\s\S]*Insights<\/a>/);
  // the Overview carries the recommendations before the link
  const ov = await get("/rosa");
  assert.match(ov.text, /<p class=recsline>Publish in the morning <i>\|<\/i> Show swell map <i>\|<\/i> <a href='\/rosa\/insights'>View full insights<\/a><\/p>/);
  // a change of five hundred percent or more is said in words
  await OPS.add_snapshot(ctx(), { post_id: null, source: "ig_account", window: "daily", metrics: { date: day(2), views: 900, reach: 20, followers_count: 1000 } });
  assert.match((await get("/rosa/insights")).text, /<strong>1,000<\/strong><small>up from 50 the week before/);
  assert.equal((await get("/rosa/insights", 2)).status, 403);
});

test("a video without a first-day snapshot or a publish date is left out", async () => {
  const typicalOf = (text) => /<span>Typical video<\/span><strong>([^<]+)<\/strong>/.exec(text)[1];
  await OPS.create_post(ctx(), { slot_id: "c1", fields: {} });
  await OPS.add_snapshot(ctx(), { post_id: "c1", source: "ig_media", window: "24h", metrics: { views: 9999 } }); // no publish date
  await live("c2", 9999, { at: iso(Date.now() - 3600_000) });
  await OPS.delete_snapshots(ctx(), { post_id: "c2", source: "ig_media", window: "24h" }); // too young for a first day
  await OPS.add_snapshot(ctx(), { post_id: "c2", source: "ig_media", window: "h:2026-11-02T10", metrics: { views: 9999 } });
  assert.equal(typicalOf((await get("/rosa/insights")).text), "50");
  assert.deepEqual(tablesOf([], 0).Topic, []);
});

test("numbers round as app.py's Python format: an exact tie to even", async () => {
  const { fixed } = await import("../src/pages/insights.ts");
  assert.deepEqual([fixed(36.5, 0), fixed(37.5, 0), fixed(58.5, 0), fixed(1.25, 1), fixed(1.35, 1), fixed(-36.5, 0), fixed(2.4, 0)], ["36", "38", "58", "1.2", "1.4", "-36", "2"]);
});
