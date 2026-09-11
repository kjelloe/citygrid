// Twelve definitions, twelve buildings (slice S1).
//
// A coal plant and a park were the same box with different windows in it, and
// the only thing that said which was the label on the build menu. The shapes
// are a pure table so the questions that matter can be asked here: is there one
// per definition, are they distinguishable, and does anything stick out past
// the lot it was placed on.

import test from "node:test";
import assert from "node:assert/strict";
import { definitionIds, definition } from "../engine/catalogue.js";
import {
  CIVIC_SHAPES, CIVIC_DEFS, civicShape, civicVariant, civicHeight,
} from "../client/world/civic-spec.js";

test("every catalogue definition has a shape, and no shape is an orphan", () => {
  // The drift a mirror exists to make loud: `client/world/` may not import
  // `engine/` (ruling 032), so this table's keys are a second copy of the
  // catalogue's — and a second copy is a defect waiting for the next edit
  // unless something compares them.
  assert.deepEqual([...CIVIC_DEFS], definitionIds(),
    "the shape table and the catalogue disagree about which buildings exist");
});

test("no two definitions are the same building", () => {
  // The whole item. Two definitions with the same masses is the six-generic-
  // silhouettes problem wearing twelve names.
  const seen = new Map();
  for (const def of CIVIC_DEFS) {
    const key = JSON.stringify(civicShape(def).masses);
    assert.equal(seen.has(key), false,
      `${def} is drawn exactly like ${seen.get(key)}`);
    seen.set(key, def);
  }
});

test("a definition's index is stable, and an unknown one is not a hole", () => {
  // The instanced pass keys its pools `civic<n>`; `pools[undefined]` is how
  // every building of a category silently stops being drawn (V6).
  for (let i = 0; i < CIVIC_DEFS.length; i += 1) {
    assert.equal(civicVariant(CIVIC_DEFS[i]), i, CIVIC_DEFS[i]);
  }
  assert.equal(civicVariant("somethingAModAdded"), 0);
  assert.ok(civicShape("somethingAModAdded").masses.length > 0);
  assert.ok(civicShape(3).masses.length > 0, "an index has to work as well as a name");
});

test("nothing reaches outside the lot it stands on", () => {
  // The masses are in unit space across the footprint, so anything past ±1 in x
  // or z is on the pavement — which is a wall to the walker (ruling 035) and a
  // building growing through its neighbour at city zoom.
  for (const def of CIVIC_DEFS) {
    for (const m of civicShape(def).masses) {
      for (const [name, v] of [["x0", m.x0], ["x1", m.x1], ["z0", m.z0], ["z1", m.z1]]) {
        assert.ok(v >= -1 && v <= 1, `${def}: ${name} is ${v}, outside the lot`);
      }
      assert.ok(m.x1 > m.x0 && m.z1 > m.z0 && m.y1 > m.y0, `${def}: an inside-out mass`);
      assert.ok(m.y0 >= 0, `${def}: a mass starts ${m.y0} below the ground`);
    }
  }
});

test("the things that should be tall are tall, and the park is not a building", () => {
  // The silhouette pass flattens a building to a block, and a power station
  // whose stacks are flattened to its hall stops being a power station from the
  // air. `civicHeight` is what the block form reads instead of assuming 1.
  assert.ok(civicHeight("windTurbine") > 3, "a turbine is a mast");
  assert.ok(civicHeight("waterTower") > civicHeight("groundwaterPump"), "a tower is taller than a hut");
  assert.ok(civicHeight("coalPlant") > 1.4, "a stack is taller than its hall");
  assert.ok(civicHeight("park") < 0.1, "the park is a lawn, not a building");
  for (const def of ["coalPlant", "gasPlant", "windTurbine", "waterTower", "fireStation", "hospital"]) {
    assert.equal(CIVIC_SHAPES[def].tall, true, `${def} is not marked tall`);
  }
});

test("a bigger footprint in the catalogue is not a bigger shape here", () => {
  // Unit space is the point: one description serves a 1×1 water tower and a 3×3
  // hospital, and the renderer multiplies. A shape that had metres in it would
  // be wrong for one of the two.
  for (const def of CIVIC_DEFS) {
    const cat = definition(def);
    assert.ok(cat, `${def} is not in the catalogue`);
    const widest = Math.max(...civicShape(def).masses.map((m) => m.x1 - m.x0));
    assert.ok(widest <= 2, `${def} spans ${widest} of a possible 2`);
  }
});
