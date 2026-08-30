// The N7 gate.
//
// "Assignment fits the month-tick budget on a saturated 128×128; congestion
// correlates with density rather than with seed luck across 200 games."
//
// Two measurements. The budget one is a stopwatch on the real pass over a real
// saturated region. The correlation one is the interesting half: if congestion
// tracks the seed rather than the city, then the traffic model is noise wearing
// a system's clothes, and every decision a player makes about roads is
// meaningless.
//
//   node tools/traffic_gate.mjs [games] [years]

import { generateWorld } from "../engine/worldgen.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import { makeDeputy, deputyTurn } from "../engine/deputy.js";
import { CMD_JOIN, CMD_TICK } from "../engine/commands.js";
import { TICKS_PER_YEAR } from "../engine/constants.js";
import { trafficPass } from "../engine/traffic.js";
import "../engine/build-commands.js";
import "../engine/development.js";
import "../engine/utilities.js";
import "../engine/economy.js";
import "../engine/civic.js";
import "../engine/fire.js";
import "../engine/disasters.js";
import "../engine/traffic.js";
import "../engine/history.js";

const GAMES = Number(process.argv[2] ?? 200);
const YEARS = Number(process.argv[3] ?? 25);

/** The plan's month-tick budget (plan.md §3.8). Traffic is one system among
 * several, so it may not have the whole thing. */
const MONTH_BUDGET_MS = 16;
const TRAFFIC_SHARE_MS = 8;

function play(seed, size, seats, years) {
  const world = generateWorld(defaultOptions({ seed, width: size, height: size, seats, waterStyle: "river" }));
  if (!world.ok) return undefined;
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
  return state;
}

let failed = false;

// --- 1. the budget ----------------------------------------------------------

console.log("building a saturated 128×128 region…");
const big = play(2026, 128, 16, 25);
let roads = 0;
for (let i = 0; i < big.tiles.road.length; i += 1) if (big.tiles.road[i] & 16) roads += 1;
let homes = 0;
for (const b of big.buildings) if (b.zone === 1) homes += 1;

// Warm, then measure. A first call pays for allocation the later ones reuse.
trafficPass(big);
const runs = [];
for (let i = 0; i < 20; i += 1) {
  const started = process.hrtime.bigint();
  trafficPass(big);
  runs.push(Number(process.hrtime.bigint() - started) / 1e6);
}
runs.sort((a, b) => a - b);
const median = runs[Math.floor(runs.length / 2)];
const worst = runs[runs.length - 1];

console.log(`\n${big.buildings.length} buildings (${homes} homes), ${roads} road tiles, pop ${big.population}`);
console.log(`traffic pass: median ${median.toFixed(2)}ms, worst ${worst.toFixed(2)}ms`);
console.log(`budget: ${TRAFFIC_SHARE_MS}ms of the ${MONTH_BUDGET_MS}ms month tick`);
console.log(`summary: ${JSON.stringify(big.traffic)}`);

if (median > TRAFFIC_SHARE_MS) {
  console.error(`\nFAIL — traffic takes ${median.toFixed(2)}ms, over its ${TRAFFIC_SHARE_MS}ms share`);
  failed = true;
}
if (big.traffic.commuters === 0) {
  console.error("\nFAIL — a saturated region produced no commuters, so the timing above measured nothing");
  failed = true;
}

// --- 2. congestion follows the city, not the seed ---------------------------

console.log(`\nrunning ${GAMES} games × ${YEARS} years to see what congestion tracks…`);
const rows = [];
for (let game = 0; game < GAMES; game += 1) {
  const state = play(70000 + game, 64, 1, YEARS);
  if (!state) continue;
  let roadTiles = 0;
  for (let i = 0; i < state.tiles.road.length; i += 1) if (state.tiles.road[i] & 16) roadTiles += 1;
  rows.push({
    seed: 70000 + game,
    population: state.population,
    congested: state.traffic.congested,
    commuters: state.traffic.commuters,
    roads: roadTiles,
    // Density is what the gate says congestion should track: people per road.
    density: roadTiles > 0 ? state.population / roadTiles : 0,
  });
}

/** Pearson's r. Not a sophisticated statistic, but the question is only
 * "does this track that", and for that it is enough. */
function correlation(xs, ys) {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let top = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    top += dx * dy;
    sx += dx * dx;
    sy += dy * dy;
  }
  const bottom = Math.sqrt(sx * sy);
  return bottom === 0 ? 0 : top / bottom;
}

const live = rows.filter((r) => r.population > 0);
const rDensity = correlation(live.map((r) => r.density), live.map((r) => r.congested));
const rPopulation = correlation(live.map((r) => r.population), live.map((r) => r.congested));
const rSeed = correlation(live.map((r) => r.seed), live.map((r) => r.congested));

console.log(`\n${live.length} games with a living city`);
console.log(`congestion vs people-per-road : r = ${rDensity.toFixed(3)}`);
console.log(`congestion vs population      : r = ${rPopulation.toFixed(3)}`);
console.log(`congestion vs SEED            : r = ${rSeed.toFixed(3)}   (should be ~0)`);

const congestedGames = live.filter((r) => r.congested > 0).length;
console.log(`games with any congestion: ${congestedGames} of ${live.length}`);

if (Math.abs(rSeed) > 0.2) {
  console.error(`\nFAIL — congestion correlates with the SEED (r=${rSeed.toFixed(3)}). That is seed luck, not a system.`);
  failed = true;
}
if (rDensity < 0.3 && rPopulation < 0.3) {
  console.error(`\nFAIL — congestion tracks neither density (${rDensity.toFixed(3)}) nor population (${rPopulation.toFixed(3)}).`);
  console.error("If roads jam for no reason the player can see, every decision about roads is meaningless.");
  failed = true;
}

if (failed) process.exit(1);
console.log("\ntraffic gate ok");
