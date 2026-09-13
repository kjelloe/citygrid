// Signal heads and crossings (slice V8; spec §9.2, A33).
//
// Cars have stopped at invisible lights since E1. `phaseAt` decides the cycle,
// `ahead()` treats a red as a wall, and the player watches a queue form at a
// junction with nothing standing at it — which reads as a jam rather than as a
// light, and is the one thing that makes traffic look broken instead of alive.
//
// Two pieces, and only one of them can be baked. A HEAD is geometry: a post at
// the kerb with a housing on it, and it goes into the chunk with everything
// else. Its LENS is not: it changes three times a minute, so it is an instance
// coloured per frame from the same `phaseAt` the cars read. Two sources of
// truth about which way is green would be a car going through a red one.

import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { adjacencyMask, tileAt } from "../shared/grid.js";
import { NET_PRESENT } from "../client/constants-mirror.js";
import { DEFAULTS, setConfig } from "../client/world/config.js";
import { createModel } from "../client/world/model.js";
import { signalHeads, crossingBars, lensColour } from "../client/world/signals.js";

setConfig(DEFAULTS);
const T = DEFAULTS.tileM;

function crossroads(size = 16) {
  const state = createState(defaultOptions({ width: size, height: size, seed: 7 }));
  state.tiles.elevation.fill(40);
  const road = state.tiles.road;
  const tiles = [];
  for (let x = 2; x < size - 2; x += 1) tiles.push([x, 8]);
  for (let y = 2; y < size - 2; y += 1) tiles.push([8, y]);
  for (const [x, y] of tiles) road[tileAt(size, x, y)] = NET_PRESENT;
  for (const [x, y] of tiles) {
    road[tileAt(size, x, y)] = NET_PRESENT
      | adjacencyMask(size, size, x, y, (i) => (road[i] & NET_PRESENT) !== 0);
  }
  return createModel(state);
}

// --- the heads -------------------------------------------------------------------

test("a signalled junction gets a head on every approach", () => {
  const model = crossroads();
  const node = model.nodes.find((n) => model.lanes.signals.has(n.id));
  assert.ok(node, "the fixture has no signalled junction in it");
  const heads = signalHeads(model, node);
  assert.equal(heads.length, node.corridors.length, `${heads.length} heads on ${node.corridors.length} arms`);
});

test("an unsignalled node gets none", () => {
  // A bend or the end of a road is not a junction, and a light on one would be
  // a light nothing obeys — the cars only read `signals`.
  const model = crossroads();
  for (const node of model.nodes) {
    if (model.lanes.signals.has(node.id)) continue;
    assert.deepEqual(signalHeads(model, node), []);
  }
});

test("a head stands at the kerb, not in the road and not in a garden", () => {
  const model = crossroads();
  const node = model.nodes.find((n) => model.lanes.signals.has(n.id));
  const half = DEFAULTS.road.width / 2;
  for (const head of signalHeads(model, node)) {
    const across = Math.min(Math.abs(head.x - node.x), Math.abs(head.z - node.z));
    assert.ok(across > half, `a head ${across.toFixed(2)} m from the centre line is in the carriageway`);
    assert.ok(across < half + DEFAULTS.road.sidewalk + 1,
      `a head ${across.toFixed(2)} m out has walked into the gardens`);
  }
});

test("a head stands back from the junction box, where a driver can see it", () => {
  const model = crossroads();
  const node = model.nodes.find((n) => model.lanes.signals.has(n.id));
  const box = DEFAULTS.road.width / 2 + DEFAULTS.road.sidewalk;
  for (const head of signalHeads(model, node)) {
    const d = Math.hypot(head.x - node.x, head.z - node.z);
    assert.ok(d >= box - 1e-6, `a head ${d.toFixed(2)} m from the middle of a ${box} m box`);
  }
});

test("every head knows its node and its axis, so a lens can be lit", () => {
  const model = crossroads();
  const node = model.nodes.find((n) => model.lanes.signals.has(n.id));
  for (const head of signalHeads(model, node)) {
    assert.equal(head.node, node.id);
    assert.ok(head.axis === "ns" || head.axis === "ew", `axis "${head.axis}"`);
    assert.ok(Number.isFinite(head.h) && head.h > 2, `a ${head.h} m post`);
  }
});

// --- the lens ---------------------------------------------------------------------

test("the lens reads the same phase the cars do", () => {
  // Two sources of truth about which way is green is a car driving through a
  // red one, and it would only ever be visible for the second it took.
  const model = crossroads();
  const node = model.nodes.find((n) => model.lanes.signals.has(n.id));
  const [head] = signalHeads(model, node);
  for (const t of [0, 7, 19, 31, 44, 58]) {
    const phase = model.lanes.phaseAt(node.id, t);
    const colour = lensColour(phase, head.axis);
    if (phase === "amber") assert.equal(colour.name, "amber");
    else assert.equal(colour.name, phase === head.axis ? "green" : "red");
  }
});

