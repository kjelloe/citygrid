// Cars on the lane graph (slice V1; ruling 037, specs/engine/09-life.md §9.1).
//
// `test/traffic.test.js` is the ENGINE's traffic — the monthly commuter
// assignment that fills `tiles.traffic`. This is the renderer's, which reads
// that layer and puts cars on it. Two different things with one name, kept in
// two files.
//
// The engine has computed a per-tile commuter load since N7 and until now the
// only things that read it were an overlay tint and one row of the inspector.
// This is the other reader — and it is a RENDERER-SIDE simulation: no vehicle
// enters state, no float enters state, no hash moves. What makes that safe is
// that every choice a car makes comes from a hash of an integer that is already
// in state (ruling 032), so two clients showing the same city show the same
// traffic without agreeing on anything.
//
// Everything below is the pure half: the following model, the density control,
// the signal, the cap and the determinism. What a car looks like is a
// screenshot's job.

import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { adjacencyMask, tileAt } from "../shared/grid.js";
import { NET_PRESENT } from "../client/constants-mirror.js";
import { DEFAULTS } from "../client/world/config.js";
import { createModel } from "../client/world/model.js";
import { createTraffic, CAR_M } from "../client/life/traffic.js";

const { stopLine, speed: VMAX, maxDensity } = DEFAULTS.road;

function blank(size = 12) {
  return createState(defaultOptions({ width: size, height: size, seed: 7 }));
}

function pave(state, ...groups) {
  const road = state.tiles.road;
  const tiles = groups.flat();
  for (const [x, y] of tiles) road[tileAt(state.width, x, y)] = NET_PRESENT;
  for (const [x, y] of tiles) {
    const mask = adjacencyMask(state.width, state.height, x, y, (i) => (road[i] & NET_PRESENT) !== 0);
    road[tileAt(state.width, x, y)] = NET_PRESENT | mask;
  }
}

const row = (y, x0, x1) => Array.from({ length: x1 - x0 + 1 }, (_, k) => [x0 + k, y]);
const column = (x, y0, y1) => Array.from({ length: y1 - y0 + 1 }, (_, k) => [x, y0 + k]);

/** Sets the engine's commuter load on every road tile. */
function load(state, value) {
  for (let i = 0; i < state.tiles.road.length; i += 1) {
    if (state.tiles.road[i] & NET_PRESENT) state.tiles.traffic[i] = value;
  }
}

/** A long straight road with a given load. */
function highway(value = 255, size = 24) {
  const state = blank(size);
  pave(state, row(6, 2, size - 3));
  load(state, value);
  const model = createModel(state);
  return { state, model };
}

/** Runs `seconds` of simulation in fixed steps. */
function run(traffic, seconds, dt = 1 / 30) {
  for (let t = 0; t < seconds; t += dt) traffic.update(dt);
}

// --- the following model -----------------------------------------------------

test("cars never overlap, however long they run", () => {
  // The one that matters: a following model that lets a gap go negative has
  // cars driving through each other, and at a distance it reads as a flicker
  // rather than as a bug.
  const { state, model } = highway();
  const traffic = createTraffic(state, model, { cap: 400 });
  const gaps = [];
  for (let step = 0; step < 60 * 30; step += 1) {
    traffic.update(1 / 30);
    if (step % 200 !== 0) continue;
    for (const [a, b] of traffic.pairsOnSameLink()) {
      gaps.push(b.s - a.s - CAR_M);
    }
  }
  assert.ok(gaps.length > 50, `only ${gaps.length} pairs to check`);
  const worst = Math.min(...gaps);
  assert.ok(worst >= -1e-6, `two cars overlapped by ${(-worst).toFixed(3)} m`);
});

test("nobody drives backwards, and nobody exceeds the speed limit", () => {
  const { state, model } = highway();
  const traffic = createTraffic(state, model, { cap: 400 });
  for (let step = 0; step < 30 * 30; step += 1) {
    traffic.update(1 / 30);
    for (const car of traffic.cars()) {
      assert.ok(car.v >= -1e-9, `a car is going ${car.v.toFixed(2)} m/s`);
      assert.ok(car.v <= VMAX + 1e-6, `a car is going ${car.v.toFixed(2)} m/s over ${VMAX}`);
    }
  }
});

