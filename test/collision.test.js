// The walker's world (slice E4; spec §8.1, work item E4).
//
// Everything a street camera can get wrong is arithmetic: walking through a
// wall, sticking on a corner, floating a foot above the pavement, being unable
// to step up a kerb, or being stopped by a doorway it should fit through. All
// of it is pure, so all of it is testable here rather than by walking around
// the city and hoping — which is the whole reason `collision.js` lives in
// `client/world/` and not next to the camera that uses it.

import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { adjacencyMask, tileAt } from "../shared/grid.js";
import { NET_PRESENT } from "../client/constants-mirror.js";
import { DEFAULTS } from "../client/world/config.js";
import { createModel } from "../client/world/model.js";
import { createCollision, CELL } from "../client/world/collision.js";

const T = DEFAULTS.tileM;
const R = 0.34;

function blank(size = 12) {
  return createState(defaultOptions({ width: size, height: size, seed: 7 }));
}

function pave(state, tiles) {
  const road = state.tiles.road;
  for (const [x, y] of tiles) road[tileAt(state.width, x, y)] = NET_PRESENT;
  for (const [x, y] of tiles) {
    const mask = adjacencyMask(state.width, state.height, x, y, (i) => (road[i] & NET_PRESENT) !== 0);
    road[tileAt(state.width, x, y)] = NET_PRESENT | mask;
  }
}

function place(state, b) {
  const building = { id: b.id, def: "", zone: 1, x: 0, y: 0, w: 1, h: 1, owner: 1, level: 1, valueTier: 1, occupancy: 0, condition: 100, builtTick: 0, flags: 0, ...b };
  state.buildings.push(building);
  for (let y = building.y; y < building.y + building.h; y += 1) {
    for (let x = building.x; x < building.x + building.w; x += 1) {
      state.tiles.buildingId[tileAt(state.width, x, y)] = building.id;
    }
  }
  return building;
}

const row = (y, x0, x1) => Array.from({ length: x1 - x0 + 1 }, (_, k) => [x0 + k, y]);

/** A street with a building on either side of it. */
function street() {
  const state = blank();
  pave(state, row(5, 1, 10));
  place(state, { id: 1, x: 3, y: 3, w: 2, h: 2 });
  place(state, { id: 2, x: 3, y: 6, w: 2, h: 2 });
  const model = createModel(state);
  return { state, model, collision: createCollision(model) };
}

// --- the solids --------------------------------------------------------------

test("every lot is one solid, seated on its own ground and taller than a walker", () => {
  const { model, collision } = street();
  assert.equal(collision.solids.length, model.lots.length);
  for (const lot of model.lots) {
    const box = collision.solids.find((s) => s.lot === lot.id);
    assert.deepEqual(
      [box.x0, box.z0, box.x1, box.z1],
      [lot.x0, lot.z0, lot.x1, lot.z1],
      "a collider is the lot rectangle the facade is built on",
    );
    assert.equal(box.yBase, lot.seat);
    assert.ok(box.yTop - box.yBase >= 3, `a ${box.yTop - box.yBase} m building`);
  }
});

// --- push-out ----------------------------------------------------------------

test("a walker 0.2 m inside a wall is pushed OUT to exactly its radius", () => {
  const { model, collision } = street();
  const lot = model.lots[0];
  const at = { x: lot.cx, y: lot.seat, z: lot.z0 + 0.2 };
  const out = collision.resolve(at, R, 1.7);
  assert.ok(out.hit);
  // Out through the north face — the nearest daylight — and not deeper in,
  // which is what a segment push-out did before a lot was a box.
  assert.ok(Math.abs(out.z - (lot.z0 - R)) < 1e-6, `pushed to ${out.z}, wanted ${lot.z0 - R}`);
  assert.equal(out.x, lot.cx, "a face push must not slide the walker along it");
});

test("a walker just outside a wall is pushed clear of it, not through it", () => {
  const { model, collision } = street();
  const lot = model.lots[0];
  const out = collision.resolve({ x: lot.cx, y: lot.seat, z: lot.z0 - 0.1 }, R, 1.7);
  assert.ok(out.hit);
  assert.ok(Math.abs(out.z - (lot.z0 - R)) < 1e-6, `pushed to ${out.z}`);
});