test("green, amber and red are three colours a driver can tell apart", () => {
  const seen = new Map();
  for (const name of ["green", "amber", "red"]) {
    const c = lensColour(name === "green" ? "ns" : name === "amber" ? "amber" : "ew", "ns");
    seen.set(c.name, c.hex);
  }
  assert.equal(seen.size, 3, `${[...seen.keys()].join(", ")}`);
  const rgb = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  const values = [...seen.values()];
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      const [a, b] = [rgb(values[i]), rgb(values[j])];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      assert.ok(d > 60, `two lenses ${d.toFixed(0)} apart in 8-bit RGB`);
    }
  }
});

// --- the crossings ------------------------------------------------------------------

test("a signalled junction gets crossing bars on every approach", () => {
  const model = crossroads();
  const node = model.nodes.find((n) => model.lanes.signals.has(n.id));
  const bars = crossingBars(model, node);
  assert.ok(bars.length >= node.corridors.length * 3,
    `${bars.length} bars for ${node.corridors.length} approaches`);
  for (const bar of bars) {
    assert.equal(bar.points.length, 2);
    const len = Math.hypot(bar.points[1].x - bar.points[0].x, bar.points[1].z - bar.points[0].z);
    assert.ok(len > 0.5, `a ${len.toFixed(2)} m bar`);
  }
});

test("the bars lie across the carriageway, not along it", () => {
  const model = crossroads();
  const node = model.nodes.find((n) => model.lanes.signals.has(n.id));
  for (const bar of crossingBars(model, node)) {
    // Every bar runs perpendicular to the arm it is on, so its own direction is
    // at right angles to the line from the node to its middle.
    const mx = (bar.points[0].x + bar.points[1].x) / 2 - node.x;
    const mz = (bar.points[0].z + bar.points[1].z) / 2 - node.z;
    const dx = bar.points[1].x - bar.points[0].x;
    const dz = bar.points[1].z - bar.points[0].z;
    const dot = Math.abs((mx * dx + mz * dz) / (Math.hypot(mx, mz) * Math.hypot(dx, dz) || 1));
    assert.ok(dot < 0.2, `a bar ${dot.toFixed(2)} out of square with its approach`);
  }
});

test("a node that is not a junction has no crossing painted on it", () => {
  // An end or a bend is not a place anyone crosses. A give-way JUNCTION is, and
  // it keeps its bars — see below (T1, A51).
  const model = crossroads();
  for (const node of model.nodes) {
    if (node.kind === "junction") continue;
    assert.deepEqual(crossingBars(model, node), []);
  }
});

test("heads and bars are a function of the model and nothing else", () => {
  const a = crossroads();
  const b = crossroads();
  const nodeA = a.nodes.find((n) => a.lanes.signals.has(n.id));
  const nodeB = b.nodes.find((n) => b.lanes.signals.has(n.id));
  assert.deepEqual(signalHeads(a, nodeA), signalHeads(b, nodeB));
  assert.deepEqual(crossingBars(a, nodeA), crossingBars(b, nodeB));
});

// --- what an unsignalled junction keeps (slice T1, A51) ----------------------

test("an unsignalled junction loses its heads, and its zebra unless a door asks for one", () => {
  // A51 kept the bars at every give-way junction; the review after S5 saw a
  // grid of white bars from the air, and S3 paints a crossing only where a
  // signal or a door demand is. This T has no doors on it at all.
  const state = createState(defaultOptions({ width: 16, height: 16, seed: 7 }));
  state.tiles.elevation.fill(40);
  const road = state.tiles.road;
  const tiles = [];
  for (let x = 2; x < 14; x += 1) tiles.push([x, 8]);
  for (let y = 8; y < 14; y += 1) tiles.push([8, y]);   // a T, not a crossroads
  for (const [x, y] of tiles) road[tileAt(16, x, y)] = NET_PRESENT;
  for (const [x, y] of tiles) {
    road[tileAt(16, x, y)] = NET_PRESENT
      | adjacencyMask(16, 16, x, y, (i) => (road[i] & NET_PRESENT) !== 0);
  }
  const model = createModel(state);
  const tee = model.nodes.find((n) => n.degree === 3);
  assert.ok(tee, "no T in the fixture");
  assert.equal(model.lanes.signals.has(tee.id), false);
  assert.deepEqual(signalHeads(model, tee), [], "a give-way junction has heads on it");
  assert.deepEqual(crossingBars(model, tee), [], "a give-way junction with nobody to cross to has a zebra");
});

test("a node that is not a junction at all gets neither", () => {
  const model = crossroads();
  for (const node of model.nodes) {
    if (node.kind === "junction") continue;
    assert.deepEqual(signalHeads(model, node), []);
    assert.deepEqual(crossingBars(model, node), []);
  }
});

