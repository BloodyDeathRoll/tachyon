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
