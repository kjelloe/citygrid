// What the model rebuild is made of, and how much one build action changes
// (W6, Q60, Q51).
//
//   node tools/model_cost.mjs [size] [terrain]
//
// W3 priced the whole thing: a build action blocks the render thread for 38.5 ms
// on a played 96 and `createModel` is 100% of it. W6 has two shapes to choose
// between — the derivation in a worker, or per-chunk rebuilds keyed by
// `chunkHash` — and the item says to split the cost by phase and count what one
// action actually invalidates BEFORE choosing, because those two numbers decide
// it.
//
// Node, not a browser: every phase here is `client/world/`, which is pure, and
// the numbers are CPU rather than SwiftShader.

import { deriveCorridors } from "../client/world/corridors.js";
import { createGround } from "../client/world/ground.js";
import { deriveLots } from "../client/world/lots.js";
import { deriveLanes } from "../client/world/lanes.js";
import { deriveWater } from "../client/world/water.js";
import { deriveNav } from "../client/world/nav.js";
import { profilesFor } from "../client/world/grade.js";
import { createModel } from "../client/world/model.js";
import { DEFAULTS, setConfig, getConfig } from "../client/world/config.js";
import { apply } from "../engine/reducer.js";
import { generateWorld } from "../engine/worldgen.js";
import { defaultOptions } from "../engine/options.js";
import { CMD_JOIN, CMD_TICK, CMD_PLACE_ROAD, CMD_PLACE_BUILDING } from "../engine/commands.js";
import { TICKS_PER_YEAR } from "../engine/constants.js";
import { makeDeputy, deputyTurn } from "../engine/deputy.js";
import { encodeRuns } from "../shared/grid.js";
import "../engine/build-commands.js";
import "../engine/development.js";
import "../engine/utilities.js";
import "../engine/economy.js";
import "../engine/civic.js";
import "../engine/fire.js";
import "../engine/disasters.js";
import "../engine/traffic.js";
import "../engine/history.js";
import "../engine/quests.js";
import "../engine/requests.js";

setConfig(DEFAULTS);
const cfg = getConfig();
const size = Number(process.argv[2] ?? 96);
const terrain = process.argv[3] ?? "rolling";
const YEARS = 20;

const played = () => {
  const world = generateWorld(defaultOptions({
    seed: 1003, width: size, height: size, seats: 1, waterStyle: "river", terrainStyle: terrain,
  }));
  if (!world.ok) throw new Error(world.reason);
  const state = world.state;
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Mayor" });
  const deputy = makeDeputy(1, "expand");
  for (let tick = 1; tick <= YEARS * TICKS_PER_YEAR; tick += 1) {
    apply(state, { type: CMD_TICK });
    if (tick % 6 === 0) deputyTurn(state, deputy);
  }
  return state;
};

/** Median of n runs, which is what a phase costs rather than what the first one
 * cost: the first `createModel` of a process pays for every JIT decision in it. */
function median(times) {
  const sorted = [...times].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
}
function time(label, runs, fn) {
  const times = [];
  let out;
  for (let n = 0; n < runs; n += 1) {
    const t = performance.now();
    out = fn();
    times.push(performance.now() - t);
  }
  const sorted = [...times].sort((a, b) => a - b);
  // `min` as well as the median, because a derivation that allocates eight
  // thousand objects pays for a garbage collection in SOME of its runs and not
  // others: two readings of the same build action came out 31 ms and 39 ms, and
  // a change cannot be judged against a number that moves by a quarter. The
  // median is what a player feels; the min is what the code costs.
  return { label, ms: median(times), min: sorted[0], max: sorted[sorted.length - 1], out };
}

const state = played();
console.log(`${size}×${size} ${terrain}, ${YEARS} years: ${state.buildings.length} buildings, `
  + `population ${state.population}\n`);

// --- 1. the phases -----------------------------------------------------------
//
// In the order `createModel` runs them, each one given what the ones before it
// produced, so the numbers add up to the whole rather than to an argument.

// **The cold run, kept as its own number.** The first derivation in a process
// pays for every JIT decision in it, and it is also what a player pays on their
// first build action after the page loads — so it is measured first, reported
// separately, and never used as the denominator for a share.
const whole = time("createModel (everything)", 6, () => createModel(state));
// Then everything is warmed, INCLUDING the nav graph, before a single phase is
// timed. The first cut of this gate timed `createModel` cold and every phase
// warm, which is how the phase list came to account for 55% of the rebuild: the
// missing 29 ms was warmup, not work, and W6's shape was argued from it.
for (let n = 0; n < 3; n += 1) {
  const warmModel = createModel(state);
  deriveNav(state, warmModel);
  deriveCorridors(state, "road");
  deriveWater(state, cfg);
}
const corridors = time("deriveCorridors (road)", 6, () => deriveCorridors(state, "road"));
const network = corridors.out;
const water = time("deriveWater", 6, () => deriveWater(state, cfg));
const ground = time("createGround (profiles, relax)", 6, () => createGround(state, network));
const lots = time("deriveLots", 6, () => deriveLots(state, network, ground.out));
const lanes = time("deriveLanes", 6, () => deriveLanes(state, network, ground.out));
const rail = time("deriveCorridors (rail)", 6, () => deriveCorridors(state, "rail"));
const railProfiles = time("profilesFor (rail)", 6, () =>
  profilesFor(rail.out, ground.out.landAt, { maxGrade: cfg.rail.maxGrade, freeEnds: true }));