// --- where a crossing is painted (S3) --------------------------------------------
//
// T1 kept the bars at every junction and from the air a dense grid was white
// bars. A crossing is painted where a signal is, or where the doors on one of
// its arms draw people: a shop's, a civic building's.

import { crossingWanted } from "../client/world/signals.js";
import { FLAG_RUINED } from "../client/constants-mirror.js";

function tee(buildings = []) {
  // A street along y = 8 with a stem down from x = 8: a T, which is give-way.
  const size = 16;
  const state = createState(defaultOptions({ width: size, height: size, seed: 7 }));
  state.tiles.elevation.fill(40);
  const road = state.tiles.road;
  const tiles = [];
  for (let x = 2; x < 14; x += 1) tiles.push([x, 8]);
  for (let y = 9; y < 14; y += 1) tiles.push([8, y]);
  for (const [x, y] of tiles) road[tileAt(size, x, y)] = NET_PRESENT;
  for (const [x, y] of tiles) {
    road[tileAt(size, x, y)] = NET_PRESENT | adjacencyMask(size, size, x, y, (i) => (road[i] & NET_PRESENT) !== 0);
  }
  let id = 1;
  for (const b of buildings) {
    const building = { id: id++, def: "", zone: 1, x: 0, y: 7, w: 1, h: 1, owner: 1, level: 1, valueTier: 1,
      occupancy: 30, condition: 100, builtTick: 0, flags: 0, ...b };
    state.buildings.push(building);
    state.tiles.buildingId[tileAt(size, building.x, building.y)] = building.id;
  }
  const model = createModel(state);
  return { model, node: model.nodes.find((n) => n.kind === "junction") };
}

test("a give-way corner on a street of houses has no zebra", () => {
  const houses = [3, 4, 5, 6, 10, 11, 12].map((x) => ({ x }));
  const { model, node } = tee(houses);
  assert.ok(node, "the fixture has no junction");
  assert.equal(model.lanes.signals.has(node.id), false, "the T is signalled");
  assert.equal(crossingWanted(model, node), false);
  assert.deepEqual(crossingBars(model, node), []);
});

test("a shop on one of its arms paints the crossing", () => {
  const { model, node } = tee([{ x: 10, zone: 2, occupancy: 40 }, { x: 4 }]);
  assert.equal(crossingWanted(model, node), true, "a shop's door did not ask for a crossing");
  assert.ok(crossingBars(model, node).length >= node.corridors.length * 3);
  // A shop as the engine makes it: no occupants at all (occupancy counts
  // RESIDENTS). It still draws people.
  const real = tee([{ x: 10, zone: 2, occupancy: 0 }]);
  assert.equal(crossingWanted(real.model, real.node), true, "a shop with the engine's zero occupancy painted nothing");
  // A ruined one draws nobody.
  const ruin = tee([{ x: 10, zone: 2, occupancy: 0, flags: FLAG_RUINED }]);
  assert.equal(crossingWanted(ruin.model, ruin.node), false, "a ruined shop painted a crossing");
});

test("a signalled crossroads keeps its bars whatever is on it", () => {
  const model = crossroads();
  const node = model.nodes.find((n) => model.lanes.signals.has(n.id));
  assert.equal(crossingWanted(model, node), true);
});

import { stopMarks } from "../client/world/signals.js";

test("a signalled junction has a stop line and an arrow on each approach, behind its zebra (S3)", () => {
  const cfg = DEFAULTS;
  const model = crossroads();
  const node = model.nodes.find((n) => model.lanes.signals.has(n.id));
  const marks = stopMarks(model, node);
  const stops = marks.filter((m) => m.kind === "stop");
  assert.equal(stops.length, node.corridors.length, `${stops.length} stop lines on ${node.corridors.length} approaches`);
  const bars = crossingBars(model, node);
  const far = (p) => Math.hypot(p.x - node.x, p.z - node.z);
  const zebraOut = Math.max(...bars.flatMap((b) => b.points.map(far)).map((d) => d));
  for (const stop of stops) {
    const width = Math.hypot(stop.points[1].x - stop.points[0].x, stop.points[1].z - stop.points[0].z);
    assert.ok(Math.abs(width - cfg.road.width / 2) < 1e-6, `a stop line ${width.toFixed(2)} m long: not one lane`);
    const mid = { x: (stop.points[0].x + stop.points[1].x) / 2, z: (stop.points[0].z + stop.points[1].z) / 2 };
    assert.ok(far(mid) > Math.min(...bars.map((b) => far({ x: (b.points[0].x + b.points[1].x) / 2, z: (b.points[0].z + b.points[1].z) / 2 }))),
      "a stop line in front of the zebra");
  }
  assert.ok(zebraOut > 0);
  for (const arrow of marks.filter((m) => m.kind === "arrow")) assert.equal(arrow.points.length, 2);
});

test("a give-way junction has no stop line", () => {
  const { model, node } = tee([{ x: 10, zone: 2, occupancy: 40 }]);
  assert.deepEqual(stopMarks(model, node), []);
});
