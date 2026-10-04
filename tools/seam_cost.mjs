// What the worker bought, and what is still on the render thread (W3).
//
//   node tools/seam_cost.mjs [size] [terrain]
//
// Every number here is CPU on one thread, measured in node, which is why this is
// not a browser tool: the frame times this project can take are SwiftShader's
// and do not travel, but the time a reducer or a model rebuild blocks a thread
// for is this machine's CPU and travels to any machine with a similar one. The
// browser's half of W2 is proven by `tools/worker_smoke.mjs`; this is the half
// that says whether moving the reducer was worth anything.
//
// The question it answers, in one table: for a build action and for a tick, what
// did the main thread pay BEFORE the seam (the reducer, inline) and what does it
// pay AFTER (the patch, and the model rebuild that never moved)?

import { createSimHost } from "../worker/sim-host.js";
import { createMirror, applyPatch } from "../client/mirror.js";
import { apply } from "../engine/reducer.js";
import { hashState } from "../engine/state.js";
import { CMD_TICK, CMD_JOIN, CMD_PLACE_ROAD } from "../engine/commands.js";
import { TICKS_PER_MONTH, TICKS_PER_YEAR } from "../engine/constants.js";
import { makeDeputy, deputyTurn } from "../engine/deputy.js";
import { generateWorld } from "../engine/worldgen.js";
import { defaultOptions } from "../engine/options.js";
import { createModel } from "../client/world/model.js";
import { DEFAULTS, setConfig } from "../client/world/config.js";
import { encodeRuns } from "../shared/grid.js";

setConfig(DEFAULTS);

const size = Number(process.argv[2] ?? 96);
const terrain = process.argv[3] ?? "rolling";
const YEARS = 20;

/** p50 / p95 / max of a list of millisecond samples. */
function spread(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (f) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))];
  return { p50: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1], n: sorted.length };
}
const ms = (v) => `${v.toFixed(2)} ms`;
const row = (name, s) => console.log(`  ${name.padEnd(34)} p50 ${ms(s.p50).padStart(9)}   `
  + `p95 ${ms(s.p95).padStart(9)}   max ${ms(s.max).padStart(9)}   (${s.n})`);

/** A PLAYED city, which is the only kind worth timing: the saturated fixture is
 * a monoculture and an empty map is not a measurement (CLAUDE.md). */
function playedCity() {
  const world = generateWorld(defaultOptions({
    seed: 1003, width: size, height: size, seats: 1, waterStyle: "river", terrainStyle: terrain,
  }));
  if (!world.ok) throw new Error(`generation failed: ${world.reason}`);
  const state = world.state;
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "Mayor" });
  const deputy = makeDeputy(1, "expand");
  for (let tick = 1; tick <= YEARS * TICKS_PER_YEAR; tick += 1) {
    apply(state, { type: CMD_TICK });
    if (tick % 6 === 0) deputyTurn(state, deputy);
  }
  return state;
}

/** A road nobody has built yet, somewhere the city has not reached. */
function freeRoad(state, n) {
  const W = state.width;
  const y = 2 + (n % 6);
  const x = 2 + ((n * 7) % Math.max(1, W - 20));
  return { type: CMD_PLACE_ROAD, actor: 1, runs: encodeRuns([y * W + x, y * W + x + 1, y * W + x + 2]) };
}

const state = playedCity();
console.log(`${size}×${size} ${terrain}, ${YEARS} years with the deputy: `
  + `${state.buildings.length} buildings, population ${state.population}, tick ${state.tick}\n`);

// --- 1. what the main thread paid BEFORE the seam ----------------------------
//
// The reducer, inline, on the thread that draws. This is exactly what `?worker=0`
// still does and what every build before 2026-10-04 did.

const fast = [];
const month = [];
for (let n = 0; n < 240; n += 1) {
  const t = performance.now();
  apply(state, { type: CMD_TICK });
  const took = performance.now() - t;
  (state.tick % TICKS_PER_MONTH === 0 ? month : fast).push(took);
}
const builds = [];
for (let n = 0; n < 60; n += 1) {
  const command = freeRoad(state, n);
  const t = performance.now();
  apply(state, command);
  builds.push(performance.now() - t);
}

// --- 2. what the main thread pays AFTER it -----------------------------------
//
// The patch: the layers that changed, decoded into the mirror, plus the rest of
// the state assigned in. The worker's own cost (the reducer, and building the
// patch) is paid on the other thread and is reported here only to say what the
// worker is doing while the main thread is free.

const host = createSimHost();
const ready = host.handle({ type: "init", id: 0, options: state.options }).reply;
const mirror = createMirror(ready.patch);
// Play the mirror's city up to the same shape, through the host, so the patches
// being measured are a real city's patches rather than an empty map's.
const deputyLess = Math.floor(YEARS * TICKS_PER_YEAR);
host.handle({ type: "apply", id: 1, command: { type: CMD_JOIN, actor: 1, seat: 1, name: "Mayor" } });
host.handle({ type: "tick", id: 2, count: deputyLess });

const patchTick = [];
const workerTick = [];
for (let n = 0; n < 240; n += 1) {
  const t0 = performance.now();
  const { reply } = host.handle({ type: "tick", id: 10 + n, count: 1 });
  workerTick.push(performance.now() - t0);
  const t1 = performance.now();
  applyPatch(mirror, reply.patch);
  patchTick.push(performance.now() - t1);
}
const patchBuild = [];
for (let n = 0; n < 60; n += 1) {
  const { reply } = host.handle({ type: "apply", id: 100 + n, command: freeRoad(mirror, n) });
  const t = performance.now();
  applyPatch(mirror, reply.patch);
  patchBuild.push(performance.now() - t);
}

// --- 3. what never moved -----------------------------------------------------
//
// `createModel` runs on the render thread after every accepted build action
// (`renderer.worldChanged`), and the seam did not touch it. Q60 measured 53.3 ms
// on a 96 at era 1; this is the same number at era 26 on a played city.

const models = [];
for (let n = 0; n < 10; n += 1) {
  const t = performance.now();
  createModel(state);
  models.push(performance.now() - t);
}

// The desync detector's own cost, once a sim-month on the main thread (W2).
const hashes = [];
for (let n = 0; n < 20; n += 1) {
  const t = performance.now();
  hashState(mirror);
  hashes.push(performance.now() - t);
}

console.log("on the MAIN thread, before the seam (?worker=0 still does this):");
row("a build command (reducer)", spread(builds));
row("a fast tick (reducer)", spread(fast));
row("a month tick (reducer)", spread(month));
console.log("\non the MAIN thread, after it:");
row("a build command (patch)", spread(patchBuild));
row("a tick (patch)", spread(patchTick));
row("the monthly desync check (hash)", spread(hashes));
console.log("\non the WORKER thread (the main thread is free for this):");
row("a tick (reducer + patch built)", spread(workerTick));
console.log("\nand what never moved — the render thread pays this per build action:");
row("createModel (cityviewer)", spread(models));

const before = spread(builds).p50 + spread(models).p50;
const after = spread(patchBuild).p50 + spread(models).p50;
console.log(`\na build action blocks the render thread for ${ms(before)} before the seam and `
  + `${ms(after)} after it`);
console.log(`the model rebuild is ${(100 * spread(models).p50 / after).toFixed(1)}% of what is left`);
