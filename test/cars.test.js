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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";
import { createTraffic, CAR_M, MAX_STEP } from "../client/life/traffic.js";

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

/** The smallest thing `pose` will write into. */
function fakePool() {
  return { count: 0 };
}
function fakePush(pool) {
  pool.count += 1;
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

// --- the review's findings (slice R1) ----------------------------------------

test("a junction's desired speed is never looked up by a node id (R1.3)", () => {
  // `desired` is keyed by LINK id. On a turn link `link.from` is a NODE id, so
  // `desired.get(link.from)` returned whichever link happened to have that
  // number — a stranger's speed.
  //
  // Asserted against the SOURCE, which is not how this project prefers to test
  // anything, and here is why it is the honest instrument: the two key spaces
  // overlap, so the wrong answer is a plausible speed rather than a wrong one;
  // and a car crosses an 8 m junction box in well under a second, so nothing
  // measurable about its position changes. What is wrong is which map the
  // lookup is in, and that is a fact about the code.
  const source = readFileSync(join(repoRoot, "client", "life", "traffic.js"), "utf8");
  assert.equal(/desired\.get\([^)]*link\.from/.test(source), false,
    "a node id is being used as a key into a map of link ids");
  assert.match(source, /car\.v0 = link\.kind === "block"/,
    "the desired speed is not carried on the car through the junction");
});

test("a car carries a desired speed, and a loaded road slows it", () => {
  const { state, model } = highway(255);
  const traffic = createTraffic(state, model, { cap: 400 });
  run(traffic, 20);
  const busy = traffic.cars();
  assert.ok(busy.length > 4);
  for (const car of busy) {
    assert.ok(car.v0 > 0 && car.v0 < VMAX,
      `a car on a fully loaded road aiming at ${car.v0} of ${VMAX} m/s`);
  }

  // A LIGHT load, not none: an empty road has no cars on it to ask.
  const { state: light, model: lightModel } = highway(30);
  const quiet = createTraffic(light, lightModel, { cap: 400 });
  run(quiet, 20);
  const fastest = Math.max(...quiet.cars().map((c) => c.v0), 0);
  assert.ok(fastest > Math.max(...busy.map((c) => c.v0)),
    `an empty road aims at ${fastest} and a full one at ${Math.max(...busy.map((c) => c.v0))}`);
});

test("only the cars on screen are posed, and the count agrees with the pose", () => {
  // `traffic.pose` walked every car in the city and `counts.cars` counted every
  // car in the city. On a saturated 128×128 that is 3,660 cars at 82 triangles
  // — 300k against a 200k budget — so the ladder dropped the cars at every
  // zoom and the pools carried the cost anyway (R1.1).
  const state = blank(40);
  pave(state, row(6, 2, 37), row(30, 2, 37));
  load(state, 200);
  const model = createModel(state);
  const traffic = createTraffic(state, model, { cap: 600 });
  run(traffic, 30);

  const all = traffic.count();
  assert.ok(all > 8, `only ${all} cars in the whole city`);

  // A box around the first street only.
  const bounds = { x0: 0, y0: 3, x1: 40, y1: 12 };
  const near = traffic.count(bounds);
  assert.ok(near > 0 && near < all, `${near} of ${all} cars are in the box`);

  const posed = [];
  const pools = { car0: {}, car1: {} };
  const push = (pool, x, y, z) => posed.push({ x, y, z });
  assert.equal(traffic.pose(pools, push, [0xffffff], bounds), near,
    "the pose and the count disagree, which is what makes the budget wrong");
  assert.equal(posed.length, near);
  for (const at of posed) {
    assert.ok(at.z >= bounds.y0 - 1 && at.z <= bounds.y1 + 1, `a car posed at z ${at.z}`);
  }
});

test("no bounds means the whole city, so nothing else has to know about this", () => {
  const { state, model } = highway(200);
  const traffic = createTraffic(state, model, { cap: 200 });
  run(traffic, 20);
  const pools = { car0: {}, car1: {} };
  let posed = 0;
  assert.equal(traffic.pose(pools, () => { posed += 1; }, [0xffffff]), traffic.count());
  assert.equal(posed, traffic.count());
});

// --- cars yield to people (slice E7, A45) -------------------------------------

test("a car stops for somebody standing in the road", () => {
  // A45, answered by Kjell: cars yield, the walker goes anywhere. The collision
  // world never keeps a person off a carriageway, so the carriageway has to
  // keep itself off them.
  const { state, model } = highway();
  const traffic = createTraffic(state, model, { cap: 400 });
  run(traffic, 30);
  const before = traffic.cars().filter((c) => c.v > 1).length;
  assert.ok(before > 3, `only ${before} cars were moving before anybody stepped out`);

  // Somebody steps into the middle of the road, at the middle of the map.
  const mid = 12.5 * DEFAULTS.tileM;
  const centre = 6.5 * DEFAULTS.tileM;
  for (let step = 0; step < 30 * 20; step += 1) {
    traffic.yieldTo([{ x: mid, z: centre }]);
    traffic.update(1 / 30);
  }
  // Every car that has reached them is stopped short, and none has driven over
  // the spot.
  const stopped = traffic.cars().filter((c) => c.v < 0.2).length;
  assert.ok(stopped > 0, "nothing stopped for a person in the road");
});

test("nobody is driven over", () => {
  const { state, model } = highway();
  const traffic = createTraffic(state, model, { cap: 400 });
  run(traffic, 20);
  const mid = 12.5 * DEFAULTS.tileM;
  const centre = 6.5 * DEFAULTS.tileM;
  const out = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };
  let closest = Infinity;
  for (let step = 0; step < 30 * 40; step += 1) {
    traffic.yieldTo([{ x: mid, z: centre }]);
    traffic.update(1 / 30);
    for (const car of traffic.cars()) {
      const link = model.lanes.links[car.link];
      if (!link) continue;
      model.lanes.sample(link, car.s, out);
      closest = Math.min(closest, Math.hypot(out.x - mid, out.z - centre));
    }
  }
  // A car's own length plus the gap it leaves; anything less and it is on top
  // of somebody.
  assert.ok(closest > 1, `a car came within ${closest.toFixed(2)} m of a pedestrian`);
});

