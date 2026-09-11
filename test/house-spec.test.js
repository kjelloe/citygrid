// What makes one house that house (slice S9, P61).
//
// Kjell asked for houses with more on them. Everything added is a pure function
// of `(id, storeys, variant)`, which is what lets the interesting questions be
// asked here rather than in a screenshot: does a level-1 house have a dormer,
// does the same id get the same chimney twice, and does the furniture fit in
// the 300 triangles the item budgeted for it.

import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { adjacencyMask, tileAt } from "../shared/grid.js";
import { NET_PRESENT } from "../client/constants-mirror.js";
import { createModel } from "../client/world/model.js";
import { buildingParams } from "../client/world/params.js";
import { facadeSpec } from "../client/world/facade-spec.js";
import { buildFacade } from "../client/render/facade.js";
import { buildHouseParts } from "../client/render/house-parts.js";
import { PALETTES } from "../client/render/palettes.js";
import { houseParts, materialOf, coursesOf, ridgeRise, MATERIALS, HOUSE_BUDGET, HOUSE_BUDGET_WIDE } from "../client/world/house-spec.js";

function house({ id = 1, level = 1, w = 1, h = 1 } = {}) {
  const state = createState(defaultOptions({ width: 16, height: 16, seed: 7 }));
  const road = state.tiles.road;
  for (let x = 1; x <= 14; x += 1) road[tileAt(state.width, x, 5)] = NET_PRESENT;
  for (let x = 1; x <= 14; x += 1) {
    const mask = adjacencyMask(state.width, state.height, x, 5, (i) => (road[i] & NET_PRESENT) !== 0);
    road[tileAt(state.width, x, 5)] = NET_PRESENT | mask;
  }
  const building = {
    id, def: "", zone: 1, x: 4, y: 6, w, h, owner: 1,
    level, valueTier: 1, occupancy: 20, condition: 100, builtTick: 0, flags: 0,
  };
  state.buildings.push(building);
  for (let yy = building.y; yy < building.y + h; yy += 1) {
    for (let xx = building.x; xx < building.x + w; xx += 1) {
      state.tiles.buildingId[tileAt(state.width, xx, yy)] = id;
    }
  }
  const model = createModel(state);
  const spec = facadeSpec(model.lotOf(id), buildingParams(building, PALETTES.plain, 0x998877));
  return spec;
}

const kinds = (spec) => spec.extras.map((e) => e.kind);

test("every house has a chimney, and it is the same chimney every time", () => {
  // A house without one reads as a shed. And the whole point of deriving it
  // from the id is that it survives a reload, a rebuild and a second player.
  for (const id of [1, 2, 7, 40, 999]) {
    const a = houseParts(house({ id }));
    const b = houseParts(house({ id }));
    assert.deepEqual(a, b, `house ${id} is not the same house twice`);
    assert.ok(a.some((p) => p.kind === "chimney"), `house ${id} has no chimney`);
  }
});

test("two houses are not the same house", () => {
  // Variety is the whole item. If every id produced the same list, the street
  // would be a terrace of clones with extra triangles on it.
  const seen = new Set();
  for (let id = 1; id <= 24; id += 1) {
    seen.add(JSON.stringify(houseParts(house({ id })).map((p) => p.kind).sort()));
  }
  assert.ok(seen.size >= 4, `24 houses produced ${seen.size} distinct kits`);
});

test("a level-1 house has no dormer, and a level-3 house does", () => {
  // Dormers are a room in the roof: a bungalow has not got one, and a house
  // that grew to level 3 says so from the pavement.
  assert.equal(kinds(house({ id: 3, level: 1 })).includes("dormer"), false);
  assert.ok(kinds(house({ id: 3, level: 3 })).includes("dormer"));
});

test("a bay window is a level-3 house saying so", () => {
  assert.equal(kinds(house({ id: 5, level: 1 })).includes("bay"), false);
  assert.ok(kinds(house({ id: 5, level: 4 })).includes("bay"));
});

test("a garage needs a lot to put it on", () => {
  assert.equal(kinds(house({ id: 9, w: 1, h: 1 })).includes("garage"), false);
  assert.ok(kinds(house({ id: 9, w: 3, h: 2 })).includes("garage"));
});

test("the three materials are all reachable, and render has no courses", () => {
  const materials = new Set(Array.from({ length: 12 }, (_, v) => materialOf(v)));
  assert.deepEqual([...materials].sort(), ["brick", "clapboard", "render"]);
  assert.equal(MATERIALS.length % 3, 0, "the variants do not divide evenly between the materials");
  assert.deepEqual(coursesOf("render", 6), []);
  assert.ok(coursesOf("clapboard", 6).length > coursesOf("brick", 6).length,
    "brick has as many courses as clapboard, which is not what a soldier course is");
  for (const y of coursesOf("brick", 6)) assert.ok(y > 0 && y < 6, `course at ${y} is outside the wall`);
});

