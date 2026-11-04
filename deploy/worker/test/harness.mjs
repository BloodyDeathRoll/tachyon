// A Miniflare with the bundled Worker, a fresh local D1 with schema.sql applied and
// the users, clients and memberships the tests share. Used by the .test.mjs files
// and by serve.mjs (the Python tests' server).
import { readFileSync } from "node:fs";
import { Miniflare } from "miniflare";

export const SECRET = "test-secret";
export const NOW = Date.now();

export async function start({ port } = {}) {
  const text = (value) => ({ type: "text", value });
  const mf = new Miniflare({
    ...(port === undefined ? {} : { port, host: "127.0.0.1" }),
    workers: [
      {
        config: {
          name: "tachyon",
          compatibilityDate: "2026-08-01",
          manifest: {
            mainModule: "index.mjs",
            modules: { "index.mjs": { type: "esm", contents: readFileSync(new URL("../.test/index.mjs", import.meta.url), "utf8") } },
          },
          env: {
            DB: { type: "d1", name: "tachyon" },
            MEDIA: { type: "r2", name: "tachyon-media" },
            SESSION_SECRET: text(SECRET),
            GOOGLE_CLIENT_ID: text("x"),
            GOOGLE_CLIENT_SECRET: text(""),
          },
        },
      },
    ],
  });
  const DB = await mf.getD1Database("DB");
  const MEDIA = await mf.getR2Bucket("MEDIA");
  // one statement at a time: D1's exec() wants one statement per line
  const schema = readFileSync(new URL("../schema.sql", import.meta.url), "utf8").replace(/^\s*--.*$/gm, "");
  for (const stmt of schema.split(";").map((s) => s.trim()).filter(Boolean)) await DB.prepare(stmt).run();
  // alice (1) is a member of rosa, bob (2) of nothing, root (3) is an admin
  await DB.batch([
    DB.prepare(
      "INSERT INTO users (id, email, admin, created_at) VALUES (1, 'alice@example.com', 0, ?1), (2, 'bob@example.com', 0, ?1), (3, 'root@example.com', 1, ?1)",
    ).bind(NOW),
    DB.prepare("INSERT INTO clients (id, name, created_at) VALUES ('rosa', 'Rosa', ?1), ('acme', 'Acme', ?1)").bind(NOW),
    DB.prepare("INSERT INTO memberships (user, client) VALUES (1, 'rosa')"),
  ]);
  const env = { DB, MEDIA, GOOGLE_CLIENT_ID: "x", GOOGLE_CLIENT_SECRET: "", SESSION_SECRET: SECRET };
  return { mf, env };
}