// Not inside `createModel` — `scene.js` derives it beside the model, on the
// same thread and for the same reason, so a worker that moved the model and
// left this behind would have moved half the stall (E7).
const model = whole.out;
const nav = time("deriveNav (scene.js, beside it)", 6, () => deriveNav(state, model));
// Timed again after everything else, because this is the biggest single number
// in the gate and the one most worth doubting: two readings from different
// points in the run that agree are a measurement, and one is a guess.
const navAgain = time("deriveNav (again, last)", 6, () => deriveNav(state, model));

// **The whole, measured again, warm.** The first `createModel` above is the
// first thing this process does: its six runs pay for every JIT decision in the
// derivation, and the phases below it are then timed on a warmed-up engine. The
// gap was 45% of the rebuild — 29 ms that the phase list did not account for and
// that nothing in the model was spending — and a dirty-set slice aimed at 29 ms
// of nothing would have been a slice aimed at the measurement.
const wholeWarm = time("createModel (everything, warm)", 6, () => createModel(state));

const phases = [corridors, water, ground, lots, lanes, rail, railProfiles];
const accounted = phases.reduce((n, p) => n + p.ms, 0);
console.log("what a model rebuild is made of:");
for (const p of [...phases].sort((a, b) => b.ms - a.ms)) {
  const share = (100 * p.ms / wholeWarm.ms).toFixed(0);
  console.log(`  ${p.label.padEnd(32)} ${p.ms.toFixed(2).padStart(8)} ms  ${share.padStart(3)}%`
    + `  ${"#".repeat(Math.round(p.ms / wholeWarm.ms * 40))}`);
}
console.log(`  ${"accounted for".padEnd(32)} ${accounted.toFixed(2).padStart(8)} ms  `
  + `${(100 * accounted / wholeWarm.ms).toFixed(0).padStart(3)}%`);
console.log(`  ${"createModel, whole (warm)".padEnd(32)} ${wholeWarm.ms.toFixed(2).padStart(8)} ms`);
console.log(`  ${"createModel, whole (COLD, first)".padEnd(32)} ${whole.ms.toFixed(2).padStart(8)} ms`
  + `  — what a player pays once, and what every number in this gate before W6b was`);
console.log(`  ${nav.label.padEnd(32)} ${nav.ms.toFixed(2).padStart(8)} ms  `
  + `(+${(100 * nav.ms / wholeWarm.ms).toFixed(0)}% on top, and on the same thread)`);
console.log(`  ${navAgain.label.padEnd(32)} ${navAgain.ms.toFixed(2).padStart(8)} ms  `
  + `(the same measurement from the other end of the run)`);
console.log(`\n  one build action, warm: ${(wholeWarm.ms + nav.ms).toFixed(1)} ms of derivation `
  + `— ${(100 * nav.ms / (wholeWarm.ms + nav.ms)).toFixed(0)}% of it the NAV graph, `
  + `${(100 * lanes.ms / (wholeWarm.ms + nav.ms)).toFixed(0)}% the lane graph`);

// --- 2. what ONE build action invalidates ------------------------------------
//
// The question that decides between a model worker and per-chunk rebuilds: if a
// road tile changes two chunks' worth of derivation, the second shape is cheap
// and needs no staleness rule at all.