test("a walker outside everything is left exactly where it is", () => {
  const { model, collision } = street();
  const at = { x: 5.5 * T, y: model.surfaceAt(5.5 * T, 5.5 * T).y, z: 5.5 * T };
  const out = collision.resolve(at, R, 1.7);
  assert.equal(out.hit, false);
  assert.equal(out.x, at.x);
  assert.equal(out.z, at.z);
});

test("a walker above the roof is not stopped by the building under it", () => {
  const { model, collision } = street();
  const lot = model.lots[0];
  const box = collision.solids.find((s) => s.lot === lot.id);
  const out = collision.resolve({ x: lot.cx, y: box.yTop + 1, z: lot.cz }, R, 1.7);
  assert.equal(out.hit, false);
});

test("a doorway 1.8 m wide passes and 0.6 m does not", () => {
  const { model } = street();
  const gapped = (gap) => createCollision(model, [
    { id: 0, x0: -10, z0: -20, x1: 10, z1: -gap / 2, yBase: 0, yTop: 6 },
    { id: 1, x0: -10, z0: gap / 2, x1: 10, z1: 20, yBase: 0, yTop: 6 },
  ]);
  // Wide enough only if the walker can stand on the centre line untouched.
  const through = (gap) => gapped(gap).resolve({ x: 0, y: 1, z: 0 }, R, 1.7).hit === false;
  assert.equal(through(1.8), true);
  assert.equal(through(0.6), false);
});

test("a corner leaves the walker outside the lot, not inside its neighbour face", () => {
  const { model, collision } = street();
  const lot = model.lots[0];
  const out = collision.resolve({ x: lot.x0 + 0.1, y: lot.seat, z: lot.z0 + 0.1 }, R, 1.7);
  assert.ok(out.hit);
  const inside = out.x > lot.x0 && out.x < lot.x1 && out.z > lot.z0 && out.z < lot.z1;
  assert.equal(inside, false, `corner left the walker at ${out.x}, ${out.z}`);
});

// --- the floor ---------------------------------------------------------------

test("floorAt steps up a kerb and refuses a wall", () => {
  const { collision } = street();
  const cz = 5.5 * T;
  const road = collision.floorAt(5.5 * T, cz, 0);
  const walk = collision.floorAt(5.5 * T, cz + DEFAULTS.road.width / 2 + 1, road);
  assert.ok(walk !== undefined, "the pavement is a step, not a wall");
  assert.ok(Math.abs(walk - road - DEFAULTS.road.kerb) < 1e-6, `${walk} against ${road}`);
  // A step taller than the limit is not a step.
  assert.equal(collision.floorAt(5.5 * T, cz + DEFAULTS.road.width / 2 + 1, road - 2), undefined);
});

test("the step-up limit is a limit and not a fence: down is always allowed", () => {
  const { collision } = street();
  const cz = 5.5 * T;
  const high = collision.floorAt(5.5 * T, cz, 0) + 10;
  assert.notEqual(collision.floorAt(5.5 * T, cz, high), undefined);
});

// --- the spatial hash --------------------------------------------------------

test("the hash returns everything brute force does, on two hundred points", () => {
  const { state, collision } = street();
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  let touched = 0;
  for (let i = 0; i < 200; i += 1) {
    const x = rnd() * state.width * T;
    const z = rnd() * state.height * T;
    const hashed = new Set(collision.near(x, z, R).map((s) => s.id));
    for (const b of collision.solids) {
      const cx = Math.max(b.x0, Math.min(b.x1, x));
      const cz = Math.max(b.z0, Math.min(b.z1, z));
      if (Math.hypot(x - cx, z - cz) > R) continue;
      touched += 1;
      assert.ok(hashed.has(b.id), `the hash missed a solid at ${x}, ${z}`);
    }
  }
  assert.ok(touched > 0, "two hundred points that touch nothing prove nothing");
  assert.ok(CELL > R);
});
