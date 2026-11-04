// The web-app manifest and its icon (src/index.ts), public, and the shell's head tags.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mint } from "../src/session.ts";
import { NOW, SECRET, start } from "./harness.mjs";

let mf;
before(async () => {
  ({ mf } = await start());
});
after(() => mf.dispose());

test("the manifest and the icon need no sign-in; the shell links them", async () => {
  const m = await mf.dispatchFetch("http://t/manifest.webmanifest");
  assert.equal(m.status, 200);
  assert.equal(m.headers.get("Content-Type"), "application/manifest+json");
  const j = await m.json();
  assert.equal(j.start_url, "/app");
  assert.equal(j.display, "standalone");
  assert.equal(j.short_name, "Tachyon");
  assert.match(j.theme_color, /^#/);
  assert.match(j.background_color, /^#/);
  assert.ok(j.icons.length >= 1 && j.icons.every((i) => i.src === "/icon.svg" && i.type === "image/svg+xml"));
  assert.ok(j.icons.some((i) => /192x192/.test(i.sizes)) && j.icons.some((i) => /512x512/.test(i.sizes)));
  const i = await mf.dispatchFetch("http://t/icon.svg");
  assert.equal(i.status, 200);
  assert.equal(i.headers.get("Content-Type"), "image/svg+xml");
  assert.match(await i.text(), /^<svg /);
  assert.equal((await mf.dispatchFetch("http://t/manifest.webmanifest", { method: "POST" })).status, 401);
  const page = await mf.dispatchFetch("http://t/rosa", { headers: { Cookie: `s=${await mint({ sub: "1", exp: NOW + 3600_000, ep: 0 }, SECRET)}` } });
  const html = await page.text();
  assert.match(html, /<link rel=manifest href=\/manifest\.webmanifest>/);
  assert.match(html, new RegExp(`<meta name=theme-color content='${j.theme_color.slice(0, 4)}'>`));
  assert.match(html, /@media \(max-width:900px\)\{[^}]*\}[^@]*main\{padding:16px 16px 48px\}/); // the phone gutter
});
