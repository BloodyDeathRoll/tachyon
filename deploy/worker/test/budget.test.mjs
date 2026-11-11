// countedDB: batch() gets D1's own statements, not the counting proxies; spend() warns once past the limit.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Budget, countedDB } from "../src/budget.ts";

test("batch hands D1 the real statements and counts one", async () => {
  const made = [];
  let seen = null;
  const db = {
    prepare: (q) => { const s = { q, bind() { return this; }, run: async () => ({}) }; made.push(s); return s; },
    batch: async (stmts) => { seen = stmts; return []; },
  };
  const b = new Budget(5);
  const c = countedDB(db, b);
  await c.batch([c.prepare("a"), c.prepare("b").bind(1)]);
  assert.deepEqual(seen, made);
  assert.equal(b.used, 1);
});

test("spend warns once when the budget is passed", () => {
  const warned = [];
  const orig = console.warn;
  console.warn = (m) => warned.push(m);
  try {
    const b = new Budget(2);
    b.spend(); b.spend(); b.spend(); b.spend();
    assert.equal(warned.length, 1);
  } finally {
    console.warn = orig;
  }
});
