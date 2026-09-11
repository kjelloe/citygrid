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
  CIVIC_SHAPES, CIVIC_DEFS, MATERIALS, civicShape, civicVariant, civicHeight,
  materialsOf, defaultName,
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

// --- materials and signs (slice S1b) ----------------------------------------

test("every mass is made of something the renderer knows", () => {
  // The S1 defect, from the other side: every mass was `palette.civic`, one
  // concrete tone, so a coal plant's stacks and a hospital's ward were the same
  // grey as each other and as the wall they stood on. A name the palette does
  // not resolve falls back to that same tone — which is a building that looks
  // like it did before, silently.
  for (const def of CIVIC_DEFS) {
    for (const m of civicShape(def).masses) {
      assert.ok(m.mat, `${def}: a mass with no material`);
      assert.ok(MATERIALS.includes(m.mat), `${def}: unknown material "${m.mat}"`);
    }
  }
});

test("no definition is a single material", () => {
  // The whole of S1b. One material for the whole building is the warehouse the
  // review saw twelve of.
  for (const def of CIVIC_DEFS) {
    const mats = materialsOf(def);
    assert.ok(mats.length >= 2, `${def} is made entirely of ${mats[0]}`);
  }
});

test("the recognising part is the part you can see", () => {
  // A stack that does not clear its hall, a cross the width of a window, a door
  // the colour of the wall beside it — the parts that say WHICH building this
  // is have to be the parts that carry from the pavement.
  const coal = civicShape("coalPlant");
  const hall = coal.masses.find((m) => m.mat === "brick");
  const stacks = coal.masses.filter((m) => m.mat === "steel");
  assert.ok(stacks.length >= 2, "a coal plant has fewer than two stacks");
  assert.ok(stacks.every((s) => s.round), "a stack is a box");
  assert.ok(stacks[0].y1 > hall.y1 * 2, "the tallest stack does not clear its hall by its own height");

  const hospital = civicShape("hospital");
  const cross = hospital.masses.filter((m) => m.mat === "red");
  assert.equal(cross.length, 2, "the cross is not two masses");
  // On the STREET face: the shapes are authored with the frontage on +z, so a
  // cross at the back of the building is a cross nobody sees.
  assert.ok(cross.every((m) => m.z1 > 0.3), "the cross is not on the street face");
  assert.ok(cross.some((m) => m.y1 - m.y0 > 0.4), "the cross is shorter than a storey");

  const fire = civicShape("fireStation");
  const doors = fire.masses.filter((m) => m.mat === "red");
  assert.equal(doors.length, 2, "a fire station has two doors");
  assert.ok(doors.every((d) => d.z1 > 0.7), "the doors are not on the front");
});

test("a definition's name is readable without a catalogue", () => {
  // The screenshot harness has no `t()`, and a sign that says `coalPlant` is a
  // sign nobody would print.
  assert.equal(defaultName("coalPlant"), "Coal plant");
  assert.equal(defaultName("waterTower"), "Water tower");
  assert.equal(defaultName("park"), "Park");
  assert.equal(defaultName(""), "");
  for (const def of CIVIC_DEFS) {
    assert.ok(defaultName(def).length > 2, `${def} has no readable name`);
    assert.equal(defaultName(def), defaultName(def));
  }
});
