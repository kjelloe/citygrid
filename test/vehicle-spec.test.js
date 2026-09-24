// What a car is (slice B3a).
//
// The item's amendment: "from the pavement a car is two boxes and the least
// detailed thing in a frame that now has chimneys, shutters and zebra bars —
// three body types from one pure module, within 120 triangles a car (76
// today)". The budget is the interesting half, because the kit imports three
// and node cannot load it to count for itself: the cost is arithmetic here and
// `budget_gate`'s car rows are what check it against the real geometry.

import test from "node:test";
import assert from "node:assert/strict";
import {
  vehicleSpec, triangleCost, bodyOf, BODY_NAMES, WHEEL,
} from "../client/world/vehicle-spec.js";

test("three bodies, and they are different shapes rather than colours", () => {
  assert.equal(BODY_NAMES.length, 3);
  const specs = BODY_NAMES.map((name) => vehicleSpec(1, name));
  const lengths = new Set(specs.map((s) => s.length));
  const heights = new Set(specs.map((s) => s.height));
  assert.equal(lengths.size, 3, "two bodies are the same length");
  assert.ok(heights.size >= 2, "every body is the same height");
  // V6's lesson: two variants that hash the same are a city of clones.
});

test("a car keeps its body between frames and between cities", () => {
  for (const id of [1, 7, 41, 900]) assert.equal(bodyOf(id), bodyOf(id));
  const bodies = new Set();
  for (let id = 0; id < 60; id += 1) bodies.add(bodyOf(id));
  assert.equal(bodies.size, 3, `sixty cars are ${bodies.size} body type(s)`);
});

test("a car is car-sized, and B8's lanes were measured against 2.2 m", () => {
  for (const name of BODY_NAMES) {
    const s = vehicleSpec(1, name);
    assert.ok(s.length >= 3.5 && s.length <= 5.5, `${name} is ${s.length} m long`);
    assert.ok(s.width >= 1.7 && s.width <= 2.2, `${name} is ${s.width} m wide`);
    assert.ok(s.height >= 1.1 && s.height <= 2.0, `${name} stands ${s.height} m`);
  }
});

test("the body sits on its wheels, not on the road", () => {
  for (const name of BODY_NAMES) {
    const s = vehicleSpec(1, name);
    assert.ok(s.hull.y0 > WHEEL.radius * 0.8,
      `${name}'s sill is at ${s.hull.y0} m with a ${WHEEL.radius} m wheel — a box beside its wheels`);
    assert.equal(s.cabin.y0, s.hull.y1, "the cabin floats above the body");
    assert.ok(s.cabin.x0 > s.hull.x0 && s.cabin.x1 < s.hull.x1, "the cabin overhangs the body");
  }
});

test("four wheels, at the corners, inside the width", () => {
  for (const name of BODY_NAMES) {
    const s = vehicleSpec(1, name);
    assert.equal(s.wheels.length, 4);
    for (const w of s.wheels) {
      assert.ok(Math.abs(w.z) + w.width / 2 <= s.width / 2 + 1e-9, `a wheel sticks out of ${name}`);
      assert.ok(Math.abs(w.x) < s.length / 2, `a wheel is outside ${name}'s bumper`);
    }
    const axles = new Set(s.wheels.map((w) => w.x));
    assert.equal(axles.size, 2, "the wheels are not on two axles");
  }
});

test("a car is inside the item's 120 triangles", () => {
  for (const name of BODY_NAMES) {
    const cost = triangleCost(vehicleSpec(1, name));
    assert.ok(cost <= 120, `${name} costs ${cost} triangles`);
    assert.ok(cost > 76, `${name} costs ${cost}, which is no more than the two boxes it replaces`);
  }
});