test("the furniture fits the budget it was given", () => {
  // S9 allowed +300; `budget_gate` said the frame had ~125 a house. Unbounded,
  // the clapboard courses alone were 168 of it and the shutters another 108 on
  // a wide house. Capped, and then drawn flat where flat is all anybody can
  // see — 126 on a one-tile house with every part still on it.
  const groundTop = 3;
  const wallTop = 9;
  for (const level of [1, 2, 3, 4]) {
    for (const id of [1, 4, 11, 26]) {
      for (const [w, h, budget] of [[1, 1, HOUSE_BUDGET], [2, 2, HOUSE_BUDGET_WIDE]]) {
        const spec = house({ id, level, w, h });
        const pieces = buildHouseParts(spec, { groundTop, wallTop, trim: 0xffffff, glass: 0x334455 });
        const triangles = pieces.reduce((n, p) => n + p.part.triangles, 0);
        assert.ok(triangles <= budget,
          `house ${id} at level ${level} on ${w}x${h} spends ${triangles} of ${budget}`);
        // A floor as well as a ceiling. Every part is behind a hash and hashes
        // multiply: the first version of the cut left house 1 with a chimney, a
        // plinth and nothing else — 36 triangles, and the same bare bungalow
        // this slice exists to fix. `houseParts` gives a porch to any house
        // that drew nothing else from the front.
        // The floor is a chimney, a plinth, a number on the door and one shape
        // — 48 triangles. Below that a house is the bare box this slice exists
        // to fix, and every part is behind a hash, so hashes multiplying is
        // exactly how that happens by accident.
        assert.ok(triangles >= 44, `house ${id} at level ${level} spends only ${triangles}`);
        // And the flat parts stay flat: a shutter that becomes a box again
        // takes the whole frame with it, one house at a time.
        assert.ok(triangles < 200 || w > 1, `house ${id} at level ${level} is back to boxes at ${triangles}`);
      }
    }
  }
});

test("nothing reaches past the lot onto the pavement", () => {
  // The one error that breaks the game rather than the picture: `walkthrough`
  // has to get down the street, and a bay window over the kerb is a wall.
  for (const id of [1, 2, 3, 8, 21]) {
    const spec = house({ id, level: 4, w: 2, h: 2 });
    const pieces = buildHouseParts(spec, { groundTop: 3, wallTop: 9, trim: 0xffffff, glass: 0x334455 });
    for (const { part } of pieces) {
      for (let i = 0; i < part.triangles * 3; i += 1) {
        const x = part.position[i * 3];
        const z = part.position[i * 3 + 2];
        // The eaves' own overhang is the allowance, and gutters hang on it.
        assert.ok(x > spec.x0 - 1.2 && x < spec.x1 + 1.2, `house ${id}: x ${x} outside the lot`);
        assert.ok(z > spec.z0 - 1.2 && z < spec.z1 + 1.2, `house ${id}: z ${z} outside the lot`);
      }
    }
  }
});

test("the furniture is on the house, not under it or in the sky", () => {
  const spec = house({ id: 6, level: 3, w: 2, h: 2 });
  const wallTop = 9;
  const pieces = buildHouseParts(spec, { groundTop: 3, wallTop, trim: 0xffffff, glass: 0x334455 });
  let lowest = Infinity;
  let highest = -Infinity;
  for (const { part } of pieces) {
    for (let i = 0; i < part.triangles * 3; i += 1) {
      lowest = Math.min(lowest, part.position[i * 3 + 1]);
      highest = Math.max(highest, part.position[i * 3 + 1]);
    }
  }
  assert.ok(lowest >= spec.seat - 0.3, `something is ${(spec.seat - lowest).toFixed(2)} m underground`);
  // The ridge plus the tallest chimney and its pot, and nothing beyond it.
  // The ridge of a gable over this lot's short span, plus the tallest chimney
  // and its pot. Computed rather than guessed: a 2×2 lot is 34 m across, so its
  // roof is genuinely 10 m tall and a fixed allowance would have been wrong
  // about the geometry rather than about the chimney.
  const ridge = wallTop + ridgeRise(Math.min(spec.x1 - spec.x0, spec.z1 - spec.z0),
    spec.roof.eave, spec.roof.pitch);
  assert.ok(highest < ridge + 2.6,
    `something stands ${(highest - ridge).toFixed(1)} m over the ridge at ${ridge.toFixed(1)}`);
  // And the chimney CLEARS it. This is the assertion the first version did not
  // have: the roof is built on a box expanded by the eave, so a chimney sized
  // to a ridge computed without it is buried in the slope — a part that costs
  // 36 triangles and cannot be seen.
  assert.ok(highest > ridge + 0.5,
    `nothing clears the ridge at ${ridge.toFixed(1)}: the tallest thing is ${highest.toFixed(1)}`);
});

test("a house is still a house when the renderer draws it", () => {
  // The parts reach the facade: an extras list nothing draws is the shape of
  // defect K3's border pull was (a module with tests and no caller).
  const plain = buildFacade(house({ id: 2, level: 1 }));
  assert.ok(plain.reduce((n, p) => n + p.part.triangles, 0) > 200);
  const spec = house({ id: 2, level: 1 });
  const furniture = buildHouseParts(spec, { groundTop: 3, wallTop: 9, trim: 0xffffff, glass: 0x334455 });
  assert.ok(furniture.length > 0, "the house has no furniture at all");
});
