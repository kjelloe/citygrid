// What makes one works that works (slice S16c).
//
// The air shot that filed it: S16a's industrial ladder put two sheds on a 36 m
// lot, each set back 16% of the depth with the yard between them and the kerb —
// and the yard is GRASS, because nothing draws anything on an industrial lot's
// open ground. An estate from the air is sheds on a lawn.
//
// Pure in the facade spec, like `shop-spec.js`: a works keeps its tank for life.

import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { createModel } from "../client/world/model.js";
import { facadeSpec } from "../client/world/facade-spec.js";
import { buildingParams } from "../client/world/params.js";
import { PALETTES } from "../client/render/palettes.js";
import { worksParts, WORKS_BUDGET } from "../client/world/works-spec.js";
import { unitsOf } from "../client/world/units.js";
import { buildWorksYards } from "../client/render/trade-parts.js";
import { tileAt, adjacencyMask } from "../shared/grid.js";
import { NET_PRESENT } from "../client/constants-mirror.js";

/** A works at (6,6) with the street on side `frontage`. */
function works(frontage = 0, { level = 1, id = 1, w = 1, h = 1 } = {}) {
  const state = createState(defaultOptions({ width: 16, height: 16, seed: 7 }));
  const road = state.tiles.road;
  const at = [[6, 5], [7 + (w - 1), 6], [6, 7 + (h - 1)], [5, 6]][frontage];
  const line = frontage % 2 === 0
    ? Array.from({ length: 12 }, (unused, i) => [2 + i, at[1]])
    : Array.from({ length: 12 }, (unused, i) => [at[0], 2 + i]);
  for (const [x, y] of line) road[tileAt(state.width, x, y)] = NET_PRESENT;
  for (const [x, y] of line) {
    road[tileAt(state.width, x, y)] = NET_PRESENT
      | adjacencyMask(state.width, state.height, x, y, (i) => (road[i] & NET_PRESENT) !== 0);
  }
  const building = {
    id, def: "", zone: 3, x: 6, y: 6, w, h, owner: 1,
    level, valueTier: 1, occupancy: 0, condition: 100, builtTick: 0, flags: 0,
  };
  state.buildings.push(building);
  for (let yy = 6; yy < 6 + h; yy += 1) {
    for (let xx = 6; xx < 6 + w; xx += 1) state.tiles.buildingId[tileAt(state.width, xx, yy)] = id;
  }
  const model = createModel(state);
  const lot = model.lotOf(id);
  // Through the ladder, which is what the renderer feeds the facade: a works is
  // a SHED on a lot, not a building filling it (S16a), and the yard is the
  // ground around it.
  const unit = unitsOf(lot, "industrial")[0];
  return { lot, spec: facadeSpec(unit, buildingParams(building, PALETTES.plain, 0x998877)) };
}

const kinds = (parts) => parts.map((p) => p.kind);

test("a works stands on a yard, not on a lawn", () => {
  for (const frontage of [0, 1, 2, 3]) {
    const { lot, spec } = works(frontage);
    const yard = worksParts(spec).find((p) => p.kind === "yard");
    assert.ok(yard, `frontage ${frontage}: a works with no yard`);
    assert.ok(yard.x0 >= lot.x0 - 0.01 && yard.x1 <= lot.x1 + 0.01, "the yard is off the side of the lot");
    assert.ok(yard.z0 >= lot.z0 - 0.01 && yard.z1 <= lot.z1 + 0.01, "the yard is off the back of the lot");
    const area = (yard.x1 - yard.x0) * (yard.z1 - yard.z0);
    const lotArea = (lot.x1 - lot.x0) * (lot.z1 - lot.z0);
    assert.ok(area > lotArea * 0.5, `the yard covers ${Math.round(100 * area / lotArea)}% of the lot`);
  }
});