// Keyed by the model's own KEYS, never by id. The first cut of this keyed
// everything by `c.id` and reported that one road tile changed 8,896 of 8,896
// lanes — which is true of the ids and false of the city: ids are array indices
// assigned at derivation, so adding one corridor renumbers every one of them. A
// measure of how much changed must not be a measure of how much was renumbered.
//
// The second cut built its own geometric fingerprint here, because the model had
// no stable identity to offer. **W6a gave it one**, so this now reads the same
// `key` the life systems re-seat themselves by (B11) — one definition of "the
// same street", in the model rather than in the instrument.
const place = (p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`;
const fingerprint = (m) => ({
  corridors: new Map(m.corridors.map((c) => [c.key, c.points.map(place).join(" ")])),
  lots: new Map(m.lots.map((l) => [`lot${l.id}`,
    `${l.frontage},${l.building?.def ?? ""},${l.building?.level ?? 0}`])),
  lanes: new Map((m.lanes?.links ?? []).map((l) => [l.key, `${(l.len ?? 0).toFixed(2)}`])),
});
const changed = (a, b) => {
  const out = { corridors: 0, lots: 0, lanes: 0, chunks: new Set() };
  for (const key of ["corridors", "lots", "lanes"]) {
    for (const [id, was] of a[key]) if (b[key].get(id) !== was) out[key] += 1;
    for (const id of b[key].keys()) if (!a[key].has(id)) out[key] += 1;
  }
  return out;
};

const empty = { x: 2, y: 2 };
const W = state.width;
/** An empty tile TOUCHING a road, which is what a player's next tile is.
 *
 * The first cut laid its single tile on empty ground at (2,2): a lone road tile
 * has no neighbour, so it is no corridor and no lane, and the row read "0 of
 * 1402, 0 of 8896" — a measurement of nothing, printed as the best possible
 * result. */
const attached = (() => {
  const road = state.tiles.road;
  for (let i = W + 1; i < road.length - W - 1; i += 1) {
    if ((road[i] & 16) !== 0) continue;
    if (state.tiles.buildingId[i] !== 0) continue;
    const touching = [i - 1, i + 1, i - W, i + W].some((j) => (road[j] & 16) !== 0);
    if (touching) return i;
  }
  return empty.y * W + empty.x;
})();

const actions = [
  ["one road tile", { type: CMD_PLACE_ROAD, actor: 1, runs: encodeRuns([attached]) }],
  ["a ten-tile drag", { type: CMD_PLACE_ROAD, actor: 1,
    runs: encodeRuns(Array.from({ length: 10 }, (unused, i) => (empty.y + 2) * W + empty.x + i)) }],
  ["a building", { type: CMD_PLACE_BUILDING, actor: 1, def: "clinic", x: empty.x + 2, y: empty.y + 5 }],
];

// --- 3. what a build action actually costs now (W6b) -------------------------
//
// The number W6's "done when" is about: not what a full derivation costs, but
// what the RENDERER pays when it is told what the model used to be. Measured on
// the same played 96, with a one-tile build attached to the network — which is
// the build a player makes most.
{
  const road = state.tiles.road;
  let site = -1;
  for (let i = W + 1; i < road.length - W - 1 && site < 0; i += 1) {
    if ((road[i] & 16) !== 0 || state.tiles.buildingId[i] !== 0) continue;
    if ([i - 1, i + 1, i - W, i + W].some((j) => (road[j] & 16) !== 0)) site = i;
  }
  const previous = createModel(state);
  const navBefore = deriveNav(state, previous);
  const outcome = apply(state, { type: CMD_PLACE_ROAD, actor: 1, runs: encodeRuns([site]) });

  // Warm the incremental path too, or this compares a cold reading against the
  // warm ones above (the lesson this gate itself taught, 2026-10-04).
  for (let n = 0; n < 3; n += 1) deriveNav(state, createModel(state, previous));
  // Twenty runs, not six: this is the number W6 is judged on.
  const dirty = time("createModel(state, previous)", 20, () => createModel(state, previous));
  const dirtyNav = time("deriveNav(state, model, previous)", 20,
    () => deriveNav(state, dirty.out, navBefore));
  const stats = dirty.out.lanes.stats;
  const frame = 1000 / 60;

  const navStats = dirtyNav.out.stats;
  console.log(`\nwhat a build action costs, told what the model was (${outcome.result}):`);
  console.log(`  ${"createModel(state, previous)".padEnd(32)} ${dirty.ms.toFixed(2).padStart(8)} ms  `
    + `(min ${dirty.min.toFixed(2)}, max ${dirty.max.toFixed(2)}) — `
    + `${stats.reused} corridors reused, ${stats.derived} re-derived`);
  console.log(`  ${"deriveNav(state, model, previous)".padEnd(32)} ${dirtyNav.ms.toFixed(2).padStart(8)} ms  `
    + `(min ${dirtyNav.min.toFixed(2)}, max ${dirtyNav.max.toFixed(2)}) — `
    + `${navStats.reusedEdges} edges reused, ${navStats.packedEdges} packed`);
  const total = dirty.ms + dirtyNav.ms;
  const best = dirty.min + dirtyNav.min;
  console.log(`  ${"one build action".padEnd(32)} ${total.toFixed(2).padStart(8)} ms  `
    + `${total < frame ? "INSIDE" : "over"} a 60 Hz frame (${frame.toFixed(1)} ms); `
    + `best run ${best.toFixed(2)} ms`);
}

console.log("\nwhat one action invalidates (of the whole model):");
const before = fingerprint(model);
const totals = { corridors: model.corridors.length, lots: model.lots.length,
  lanes: (model.lanes?.links ?? []).length };
for (const [name, command] of actions) {
  const outcome = apply(state, command);
  const after = fingerprint(createModel(state));
  const diff = changed(before, after);
  console.log(`  ${name.padEnd(18)} ${outcome.result === "ok" ? "   " : "(refused)"}`
    + ` corridors ${String(diff.corridors).padStart(4)} of ${totals.corridors}`
    + `   lots ${String(diff.lots).padStart(4)} of ${totals.lots}`
    + `   lanes ${String(diff.lanes).padStart(5)} of ${totals.lanes}`);
}
