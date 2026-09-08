// The performance sweep, under Playwright (slice D1).
//
//   node tools/perf_card.mjs [--hold <seconds>] [--out <path>]
//
// The same `client/debug/perf-sweep.js` the player's `?perf=1` card runs, on
// the same saturated fixture, through the same code — this file adds a browser
// and a file to write to and nothing else. That is the point: a SwiftShader row
// and a phone row have to be the same *shape* or they cannot go in one table.
//
// **What this number is and is not.** Triangles, draw calls, the LOD reason and
// the governor's sacrifices are counted by the renderer and are true on any
// machine. Frame time here is the frame time of a software rasteriser in a
// headless container, and says nothing whatever about a phone. It is the
// baseline row: the one every previous performance claim in this repository was
// actually about, written down as such so the next one can be compared to
// something honest (`workitems-measurement.md`, D1).

import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".png": "image/png",
};

function serve() {
  return createServer(async (req, res) => {
    try {
      const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
      const target = join(root, normalize(path === "/" ? "/index.html" : path));
      if (!target.startsWith(root)) return res.writeHead(403).end();
      const body = await readFile(target);
      res.writeHead(200, { "content-type": TYPES[extname(target)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
}

const arg = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at > 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
};
const hold = Number(arg("--hold", "0")) || 0;
// `--map big|steep` runs the sweep on the bigger or the steeper city (D6). The
// default output is named after the map, so three runs do not overwrite one
// another and `reports/perf/` reads as a table.
const map = arg("--map", "base");
const out = join(root, arg("--out",
  map === "base" ? "reports/perf/swiftshader.json" : `reports/perf/swiftshader-${map}.json`));

const server = serve();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const browser = await chromium.launch();
const problems = [];
let card;

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => problems.push(`page error — ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console error — ${message.text()}`);
  });

  const query = `perf=1&perfMap=${map}${hold > 0 ? `&perfHold=${hold}` : ""}`;
  await page.goto(`http://127.0.0.1:${port}/index.html?${query}`, { waitUntil: "commit" });
  // The sweep is 55 s of holding plus a warm-up per step plus the fixture's 400
  // ticks, and SwiftShader is slow at all of it. A 256-tile map spends minutes
  // in worldgen and the model derivation alone.
  await page.waitForFunction(() => globalThis.PERF_CARD !== undefined, undefined, { timeout: 1800000 });
  card = await page.evaluate(() => globalThis.PERF_CARD);
  await context.close();
} finally {
  await browser.close();
  server.close();
}

if (!card) {
  console.error("no card — the sweep did not finish");
  process.exit(1);
}

// The renderer's own counts, which are the half of this that travels. A step
// that drew nothing measured nothing, and a table of zeros looks exactly like a
// table of very fast frames.
for (const row of card.steps) {
  if (row.frames < 2) problems.push(`${row.step}: ${row.frames} frame(s) sampled`);
  if (!(row.triangles > 0)) problems.push(`${row.step}: ${row.triangles} triangles`);
  if (row.entered === false) problems.push(`${row.step}: never reached street mode`);
  // Not a failure — a slow machine legitimately cannot reach the same city
  // inside the warm-up — but it has to be said out loud, or two cards get put
  // in one table and compared as though they were of the same place (D2).
  if (row.thinSample) {
    console.warn(`  note  ${row.step}: only ${row.frames} frames in the hold — the governor's `
      + `window is 60 and its floor is 10, so this row did not test it, and its p95 is `
      + `a percentile over ${row.frames} numbers`);
  }
  if (row.settled === false) {
    console.warn(`  note  ${row.step}: the city was still filling after `
      + `${row.settleFrames} frames (${row.settleS}s) — ${row.cars} cars is not an equilibrium`);
  }
}

card.renderer = "swiftshader (headless chromium)";
card.note = "Frame times are software rendering. Triangles, draw calls and the "
  + "governor's decisions are the machine-independent half.";
await mkdir(dirname(out), { recursive: true });
await writeFile(out, `${JSON.stringify(card, undefined, 1)}\n`);

const pad = (text, width) => String(text).padEnd(width);
console.log(card.fixture);
console.log(`${pad("step", 26)}${pad("p50", 8)}${pad("p95", 8)}${pad("tris", 9)}${pad("calls", 7)}${pad("water", 8)}lod`);
for (const row of card.steps) {
  console.log(`${pad(row.step, 26)}${pad(row.p50, 8)}${pad(row.p95, 8)}`
    + `${pad(row.triangles, 9)}${pad(row.drawCalls, 7)}${pad(row.waterTriangles, 8)}${row.lod}`);
}
console.log(`\n${card.machine.deviceClass}, tier ${card.machine.tier} — wrote ${out}`);

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