test("a car keeps a gap that grows with speed", () => {
  // The headway term. At a standstill the gap is S0; at speed it is S0 plus a
  // time headway, which is what makes a queue discharge like a queue.
  // A QUIET road, because a busy one is slow by design: the engine's load is
  // what sets the desired speed, and at a full byte nothing does 5 m/s.
  const { state, model } = highway(50);
  const traffic = createTraffic(state, model, { cap: 400 });
  run(traffic, 90);
  const moving = [];
  for (const [a, b] of traffic.pairsOnSameLink()) {
    if (a.v > 5) moving.push({ gap: b.s - a.s - CAR_M, v: a.v });
  }
  assert.ok(moving.length > 3, `only ${moving.length} moving pairs`);
  for (const m of moving) {
    assert.ok(m.gap > 1, `a car doing ${m.v.toFixed(1)} m/s is ${m.gap.toFixed(2)} m behind the next`);
  }
});

// --- density -----------------------------------------------------------------

test("a busy road fills to its target density and stays there", () => {
  const { state, model } = highway(255);
  const traffic = createTraffic(state, model, { cap: 1000 });
  // Long enough to settle: a fully loaded road runs at a third of the limit,
  // so a car takes a hundred seconds to cross it.
  run(traffic, 150);
  const settled = traffic.count();
  run(traffic, 60);
  const after = traffic.count();
  assert.ok(Math.abs(after - settled) <= Math.max(2, settled * 0.1),
    `${settled} cars became ${after}`);

  // And the number is the one the engine's load asks for, not an accident.
  const metres = model.lanes.links.filter((l) => l.kind === "block")
    .reduce((sum, l) => sum + l.len, 0);
  const wanted = (metres / 100) * maxDensity;
  assert.ok(settled > wanted * 0.4 && settled <= wanted,
    `${settled} cars for a ceiling of ${wanted.toFixed(1)} over ${metres.toFixed(0)} m`);
});

test("an empty road is empty, and a quiet one is quieter AND faster", () => {
  const quiet = highway(20);
  const busy = highway(255);
  const a = createTraffic(quiet.state, quiet.model, { cap: 1000 });
  const b = createTraffic(busy.state, busy.model, { cap: 1000 });
  run(a, 90);
  run(b, 90);
  assert.ok(a.count() < b.count(), `${a.count()} on a quiet road, ${b.count()} on a busy one`);
  // The engine's load has to be visible in the SPEED too, or a jam is just a
  // longer line of cars going the same speed as an empty street.
  const mean = (t) => t.cars().reduce((sum, c) => sum + c.v, 0) / Math.max(1, t.count());
  assert.ok(mean(a) > mean(b) + 1,
    `${mean(a).toFixed(1)} m/s on a quiet road against ${mean(b).toFixed(1)} on a busy one`);

  const empty = highway(0);
  const none = createTraffic(empty.state, empty.model, { cap: 1000 });
  run(none, 40);
  assert.equal(none.count(), 0, "cars appeared on a road nobody drives on");
});

test("the cap is a cap", () => {
  const { state, model } = highway(255, 40);
  const traffic = createTraffic(state, model, { cap: 25 });
  run(traffic, 90);
  assert.ok(traffic.count() <= 25, `${traffic.count()} cars against a cap of 25`);
  assert.ok(traffic.count() > 0, "the cap emptied the road");
});

// --- signals -----------------------------------------------------------------

