// A building that shows its age (slice B2).
//
// Level, condition, occupancy and age are all on the record and none of them
// reached a pixel: a brand-new hospital and a derelict one were the same box.
// Every judgement about those numbers is here rather than in the renderer,
// because a judgement in a renderer is a judgement nobody can test.

import test from "node:test";
import assert from "node:assert/strict";
import {
  visualState, looksWorse, BUILDING_TICKS, BOARDED, DERELICT, GRIME,
} from "../client/world/age.js";

const record = (over = {}) => ({
  id: 1, def: "", zone: 1, x: 0, y: 0, w: 1, h: 1, owner: 1,
  level: 1, valueTier: 1, occupancy: 20, condition: 100, builtTick: 0, flags: 0,
  ...over,
});

test("a new building is a building site, and then it is not", () => {
  assert.equal(visualState(record(), 0).phase, "site");
  assert.equal(visualState(record(), BUILDING_TICKS - 1).phase, "site");
  assert.equal(visualState(record(), BUILDING_TICKS).phase, "standing");
  assert.equal(visualState(record(), BUILDING_TICKS * 40).phase, "standing");
});

test("the site grows, and never starts at nothing", () => {
  // A zero-height shell is an empty lot, which is what the tile looked like
  // before anybody built on it.
  const early = visualState(record(), 1).progress;
  const late = visualState(record(), BUILDING_TICKS - 1).progress;
  assert.ok(early > 0.05, `a site starts at ${early}`);
  assert.ok(late > early, "the site does not grow");
  assert.equal(visualState(record(), BUILDING_TICKS).progress, 1);
});

test("a building built in the past is not a site now", () => {
  // The half of the arithmetic that is easy to get backwards: age is
  // `tick - builtTick`, and a building placed at tick 500 and looked at at tick
  // 600 is a hundred ticks old, not minus five hundred.
  assert.equal(visualState(record({ builtTick: 500 }), 500 + BUILDING_TICKS - 1).phase, "site");
  assert.equal(visualState(record({ builtTick: 500 }), 600).phase,
    600 - 500 < BUILDING_TICKS ? "site" : "standing");
  assert.equal(visualState(record({ builtTick: 500 }), 500 + BUILDING_TICKS).phase, "standing");
  assert.equal(visualState(record({ builtTick: 500 }), 100).progress, 0.25,
    "a building from the future is a fresh site, not a negative one");
});

test("condition darkens the walls, monotonically and not to black", () => {
  const at = (c) => visualState(record({ condition: c, builtTick: -1000 }), 0);
  let previous = at(100);
  for (const c of [90, 70, 50, 30, 10, 0]) {
    const now = at(c);
    assert.ok(now.grime <= previous.grime, `condition ${c} looks cleaner than the one above it`);
    previous = now;
  }
  assert.equal(at(100).grime, 1);
  assert.ok(at(0).grime >= GRIME, "a ruin is a hole in the city rather than a building");
});

test("windows board below the threshold and not above it", () => {
  const at = (c) => visualState(record({ condition: c, builtTick: -1000 }), 0);
  assert.equal(at(BOARDED).boarded, 0, "a building at the threshold is merely worn");
  assert.equal(at(BOARDED + 20).boarded, 0);
  assert.ok(at(BOARDED - 10).boarded > 0);
  assert.ok(at(0).boarded > at(BOARDED - 10).boarded, "worse is not more boarded");
  assert.ok(at(0).boarded <= 1, "more windows are boarded than there are windows");
});

test("the garden goes at the bottom, and the whole thing goes when it is abandoned", () => {
  const at = (c) => visualState(record({ condition: c, builtTick: -1000 }), 0);
  assert.equal(at(DERELICT + 1).overgrown, false);
  assert.equal(at(DERELICT - 1).overgrown, true);
  const gone = visualState(record({ zone: 0, def: "", builtTick: -1000 }), 0);
  assert.equal(gone.phase, "abandoned");
  assert.equal(gone.boarded, 1, "an abandoned building has its windows");
  assert.equal(gone.lit, 0, "an abandoned building is lit at night");
  assert.equal(gone.overgrown, true);
});

test("a civic building is not abandoned for having no zone", () => {
  // `zone === 0` is how a placed building is stored, so the abandonment test
  // has to look at the definition too — otherwise every hospital in the city is
  // a ruin.
  const hospital = visualState(record({ zone: 0, def: "hospital", builtTick: -1000 }), 0);
  assert.equal(hospital.phase, "standing");
  assert.equal(hospital.boarded, 0);
});

test("occupancy lights the windows, between never and always", () => {
  const at = (o) => visualState(record({ occupancy: o, builtTick: -1000 }), 0, 100).lit;
  assert.ok(at(0) > 0, "an empty block is pitch dark, with no stairwell");
  assert.ok(at(100) < 1, "a full block has nobody asleep");
  assert.ok(at(100) > at(50) && at(50) > at(0), "occupancy does not light anything");
  // With no capacity to divide by, the answer is what E5 already did — so this
  // can never make a city darker than it was before the question was asked.
  assert.ok(Math.abs(visualState(record(), 1e6).lit - 1 / 3) < 1e-9);
});

test("nothing about getting older makes a building look better", () => {
  // The monotonicity the whole module is for, asserted across the grid rather
  // than at the two ends.
  for (const condition of [100, 80, 60, 40, 20, 0]) {
    for (const older of [condition - 20]) {
      if (older < 0) continue;
      const a = visualState(record({ condition: older, builtTick: -1000 }), 0);
      const b = visualState(record({ condition, builtTick: -1000 }), 0);
      assert.ok(looksWorse(a, b) || a.grime === b.grime,
        `condition ${older} does not look worse than ${condition}`);
    }
  }
});

test("with no clock at all a building is standing, not new", () => {
  // The default has to fail safe in this direction: a caller that forgets the
  // tick would otherwise turn every building in the city into a 10%-height
  // shell with a scaffold round it. The other way round costs one building its
  // first half-year of scaffolding.
  assert.equal(visualState(record({ builtTick: 0 })).phase, "standing");
  assert.equal(visualState(record({ builtTick: 0 })).progress, 1);
  assert.equal(visualState(record({ builtTick: 999999 })).phase, "standing");
  // And a clock of zero IS a clock: a city at tick 0 has new buildings in it.
  assert.equal(visualState(record({ builtTick: 0 }), 0).phase, "site");
});
