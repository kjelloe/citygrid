// What the lane graph came out as (slice E1).
//
// The model is pure, so this needs no browser: it builds a saturated city with
// the real reducer and prints what `deriveLanes` made of it. E1's gate is a
// number in the log rather than a picture, because a lane graph has no picture
// until V1 puts cars on it — and the counts are what a wrong derivation shows
// up in first (a T with two connectors instead of six, a link shorter than the
// car that has to sit on it).
//
//   node tools/lanes_dump.mjs [size]

import { saturatedCity } from "./lib/saturated.mjs";
import { createModel } from "../client/world/model.js";
import { DEFAULTS } from "../client/world/config.js";

const size = Number(process.argv[2] ?? 96);
// `node tools/<gate>.mjs <size> <terrain>` — Q64 is a question about a `hilly`
// map and there was no way to run this on one (D6).
const terrain = process.argv[3] ?? "rolling";
// The gates' shared city (`tools/lib/saturated.mjs`), without the seeded
// buildings: a lane graph is derived from roads, and E1's numbers were
// recorded on a city that had none.
const { state } = saturatedCity({ size, terrain, buildings: false });

// Two timings, because the model is rebuilt on every build action and E1 adds
// to it: the lane graph is the difference between them.
const t0 = Date.now();
for (let i = 0; i < 3; i += 1) createModel(state);
const ms = (Date.now() - t0) / 3;
const model = createModel(state);
const { deriveCorridors } = await import("../client/world/corridors.js");
const { createGround } = await import("../client/world/ground.js");
const { deriveLanes } = await import("../client/world/lanes.js");
let lanesMs = 0;
{
  const net = deriveCorridors(state, "road");
  const ground = createGround(state, net);
  const t = Date.now();
  for (let i = 0; i < 3; i += 1) deriveLanes(state, net, ground);
  lanesMs = (Date.now() - t) / 3;
}
const lanes = model.lanes;

const blocks = lanes.links.filter((l) => l.kind === "block");
const turns = lanes.links.filter((l) => l.kind === "turn");
const byTurn = {};
for (const t of turns) byTurn[t.turn] = (byTurn[t.turn] ?? 0) + 1;
const kinds = {};
for (const n of model.nodes) kinds[n.kind] = (kinds[n.kind] ?? 0) + 1;

const lengths = blocks.map((l) => l.len).sort((a, b) => a - b);
const shortest = lanes.links.reduce((a, b) => (a.len < b.len ? a : b));
const p = (q) => lengths[Math.min(lengths.length - 1, Math.floor(lengths.length * q))];

console.log(`city            ${size}×${size} ${terrain}, seed 1003, 400 ticks`);
console.log(`model built in  ${ms.toFixed(1)} ms  (lane graph ${lanesMs.toFixed(1)} ms of it)`);
console.log(`corridors       ${model.stats.corridors}`);
console.log(`nodes           ${model.stats.nodes}  (${Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(", ")})`);
console.log(`lanes           ${lanes.stats.lanes}`);
console.log(`links           ${lanes.stats.links}  (${blocks.length} block, ${turns.length} turn)`);
console.log(`turns           ${Object.entries(byTurn).map(([k, v]) => `${k} ${v}`).join(", ")}`);
console.log(`signals         ${lanes.stats.signals}`);
console.log(`entries/exits   ${lanes.links.filter((l) => l.entry).length} / ${lanes.links.filter((l) => l.exit).length}`);

// How far every packed lane point is from the ground under it (R4).
//
// The number this gate exists to keep. R2 gave the lane graph the corridor's
// own profile instead of a `heightAt` per point — 80 ms of model rebuild became
// 53.7 — and mapped a lane's fraction of length onto a profile built in FORWARD
// order, so every lane with `dir === 1` read it mirrored: 1.79 m mean error,
// 2,540 points of 3,742 worse than half a metre, worst 12.44 m. Half the
// traffic in the city was posed against the wrong end of its street, and
// nothing saw it — `budget_gate` counts triangles and `walkthrough` never looks
// at a car.
const LANE_TOLERANCE = 0.3;
const rows = new Map();
for (const link of lanes.links) {
  const key = link.kind === "block" ? `block dir ${link.dir}` : "turns";
  let row = rows.get(key);
  if (!row) { row = { n: 0, sum: 0, over: 0, worst: 0, at: undefined }; rows.set(key, row); }
  for (let i = 0; i < link.cum.length; i += 1) {
    const x = link.pts[i * 3];
    const z = link.pts[i * 3 + 2];
    const error = Math.abs(link.pts[i * 3 + 1] - model.heightAt(x, z));
    row.n += 1;
    row.sum += error;
    if (error > 0.5) row.over += 1;
    if (error > row.worst) { row.worst = error; row.at = { x, z }; }
  }
}
let worstLane = 0;
for (const [key, row] of rows) {
  worstLane = Math.max(worstLane, row.worst);
  console.log(`${key.padEnd(15)} ${String(row.n).padStart(5)} points, mean ${(row.sum / row.n).toFixed(2)} m `
    + `off the ground, ${row.over} over 0.5 m, worst ${row.worst.toFixed(2)} m`
    + `${row.at ? ` at ${row.at.x.toFixed(0)}, ${row.at.z.toFixed(0)}` : ""}`);
}
console.log(`block length    median ${p(0.5).toFixed(1)} m, p05 ${p(0.05).toFixed(1)} m, p95 ${p(0.95).toFixed(1)} m`);
console.log(`shortest link   ${shortest.len.toFixed(2)} m (${shortest.kind}${shortest.turn ? ` ${shortest.turn}` : ""})`);

