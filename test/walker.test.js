// The walker (slice E4).
//
// It lives in `client/life/` and imports neither three nor the DOM, so the
// things that make a street camera feel wrong — a diagonal that is faster than
// a straight line, a wall you slide through, a kerb you cannot step up, a look
// that flips over at the zenith — are all assertions rather than a walk around
// the city with your eyes.

import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { adjacencyMask, tileAt } from "../shared/grid.js";
import { NET_PRESENT } from "../client/constants-mirror.js";
import { DEFAULTS } from "../client/world/config.js";
import { createModel } from "../client/world/model.js";
import { createCollision } from "../client/world/collision.js";
import { createWalker } from "../client/life/walker.js";

const T = DEFAULTS.tileM;
const EYE = 1.62;

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

function city() {
  const state = createState(defaultOptions({ width: 12, height: 12, seed: 7 }));
  pave(state, row(5, 1, 10));
  place(state, { id: 1, x: 3, y: 3, w: 2, h: 2 });
  const model = createModel(state);
  const collision = createCollision(model);
  return { state, model, collision, walker: createWalker(collision) };
}

/** Yaw looking along -z, which is the direction `forwardOf` gives for yaw 0. */
const NORTH = 0;

test("the eye lands 1.62 m above whatever it is teleported onto", () => {
  const { model, walker } = city();
  const x = 5.5 * T;
  const z = 5.5 * T;
  walker.teleport(x, z, NORTH);
  assert.equal(walker.pose.x, x);
  assert.ok(Math.abs(walker.pose.y - (model.surfaceAt(x, z).y + EYE)) < 1e-9);
});

test("a second of walking is 1.6 m and a second of running is 4", () => {
  const { walker } = city();
  const start = 5.5 * T;
  walker.teleport(start, 5.5 * T, NORTH);
  // Along the road, which runs east-west, so nothing is in the way.
  walker.pose.yaw = Math.PI / 2;   // forward = -x
  for (let i = 0; i < 10; i += 1) walker.update(0.1, { forward: 1 });
  assert.ok(Math.abs((start - walker.pose.x) - 1.6) < 1e-6, `walked ${start - walker.pose.x}`);

  const at = walker.pose.x;
  for (let i = 0; i < 10; i += 1) walker.update(0.1, { forward: 1, run: true });
  assert.ok(Math.abs((at - walker.pose.x) - 4) < 1e-6, `ran ${at - walker.pose.x}`);
});

test("a diagonal is not faster than a straight line", () => {
  const { walker } = city();
  walker.teleport(5.5 * T, 5.5 * T, Math.PI / 2);
  const from = { x: walker.pose.x, z: walker.pose.z };
  walker.update(1, { forward: 1, strafe: 1 });
  const moved = Math.hypot(walker.pose.x - from.x, walker.pose.z - from.z);
  assert.ok(Math.abs(moved - 1.6) < 1e-6, `a diagonal second covered ${moved} m`);
});

test("no input and no time move nothing", () => {
  const { walker } = city();
  walker.teleport(5.5 * T, 5.5 * T, NORTH);
  const before = { ...walker.pose };
  walker.update(0.1, {});
  walker.update(0, { forward: 1 });
  assert.deepEqual({ ...walker.pose }, before);
});

test("walking into a building stops at its wall, radius and all", () => {
  const { model, walker } = city();
  const lot = model.lots[0];
  // Start south of the lot, on the street, and walk north into it.
  walker.teleport(lot.cx, lot.z1 + 6, Math.PI);   // forward = +z is yaw PI... look north
  walker.pose.yaw = 0;                            // forward = -z, towards the lot
  for (let i = 0; i < 200; i += 1) walker.update(0.1, { forward: 1, run: true });
  assert.ok(walker.pose.z >= lot.z1 - 1e-6, `walked to z ${walker.pose.z} against a wall at ${lot.z1}`);
  assert.ok(walker.pose.z <= lot.z1 + walker.radius + 1e-6, `stopped ${walker.pose.z - lot.z1} m short`);
});

test("a kerb is a step, and the eye rises by it", () => {
  const { model, walker } = city();
  const cz = 5.5 * T;
  walker.teleport(5.5 * T, cz, NORTH);
  const onRoad = walker.pose.y;
  assert.equal(model.surfaceAt(walker.pose.x, walker.pose.z).kind, "road");
  // South, off the carriageway and onto the pavement.
  walker.pose.yaw = Math.PI;
  for (let i = 0; i < 40; i += 1) walker.update(0.1, { forward: 1 });
  assert.equal(model.surfaceAt(walker.pose.x, walker.pose.z).kind, "sidewalk");
  assert.ok(Math.abs((walker.pose.y - onRoad) - DEFAULTS.road.kerb) < 1e-6,
    `the eye rose ${walker.pose.y - onRoad} m over a ${DEFAULTS.road.kerb} m kerb`);
});

test("look wraps in yaw and clamps in pitch", () => {
  const { walker } = city();
  walker.teleport(5.5 * T, 5.5 * T, NORTH);
  walker.look(Math.PI * 2.5, 0);
  assert.ok(Math.abs(walker.pose.yaw - Math.PI * 0.5) < 1e-9, `yaw ${walker.pose.yaw}`);
  walker.look(0, 10);
  assert.ok(walker.pose.pitch < Math.PI / 2, "pitch may not reach the zenith");
  walker.look(0, -20);
  assert.ok(walker.pose.pitch > -Math.PI / 2);
});

// --- tap to walk (touch) -----------------------------------------------------

test("a tap walks there and stops on arrival", () => {
  const { walker } = city();
  const start = 5.5 * T;
  walker.teleport(start, 5.5 * T, 0);
  walker.seek(start - 8, 5.5 * T);
  for (let i = 0; i < 200; i += 1) walker.update(0.05, {});
  assert.equal(walker.goal, undefined, "the tap should have been consumed");
  assert.ok(Math.hypot(walker.pose.x - (start - 8), walker.pose.z - 5.5 * T) <= 1.001,
    `stopped ${walker.pose.x - (start - 8)} m away`);
});

test("a held key outranks a tap, and a wall cancels it", () => {
  const { model, walker } = city();
  const lot = model.lots[0];
  walker.teleport(5.5 * T, 5.5 * T, 0);
  walker.seek(5.5 * T - 20, 5.5 * T);
  walker.update(0.05, { forward: 1 });
  assert.equal(walker.goal, undefined, "a key cancels the tap");

  // A tap through a building walks into it once and gives up.
  walker.teleport(lot.cx, lot.z1 + 2, 0);
  walker.seek(lot.cx, lot.z0 - 5);
  for (let i = 0; i < 100; i += 1) walker.update(0.05, {});
  assert.equal(walker.goal, undefined, "a tap through a wall must not grind");
});
