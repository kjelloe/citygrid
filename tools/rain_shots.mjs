// The rain (slice B6).
//
// A fourth look — OVERCAST — from the street and from the air, and since A115
// the falling STREAKS as well.
//
// What this measures is the light (a grey day is a desaturated one) and, on
// foot, where the rain actually IS. B6's pool drew 1,140 instances the frame
// counted and no camera ever saw: every probe it had reported a COUNT, and a
// count is not a picture. So this one reads back the first instance's MATRIX
// and asks how far it is from the camera — the question that would have found
// it in one run (Q112).
//
//   reports/smoke-B6-street.png   from the pavement, in the rain
//   reports/smoke-B6-city.png     the same city from above
//
//     node tools/rain_shots.mjs

import { shoot } from "./screenshot.mjs";

const SEED = 1003;
const SIZE = 64;
const YEARS = 25;

const ASK = `(state, view) => {
  const pool = view.pools?.rain;
  const m = pool && pool.count > 0 ? pool.instanceMatrix.array : undefined;
  const v = view.view;
  // Where the camera is, in tiles: the walker's own eye on foot, the target
  // from the air. Both of B6's placements were far from both.
  const eye = v.mode === "street" && v.eye ? v.eye : { x: v.targetX, y: v.groundY ?? 0, z: v.targetZ };
  let near = Infinity;
  let far = 0;
  for (let i = 0; i < (pool ? pool.count : 0); i += 1) {
    const d = Math.hypot(m[i * 16 + 12] - eye.x, m[i * 16 + 14] - eye.z);
    if (d < near) near = d;
    if (d > far) far = d;
  }
  return {
    raining: view.stats?.raining === true,
    lod: view.stats?.lod ?? "",
    triangles: view.stats?.triangles ?? 0,
    sky: view.stats?.sky ?? "",
    streaks: pool ? pool.count : -1,
    drawn: pool ? pool.visible : false,
    nearest: pool && pool.count > 0 ? +near.toFixed(2) : -1,
    furthest: pool && pool.count > 0 ? +far.toFixed(2) : -1,
  };
}`;

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
async function frame(out, opts, wantRain, rain) {
  const r = await shoot({ out, seed: SEED, years: YEARS, size: SIZE, tier: "high",
    width: 1600, height: 900, streets: 60, frames: 60, life: true, time: "rain",
    ...opts, extra: { __ask: ASK, ...(opts.extra ?? {}) } });
  const a = r.answer ?? {};
  console.log(`${out} ok=${r.ok} raining=${a.raining} triangles=${a.triangles} ladder="${a.lod}"`
    + ` streaks=${a.streaks} drawn=${a.drawn} nearest=${a.nearest} furthest=${a.furthest}`);
  if (!r.ok) for (const p of r.problems.slice(0, 3)) console.log("   ", p);
  if (wantRain && a.raining !== true) problems.push(`${out}: the frame does not know it is overcast`);
  // On foot the streaks have to be THERE, and around the camera: B6's were
  // counted at 1,140 and fell twelve hundred tiles away, and past the map's
  // edge before that.
  if (rain === "street") {
    if (!(a.streaks > 0 && a.drawn)) problems.push(`${out}: ${a.streaks} streaks, drawn=${a.drawn}`);
    if (!(a.nearest >= 0 && a.nearest < 2)) problems.push(`${out}: the nearest streak is ${a.nearest} tiles away`);
    if (!(a.furthest < 4)) problems.push(`${out}: a streak is ${a.furthest} tiles from the camera`);
  }
  // And from the air there are none: a raindrop at eighteen pixels a tile is
  // nothing, and the weather up there is the light (A115).
  if (rain === "city" && a.streaks > 0) problems.push(`${out}: ${a.streaks} streaks drawn from the city camera`);
}

await frame("reports/smoke-B6-street.png",
  { street: `${at.road[0]},${at.road[1]}`, yaw: (at.frontage + 2) % 4, pitch: -6 }, true, "street");
await frame("reports/smoke-B6-city.png",
  { mode: "city", span: 12, pitch: 30, fx: at.x, fy: at.y }, true, "city");

if (problems.length > 0) {
  for (const p of problems) console.error("FAIL —", p);
  process.exit(1);
}
console.log("\nrain shots ok");