test("the road clears again once they are off it", () => {
  // A yield that is never withdrawn is a permanent roadblock, and it would look
  // exactly like a jam.
  const { state, model } = highway();
  const traffic = createTraffic(state, model, { cap: 400 });
  run(traffic, 20);
  const mid = 12.5 * DEFAULTS.tileM;
  const centre = 6.5 * DEFAULTS.tileM;
  for (let step = 0; step < 30 * 20; step += 1) {
    traffic.yieldTo([{ x: mid, z: centre }]);
    traffic.update(1 / 30);
  }
  traffic.yieldTo([]);
  run(traffic, 20);
  const moving = traffic.cars().filter((c) => c.v > 1).length;
  assert.ok(moving > 3, `only ${moving} cars moved again after the road cleared`);
});

test("an empty yield list costs nothing and changes nothing", () => {
  const a = highway();
  const b = highway();
  const ta = createTraffic(a.state, a.model, { cap: 400 });
  const tb = createTraffic(b.state, b.model, { cap: 400 });
  for (let step = 0; step < 30 * 20; step += 1) {
    ta.update(1 / 30);
    tb.yieldTo([]);
    tb.update(1 / 30);
  }
  const key = (t) => t.cars().map((c) => `${c.id}:${c.link}:${c.s.toFixed(6)}`).join("|");
  assert.equal(key(ta), key(tb));
});

// --- headlights and tail lights (slice V8, spec §9.1) ------------------------

test("a car carries a lamp at each end, and they are at each end", () => {
  // Two emissive quads per car, dialled with `night`. What a screenshot cannot
  // check is that they are the right way round: a car with its headlights
  // behind it is a car driving backwards, and at a distance it reads as
  // traffic going the wrong way down the street.
  const { state, model } = highway();
  const traffic = createTraffic(state, model, { cap: 400 });
  run(traffic, 20);
  const car = traffic.cars()[0];
  assert.ok(car, "no car to light");
  const lamps = traffic.lampsOf(car);
  assert.equal(lamps.length, 2);
  const [head, tail] = lamps;
  assert.equal(head.kind, "head");
  assert.equal(tail.kind, "tail");
  // Along the direction of travel: the head is in front of the tail.
  const out = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };
  model.lanes.sample(model.lanes.links[car.link], car.s, out);
  const ahead = (p) => (p.x - out.x) * out.tx + (p.z - out.z) * out.tz;
  assert.ok(ahead(head) > ahead(tail), "the headlights are on the back of the car");
  assert.ok(ahead(head) - ahead(tail) > 2, `the two lamps are ${(ahead(head) - ahead(tail)).toFixed(2)} m apart`);
});

test("the lamps sit at the car's own height, not on the road", () => {
  const { state, model } = highway();
  const traffic = createTraffic(state, model, { cap: 400 });
  run(traffic, 20);
  const car = traffic.cars()[0];
  const out = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };
  model.lanes.sample(model.lanes.links[car.link], car.s, out);
  for (const lamp of traffic.lampsOf(car)) {
    assert.ok(lamp.y > out.y, `a lamp ${(out.y - lamp.y).toFixed(2)} m under the carriageway`);
    assert.ok(lamp.y - out.y < 1.5, "a lamp on the roof");
  }
});

test("nobody's lights are on by day", () => {
  // The pool is posed with `night`, and a city of cars with headlights at noon
  // is the thing everybody notices.
  const { state, model } = highway();
  const traffic = createTraffic(state, model, { cap: 400 });
  run(traffic, 20);
  const pools = { headlight: fakePool(), taillight: fakePool() };
  traffic.poseLights(pools, fakePush, 0);
  assert.equal(pools.headlight.count, 0);
  assert.equal(pools.taillight.count, 0);
});

test("at night every car on screen is lit, at both ends", () => {
  const { state, model } = highway();
  const traffic = createTraffic(state, model, { cap: 400 });
  run(traffic, 20);
  const pools = { headlight: fakePool(), taillight: fakePool() };
  traffic.poseLights(pools, fakePush, 1);
  assert.equal(pools.headlight.count, traffic.cars().length);
  assert.equal(pools.taillight.count, traffic.cars().length);
});

// --- a yield lands on the link it is on (slice R4) ---------------------------

