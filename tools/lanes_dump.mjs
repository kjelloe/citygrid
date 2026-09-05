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

import { generateWorld } from "../engine/worldgen.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import {
  CMD_TICK, CMD_PLACE_ROAD, CMD_PAINT_ZONE, CMD_JOIN,
} from "../engine/commands.js";
// Imported for its side effect: `registerNetwork` runs at module load, and
// without it the reducer has no handler for `placeRoad` and refuses every
// command as INVALID.
import "../engine/build-commands.js";
import "../engine/development.js";
import { createModel } from "../client/world/model.js";

const size = Number(process.argv[2] ?? 96);
// A GENERATED world, not a blank state: `createState` leaves every tile at
// terrain 0 with no elevation, and the reducer refuses to build on it.
const world = generateWorld(defaultOptions({ seed: 1003, width: size, height: size, waterStyle: "river" }));
if (!world.ok) { console.error(`generation failed: ${world.reason}`); process.exit(1); }
const state = world.state;
apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Surveyor" });
state.players[0].treasury = 90000000;

// The budget gate's city: a grid every four tiles, zoned between — but only on
// land. `placeNetwork` refuses water, and a command that touches one tile of
// river is refused whole, which on seed 1003 is most of them.
const W = state.width;
const land = (x, y) => {
  const t = state.tiles.terrain[y * W + x];
  return t !== 3 && t !== 4;   // WATER, SHALLOW
};
/** Splits a line of tiles into runs of dry ones and issues each. */
function paveLine(tiles) {
  let start = -1;
  for (let k = 0; k <= tiles.length; k += 1) {
    const dry = k < tiles.length && land(tiles[k][0], tiles[k][1]);
    if (dry && start < 0) start = k;
    if (!dry && start >= 0) {
      const [x, y] = tiles[start];
      apply(state, { type: CMD_PLACE_ROAD, actor: 1, runs: [y * W + x, k - start] });
      start = -1;
    }
  }
}
for (let y = 8; y < W - 8; y += 4) {
  paveLine(Array.from({ length: W - 16 }, (_, k) => [8 + k, y]));
}
for (let x = 8; x < W - 8; x += 4) {
  for (let y = 8; y < W - 8; y += 1) if (land(x, y)) apply(state, { type: CMD_PLACE_ROAD, actor: 1, runs: [y * W + x, 1] });
}
for (let y = 9; y < W - 9; y += 4) {
  for (let x = 9; x < W - 9; x += 1) {
    if (land(x, y)) apply(state, { type: CMD_PAINT_ZONE, actor: 1, runs: [y * W + x, 1], zone: ((y / 4) | 0) % 3 + 1 });
  }
}
for (let i = 0; i < 400; i += 1) apply(state, { type: CMD_TICK });

let paved = 0;
for (let i = 0; i < state.tiles.road.length; i += 1) if (state.tiles.road[i] & 16) paved += 1;
if (paved === 0) {
  console.error("no road was built");
  process.exit(1);
}

// Two timings, because the model is rebuilt on every build action and E1 adds
// to it: the lane graph is the difference between them.
const t0 = Date.now();
for (let i = 0; i < 3; i += 1) createModel(state);
const ms = (Date.now() - t0) / 3;
const model = createModel(state);
const t1 = Date.now();
const { deriveCorridors } = await import("../client/world/corridors.js");
const { createGround } = await import("../client/world/ground.js");
const { deriveLanes } = await import("../client/world/lanes.js");
let lanesMs = 0;
{
  const net = deriveCorridors(state, "road");
  const ground = createGround(state, net);
  const t = Date.now();
  for (let i = 0; i < 3; i += 1) deriveLanes(state, net, ground.heightAt);
  lanesMs = (Date.now() - t) / 3;
}
void t1;
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

console.log(`city            ${size}×${size}, seed 1003, 400 ticks`);
console.log(`model built in  ${ms.toFixed(1)} ms  (lane graph ${lanesMs.toFixed(1)} ms of it)`);
console.log(`corridors       ${model.stats.corridors}`);
console.log(`nodes           ${model.stats.nodes}  (${Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(", ")})`);
console.log(`lanes           ${lanes.stats.lanes}`);
console.log(`links           ${lanes.stats.links}  (${blocks.length} block, ${turns.length} turn)`);
console.log(`turns           ${Object.entries(byTurn).map(([k, v]) => `${k} ${v}`).join(", ")}`);
console.log(`signals         ${lanes.stats.signals}`);
console.log(`entries/exits   ${lanes.links.filter((l) => l.entry).length} / ${lanes.links.filter((l) => l.exit).length}`);
console.log(`block length    median ${p(0.5).toFixed(1)} m, p05 ${p(0.05).toFixed(1)} m, p95 ${p(0.95).toFixed(1)} m`);
console.log(`shortest link   ${shortest.len.toFixed(2)} m (${shortest.kind}${shortest.turn ? ` ${shortest.turn}` : ""})`);

// The one invariant worth failing on: a car is 4.5 m and has to fit.
const CAR = 4.5;
if (shortest.len < CAR) {
  console.error(`\nFAIL  a ${shortest.len.toFixed(2)} m link cannot hold a ${CAR} m car`);
  process.exit(1);
}
const orphans = lanes.links.filter((l) => !l.exit && l.next.length === 0);
if (orphans.length > 0) {
  console.error(`\nFAIL  ${orphans.length} link(s) lead nowhere and are not exits`);
  process.exit(1);
}
console.log("\nlanes dump ok");
