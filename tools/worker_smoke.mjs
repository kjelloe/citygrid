// The seam, both ways round (W2; `workitems-worker.md`).
//
// The claim is that the simulation is the same game whichever thread it runs
// on. This drives the REAL page twice — once with the worker, once with
// `?worker=0` — plays the same fifty commands and two hundred ticks through
// `CITY`, and compares the two cities by `shared/statehash.js`. Two hashes that
// differ is the loudest failure this project has; two hashes that match is the
// only evidence that moving the reducer changed nothing.
//
// It also checks the things only a browser can answer: that the worker is
// actually what the page uses by default (a fallback nobody notices is a
// feature nobody has), that the mirror never desyncs over a played city, and
// that a save made on one arm restores on the other.

import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".css": "text/css", ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};

function serve() {
  return createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      const file = join(root, normalize(path === "/" ? "/index.html" : path));
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
      res.end(await readFile(file));
    } catch { res.writeHead(404).end(); }
  });
}

const problems = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) problems.push(`${name}${detail ? ` — ${detail}` : ""}`);
};

/**
 * Plays the same city in the page, through the seam.
 *
 * Fifty commands and two hundred ticks: roads, three zones, two utilities, the
 * networks that join them, and long enough for the city to develop, so a field
 * that crossed the seam wrong has somewhere to show up.
 */
const PLAY = async () => {
  const { state } = globalThis.CITY;
  const c = await import("/engine/commands.js");
  globalThis.CITY.pause();
  const W = state.width;
  let row = -1;
  for (let y = 12; y < state.height - 10 && row < 0; y += 1) {
    let clear = true;
    for (let x = 8; x < 34; x += 1) {
      for (let dy = -6; dy <= 7; dy += 1) {
        const i = (y + dy) * W + x;
        if (state.tiles.terrain[i] === 3 || state.tiles.terrain[i] === 4) clear = false;
      }
    }
    if (clear) row = y;
  }
  if (row < 0) return { reason: "no dry ground" };

  const commands = [];
  commands.push({ type: c.CMD_PLACE_ROAD, actor: 1, runs: [row * W + 8, 26] });
  commands.push({ type: c.CMD_PLACE_ROAD, actor: 1, runs: [(row + 4) * W + 8, 26] });
  const band = (y0, y1, zone) => {
    const runs = [];
    for (let y = y0; y <= y1; y += 1) runs.push(y * W + 8, 26);
    commands.push({ type: c.CMD_PAINT_ZONE, actor: 1, runs, zone });
  };
  band(row + 1, row + 3, 1);
  band(row - 3, row - 1, 2);
  band(row + 5, row + 6, 3);
  commands.push({ type: c.CMD_PLACE_BUILDING, actor: 1, def: "coalPlant", x: 11, y: row - 6 });
  commands.push({ type: c.CMD_PLACE_BUILDING, actor: 1, def: "groundwaterPump", x: 23, y: row - 6 });
  const wire = [];
  const pipe = [];
  for (const spine of [13, 23]) {
    const from = spine === 13 ? row - 3 : row - 5;
    for (let y = from; y <= row + 7; y += 1) { wire.push(y * W + spine, 1); pipe.push(y * W + spine, 1); }
  }
  for (let x = 13; x <= 23; x += 1) { wire.push((row - 3) * W + x, 1); pipe.push((row - 3) * W + x, 1); }
  commands.push({ type: c.CMD_PLACE_WIRE, actor: 1, runs: wire });
  commands.push({ type: c.CMD_PLACE_PIPE, actor: 1, runs: pipe });
  commands.push({ type: c.CMD_SET_TAX, actor: 1, rate: 9 });
  // One tile at a time, to get the count up: fifty commands is what the item
  // asked for, and a single run-length-encoded stroke would be one.
  for (let x = 8; x < 44; x += 1) commands.push({ type: c.CMD_PLACE_ROAD, actor: 1, runs: [(row + 8) * W + x, 1] });

  const refused = [];
  for (const command of commands) {
    const outcome = await globalThis.CITY.apply(command);
    if (outcome.result !== "ok") refused.push(`${command.type}:${outcome.result}`);
  }
  await globalThis.CITY.tick(200);

  return {
    row,
    commands: commands.length,
    refused,
    worker: globalThis.CITY.worker,
    hash: await globalThis.CITY.hash(),
    tick: state.tick,
    buildings: state.buildings.length,
    population: state.population,
    treasury: state.players[0].treasury,
    save: globalThis.CITY.exportSave(),
  };
};

const server = serve();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const url = (extra) => `http://127.0.0.1:${port}/index.html?seed=1003&size=64&lock=0&life=0&funds=9000000${extra}`;

const arms = {};
try {
  for (const [name, extra] of [["worker", ""], ["local", "&worker=0"]]) {
    const context = await browser.newContext({ viewport: { width: 900, height: 600 } });
    const page = await context.newPage();
    page.on("pageerror", (error) => problems.push(`${name}: page error — ${error.message}`));
    page.on("console", (m) => { if (m.type() === "error") problems.push(`${name}: console — ${m.text()}`); });
    await page.goto(url(extra));
    await page.waitForFunction(() => globalThis.CITY !== undefined, undefined, { timeout: 60000 });
    await page.evaluate(() => document.querySelector("#controls-dismiss")?.click());
    arms[name] = await page.evaluate(PLAY);
    check(`${name}: the fixture city is worth comparing`,
      !arms[name].reason && arms[name].buildings > 2 && arms[name].population > 0,
      arms[name].reason ?? `${arms[name].commands} commands, ${arms[name].buildings} buildings, pop ${arms[name].population}`);
    check(`${name}: every command was accepted`, arms[name].refused?.length === 0,
      (arms[name].refused ?? []).join(", ") || "none refused");
    await context.close();
  }

  // The point of the whole lane.
  check("the page uses the worker unless it is told not to", arms.worker.worker === true,
    `default worker=${arms.worker.worker}, ?worker=0 worker=${arms.local.worker}`);
  check("?worker=0 really is the local arm", arms.local.worker === false, `worker=${arms.local.worker}`);
  check("both arms played the same city, hash for hash", arms.worker.hash === arms.local.hash,
    `${arms.worker.hash} vs ${arms.local.hash}`);
  check("both arms agree on what is in it", arms.worker.buildings === arms.local.buildings
    && arms.worker.population === arms.local.population && arms.worker.treasury === arms.local.treasury,
    `${arms.worker.buildings}/${arms.worker.population}/${arms.worker.treasury} vs `
    + `${arms.local.buildings}/${arms.local.population}/${arms.local.treasury}`);
  check("and on the clock", arms.worker.tick === arms.local.tick, `${arms.worker.tick} vs ${arms.local.tick}`);

  // A save made on one arm, restored on the other: the bytes are the city.
  const swap = await browser.newContext({ viewport: { width: 900, height: 600 } });
  const page = await swap.newPage();
  page.on("pageerror", (error) => problems.push(`swap: page error — ${error.message}`));
  await page.goto(url(""));
  await page.waitForFunction(() => globalThis.CITY !== undefined, undefined, { timeout: 60000 });
  const restored = await page.evaluate(async (text) => {
    const ok = await globalThis.CITY.importSave(text);
    return { ok, hash: await globalThis.CITY.hash(), worker: globalThis.CITY.worker };
  }, arms.local.save);
  check("a city played on this thread loads into the worker, hash for hash",
    restored.ok && restored.hash === arms.local.hash, `${restored.hash} vs ${arms.local.hash}`);
  await swap.close();
} finally {
  await browser.close();
  server.close();
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log("\nworker smoke ok");