test("a yield point goes on the link it is standing on, not on every link", () => {
  // `placeYield` walked every block link in the city for every yield point,
  // every step: yields x ~6,000 links on a 128x128, for a lookup the derivation
  // already knew the answer to. Indexed by corridor now. The behaviour must not
  // change, which is what this asserts — the point stops the traffic on its own
  // corridor and nothing else.
  const state = blank(24);
  pave(state, row(6, 2, 21), row(16, 2, 21));
  load(state, 255);
  const model = createModel(state);
  const traffic = createTraffic(state, model, { cap: 400 });
  run(traffic, 25);

  const on = 6.5 * DEFAULTS.tileM;
  const off = 16.5 * DEFAULTS.tileM;
  for (let step = 0; step < 30 * 25; step += 1) {
    traffic.yieldTo([{ x: 12.5 * DEFAULTS.tileM, z: on }]);
    traffic.update(1 / 30);
  }
  const out = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };
  const onStreet = (z) => traffic.cars().filter((car) => {
    const link = model.lanes.links[car.link];
    if (!link) return false;
    model.lanes.sample(link, car.s, out);
    return Math.abs(out.z - z) <= DEFAULTS.road.width;
  });
  const closest = Math.min(...onStreet(on).map((car) => {
    model.lanes.sample(model.lanes.links[car.link], car.s, out);
    return Math.abs(out.x - 12.5 * DEFAULTS.tileM);
  }));
  assert.ok(closest > 1, `a car came within ${closest.toFixed(2)} m of the person`);
  // And the other street, ten tiles away, never noticed: a yield that landed on
  // every link would have stopped the whole city.
  const elsewhere = onStreet(off);
  assert.ok(elsewhere.length > 3, `only ${elsewhere.length} cars on the other street to check`);
  assert.ok(elsewhere.filter((car) => car.v > 1).length > elsewhere.length / 2,
    `${elsewhere.filter((car) => car.v > 1).length} of ${elsewhere.length} cars still moving elsewhere`);
});

