// The traffic shots (slice B4).
//
// What a green suite cannot tell you is whether a street reads as traffic. The
// numbers say the population follows the hour and that some cars have their
// brakes on; only a picture says whether that looks like a road at half past
// eight or like boxes sliding along a line.
//
// A PLAYED city (forty years), because the load the cars read is the engine's
// commuter layer and an empty map has none of it. The tile is FOUND — the
// busiest road tile with clear ground to stand on — rather than remembered,
// so the next seed does not put the camera in a hedge (S10).
//
//     node tools/traffic_shots.mjs

import { shoot } from "./screenshot.mjs";

const SEED = Number(process.env.SEED ?? 1003);
const SIZE = Number(process.env.SIZE ?? 64);
const YEARS = Number(process.env.YEARS ?? 40);

/** The junction with the most CARS ON IT, asked of the traffic itself.
 *
 * The first version of this ranked junctions by the engine's commuter load and
 * shot the winner: both pictures came back with 438 cars in the city and not
 * one in frame. A played city's load is spread thin, and "the busiest tile" in
 * it can still be a road a car visits once a minute. The count the shot needs
 * is the one the renderer's own traffic reports for a box around the camera —
 * verify the instrument is pointed at something before believing the picture.
 */
const ASK = `(state, view) => {
  const W = state.width;
  const H = state.height;
  const road = state.tiles.road;
  const isRoad = (x, y) => x >= 0 && y >= 0 && x < W && y < H && (road[y * W + x] & 16) !== 0;
  const clear = (x, y) => isRoad(x, y) && state.tiles.buildingId[y * W + x] === 0;
  const spots = [];
  for (let y = 3; y < H - 3; y += 1) {
    for (let x = 3; x < W - 3; x += 1) {
      if (!clear(x, y)) continue;
      const arms = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => isRoad(x + dx, y + dy)).length;
      if (arms < 3) continue;
      const cars = view.traffic.count({ x0: x - 3, y0: y - 3, x1: x + 3, y1: y + 3 });
      spots.push({ x, y, arms, cars });
    }
  }
  spots.sort((a, b) => (b.cars - a.cars) || (b.arms - a.arms));
  const approach = (j) => [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) =>
    [3, 2, 4].some((d) => clear(j.x + dx * d, j.y + dy * d) && isRoad(j.x + dx * (d + 1), j.y + dy * (d + 1))
      && isRoad(j.x + dx * (d - 1), j.y + dy * (d - 1))
      && !isRoad(j.x + dx * d + dy, j.y + dy * d + dx) && !isRoad(j.x + dx * d - dy, j.y + dy * d - dx)));
  const at = spots.find(approach);
  if (!at) return { at: null, junctions: 0, busiest: 0 };
  // \`yaw\` is in QUARTER TURNS, and forward is (-sin yaw, -cos yaw) in x,z
  // (client/world/orbit.js): 0 looks at -y, 1 at -x, 2 at +y, 3 at +x. Standing
  // at +d means looking at -d. Two tiles back, so the junction is in frame
  // rather than under the camera.
  //
  // And the tile stood on must be a plain STRAIGHT — road ahead and behind,
  // nothing to either side. The first aim stood on a tile two back from the
  // junction that was itself on a crossing road: the walker steps onto the
  // pavement of the NEAREST corridor, which there is the other street's
  // carriageway, and at rush the shot came back as the inside of a mustard car
  // 1.6 m from the lens.
  const straight = (x, y, dx, dy) => clear(x, y) && isRoad(x + dx, y + dy) && isRoad(x - dx, y - dy)
    && !isRoad(x + dy, y + dx) && !isRoad(x - dy, y - dx);
  let back;
  for (const d of [3, 2, 4]) {
    back = [[0, 1, 0], [0, -1, 2], [1, 0, 1], [-1, 0, 3]]
      .map(([dx, dy, yaw]) => [dx * d, dy * d, yaw, dx, dy])
      .filter(([bx, by, , dx, dy]) => straight(at.x + bx, at.y + by, dx, dy))[0];
    if (back) break;
  }
  return {
    at: back
      ? { x: at.x + back[0], y: at.y + back[1], yaw: back[2], cars: at.cars, arms: at.arms }
      : { x: at.x, y: at.y, yaw: 0, cars: at.cars, arms: at.arms },
    junctions: spots.length,
    busiest: at.cars,
  };
}`;

// The probe settles at the MORNING phase, because that is the shot being
// aimed and the quiet hour puts the cars somewhere else.
const found = await shoot({
  out: "reports/.traffic-shots-probe.png", seed: SEED, years: YEARS, size: SIZE,
  width: 320, height: 240, extra: { __ask: ASK, hour: 0.08 },
});
const at = found.answer?.at;
if (!at) throw new Error(`no junction with clear ground in seed ${SEED}`);
console.log(`aiming at (${at.x}, ${at.y}) — ${found.answer.junctions} junctions, `
  + `${at.cars} cars within three tiles of the busiest, ${at.arms} arms`);
if (at.cars === 0) throw new Error("the busiest junction in the city has no cars on it");

// The two hours the item names. `hour=` is the phase directly, so the morning
// is the RUSH (0.08 on the curve, ×1.30) rather than a mid-morning; the night
// is the trough (×0.40). Both are settled at their own hour — `life=0` settles
// once, and the phase now reaches that settle (B4).
const shots = [
  ["reports/smoke-B4-morning.png", { hour: 0.08, time: "day" }],
  ["reports/smoke-B4-night.png", { hour: 0.78, time: "night" }],
];
for (const [out, { hour, time }] of shots) {
  const r = await shoot({
    out, seed: SEED, years: YEARS, size: SIZE, tier: "high", streets: 60, frames: 60,
    street: `${at.x},${at.y}`, yaw: at.yaw, pitch: 0, time,
    width: 1280, height: 720, extra: { hour },
  });
  console.log(`${out} ok=${r.ok} tri=${r.report?.triangles} cars=${r.report?.cars ?? "?"}`);
  if (!r.ok) for (const p of r.problems.slice(0, 3)) console.log("   ", p);
}
