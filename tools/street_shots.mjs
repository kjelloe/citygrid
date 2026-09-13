// The street shots (slice S3).
//
// A shopping street from the pavement of a PLAYED city: its parking bays, the
// bench and bike rack outside a shop, the bollards and the name sign at the
// corner, the wear down the lanes. Aimed at a shop with a street in front of
// it, found by asking the page, and COUNTED before it is called a street.
//
//   reports/smoke-S3-street.png   along a shopping street, from the road
//   reports/smoke-S3-shop.png     facing the shop across its bays
//   reports/smoke-S3-corner.png   at a junction, facing its corner
//   reports/smoke-S3-city15.png   the same streets at D4's row-3 zoom (city 15, 26°)
//   reports/smoke-S3-row3.png     that view beside D4's reference row 3
//
//     node tools/street_shots.mjs

import { shoot } from "./screenshot.mjs";

const SEED = 1003;
const SIZE = 64;
const YEARS = 20;

// The standing shop nearest the middle with a road on one side, the side (the
// frontage and the yaw in quarter turns that faces it), and the road tile.
const FIND = `(state) => {
  const W = state.width;
  const road = (x, y) => x >= 0 && y >= 0 && x < W && y < state.height && (state.tiles.road[y * W + x] & 16) !== 0;
  const shops = state.buildings.filter((b) => b.zone === 2 && (b.flags & 8) === 0 && state.tick - b.builtTick > 72)
    .sort((a, c) => Math.hypot(a.x - 32, a.y - 32) - Math.hypot(c.x - 32, c.y - 32));
  for (const b of shops) {
    const sides = [[b.x, b.y - 1], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x - 1, b.y]];
    const f = sides.findIndex(([x, y]) => road(x, y));
    if (f < 0) continue;
    // A junction along this street, for the corner shot: the first road tile
    // with three or more road neighbours, walking along the frontage.
    const along = f % 2 === 0 ? [1, 0] : [0, 1];
    let junction;
    for (const dir of [1, -1]) {
      for (let k = 1; k < 8 && !junction; k += 1) {
        const [x, y] = [sides[f][0] + along[0] * k * dir, sides[f][1] + along[1] * k * dir];
        if (!road(x, y)) break;
        const n = [[0, -1], [1, 0], [0, 1], [-1, 0]].filter(([dx, dy]) => road(x + dx, y + dy)).length;
        if (n >= 3) junction = [x, y];
      }
    }
    return { frontage: f, road: sides[f], junction };
  }
  return undefined;
}`;

const COUNT = `(state, view) => {
  const pools = view.pools ?? {};
  const cars = Object.keys(pools).filter((k) => /^car\\d+$/.test(k)).reduce((n, k) => n + (pools[k].count ?? 0), 0);
  return { cars, live: view.stats?.streets?.live ?? 0, keys: view.stats?.streets?.keys ?? "" };
}`;

const problems = [];
const probe = await shoot({ out: "reports/.street-probe.png", seed: SEED, years: YEARS, size: SIZE,
  width: 320, height: 240, extra: { __ask: FIND } });
const at = probe.answer;
if (!at) throw new Error("no standing shop with a street in front of it");
console.log(`shop's street at ${at.road}, frontage ${at.frontage}, junction ${at.junction ?? "none near"}`);

const shots = [
  // Along the street, from the road in front of the shop.
  ["reports/smoke-S3-street.png", { street: `${at.road[0]},${at.road[1]}`, yaw: (at.frontage + 1) % 4, pitch: -6 }],
  // Facing the shop across its bays: the bench, the bike rack, the cars.
  ["reports/smoke-S3-shop.png", { street: `${at.road[0]},${at.road[1]}`, yaw: (at.frontage + 2) % 4, pitch: -10 }],
];
if (at.junction) {
  shots.push(["reports/smoke-S3-corner.png", { street: `${at.junction[0]},${at.junction[1]}`, yaw: at.frontage, pitch: -8 }]);
}
for (const [out, camera] of shots) {
  const r = await shoot({ out, seed: SEED, years: YEARS, size: SIZE, tier: "high", streets: 40, frames: 60,
    width: 1280, height: 720, extra: { __ask: COUNT }, ...camera });
  console.log(`${out} ${JSON.stringify(camera)} ok=${r.ok} tri=${r.report?.triangles} ${JSON.stringify(r.answer)}`);
  if (!r.ok) problems.push(...r.problems.slice(0, 2));
  if (!(r.answer?.live > 0)) problems.push(`${out}: no street chunk baked — a picture of instanced boxes`);
}

// Beside D4's reference row 3 (TERRACE): one image, the reference left, and
// the same kind of view on the right — row 3 is "close and low over a
// residential street", city at span 15 and 26° (compare_sheet.mjs), not the
// pavement. A street-level frame beside an aerial is two different questions.
await shoot({ out: "reports/smoke-S3-city15.png", seed: SEED, years: YEARS, size: SIZE, tier: "high",
  mode: "city", span: 15, pitch: 26, yaw: 0.6, fx: at.road[0], fy: at.road[1], width: 1280, height: 720, frames: 40 });
{
  const { chromium } = await import("playwright");
  const { readFileSync, writeFileSync } = await import("node:fs");
  const ref = readFileSync("debugging/transport-world-3.png").toString("base64");
  const ours = readFileSync("reports/smoke-S3-city15.png").toString("base64");
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 2000, height: 560 } });
  await page.setContent(`<body style="margin:0;background:#15171a;display:flex;gap:8px">
    <img src="data:image/png;base64,${ref}" style="height:560px;width:auto;max-width:1000px;object-fit:cover">
    <img src="data:image/png;base64,${ours}" style="height:560px;width:auto;max-width:992px;object-fit:cover"></body>`);
  await page.waitForTimeout(300);
  writeFileSync("reports/smoke-S3-row3.png", await page.screenshot());
  await browser.close();
  console.log("reports/smoke-S3-row3.png — D4's row 3 reference beside the city 15 view of the same streets");
}

if (problems.length > 0) {
  console.error(`\nFAIL  ${problems.join("\n      ")}`);
  process.exit(1);
}
console.log("\nstreet shots ok");