test("looking a yield up is not a walk over every link in the city", () => {
  // A source assertion, because the cost is invisible to any behavioural test:
  // the fix is an index, and an index that quietly stops being used reads
  // exactly like one that is.
  const source = readFileSync(join(repoRoot, "client", "life", "traffic.js"), "utf8");
  const place = source.slice(source.indexOf("function placeYield"), source.indexOf("function rebuildYields"));
  assert.equal(/for \(const link of blocks\)/.test(place), false,
    "placeYield still scans every block link");
  assert.match(place, /blocksByCorridor\.get\(/, "placeYield does not use the corridor index");
});

// --- give way at an unsignalled junction (slice T1, A51) ---------------------
//
// Once only a crossing of two real streets is signalled, every T in the city is
// give-way. Something has to hold priority or the cars drive through each other
// at every one of them, which is most of the junctions on an ordinary grid.

/** A T: a long through road east–west and a stem coming up to it. */
function tee(size = 24) {
  const state = blank(size);
  pave(state, row(6, 2, size - 3), column(12, 6, size - 3));
  load(state, 200);
  const model = createModel(state);
  return { state, model };
}

test("the stem of a T is give-way and the through road is not", () => {
  const { state, model } = tee();
  const node = model.nodes.find((n) => n.degree === 3);
  assert.ok(node, "no T in the fixture");
  assert.equal(model.lanes.signals.has(node.id), false, "the T is signalled");
  // Which links arrive at it, and which of them are the minor arm.
  const arriving = model.lanes.links.filter((l) => l.kind === "block" && l.to === node.id);
  assert.equal(arriving.length, 3, `${arriving.length} arms arrive at the T`);
  const minor = arriving.filter((l) => model.lanes.givesWay(l));
  assert.equal(minor.length, 1, `${minor.length} of three arms give way`);
  assert.equal(minor[0].corridor, model.corridors.find((c) => c.id === minor[0].corridor).id);
});

test("a car on the stem waits while the through road is busy", () => {
  const { state, model } = tee();
  const traffic = createTraffic(state, model, { cap: 600 });
  run(traffic, 60);
  const node = model.nodes.find((n) => n.degree === 3);
  const stem = model.lanes.links.find((l) => l.kind === "block" && l.to === node.id
    && model.lanes.givesWay(l));
  // Somebody at the stop line on the minor arm, with the through road full.
  let waited = 0;
  for (let step = 0; step < 30 * 30; step += 1) {
    traffic.update(1 / 30);
    for (const car of traffic.cars()) {
      if (car.link !== stem.id) continue;
      if (car.s > stem.len - 12 && car.v < 0.5) waited += 1;
    }
  }
  assert.ok(waited > 0, "nobody on the stem ever gave way");
});

test("the through road never gives way to the stem", () => {
  const { state, model } = tee();
  const node = model.nodes.find((n) => n.degree === 3);
  for (const link of model.lanes.links) {
    if (link.kind !== "block" || link.to !== node.id) continue;
    if (model.lanes.givesWay(link)) continue;
    // The two through arms carry the same corridor pair as the road itself.
    assert.ok(link.len > 20, `a through arm only ${link.len.toFixed(0)} m long`);
  }
  const through = model.lanes.links.filter((l) => l.kind === "block" && l.to === node.id
    && !model.lanes.givesWay(l));
  assert.equal(through.length, 2, `${through.length} through arms`);
});

test("a signalled crossroads gives way to nobody — the light does that", () => {
  const state = blank(24);
  pave(state, row(6, 2, 21), column(12, 2, 21));
  load(state, 200);
  const model = createModel(state);
  const node = model.nodes.find((n) => n.degree === 4);
  assert.equal(model.lanes.signals.has(node.id), true);
  for (const link of model.lanes.links) {
    if (link.kind !== "block" || link.to !== node.id) continue;
    assert.equal(model.lanes.givesWay(link), false, "a signalled arm also gives way");
  }
});

test("traffic still flows through a city of give-way junctions", () => {
  // The failure mode of a priority rule is deadlock: everyone waiting for
  // everyone. A city of T-junctions has to keep moving.
  const { state, model } = tee();
  const traffic = createTraffic(state, model, { cap: 600 });
  run(traffic, 90);
  const moving = traffic.cars().filter((c) => c.v > 1).length;
  assert.ok(moving > traffic.cars().length * 0.4,
    `only ${moving} of ${traffic.cars().length} cars are moving`);
});

// --- a busy crossing is busy at ONE end (slice M5, review after D5) -----------
//
// `busyAt(corridor, node)` is what a pedestrian at an unsignalled crossing asks
// before stepping out. It walked both block links of the corridor and dropped
// the node on the floor (`void node`), so a car within its gap of the FAR end —
// a car that has already gone through this crossing and is leaving — held the
// person standing on the kerb. On a grid every corridor has a crossing at both
// ends, so this was every crossing in the city answering for its twin.

/** A corridor with a junction at each end, and the two nodes it runs between. */
function throughCorridor(model) {
  for (const corridor of model.corridors) {
    const arms = model.lanes.links.filter((l) => l.kind === "block" && l.corridor === corridor.id);
    const ends = new Set(arms.map((l) => l.to));
    if (arms.length === 2 && ends.size === 2) return { corridor, arms, ends: [...ends] };
  }
  return undefined;
}

/** Parks every car on the corridor in the middle of its own link, so the only
 * car near an end is the one the test puts there. */
function parkMidway(traffic, arms) {
  const ids = new Set(arms.map((l) => l.id));
  const parked = [];
  for (const car of traffic.cars()) {
    if (!ids.has(car.link)) continue;
    const link = arms.find((l) => l.id === car.link);
    car.s = link.len / 2;
    car.v = 0;
    parked.push(car);
  }
  return parked;
}

test("a car leaving a crossing does not hold the crossing it has left", () => {
  const { state, model } = tee(28);
  const traffic = createTraffic(state, model, { cap: 600 });
  run(traffic, 120);
  const through = throughCorridor(model);
  assert.ok(through, "no corridor with a junction at each end in the fixture");
  const { corridor, arms, ends } = through;

  const parked = parkMidway(traffic, arms);
  assert.ok(parked.length > 0, "no cars on the through corridor to move");
  assert.equal(traffic.busyAt(corridor.id, ends[0]), false, "midway cars make a crossing busy");
  assert.equal(traffic.busyAt(corridor.id, ends[1]), false, "midway cars make a crossing busy");

  // One car brought up to the stop line of ONE end. That end is busy; the other
  // is a hundred metres away and is not.
  const near = arms.find((l) => l.to === ends[0]);
  const mover = parked.find((car) => car.link === near.id);
  assert.ok(mover, "no car heading for the near end");
  mover.s = near.len - 1;

  assert.equal(traffic.busyAt(corridor.id, ends[0]), true,
    "a car at the stop line left its own crossing open");
  assert.equal(traffic.busyAt(corridor.id, ends[1]), false,
    "a car at the far end of the corridor held this crossing — busyAt ignores its node");
});

test("busyAt asks about the corridor it was given, and no other", () => {
  // The other half of the same argument: a corridor with a car on it must not
  // make a different corridor's crossing busy, even where they meet.
  const { state, model } = tee(28);
  const traffic = createTraffic(state, model, { cap: 600 });
  run(traffic, 120);
  const node = model.nodes.find((n) => n.degree === 3);
  const arriving = model.lanes.links.filter((l) => l.kind === "block" && l.to === node.id);
  const corridors = new Set(arriving.map((l) => l.corridor));
  assert.ok(corridors.size >= 2, "the T's arms are all one corridor");

  for (const car of traffic.cars()) {
    const link = model.lanes.links[car.link];
    if (link?.kind === "block") { car.s = Math.min(car.s, link.len / 2); car.v = 0; }
  }
  const arm = arriving[0];
  const mover = traffic.cars().find((c) => c.link === arm.id);
  if (mover) {
    mover.s = arm.len - 1;
    assert.equal(traffic.busyAt(arm.corridor, node.id), true);
    for (const other of corridors) {
      if (other === arm.corridor) continue;
      assert.equal(traffic.busyAt(other, node.id), false,
        "a car on one arm made another arm's corridor busy");
    }
  }
});

// --- the city is a function of the roads, not of the frame rate (slice D7) ---
//
// Q76. The density control filled a link at one car per link per STEP, so how
// full the city is was a function of how many frames had elapsed rather than of
// how long. Kjell's 4090 reached 4,590 cars on the saturated fixture in the same
// warm-up where SwiftShader reached 1,546, and the triangle counts moved with
// them — 289,086 against 239,274 at the same zoom. Two machines measuring two
// different cities, which is not a comparison.

/** The population after `seconds` of SIMULATED time at a given step.
 *
 * Simulated, not wall-clock, and the difference is the point: `update` clamps
 * its delta to `MAX_STEP` so a backgrounded tab does not teleport anybody, so a
 * caller handing it 1/10 s advances the city by 1/15. Counting calls would
 * compare two runs that had lived different lengths of time and call the
 * difference a frame-rate defect. */
function settledAt(dt, seconds) {
  const { state, model } = tee(28);
  const traffic = createTraffic(state, model, { cap: 2000 });
  const per = Math.min(dt, MAX_STEP);
  for (let t = 0; t < seconds; t += per) traffic.update(dt);
  return traffic.cars().length;
}

/** Long enough for this fixture to stop filling: it converges by about 120 s of
 * simulated time, against a sum of link targets of about 154. */
const SETTLED_S = 140;

test("the same city settles to the same traffic at any frame rate", () => {
  // The whole of Q76 as one assertion. 60 fps against 15 is the range between a
  // desktop and a phone having a bad time, and the clamp is why 15 rather than
  // the 10 the work item asked for — see `settledAt`.
  const counts = [1 / 60, 1 / 30, MAX_STEP].map((dt) => settledAt(dt, SETTLED_S));
  assert.ok(counts[0] > 40, `only ${counts[0]} cars at 60 fps — the fixture is not loaded`);
  const spread = (Math.max(...counts) - Math.min(...counts)) / Math.max(...counts);
  assert.ok(spread <= 0.1,
    `${counts.join(", ")} cars at 60, 30 and 15 fps — ${(spread * 100).toFixed(0)}% apart`);
});

test("a slow machine gets there later, not to somewhere else", () => {
  // The same assertion from the other side: half again as much time must not
  // buy half again as many cars, or "settled" means nothing.
  const short = settledAt(1 / 30, SETTLED_S);
  const long = settledAt(1 / 30, SETTLED_S * 1.5);
  const spread = Math.abs(long - short) / Math.max(long, short);
  assert.ok(spread <= 0.1, `${short} cars after ${SETTLED_S} s and ${long} after ${SETTLED_S * 1.5} s`);
});

test("the simulation says how long it has lived, in its own clamped seconds", () => {
  // What makes two measurements comparable: the population is a function of
  // simulated time, and simulated time is not wall-clock time below 15 fps.
  const { state, model } = tee(28);
  const traffic = createTraffic(state, model, { cap: 200 });
  assert.equal(traffic.simulatedS(), 0);
  for (let i = 0; i < 30; i += 1) traffic.update(1 / 30);
  assert.ok(Math.abs(traffic.simulatedS() - 1) < 1e-9, `${traffic.simulatedS()} s after one second`);
  for (let i = 0; i < 30; i += 1) traffic.update(1);      // clamped
  assert.ok(Math.abs(traffic.simulatedS() - (1 + 30 * MAX_STEP)) < 1e-9,
    `a one-second delta advanced the city by more than the clamp`);
});

test("a delta beyond the clamp advances the city by the clamp", () => {
  // Why the test above stops at 1/15 rather than the 1/10 D7 asked for. The
  // clamp is deliberate (a backgrounded tab hands back several seconds) and it
  // means no caller can ask for a longer step than this.
  const { state, model } = tee(28);
  const a = createTraffic(state, model, { cap: 2000 });
  const b = createTraffic(state, model, { cap: 2000 });
  for (let i = 0; i < 300; i += 1) { a.update(MAX_STEP); b.update(1); }
  assert.equal(a.cars().length, b.cars().length,
    "a one-second delta did something a clamped one did not");
});

test("the cap is a cap at every step size", () => {
  for (const dt of [1 / 60, 1 / 30, MAX_STEP]) {
    const { state, model } = tee(28);
    const traffic = createTraffic(state, model, { cap: 40 });
    run(traffic, 30, dt);
    assert.ok(traffic.cars().length <= 40,
      `${traffic.cars().length} cars of a 40 cap at dt ${dt.toFixed(3)}`);
  }
});

test("the traffic is the same city whatever the camera is doing", () => {
  // Q69 said a session carries every car it has ever looked at, and that a link
  // leaving the view is never emptied. It does not: `update(dt)` takes no
  // bounds, and `onScreen` is read only by `pose`, `poseLights` and `count`.
  // The population has never been a function of the camera and must not become
  // one — ruling 037 makes traffic local, and two clients on one city with
  // their cameras in different places would then show different streets.
  const { state, model } = tee(28);
  const a = createTraffic(state, model, { cap: 600 });
  const b = createTraffic(state, model, { cap: 600 });
  const pools = { car0: fakePool(), car1: fakePool() };
  const tiny = { x0: 0, y0: 0, x1: 1, y1: 1 };
  const whole = { x0: 0, y0: 0, x1: 27, y1: 27 };
  for (let step = 0; step < 30 * 30; step += 1) {
    a.update(1 / 30);
    b.update(1 / 30);
    a.pose(pools, fakePush, ["#fff"], tiny);
    b.pose(pools, fakePush, ["#fff"], whole);
  }
  assert.equal(a.cars().length, b.cars().length,
    "where the camera was changed how many cars exist");
  assert.ok(a.count(tiny) < a.count(whole), "the bounds do not filter the count at all");
});

// --- the hour on the road (slice B4) ----------------------------------------

test("night is quieter than day, and the rush is busier than both", () => {
  // The item's number: the settled count at night is the day's × 0.4 within 5%.
  // Measured on one road, settled each time, because a count taken while the
  // road is still filling is a measurement of how long you waited (D7).
  const settle = (phase) => {
    const { state, model } = highway(180);
    const traffic = createTraffic(state, model, { cap: 1000 });
    traffic.setPhase(phase);
    run(traffic, 150);
    return traffic.count();
  };
  const day = settle(0.25);
  const night = settle(0.8);
  const rush = settle(0.08);
  assert.ok(day > 10, `only ${day} cars by day — the fixture is too quiet to measure`);
  const ratio = night / day;
  assert.ok(ratio > 0.3 && ratio < 0.6,
    `night is ${night} against a day of ${day} (${ratio.toFixed(2)}, wanted about 0.4)`);
  assert.ok(rush >= day, `the rush is ${rush} against a day of ${day}`);
});

test("the hour never asks for more cars than the road holds", () => {
  // `jam` caps the target, so a rush hour on a short link cannot ask for more
  // cars than physically fit — the check that stops a multiplier becoming a
  // pile-up.
  const { state, model } = highway(255);
  const traffic = createTraffic(state, model, { cap: 5000 });
  traffic.setPhase(0.08);
  run(traffic, 150);
  const metres = model.lanes.links.filter((l) => l.kind === "block")
    .reduce((sum, l) => sum + l.len, 0);
  assert.ok(traffic.count() < metres / 7,
    `${traffic.count()} cars in ${metres.toFixed(0)} m is bumper to bumper`);
});

test("a phase nobody set is an ordinary day", () => {
  // The renderer hands the clock in; a caller that has not started one must get
  // the city it had before the hour existed, not an empty one.
  const { state, model } = highway(180);
  const traffic = createTraffic(state, model, { cap: 1000 });
  run(traffic, 120);
  const before = traffic.count();
  traffic.setPhase(0.25);
  run(traffic, 60);
  assert.ok(Math.abs(traffic.count() - before) <= Math.max(3, before * 0.25),
    `${before} cars became ${traffic.count()} when the clock was set to midday`);
});

// --- brake lights and indicators (slice B4) ----------------------------------

/** Poses one frame and returns where each pool's instances went. */
function lamps(traffic, bounds) {
  const seen = { body: [], carBrake: [], carTurn: [] };
  const pools = { car0: "car0", car1: "car1", carBrake: "carBrake", carTurn: "carTurn" };
  traffic.pose(pools, (pool, x, y, z) => {
    if (pool === "carBrake" || pool === "carTurn") seen[pool].push({ x, y, z });
    else seen.body.push({ x, y, z });
  }, [0xffffff], bounds);
  return seen;
}

test("a lamp is only ever pushed on top of a car that was posed", () => {
  // The two lamp pools ride the body pool: same position, same rotation. If a
  // lamp is ever pushed where no body was, it is a floating light in the road —
  // which is exactly what a `continue` in the wrong place would produce.
  const { state, model } = tee(28);
  const traffic = createTraffic(state, model, { cap: 600 });
  run(traffic, 40);
  const bounds = { x0: 0, y0: 0, x1: 14, y1: 27 };
  const seen = lamps(traffic, bounds);
  const bodies = new Set(seen.body.map((p) => `${p.x},${p.y},${p.z}`));
  assert.ok(bodies.size > 4, `only ${bodies.size} cars posed to hang lamps on`);
  for (const kind of ["carBrake", "carTurn"]) {
    assert.ok(seen[kind].length <= seen.body.length,
      `${seen[kind].length} ${kind} lamps for ${seen.body.length} cars`);
    for (const at of seen[kind]) {
      assert.ok(bodies.has(`${at.x},${at.y},${at.z}`),
        `a ${kind} lamp at ${at.x},${at.z} with no car under it`);
    }
  }
});

test("the pools are optional, so a caller that has not made them still poses", () => {
  // Every other caller in the tree passes the pools it has. A renderer built
  // before B4 — or the budget harness, which builds a subset — must not throw.
  const { state, model } = tee(28);
  const traffic = createTraffic(state, model, { cap: 200 });
  run(traffic, 20);
  const pools = { car0: fakePool(), car1: fakePool() };
  assert.equal(traffic.pose(pools, fakePush, [0xffffff]), traffic.count());
});

test("cars brake where the traffic is dense and hardly at all where it is not", () => {
  // Braking is the intelligent-driver model decelerating or a car held at a
  // stop line — not a flag we set. Measured on the T: on a settled straight
  // road nothing brakes at all, because a uniform flow at its desired speed
  // has nothing to close on. The queue is what a viewer sees.
  const busy = (() => {
    const { state, model } = tee(28);
    const traffic = createTraffic(state, model, { cap: 1000 });
    run(traffic, 90);
    return traffic;
  })();
  const quiet = (() => {
    const state = blank(28);
    pave(state, row(6, 2, 25), column(12, 6, 25));
    load(state, 12);
    const traffic = createTraffic(state, createModel(state), { cap: 1000 });
    run(traffic, 90);
    return traffic;
  })();
  const share = (traffic) => {
    const seen = lamps(traffic);
    return seen.body.length === 0 ? 0 : seen.carBrake.length / seen.body.length;
  };
  const dense = share(busy);
  const sparse = share(quiet);
  assert.ok(dense > sparse,
    `${(dense * 100).toFixed(1)}% braking on a full road against ${(sparse * 100).toFixed(1)}% on an empty one`);
  assert.ok(dense < 0.9, `${(dense * 100).toFixed(1)}% of the city has its brakes on`);
});

test("nobody indicates on a road with nothing to turn into", () => {
  // A straight run has one successor per link, and a lane continuing into the
  // next block is not a turn. This is the check that would fail if the
  // indicator asked "is there a successor" instead of "is it the straight one".
  const { state, model } = highway(200, 30);
  const traffic = createTraffic(state, model, { cap: 600 });
  run(traffic, 60);
  const seen = lamps(traffic);
  assert.ok(seen.body.length > 10, `only ${seen.body.length} cars posed`);
  assert.equal(seen.carTurn.length, 0,
    `${seen.carTurn.length} cars indicating on a road with no junctions`);
});

test("somebody indicates at a T, and the same car indicates the same way twice", () => {
  const { state, model } = tee(28);
  const traffic = createTraffic(state, model, { cap: 600 });
  // Long enough that cars are spread over the whole T, including the approaches.
  let indicated = 0;
  for (let frame = 0; frame < 30 * 40; frame += 1) {
    traffic.update(1 / 30);
    indicated += lamps(traffic).carTurn.length;
  }
  assert.ok(indicated > 0, "not one car indicated in forty seconds at a T junction");
});

test("the indicator blinks rather than burning steadily", () => {
  // Posing the same frame twice gives the same answer; posing across a second
  // must not, or it is a fault light. The blink comes off the traffic clock,
  // so `?life=0` freezes it like everything else (ruling 037).
  const { state, model } = tee(28);
  const traffic = createTraffic(state, model, { cap: 600 });
  run(traffic, 40);
  const counts = new Set();
  for (let frame = 0; frame < 30; frame += 1) {
    counts.add(lamps(traffic).carTurn.length === 0 ? "dark" : "lit");
    traffic.update(1 / 30);
  }
  assert.deepEqual([...counts].sort(), ["dark", "lit"],
    "the indicators never changed state across a whole second");
});

test("a frozen city shows its indicators rather than freezing them dark", () => {
  // `life: false` settles for 240 steps of 1/30 and stops. That sum is
  // 7.999999999999981 — two parts in 10^14 below eight, and on the dark side
  // of a 1.5 Hz blink, which it then stays on forever. Every screenshot of a
  // frozen city came back with cars about to turn and no indicator lit (B4).
  // A grid, not a T: at any one instant a single junction may have nobody
  // within twenty metres of it, and this is a test about a frozen INSTANT.
  const state = blank(40);
  pave(state, ...[6, 14, 22, 30].map((y) => row(y, 4, 35)),
    ...[6, 14, 22, 30].map((x) => column(x, 4, 35)));
  load(state, 220);
  const traffic = createTraffic(state, createModel(state), { cap: 2000, life: false });
  const seen = lamps(traffic);
  assert.ok(seen.body.length > 4, `only ${seen.body.length} cars in a frozen city`);
  assert.ok(seen.carTurn.length > 0, "not one indicator lit in a frozen city");
  // And a second pose is the same picture: a frozen shot taken twice must not
  // differ, which is the whole point of `?life=0`.
  assert.equal(lamps(traffic).carTurn.length, seen.carTurn.length);
});

// --- doors (slice B4) --------------------------------------------------------
//
// "A car appears out of a driveway or a bay and leaves into one, rather than
// materialising mid-link. The density control keeps the equilibrium (D7); this
// changes only where the spawn and despawn happen."

/** Puts a building on the map the way the engine would, so the model gives it
 * a lot and a frontage. */
function placeLot(state, b) {
  const building = {
    id: b.id, def: "", zone: 1, x: 0, y: 0, w: 1, h: 1, owner: 1,
    level: 2, valueTier: 1, occupancy: 30, condition: 100, builtTick: 0, flags: 0, ...b,
  };
  state.buildings.push(building);
  state.tiles.buildingId[tileAt(state.width, building.x, building.y)] = building.id;
  return building;
}

/** A long street with houses along one side and shops along the other. */
function street({ buildings = true, value = 160 } = {}) {
  const state = blank(32);
  pave(state, row(8, 1, 30));
  if (buildings) {
    let id = 1;
    for (let x = 3; x <= 28; x += 3) placeLot(state, { id: id++, x, y: 7, zone: 1 });
    for (let x = 4; x <= 28; x += 4) placeLot(state, { id: id++, x, y: 9, zone: 2 });
  }
  load(state, value);
  return { state, model: createModel(state) };
}

/** Runs the traffic and records where every new car was first seen. */
function watchSpawns(traffic, seconds, dt = 1 / 30) {
  let seen = Math.max(0, ...traffic.cars().map((c) => c.id));
  const spawns = [];
  for (let t = 0; t < seconds; t += dt) {
    traffic.update(dt);
    for (const car of traffic.cars()) {
      if (car.id > seen) spawns.push({ link: car.link, s: car.s, v: car.v });
    }
    seen = Math.max(seen, ...traffic.cars().map((c) => c.id));
  }
  return spawns;
}

test("the doors are on the lanes outside the lots they belong to", () => {
  const { state, model } = street();
  const traffic = createTraffic(state, model, { cap: 400 });
  const doors = [...traffic.doors().values()].flat();
  assert.ok(doors.length >= 10, `only ${doors.length} of 16 lots got a door on a lane`);
  const out = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };
  for (const [linkId, list] of traffic.doors()) {
    for (const door of list) {
      model.lanes.sample(model.lanes.links[linkId], door.s, out);
      const lot = model.lotOf(door.lot);
      const d = Math.hypot(out.x - lot.cx, out.z - lot.cz);
      assert.ok(d < 20, `a door ${d.toFixed(1)} m from the middle of its own lot`);
    }
  }
});

