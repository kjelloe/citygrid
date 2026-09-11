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
    if ((road[b.y * W + (b.x + 1)] & 16) === 0) continue;
    // How many other houses are within four tiles: a street, not a lone cottage.
    let neighbours = 0;
    for (const o of state.buildings) {
      if (o.zone !== 1 || o === b) continue;
      if (Math.abs(o.x - b.x) <= 4 && Math.abs(o.y - b.y) <= 4) neighbours += 1;
    }
    // Stand on the FAR side of the road where there is one: at 20 m a tile, a
    // camera on the near kerb is seven metres from the wall and photographs
    // render, not a house.
    const far = (b.x + 2 < W && (road[b.y * W + (b.x + 2)] & 16) !== 0) ? b.x + 2 : b.x + 1;
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
  out: "reports/.house-shots-probe.png", seed: SEED, years: 20, size: SIZE,
  width: 320, height: 240, extra: { __ask: ASK },
});
const at = found.answer?.street;
if (!at) throw new Error(`no residential frontage in seed ${SEED}`);
console.log(`aiming at (${at.x}, ${at.y}) — ${found.answer.houses} houses with a street in front`);

const shots = [
  // From the pavement, facing the houses. Looking ALONG the street was tried
  // and is what a player sees at a junction: a lamp post, a hydrant and the
  // underside of a tree. The slice is about the houses, so the shot faces them.
  ["reports/smoke-S9-street.png", { street: `${at.x},${at.y}`, yaw: 3, pitch: 8, width: 1280, height: 720 }],
  // And the house next door, from the pavement. The city camera was tried for
  // this and cannot do it: `span` clamps at 8 tiles, which at 20 m a tile is
  // 160 m of city — an aerial of the block, not a house with a garden.
  ["reports/smoke-S9-garden.png", {
    street: `${at.x},${at.y + 1}`, yaw: 3, pitch: 2, width: 1280, height: 720,
  }],
  ["reports/smoke-S9-city20.png", {
    mode: "city", span: 20, pitch: 30, yaw: 0, fx: at.x, fy: at.y, width: 1920, height: 1080,
  }],
];
for (const [out, opts] of shots) {
  const r = await shoot({ out, seed: SEED, years: 20, size: SIZE, tier: "high", streets: 60, frames: 60, ...opts });
  console.log(`${out} ok=${r.ok} tri=${r.report?.triangles} streets=${r.report?.streets?.live}`);
  if (!r.ok) for (const p of r.problems.slice(0, 3)) console.log("   ", p);
}
