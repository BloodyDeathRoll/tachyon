// safeNext: sign-in only ever goes back to a page on this site.
import assert from "node:assert/strict";
import { test } from "node:test";
import { safeNext } from "../src/index.ts";

test("safeNext keeps same-site paths and sends everything else to /app", () => {
  const o = "https://t.example";
  assert.equal(safeNext("/rosa/calendar?view=month", o), "https://t.example/rosa/calendar?view=month");
  assert.equal(safeNext(null, o), "/app");
  for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com/x", "\\\\evil.com", "javascript:alert(1)", "http://t.example.evil.com/"]) {
    assert.equal(safeNext(bad, o), "/app", bad);
  }
  // same origin after parsing, but a path that reads as another host: the full URL keeps it here
  for (const tricky of ["/.//evil.com", "/a/..//evil.com"]) {
    const out = safeNext(tricky, o);
    assert.equal(out, "https://t.example//evil.com", tricky);
    assert.equal(new URL(out, "https://other.example").origin, o, tricky);
  }
  assert.equal(safeNext("https://user@t.example/rosa", o), "https://t.example/rosa"); // no user part
});

test("the login page carries a working copy of safeNext", async (t) => {
  const { start } = await import("./harness.mjs");
  const { mf } = await start();
  t.after(() => mf.dispose());
  const html = await (await mf.dispatchFetch("http://t/login")).text();
  const src = /location\.replace\(\((function safeNext[\s\S]*?\n\})\)\(q\.get/.exec(html)?.[1];
  assert.ok(src, "safeNext is inlined in the page");
  const inPage = new Function(`return (${src})`)();
  for (const n of ["/rosa", "//evil.com", "/.//evil.com", null]) assert.equal(inPage(n, "https://t.example"), safeNext(n, "https://t.example"), String(n));
});