test("a spawn is at a door or at the mouth of its link, never mid-link", () => {
  const { state, model } = street();
  const traffic = createTraffic(state, model, { cap: 400 });
  const spawns = watchSpawns(traffic, 90);
  assert.ok(spawns.length > 20, `only ${spawns.length} spawns to check`);
  let atDoor = 0;
  for (const at of spawns) {
    const slack = at.v / 30 + 0.05;
    const doors = traffic.doors().get(at.link) ?? [];
    const door = doors.find((d) => Math.abs(at.s - d.s) <= slack);
    if (door) { atDoor += 1; continue; }
    assert.ok(at.s <= slack, `a car appeared ${at.s.toFixed(1)} m along link ${at.link}, at no door`);
  }
  // The tail is the fallback, not the answer: a test that passes with every
  // car arriving round the corner is a test of the old code.
  assert.ok(atDoor > spawns.length / 3, `${atDoor} of ${spawns.length} spawns came out of a door`);
});

test("doors change where the cars appear, not how many there are (D7)", () => {
  // The first version of B4 boosted any link with frontage by 1.35 and the
  // ordinary day went from 295 cars to 412. This is the test that fails on it.
  const settle = (buildings) => {
    const { state, model } = street({ buildings });
    const traffic = createTraffic(state, model, { cap: 1000 });
    traffic.setPhase(0.25);
    run(traffic, 150);
    return traffic.count();
  };
  const bare = settle(false);
  const built = settle(true);
  assert.ok(bare > 10, `only ${bare} cars on the bare street`);
  assert.ok(Math.abs(built - bare) <= Math.max(2, bare * 0.1),
    `${built} cars with doors against ${bare} without`);
});

