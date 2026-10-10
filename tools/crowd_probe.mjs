// Where the people actually are (B10, Q146).
//
//   node tools/crowd_probe.mjs [street|city] [x] [z]
//
// F2's storyboard walks a high street with six shopfronts on it and there is
// nobody on the pavement, while `stats` reports 122 people posed and 122 "near".
// A count is not a picture (E7), so this asks the only question that settles it:
// **where are the posed people, measured from the eye?**
//
// It reads the instanced pools back rather than trusting any counter — the same
// move that answered B6's rain and E7's crowd — and prints a histogram of
// distance from the camera, the nearest few, and the counters beside them so a
// disagreement between them is visible in one screen.

import { chromium } from "playwright";
import { makeStatic } from "../server/static.js";
import { createServer } from "node:http";

const server = createServer(makeStatic());
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const mode = process.argv[2] ?? "street";
const tx = Number(process.argv[3] ?? 43);
const tz = Number(process.argv[4] ?? 43);

const browser = await chromium.launch({
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
});
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on("console", (m) => { if (m.type() === "error") console.error("page error:", m.text()); });
  // The film's own city, so this probe and the storyboard are looking at the
  // same place: seed 1003, 96 tiles, twenty years with the deputy.
  const url = `http://127.0.0.1:${port}/tools/shoot.html?seed=1003&size=96&years=20&tier=high&life=1`
    + `&streets=60&frames=90&mode=${mode}${mode === "street" ? `&street=${tx},${tz}` : ""}`;
  await page.goto(url, { waitUntil: "commit", timeout: 300000 });
  await page.waitForFunction(() => globalThis.SHOT_READY === true, undefined, { timeout: 300000 });

  const report = await page.evaluate(() => {
    const view = globalThis.SHOT_VIEW;
    // A few more drawn frames with life running, so the crowds have filled and
    // been posed: a probe that reads the pools on the first frame reads a city
    // nobody has walked into yet.
    let stats;
    for (let f = 0; f < 60; f += 1) stats = view.draw({ dt: 1 / 30, frameMs: 16, now: 1000 + f * 33, dayPhase: 0.5 });

    const eye = view.view.camera.position;
    const people = [];
    for (const [name, pool] of Object.entries(view.pools)) {
      if (!/^ped/i.test(name)) continue;
      const matrix = pool.instanceMatrix?.array;
      if (!matrix) continue;
      for (let i = 0; i < pool.count; i += 1) {
        const x = matrix[i * 16 + 12];
        const y = matrix[i * 16 + 13];
        const z = matrix[i * 16 + 14];
        people.push({ pool: name, x, y, z, d: Math.hypot(x - eye.x, z - eye.z) });
      }
    }
    people.sort((a, b) => a.d - b.d);
    return {
      mode: view.view.mode,
      eye: { x: eye.x, y: eye.y, z: eye.z },
      tileM: view.model.tileM,
      pools: Object.fromEntries(Object.entries(view.pools)
        .filter(([n]) => /^ped/i.test(n)).map(([n, p]) => [n, p.count])),
      counters: {
        peds: stats.peds, pedsHeld: stats.pedsHeld, pedCap: stats.pedCap,
        pedsCity: stats.pedsCity, pedsCityNear: stats.pedsCityNear,
        pedsCityPosed: stats.pedsCityPosed, pedsCityHeld: stats.pedsCityHeld,
      },
      nearest: people.slice(0, 8),
      people: people.map((p) => p.d),
    };
  });

  const tileM = report.tileM;
  console.log(`${report.mode} mode, eye at ${report.eye.x.toFixed(1)}, ${report.eye.z.toFixed(1)} tiles `
    + `(${(report.eye.y * tileM).toFixed(1)} m up)`);
  console.log(`counters: ${JSON.stringify(report.counters)}`);
  console.log(`pools: ${JSON.stringify(report.pools)}  — ${report.people.length} instances posed\n`);

  // In METRES, because a pavement is a thing you measure in metres and the
  // scene is in tiles.
  const bands = [10, 20, 40, 80, 160, 320, Infinity];
  let from = 0;
  console.log("how far away the posed people are, from the eye:");
  for (const to of bands) {
    const n = report.people.filter((d) => d * tileM >= from && d * tileM < to).length;
    const label = to === Infinity ? `${from} m+` : `${from}–${to} m`;
    console.log(`  ${label.padEnd(12)} ${"#".repeat(Math.min(60, n)).padEnd(60)} ${n}`);
    from = to;
  }
  console.log("\nthe nearest:");
  for (const p of report.nearest) {
    console.log(`  ${(p.d * tileM).toFixed(1).padStart(7)} m  ${p.pool.padEnd(10)} `
      + `at ${p.x.toFixed(1)}, ${p.z.toFixed(1)} tiles (${(p.y * tileM).toFixed(1)} m up)`);
  }
} finally {
  await browser.close();
  server.close();
}
