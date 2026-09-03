// The gate that would have caught it: does a new build ever reach a player who
// already has the app?
//
// `offline_smoke` proves the service worker installs and serves with the
// network off. That is half the contract, and it is the half that hides the
// other one: a cache-first worker that never re-installs serves the SAME build
// for ever. It did. sw.js keys its cache on a version in a manifest it fetches,
// but a browser only re-installs a worker whose OWN BYTES changed, and sw.js is
// static — so `install` ran once, in the player's first session, and the
// version handshake in its header comment never happened. Two playtest reports
// (P33) were written against a build three slices old.
//
// So this deploys twice. First load, then a changed file and a changed manifest
// version, then a reload — and the question is whether the player is now
// running the new bytes.
//
//   node tools/update_smoke.mjs

import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".png": "image/png",
  ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json",
};

/** Files the server pretends were redeployed. Empty until the second deploy. */
const deployed = new Map();

const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const patched = deployed.get(path);
    if (patched !== undefined) {
      res.writeHead(200, {
        "content-type": TYPES[extname(path)] ?? "text/plain",
        "cache-control": "no-cache",
      });
      return res.end(patched);
    }
    const target = join(root, normalize(path === "/" ? "/index.html" : path));
    if (!target.startsWith(root)) return res.writeHead(403).end();
    const body = await readFile(target);
    res.writeHead(200, {
      "content-type": TYPES[extname(target)] ?? "application/octet-stream",
      "cache-control": "no-cache",
    });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});

let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const browser = await chromium.launch({
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});

const MARKER = "// deployed by update_smoke\n";
const PROBE = "/client/ui/hud.js";

try {
  const context = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const page = await context.newPage();
  await page.goto(`${base}/index.html?seed=91&size=32`);
  await page.waitForFunction(() => globalThis.CITY !== undefined, undefined, { timeout: 60000 });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null,
    undefined, { timeout: 60000 });

  const first = await page.evaluate(async () => ({
    version: (await (await fetch("./client/precache.json", { cache: "no-store" })).json()).version,
    caches: await caches.keys(),
  }));
  check("the worker takes charge on the first visit",
    first.caches.length === 1 && first.caches[0].endsWith(first.version),
    JSON.stringify(first));

  // The deploy. A changed file and, as `make_precache.mjs` would produce, a
  // changed version to go with it.
  const manifest = JSON.parse(await readFile(join(root, "client/precache.json"), "utf8"));
  const source = await readFile(join(root, "client/ui/hud.js"), "utf8");
  deployed.set(PROBE, MARKER + source);
  deployed.set("/client/precache.json",
    JSON.stringify({ ...manifest, version: "0000deployed" }));

  // One reload is what a player does. The new worker installs, claims, and the
  // page reloads itself once more off its own `controllerchange` — so the wait
  // is for the page to come back with the new bytes, through however many
  // navigations that takes. Evaluating into a context that is being torn down
  // by that second navigation throws, which is why this retries rather than
  // asks once.
  const settle = async (probe) => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        await page.waitForLoadState("load", { timeout: 10000 });
        const value = await page.evaluate(probe);
        if (value.fresh) return value;
      } catch { /* mid-navigation; ask again */ }
      await page.waitForTimeout(500);
    }
    try { return await page.evaluate(probe); } catch { return { fresh: false, caches: [] }; }
  };

  await page.reload();
  const after = await settle(async () => ({
    fresh: (await (await fetch("./client/ui/hud.js")).text()).startsWith("// deployed by update_smoke"),
    caches: await caches.keys(),
  }));
  check("a new build reaches a player who already has the app", after.fresh,
    JSON.stringify(after));
  check("the old cache is deleted, not kept beside the new one",
    after.caches.length === 1 && after.caches[0].endsWith("0000deployed"),
    after.caches.join(", "));

  // And the game still runs after the update, which is the point of updating.
  const alive = await page.evaluate(async () => {
    const { CMD_TICK } = await import("/engine/commands.js");
    const { apply } = await import("/engine/reducer.js");
    for (let i = 0; i < 20; i += 1) apply(globalThis.CITY.state, { type: CMD_TICK });
    return globalThis.CITY.state.tick;
  });
  check("the game runs on the build it was updated to", alive >= 20, `tick ${alive}`);

  await context.close();
} finally {
  await browser.close();
  server.close();
}

console.log(failures === 0 ? "\nupdate smoke ok" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