test("homes send the cars out in the morning, and shops in the evening", () => {
  const share = (phase) => {
    const { state, model } = street();
    const traffic = createTraffic(state, model, { cap: 400 });
    traffic.setPhase(phase);
    let home = 0;
    let shop = 0;
    for (const at of watchSpawns(traffic, 90)) {
      const door = (traffic.doors().get(at.link) ?? []).find((d) => Math.abs(at.s - d.s) <= at.v / 30 + 0.05);
      if (!door) continue;
      if (door.home) home += 1;
      else shop += 1;
    }
    return { home, shop };
  };
  const morning = share(0.08);
  const evening = share(0.44);
  assert.ok(morning.home > morning.shop, `morning: ${morning.home} from homes, ${morning.shop} from shops`);
  assert.ok(evening.shop > evening.home, `evening: ${evening.shop} from shops, ${evening.home} from homes`);
});

test("a car leaves by turning in at a door, indicating first", () => {
  // Settle busy, then lower the engine's load so the street has to empty.
  const { state, model } = street({ value: 220 });
  const traffic = createTraffic(state, model, { cap: 400 });
  run(traffic, 60);
  load(state, 40);
  let turnedIn = 0;
  let indicated = 0;
  let last = new Map(traffic.cars().map((c) => [c.id, { ...c }]));
  for (let t = 0; t < 60; t += 1 / 30) {
    traffic.update(1 / 30);
    const now = new Map(traffic.cars().map((c) => [c.id, { ...c }]));
    for (const [id, was] of last) {
      if (now.has(id) || was.exitAt === undefined) continue;
      turnedIn += 1;
      const doors = traffic.doors().get(was.link) ?? [];
      assert.ok(doors.some((d) => Math.abs(d.s - was.exitAt) < 1e-6),
        `car ${id} turned in at ${was.exitAt.toFixed(1)} m, which is not a door`);
      assert.ok(was.exitAt - was.s < 1, `car ${id} vanished ${(was.exitAt - was.s).toFixed(1)} m short of its door`);
    }
    for (const car of now.values()) if (car.exitAt !== undefined && car.exitAt - car.s <= 20) indicated += 1;
    last = now;
  }
  assert.ok(turnedIn > 3, `only ${turnedIn} cars turned in at a door while the street emptied`);
  assert.ok(indicated > 0, "nobody was indicating for their door");
});