// The one invariant worth failing on: a car is 4.5 m and has to fit.
const CAR = 4.5;
if (shortest.len < CAR) {
  console.error(`\nFAIL  a ${shortest.len.toFixed(2)} m link cannot hold a ${CAR} m car`);
  process.exit(1);
}
// What a step costs with a full crowd standing in the road (R4). `placeYield`
// used to walk every block link for every point, every step.
{
  const { createTraffic } = await import("../client/life/traffic.js");
  const { NET_PRESENT } = await import("../client/constants-mirror.js");
  // A LOADED road, or the cars never spawn and the timing is of an empty
  // simulation — the shape of instrument failure this project keeps finding.
  // The engine's own commuter pass needs buildings, and this fixture
  // deliberately has none, so the load is set directly.
  for (let i = 0; i < state.tiles.road.length; i += 1) {
    if (state.tiles.road[i] & NET_PRESENT) state.tiles.traffic[i] = 200;
  }
  const traffic = createTraffic(state, model, { cap: 400 });
  for (let i = 0; i < 300; i += 1) traffic.update(1 / 30);
  const points = [];
  for (const link of blocks.slice(0, 120)) {
    const out = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };
    lanes.sample(link, link.len / 2, out);
    points.push({ x: out.x, z: out.z });
  }
  const time = (list) => {
    const t = Date.now();
    for (let i = 0; i < 120; i += 1) { traffic.yieldTo(list); traffic.update(1 / 30); }
    return (Date.now() - t) / 120;
  };
  const bare = time([]);
  const loaded = time(points);
  const cars = traffic.cars().length;
  console.log(`traffic step    ${bare.toFixed(2)} ms with no yields, `
    + `${loaded.toFixed(2)} ms with ${points.length} of them (${cars} cars)`);
  // How the LOCAL traffic flows (T1). `traffic_gate` measures the engine's
  // commuter pass, which T1 does not touch — the cars on screen are a separate
  // simulation over the lane graph, and the give-way rule changes them and
  // nothing else. This is the only number that can see it.
  traffic.yieldTo([]);
  for (let i = 0; i < 900; i += 1) traffic.update(1 / 30);
  const all = traffic.cars();
  const moving = all.filter((c) => c.v > 1).length;
  const mean = all.reduce((a, c) => a + c.v, 0) / Math.max(1, all.length);
  console.log(`traffic flow    ${all.length} cars, ${moving} moving (${(100 * moving / Math.max(1, all.length)).toFixed(0)}%), `
    + `mean ${mean.toFixed(2)} m/s of a ${DEFAULTS.road.speed} m/s limit`);

  // **The same city at two step sizes** (D7, Q76). The density control fills a
  // road at a rate per SECOND now, so the settled population is a property of
  // the load and the cap rather than of how many frames have gone by — which is
  // what makes a card from a phone comparable to a card from a 4090. Simulated
  // seconds, not calls: `update` clamps its delta, so a slower caller lives
  // through less time per call and would otherwise look like a defect.
  {
    const { createTraffic, MAX_STEP } = await import("../client/life/traffic.js");
    const settled = (dt) => {
      // Uncapped in effect, so what settles is what the ROADS want — a cap
      // that binds would hide the thing being measured behind itself.
      const t = createTraffic(state, model, { cap: 100000 });
      const per = Math.min(dt, MAX_STEP);
      for (let elapsed = 0; elapsed < 140; elapsed += per) t.update(dt);
      return t.cars().length;
    };
    const fast = settled(1 / 60);
    const slow = settled(MAX_STEP);
    const spread = Math.abs(fast - slow) / Math.max(1, Math.max(fast, slow));
    console.log(`settled cars    ${fast} at 60 fps, ${slow} at 15 fps `
      + `(${(spread * 100).toFixed(0)}% apart, 140 s simulated)`);
    if (spread > 0.1) {
      console.error(`\nFAIL  the settled traffic depends on the frame rate (${(spread * 100).toFixed(0)}%)`);
      process.exit(1);
    }
  }
  if (cars === 0) {
    console.error("\nFAIL  the step was timed on an empty road");
    process.exit(1);
  }
}

if (worstLane > LANE_TOLERANCE) {
  console.error(`\nFAIL  a lane point is ${worstLane.toFixed(2)} m off the ground it is drawn on`);
  process.exit(1);
}

const orphans = lanes.links.filter((l) => !l.exit && l.next.length === 0);
if (orphans.length > 0) {
  console.error(`\nFAIL  ${orphans.length} link(s) lead nowhere and are not exits`);
  process.exit(1);
}
console.log("\nlanes dump ok");
