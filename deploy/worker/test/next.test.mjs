// safeNext: sign-in only ever goes back to a page on this site.
import assert from "node:assert/strict";
import { test } from "node:test";
import { safeNext } from "../src/index.ts";

test("safeNext keeps same-site paths and sends everything else to /app", () => {
  const o = "https://t.example";
  assert.equal(safeNext("/rosa/calendar?view=month", o), "/rosa/calendar?view=month");
  assert.equal(safeNext(null, o), "/app");
  for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com/x", "\\\\evil.com", "javascript:alert(1)", "http://t.example.evil.com/"]) {
    assert.equal(safeNext(bad, o), "/app", bad);
  }
});