test("a red light stops the first car short of the junction", () => {
  const state = blank(16);
  pave(state, row(7, 2, 13), column(7, 2, 13));
  load(state, 200);
  const model = createModel(state);
  const traffic = createTraffic(state, model, { cap: 200 });
  run(traffic, 120);

  const node = model.nodes.find((n) => n.kind === "junction");
  let stopped = 0;
  for (let t = 0; t < 60; t += 0.5) {
    traffic.update(0.5);
    const phase = model.lanes.phaseAt(node.id, traffic.clock());
    for (const car of traffic.cars()) {
      const link = model.lanes.links[car.link];
      if (link.kind !== "block" || link.to !== node.id) continue;
      if (link.axis === phase) continue;                 // green for this car
      // Held: no car may be past the stop line on a red.
      assert.ok(car.s <= link.len + 1e-6,
        `a car ran ${(car.s - link.len).toFixed(2)} m past a red light`);
      if (car.s > link.len - (stopLine + CAR_M) && car.v < 0.5) stopped += 1;
    }
  }
  assert.ok(stopped > 0, "nothing ever waited at a red light");
});

test("a queue forms behind a red and clears on green", () => {
  const state = blank(16);
  pave(state, row(7, 2, 13), column(7, 2, 13));
  load(state, 255);
  const model = createModel(state);
  const traffic = createTraffic(state, model, { cap: 300 });
  run(traffic, 180);
  let queued = 0;
  for (let t = 0; t < 120; t += 0.25) {
    traffic.update(0.25);
    queued = Math.max(queued, traffic.cars().filter((c) => c.v < 0.5).length);
  }
  assert.ok(queued >= 2, `the longest queue was ${queued} car(s)`);
});

// --- determinism -------------------------------------------------------------

test("one city, one seed, two identical runs", () => {
  // Not a nicety: it is what lets a screenshot gate compare two pictures, and
  // it is the whole reason nothing here reaches for Math.random.
  const build = () => {
    const { state, model } = highway();
    const traffic = createTraffic(state, model, { cap: 200 });
    run(traffic, 45);
    return traffic.cars().map((c) => `${c.link}:${c.s.toFixed(6)}:${c.v.toFixed(6)}`);
  };
  assert.deepEqual(build(), build());
});

test("nothing here touches Math.random or the clock", () => {
  const saved = Math.random;
  Math.random = () => { throw new Error("traffic reached for Math.random"); };
  try {
    const { state, model } = highway();
    const traffic = createTraffic(state, model, { cap: 100 });
    run(traffic, 10);
    assert.ok(traffic.count() > 0);
  } finally {
    Math.random = saved;
  }
});

test("freezing leaves cars on the road but stops the clock", () => {
  // `?life=0`: a screenshot has to be the same picture twice.
  const { state, model } = highway();
  const traffic = createTraffic(state, model, { cap: 200, life: false });
  const before = traffic.cars().map((c) => `${c.link}:${c.s}`);
  run(traffic, 30);
  assert.deepEqual(traffic.cars().map((c) => `${c.link}:${c.s}`), before);
  assert.ok(traffic.count() > 0, "a frozen road is an empty road");
});

// --- the world it drives in --------------------------------------------------

test("a car that reaches the end of the road leaves", () => {
  const { state, model } = highway();
  const traffic = createTraffic(state, model, { cap: 200 });
  run(traffic, 120);
  for (const car of traffic.cars()) {
    const link = model.lanes.links[car.link];
    assert.ok(car.s <= link.len + 1e-6, `a car is ${(car.s - link.len).toFixed(2)} m past the end of its link`);
    assert.ok(car.s >= -1e-6);
  }
});

test("a car never sits on a link that is not in the graph", () => {
  const state = blank(16);
  pave(state, row(7, 2, 13), column(7, 2, 13));
  load(state, 180);
  const model = createModel(state);
  const traffic = createTraffic(state, model, { cap: 200 });
  run(traffic, 90);
  for (const car of traffic.cars()) {
    assert.ok(model.lanes.links[car.link], `car on link ${car.link}, which does not exist`);
  }
});

test("a road with nowhere to go still runs", () => {
  // One isolated tile: no corridor, no lane, no car, and no exception.
  const state = blank();
  pave(state, [[5, 5]]);
  load(state, 255);
  const traffic = createTraffic(state, createModel(state), { cap: 50 });
  run(traffic, 20);
  assert.equal(traffic.count(), 0);
});
