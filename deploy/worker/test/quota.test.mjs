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

test("an upload past the cap is refused with 507 and writes nothing", async (t) => {
  const { start } = await import("./harness.mjs");
  const { media } = await import("../src/index.ts");
  const { mf, env } = await start();
  t.after(() => mf.dispose());
  await env.DB.prepare(
    "INSERT INTO posts (client, slot_id, state, ig_media_id, created_at, updated_at) VALUES ('rosa', 'w45-1', 'APPROVED', NULL, '', '')",
  ).run();
  let puts = 0;
  const full = { list: async () => ({ objects: [{ size: STORAGE_CAP }], truncated: false }), put: async () => void puts++ };
  const alice = (await env.DB.prepare("SELECT * FROM users WHERE id = 1").first());
  const req = new Request("https://x/api/media/rosa/w45-1/video", { method: "PUT", body: "abc", headers: { "Content-Length": "3" } });
  await assert.rejects(media(req, { DB: env.DB, MEDIA: full }, alice, "rosa", "w45-1", "video"), (e) => e.status === 507);
  assert.equal(puts, 0);
});
