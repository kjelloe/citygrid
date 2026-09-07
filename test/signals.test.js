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

test("an unsignalled node has no crossing painted on it", () => {
  const model = crossroads();
  for (const node of model.nodes) {
    if (model.lanes.signals.has(node.id)) continue;
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
