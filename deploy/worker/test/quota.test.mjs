// The Worker's own storage cap: R2 itself has none.
import assert from "node:assert/strict";
import { test } from "node:test";
import { bucketBytes, roomFor, STORAGE_CAP } from "../src/quota.ts";

function fakeBucket(sizes, pageSize = 2) {
  return {
    async list({ cursor } = {}) {
      const i = cursor ? Number(cursor) : 0;
      const objects = sizes.slice(i, i + pageSize).map((size) => ({ size }));
      const truncated = i + pageSize < sizes.length;
      return { objects, truncated, cursor: truncated ? String(i + pageSize) : undefined };
    },
  };
}

test("bucketBytes sums every page", async () => {
  assert.equal(await bucketBytes(fakeBucket([1, 2, 3, 4, 5])), 15);
});

test("roomFor refuses what would pass the cap", async () => {
  const b = fakeBucket([STORAGE_CAP - 10]);
  assert.equal(await roomFor(b, 10), true);
  assert.equal(await roomFor(b, 11), false);
});