test("the lorries have somewhere to go: a dock and a roller door on the street side", () => {
  const { spec } = works(0);
  const parts = worksParts(spec);
  const front = spec.edges.find((e) => e.street);
  const dock = parts.find((p) => p.kind === "dock");
  assert.ok(dock, "a works with no loading dock");
  assert.equal(dock.side, front.side, "the dock faces away from the street the lorry arrives on");
  assert.ok(dock.h >= 0.8 && dock.h <= 1.6, `a dock ${dock.h} m high — a lorry bed is about 1.2`);
  const door = parts.find((p) => p.kind === "rollerDoor");
  assert.ok(door && door.side === front.side, "no roller door over the dock");
  assert.ok(door.h > dock.h, "the roller door is shorter than the dock in front of it");
});

test("a works says whose it is, and keeps its plant on the ground", () => {
  const { lot, spec } = works(0, { w: 2, h: 2 });
  const parts = worksParts(spec);
  assert.ok(kinds(parts).includes("nameBoard"), "a works with no name board");
  const tanks = parts.filter((p) => p.kind === "tank");
  assert.ok(tanks.length > 0, "no tank anywhere on the estate");
  for (const tank of [...tanks, ...parts.filter((p) => p.kind === "pallets")]) {
    assert.ok(tank.x > lot.x0 && tank.x < lot.x1 && tank.z > lot.z0 && tank.z < lot.z1,
      `a ${tank.kind} outside the lot it belongs to`);
  }
});

test("nothing in the yard stands where the shed does", () => {
  // The defect a hash makes easy: a tank inside the building, which from the
  // air is a tank on a roof and from the street is nothing at all.
  for (let id = 1; id <= 24; id += 1) {
    const { spec } = works(0, { id, w: 2, h: 1 });
    const inside = (p) => p.x > spec.x0 - 0.5 && p.x < spec.x1 + 0.5
      && p.z > spec.z0 - 0.5 && p.z < spec.z1 + 0.5;
    for (const part of worksParts(spec).filter((p) => p.kind === "tank" || p.kind === "pallets")) {
      assert.ok(!inside(part), `id ${id}: a ${part.kind} standing inside the shed`);
    }
  }
});

test("a works is the same works every time, and within its budget", () => {
  for (let id = 1; id <= 20; id += 1) {
    const { spec } = works(0, { id });
    const once = JSON.stringify(worksParts(spec));
    assert.equal(JSON.stringify(worksParts(spec)), once, "a works changed between two reads");
    assert.ok(worksParts(spec).length <= WORKS_BUDGET.parts,
      `${worksParts(spec).length} parts on one works, over the ${WORKS_BUDGET.parts} allowed`);
  }
});

test("the yard is a mesh that faces up, not one flat quad", () => {
  // Two defects in one picture, both found by shooting it: a single quad takes
  // its height from its four corners, and across a 35 m lot with a 1.9 m fall
  // the ground in the middle rises above it — so the yard was buried under its
  // own terrain, and showed only as a line when lifted 60 cm into the air. And
  // +x then +z faces DOWN, which this project has paid for before (props-l3,
  // S3). The terrain is a mesh; anything laid on it has to be one too.
  const { spec } = works(0, { w: 2, h: 2 });
  // A ground that rises steadily across the lot: a flat quad cannot follow it.
  const heightAt = (x, z) => 20 + (x + z) * 0.05;
  const pieces = buildWorksYards([spec], { heightAt });
  assert.equal(pieces.length, 1, "no yard was built");
  const { part } = pieces[0];
  assert.ok(part.triangles >= 8, `a yard of ${part.triangles} triangles is one quad, not a mesh`);
  for (let t = 0; t < part.triangles; t += 1) {
    const i = t * 9;
    assert.ok(part.normal[i + 1] > 0.5,
      "a yard triangle faces down, where nobody standing on it can see it");
    // And it sits ON the ground it was given, not under it.
    for (let v = 0; v < 3; v += 1) {
      const x = part.position[i + v * 3];
      const y = part.position[i + v * 3 + 1];
      const z = part.position[i + v * 3 + 2];
      assert.ok(y >= heightAt(x, z) - 0.001, "a yard vertex is below the ground it lies on");
      assert.ok(y <= heightAt(x, z) + 0.5, "a yard vertex floats above the ground");
    }
  }
});
