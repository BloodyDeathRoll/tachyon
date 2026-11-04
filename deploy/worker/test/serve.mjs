// The Worker on a local port for tests/test_remote_db.py: bundles src/, starts the
// harness Miniflare, prints one JSON line {url, token} (alice's session, a member of
// rosa) and runs until stdin closes.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mint } from "../src/session.ts";
import { NOW, SECRET, start } from "./harness.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
execFileSync("node_modules/.bin/esbuild", ["src/index.ts", "--bundle", "--format=esm", "--log-level=warning", "--outfile=.test/index.mjs"], { cwd: root });

const { mf } = await start({ port: 0 });
const url = (await mf.ready).toString().replace(/\/$/, "");
const token = await mint({ sub: "1", exp: NOW + 3600_000, ep: 0 }, SECRET);
process.stdout.write(JSON.stringify({ url, token }) + "\n");

process.stdin.resume();
process.stdin.on("end", async () => {
  await mf.dispose();
  process.exit(0);
});
