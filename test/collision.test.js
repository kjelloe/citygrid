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
  // Every LOT, and now the street furniture beside them (E7, A43) — so the
  // count is a lower bound rather than an equality.
  assert.equal(collision.solids.filter((s) => s.kind === "lot").length, model.lots.length);
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

// --- street furniture is solid (slice E7, A43) -------------------------------

test("a lamp post is something you bump into", () => {
  // It was a picture of a lamp post for two slices: the geometry stood on the
  // pavement and the walker went through it, which is the class of defect a
  // screenshot cannot show because the render is exactly right.
  const state = blank(12);
  pave(state, row(6, 1, 11));
  const model = createModel(state);
  const collision = createCollision(model);
  const posts = collision.solids.filter((b) => b.kind === "lamp");
  assert.ok(posts.length > 0, "no lamp is solid on a 200 m street");
  const post = posts[0];
  const cx = (post.x0 + post.x1) / 2;
  const cz = (post.z0 + post.z1) / 2;
  const out = collision.resolve({ x: cx, z: cz, y: post.yBase + 0.2 }, R, 1.7);
  assert.equal(out.hit, true, "a walker standing in a lamp post is not pushed out");
  assert.ok(Math.hypot(out.x - cx, out.z - cz) >= R, "pushed out by less than its own radius");
});

test("a lamp post does not stand where the walker walks (A43)", () => {
  // The finding: the posts were in the middle of the pavement, which is the
  // line `walkthrough` walks, so every pavement leg stopped on one every 24 m.
  const state = blank(12);
  pave(state, row(6, 1, 11));
  const collision = createCollision(createModel(state));
  const walked = DEFAULTS.road.width / 2 + DEFAULTS.road.sidewalk / 2;
  for (const post of collision.solids.filter((b) => b.kind === "lamp")) {
    // The street runs east-west along tile row 6, so the pavement lines are at
    // z = centre ± walked.
    const centre = 6.5 * T;
    const across = Math.abs((post.z0 + post.z1) / 2 - centre);
    const edge = across + (post.z1 - post.z0) / 2;
    assert.ok(Math.abs(walked - edge) > R,
      `a post edge ${edge.toFixed(2)} m out against a walked line at ${walked} m`);
  }
});

test("a bin is stepped over, not walked round", () => {
  // A43 names lamps and hedges. A bin stands where people walk and stopping
  // for one would be the thing every player noticed.
  const state = blank(12);
  pave(state, row(6, 1, 11));
  const collision = createCollision(createModel(state));
  assert.equal(collision.solids.filter((b) => b.kind === "bin").length, 0);
});

test("the furniture does not turn a street into a corridor of posts", () => {
  // The gap either side of a post has to stay wide enough to walk through, or
  // the pavement is passable in theory and unwalkable in practice.
  const state = blank(12);
  pave(state, row(6, 1, 11));
  const collision = createCollision(createModel(state));
  const posts = collision.solids.filter((b) => b.kind === "lamp");
  const kerb = DEFAULTS.road.width / 2;
  const lot = kerb + DEFAULTS.road.sidewalk;
  for (const post of posts) {
    const centre = 6.5 * T;
    const near = Math.abs(post.z0 - centre) < Math.abs(post.z1 - centre) ? post.z0 : post.z1;
    const far = near === post.z0 ? post.z1 : post.z0;
    const inside = Math.abs(near) === 0 ? 0 : Math.abs(Math.abs(near - centre) - kerb);
    const outside = lot - Math.abs(far - centre);
    assert.ok(inside > 0.34 || outside > 0.34,
      `a post with ${inside.toFixed(2)} m to the kerb and ${outside.toFixed(2)} m to the lot line`);
  }
});

// --- the walker stays out of the water (slice E8, Q58) -----------------------

test("a walker cannot walk into deep water", () => {
  // A lake was a flat blue floor the walker strolled across, because `heightAt`
  // clamped a water tile to the water level and `floorAt` asked no further
  // question. The bed drops now, and `floorAt` refuses anything deeper than
  // `water.wade`.
  const state = blank(16);
  state.tiles.elevation.fill(40);
  for (let y = 5; y <= 10; y += 1) {
    for (let x = 5; x <= 10; x += 1) {
      state.tiles.terrain[tileAt(state.width, x, y)] = 3;
      state.tiles.elevation[tileAt(state.width, x, y)] = 30;
    }
  }
  const model = createModel(state);
  const collision = createCollision(model);
  const foot = model.heightAt(2.5 * T, 7.5 * T);
  assert.equal(collision.floorAt(7.5 * T, 7.5 * T, foot), undefined, "the middle of the lake is walkable");
  assert.notEqual(collision.floorAt(2.5 * T, 7.5 * T, foot), undefined, "dry land is not");
});

test("the very edge of the water can be waded", () => {
  // Not a wall at the shoreline: a tile that touches land is at the surface, so
  // it is ankle-deep and a walker may stand in it. The wall is where it gets
  // deeper than `water.wade`.
  const state = blank(16);
  state.tiles.elevation.fill(40);
  for (let y = 5; y <= 10; y += 1) {
    for (let x = 5; x <= 10; x += 1) {
      state.tiles.terrain[tileAt(state.width, x, y)] = 3;
      state.tiles.elevation[tileAt(state.width, x, y)] = 30;
    }
  }
  const collision = createCollision(createModel(state));
  assert.notEqual(collision.floorAt(5.5 * T, 5.5 * T, 15), undefined,
    "the shore tile is a wall rather than a paddle");
});

test("a causeway over water is walkable, and stepping off it is not", () => {
  const state = blank(16);
  state.tiles.elevation.fill(40);
  for (let y = 5; y <= 10; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      state.tiles.terrain[tileAt(state.width, x, y)] = 3;
      state.tiles.elevation[tileAt(state.width, x, y)] = 30;
    }
  }
  pave(state, row(7, 0, 15));
  const model = createModel(state);
  const collision = createCollision(model);
  const on = collision.floorAt(7.5 * T, 7.5 * T, 15);
  assert.notEqual(on, undefined, "the causeway is under water");
  // A tile in from the shore, so it is open water rather than the paddle at
  // the edge — and outside the corridor's own frontage.
  assert.equal(collision.floorAt(7.5 * T, 6.5 * T, on), undefined, "you can walk off a causeway");
});
