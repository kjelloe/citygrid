// The house shots (slice S9; P61).
//
// Kjell judges by eye against the reference he attached in August, so this
// slice's gate is three pictures somebody looks at: a residential street from
// the pavement, one house from across the road, and the same neighbourhood from
// city zoom on the desktop viewport (D8).
//
// The tiles are FOUND, not remembered: `shoot()` takes an `extra.__ask`
// function that runs against the generated state, so the tool asks where the
// houses are rather than carrying a coordinate the next seed would move. Run:
//
//     node tools/house_shots.mjs

import { shoot } from "./screenshot.mjs";

const SEED = Number(process.env.SEED ?? 1003);
const SIZE = Number(process.env.SIZE ?? 64);
/** A PLAYED city, not the saturated recipe (Q72, and the review after S1):
 * `saturatedCity` is 1,129 copies of one building with no shops and no
 * residents, and the density ladder is about what a lot at a given LEVEL
 * draws — which only a city that grew has a spread of. Forty years. */
const YEARS = Number(process.env.YEARS ?? 40);

/** A one-tile house with a street on its east side, so a camera standing there
 * looks at the front of it, and the busiest residential tile for the city shot.
 * Returned as tiles; the shots below stand on them. */
const ASK = `(state) => {
  const W = state.width;
  const road = state.tiles.road;
  const fronts = [];
  for (const b of state.buildings) {
    if (b.zone !== 1) continue;
    if (b.x + 1 >= W) continue;
    // A road tile with NOTHING BUILT ON IT. A played city has tiles that are
    // both — the first version stood the camera inside a neighbour's hedge,
    // and the shot came back with a green slab across the top of the frame.
    const eastIdx = b.y * W + (b.x + 1);
    if ((road[eastIdx] & 16) === 0) continue;
    if (state.tiles.buildingId[eastIdx] !== 0) continue;
    // How many other houses are within four tiles: a street, not a lone cottage.
    let neighbours = 0;
    for (const o of state.buildings) {
      if (o.zone !== 1 || o === b) continue;
      if (Math.abs(o.x - b.x) <= 4 && Math.abs(o.y - b.y) <= 4) neighbours += 1;
    }
    // Stand on the FAR side of the road where there is one: at 20 m a tile, a
    // camera on the near kerb is seven metres from the wall and photographs
    // render, not a house.
    const farIdx = b.y * W + (b.x + 2);
    const far = (b.x + 2 < W && (road[farIdx] & 16) !== 0 && state.tiles.buildingId[farIdx] === 0)
      ? b.x + 2 : b.x + 1;
    fronts.push({ x: far, y: b.y, level: b.level, one: b.w === 1 && b.h === 1, neighbours, wide: far === b.x + 2 });
  }
  // A street rather than a lone cottage, and room to stand back in.
  fronts.sort((a, b) => (b.wide - a.wide) || (b.neighbours - a.neighbours));
  const street = fronts.find((f) => f.one && f.wide) ?? fronts.find((f) => f.one) ?? fronts[0];
  // Which way the road runs, so one shot can look ALONG it — a street of houses
  // rather than the wall of the nearest one.
  const northSouth = street && street.y + 1 < state.height
    && (road[(street.y + 1) * W + street.x] & 16) !== 0;
  return { street: { ...street, along: northSouth ? 0 : 1 }, houses: fronts.length };
}`;

const found = await shoot({
  out: "reports/.house-shots-probe.png", seed: SEED, years: YEARS, size: SIZE,
  width: 320, height: 240, extra: { __ask: ASK },
});
const at = found.answer?.street;
if (!at) throw new Error(`no residential frontage in seed ${SEED}`);
console.log(`aiming at (${at.x}, ${at.y}) — ${found.answer.houses} houses with a street in front`);

const shots = [
  // ALONG the street. Facing the houses was right while they were slabs set
  // back behind a garden; with the density ladder they stand close to the
  // kerb, and a camera pointed at one is inside its front wall (S10).
  ["reports/smoke-S10-street.png", { street: `${at.x},${at.y}`, yaw: at.along, pitch: 0, width: 1280, height: 720 }],
  // And the houses across the road, from a few doors down: far enough to see a
  // front garden and a roofline rather than a wall.
  ["reports/smoke-S10-garden.png", {
    street: `${at.x},${at.y + 2}`, yaw: at.along, pitch: 0, width: 1280, height: 720,
  }],
  ["reports/smoke-S10-city20.png", {
    mode: "city", span: 20, pitch: 30, yaw: 0, fx: at.x, fy: at.y, width: 1920, height: 1080,
  }],
];
for (const [out, opts] of shots) {
  const r = await shoot({ out, seed: SEED, years: YEARS, size: SIZE, tier: "high", streets: 60, frames: 60, ...opts });
  console.log(`${out} ok=${r.ok} tri=${r.report?.triangles} streets=${r.report?.streets?.live}`);
  if (!r.ok) for (const p of r.problems.slice(0, 3)) console.log("   ", p);
}
