// Where is the city, really? Finds the densest window of a given zone so a
// screenshot frames something instead of a field. Not part of the game.
import { generateWorld } from "../engine/worldgen.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import { makeDeputy, deputyTurn } from "../engine/deputy.js";
import { CMD_JOIN, CMD_TICK } from "../engine/commands.js";
import { TICKS_PER_YEAR, ZONE_RESIDENTIAL, ZONE_COMMERCIAL, ZONE_INDUSTRIAL } from "../engine/constants.js";
import "../engine/build-commands.js";
import "../engine/development.js";
import "../engine/utilities.js";
import "../engine/economy.js";
import "../engine/civic.js";
import "../engine/fire.js";
import "../engine/disasters.js";
import "../engine/traffic.js";
import "../engine/history.js";

const seed = Number(process.env.SEED ?? 2026);
const years = Number(process.env.YEARS ?? 25);
const size = Number(process.env.SIZE ?? 128);
const seats = Number(process.env.SEATS ?? 16);
const win = Number(process.env.WIN ?? 10);
const ZONES = { residential: ZONE_RESIDENTIAL, commercial: ZONE_COMMERCIAL, industrial: ZONE_INDUSTRIAL };
const want = ZONES[process.env.ZONE ?? "residential"];

const world = generateWorld(defaultOptions({ seed, width: size, height: size, seats, waterStyle: "river" }));
if (!world.ok) throw new Error(world.reason);
const state = world.state;
const deputies = [];
for (let s = 1; s <= seats; s += 1) {
  apply(state, { type: CMD_JOIN, actor: s, seat: s, name: `Deputy ${s}` });
  deputies.push(makeDeputy(s, "expand"));
}
for (let tick = 1; tick <= years * TICKS_PER_YEAR; tick += 1) {
  apply(state, { type: CMD_TICK });
  if (tick % 6 === 0) for (const d of deputies) deputyTurn(state, d);
}

const counts = new Map();
for (const b of state.buildings) {
  if (b.zone !== want) continue;
  const key = `${Math.floor(b.x / win)},${Math.floor(b.y / win)}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}
const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
const total = state.buildings.length;
const byZone = {};
for (const b of state.buildings) byZone[b.zone] = (byZone[b.zone] ?? 0) + 1;
let paved = 0;
for (let i = 0; i < state.tiles.road.length; i += 1) if ((state.tiles.road[i] & 16) !== 0) paved += 1;

console.log(`buildings ${total}  by zone ${JSON.stringify(byZone)}`);
console.log(`paved tiles ${paved} of ${state.tiles.road.length} (${Math.round(paved / state.tiles.road.length * 100)}%)`);
for (const [key, n] of ranked) {
  const [gx, gy] = key.split(",").map(Number);
  console.log(`  FX=${gx * win + win / 2} FY=${gy * win + win / 2}  ${n} buildings`);
}
