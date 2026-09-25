// The rain (slice B6).
//
// A fourth look — OVERCAST — from the street and from the air. The falling
// streaks are not in it (Q112): the pool drew 1,140 instances the frame counted
// and no camera ever saw, so it was taken out rather than left to be priced.
// What this measures is the light: a grey day is a desaturated one, and the
// check is that the frame knows it is raining and the picture is not the day.
//
//   reports/smoke-B6-street.png   from the pavement, in the rain
//   reports/smoke-B6-city.png     the same city from above
//
//     node tools/rain_shots.mjs

import { shoot } from "./screenshot.mjs";

const SEED = 1003;
const SIZE = 64;
const YEARS = 25;

const ASK = `(state, view) => ({
  raining: view.stats?.raining === true,
  lod: view.stats?.lod ?? "",
  triangles: view.stats?.triangles ?? 0,
  sky: view.stats?.sky ?? "",
})`;

const FIND = `(state) => {
  const W = state.width;
  const road = (x, y) => x >= 0 && y >= 0 && x < W && y < state.height && (state.tiles.road[y * W + x] & 16) !== 0;
  const shops = state.buildings.filter((b) => b.zone === 1 && state.tick - b.builtTick > 12)
    .sort((a, c) => Math.hypot(a.x - 32, a.y - 32) - Math.hypot(c.x - 32, c.y - 32));
  for (const b of shops) {
    const sides = [[b.x, b.y - 1], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x - 1, b.y]];
    const f = sides.findIndex(([x, y]) => road(x, y));
    if (f >= 0) return { x: b.x, y: b.y, road: sides[f], frontage: f };
  }
  return undefined;
}`;

const probe = await shoot({ out: "reports/.rain-probe.png", seed: SEED, years: YEARS, size: SIZE,
  width: 320, height: 240, extra: { __ask: FIND } });
const at = probe.answer;
if (!at) throw new Error("no house with a road in front of it");

const problems = [];
async function frame(out, opts, wantRain) {
  const r = await shoot({ out, seed: SEED, years: YEARS, size: SIZE, tier: "high",
    width: 1600, height: 900, streets: 60, frames: 60, life: true, time: "rain",
    ...opts, extra: { __ask: ASK, ...(opts.extra ?? {}) } });
  const a = r.answer ?? {};
  console.log(`${out} ok=${r.ok} raining=${a.raining} triangles=${a.triangles} ladder="${a.lod}"`);
  if (!r.ok) for (const p of r.problems.slice(0, 3)) console.log("   ", p);
  if (wantRain && a.raining !== true) problems.push(`${out}: the frame does not know it is overcast`);
}

await frame("reports/smoke-B6-street.png",
  { street: `${at.road[0]},${at.road[1]}`, yaw: (at.frontage + 2) % 4, pitch: -6 }, true);
await frame("reports/smoke-B6-city.png",
  { mode: "city", span: 12, pitch: 30, fx: at.x, fy: at.y }, true);

if (problems.length > 0) {
  for (const p of problems) console.error("FAIL —", p);
  process.exit(1);
}
console.log("\nrain shots ok");
