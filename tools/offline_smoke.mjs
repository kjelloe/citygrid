// Slice 4.5's other gate: "the app installs and plays with the network
// disabled".
//
// Not "a service worker registers" — that is the thing that is easy to check
// and proves nothing. This loads the page, waits for the worker to take over,
// **turns the network off**, reloads, and then plays: starts a city from the
// new-game screen, lays a road by pointer, and runs the clock.
//
//   node tools/offline_smoke.mjs

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

function serve() {
  return createServer(async (req, res) => {
    try {
      const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
      const target = join(root, normalize(path === "/" ? "/index.html" : path));
      if (!target.startsWith(root)) return res.writeHead(403).end();
      const body = await readFile(target);
      res.writeHead(200, {
        "content-type": TYPES[extname(target)] ?? "application/octet-stream",
        // A service worker is refused if its own script is served stale.
        "cache-control": "no-cache",
      });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
}

let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

const server = serve();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const base = `http://127.0.0.1:${port}/index.html`;
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const pageErrors = [];

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto(`${base}?seed=1003&size=48`);
  await page.waitForFunction(() => globalThis.CITY !== undefined, undefined, { timeout: 60000 });

  // --- install --------------------------------------------------------------
  const installed = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return { active: Boolean(registration.active), scope: registration.scope };
  });
  check("the service worker installs and activates", installed.active, installed.scope);

  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const cache = await caches.open(names[0]);
    return { names, entries: (await cache.keys()).length };
  });
  check("the app is precached under one versioned cache",
    cached.names.length === 1 && cached.entries > 80,
    `${cached.names.join(", ")} — ${cached.entries} entries`);

  // --- the network goes away ------------------------------------------------
  await context.setOffline(true);
  // Probing a PRECACHED file proves nothing: the worker answers it from cache
  // whether the network is up or not, which is the worker doing its job. The
  // probe has to be a path nothing has cached, so the worker falls through to
  // a real fetch and that fetch fails.
  const reachable = await page.evaluate(() => fetch(`./__offline_probe__${Date.now()}`, { cache: "no-store" })
    .then((r) => r.ok).catch(() => false));
  check("the network really is off", reachable === false);

  // --- and the game still plays --------------------------------------------
  const offline = await context.newPage();
  offline.on("pageerror", (e) => pageErrors.push(`offline: ${e.message}`));
  await offline.goto(base);
  // No seed: the new-game screen, which needs its own modules and the i18n
  // catalogue. A shell that boots but cannot find a string is not offline play.
  await offline.waitForSelector(".lobby", { timeout: 60000 });
  const screen = await offline.evaluate(() => ({
    region: document.querySelector(".region-name")?.textContent ?? "",
    rows: document.querySelectorAll(".lobby-row").length,
    start: document.querySelector(".lobby-start")?.textContent ?? "",
  }));
  check("the new-game screen opens offline, with its strings",
    screen.rows === 5 && screen.region.length > 0 && !screen.region.includes("region.")
    && screen.start.length > 0,
    JSON.stringify(screen));

  await offline.click("#start");
  await offline.waitForFunction(() => globalThis.CITY !== undefined, undefined, { timeout: 60000 });
  const started = await offline.evaluate(() => ({
    width: globalThis.CITY.state.width,
    buildings: globalThis.CITY.state.buildings.length,
    quests: globalThis.CITY.state.quests.active.length,
  }));
  check("a city starts offline", started.width > 0, JSON.stringify(started));

  // Build something, by pointer, with no network.
  await offline.evaluate(async () => {
    globalThis.CITY.pause();
    globalThis.CITY.state.players[0].treasury = 500000;
    const THREE = await import("/vendor/three.module.js");
    globalThis.V = THREE.Vector3;
  });
  const at = await offline.evaluate(([tx, ty]) => {
    const { renderer } = globalThis.CITY;
    const canvas = document.getElementById("city");
    const v = new globalThis.V(tx + 0.5, 0, ty + 0.5);
    v.project(renderer.view.camera);
    return { x: ((v.x + 1) / 2) * canvas.clientWidth, y: ((1 - v.y) / 2) * canvas.clientHeight };
  }, [24, 24]);
  await offline.click('.hud-toolbar button[data-id="road"]');
  await offline.mouse.move(at.x, at.y);
  await offline.mouse.down();
  await offline.mouse.move(at.x + 120, at.y, { steps: 4 });
  await offline.mouse.up();
  const roads = await offline.evaluate(() => {
    let n = 0;
    const s = globalThis.CITY.state;
    for (let i = 0; i < s.tiles.road.length; i += 1) if (s.tiles.road[i] & 16) n += 1;
    return n;
  });
  check("a road can be built offline, by pointer", roads > 3, `${roads} tiles`);

  const ticked = await offline.evaluate(async () => {
    const { apply } = await import("/engine/reducer.js");
    const { CMD_TICK } = await import("/engine/commands.js");
    for (let i = 0; i < 40; i += 1) apply(globalThis.CITY.state, { type: CMD_TICK });
    return globalThis.CITY.state.tick;
  });
  check("the clock runs offline", ticked >= 40, `tick ${ticked}`);

  // Saving is IndexedDB, which is local — so it has to work with no network.
  const saved = await offline.evaluate(async () => {
    const { hashState } = await import("/engine/state.js");
    await globalThis.CITY.save("slot1");
    const before = hashState(globalThis.CITY.state);
    const ok = await globalThis.CITY.load("slot1");
    return { ok, same: before === hashState(globalThis.CITY.state) };
  });
  check("a city saves and loads offline", saved.ok && saved.same, JSON.stringify(saved));

  await context.setOffline(false);
  check("no page errors", pageErrors.length === 0, pageErrors.join(" | "));
  await context.close();
} finally {
  await browser.close();
  server.close();
}

console.log(failures === 0 ? "\noffline smoke ok" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
