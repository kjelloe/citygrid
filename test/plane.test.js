// The plane (slice T5b; D7, ruling 037).
//
// One aircraft at a time, and the whole of it is a cycle: in from the edge of
// the region on the runway's axis, down, roll out, taxi to the apron, wait,
// taxi back, take off, climb away. The invariant worth asserting is the same
// shape as the boats' — a vessel on land is the obvious defect there, and here
// it is a plane that lands across its own runway, or taxis through the
// terminal, or never leaves the ground.
//
// Timed by the caller like everything in `client/life/`: `update(dt)` takes
// seconds, nothing here asks the machine what time it is, and `?life=0` means
// the caller stops calling.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";
import { createState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import { CMD_JOIN, CMD_PLACE_BUILDING, CMD_PLACE_ROAD } from "../engine/commands.js";
import { TERRAIN_GRASS } from "../engine/constants.js";
import { createModel } from "../client/world/model.js";
import { createPlanes } from "../client/life/plane.js";
import { airfieldOf } from "../client/world/airfield.js";
import { DEFAULTS } from "../client/world/config.js";
import { tileAt, encodeRuns } from "../shared/grid.js";
import "../engine/build-commands.js";
import "../engine/utilities.js";

const W = 40;
const TILE = DEFAULTS.tileM;
const spec = DEFAULTS.airport;
const at = (x, y) => tileAt(W, x, y);

/** A flat city with one airport on it, turned the way the caller asks. */
function city({ orientation = 0, x = 12, y = 14 } = {}) {
  const state = createState(defaultOptions({ width: W, height: W, seed: 5 }));
  for (let i = 0; i < state.tiles.terrain.length; i += 1) state.tiles.terrain[i] = TERRAIN_GRASS;
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "One" });
  state.players[0].treasury = 1000000;
  state.quests.vars.push({ name: "rank", value: 3 });
  const cells = [];
  for (let k = 0; k < 6; k += 1) cells.push(at(x + k, y - 1));
  apply(state, { type: CMD_PLACE_ROAD, actor: 1, runs: encodeRuns(cells) });
  const placed = apply(state, { type: CMD_PLACE_BUILDING, actor: 1, def: "airport", x, y, orientation });
  assert.equal(placed.result, "ok", "the fixture could not place an airport");
  return state;
}

const run = (planes, seconds, step = 1 / 30) => {
  for (let i = 0; i < Math.round(seconds / step); i += 1) planes.update(step);
};

test("an airport gets one plane, and a city without one gets none", () => {
  const empty = createState(defaultOptions({ width: W, height: W, seed: 5 }));
  assert.equal(createPlanes(empty, createModel(empty)).count(), 0);

  const state = city();
  const planes = createPlanes(state, createModel(state));
  assert.equal(planes.count(), 1, "one airport, one aircraft");
});

test("the whole cycle happens, in order and in reasonable time", () => {
  // A plane that never leaves the apron and a plane that never arrives look the
  // same from a screenshot: still, and in the right place.
  const state = city();
  const planes = createPlanes(state, createModel(state));
  const seen = [];
  for (let i = 0; i < 30 * 600; i += 1) {
    planes.update(1 / 30);
    const phase = planes.fleet()[0]?.phase;
    if (phase && seen[seen.length - 1] !== phase) seen.push(phase);
  }
  for (const phase of ["approach", "roll", "taxi", "stand", "takeoff", "climb"]) {
    assert.ok(seen.includes(phase), `the plane never ${phase}s — saw ${seen.join(" → ")}`);
  }
  assert.ok(seen.length >= 12, `only ${seen.length} phase changes in ten minutes: ${seen.join(" → ")}`);
});

test("on the ground it stays on its own airfield, whichever way it is turned", () => {
  // Against the FOOTPRINT, not against the plan the aircraft itself flies: a
  // plane and a layout derived from the same wrong axis agree with each other
  // all the way into the next field. The building record is the independent
  // fact — `placeBuilding` wrote `w` and `h` from the orientation (ruling 044).
  for (const orientation of [0, 1]) {
    const state = city({ orientation });
    const model = createModel(state);
    const planes = createPlanes(state, model);
    const b = state.buildings[0];
    assert.equal(b.w, orientation === 1 ? 4 : 6, "the fixture did not turn the airport");
    const slack = spec.wingspan / 2;
    const box = { x0: b.x * TILE - slack, x1: (b.x + b.w) * TILE + slack,
      z0: b.y * TILE - slack, z1: (b.y + b.h) * TILE + slack };
    let checked = 0;
    for (let i = 0; i < 30 * 600; i += 1) {
      planes.update(1 / 30);
      const plane = planes.fleet()[0];
      if (!plane || plane.y > 0.5) continue;
      assert.ok(plane.x >= box.x0 && plane.x <= box.x1 && plane.z >= box.z0 && plane.z <= box.z1,
        `orientation ${orientation}: a plane is off the airport at ${plane.x.toFixed(1)}, `
        + `${plane.z.toFixed(1)} (phase ${plane.phase}), lot ${JSON.stringify(box)}`);
      checked += 1;
    }
    assert.ok(checked > 200, `only ${checked} ground samples for orientation ${orientation}`);
  }
});

test("its ground run is down the LONG side, which is the whole point of the axis", () => {
  // The footprint test above cannot see a runway laid across the short side —
  // it is still inside the lot — and the plan's own test compares the plan with
  // itself. This is the independent one: where the aircraft actually rolls.
  for (const orientation of [0, 1]) {
    const state = city({ orientation });
    const planes = createPlanes(state, createModel(state));
    const b = state.buildings[0];
    const span = { x: [Infinity, -Infinity], z: [Infinity, -Infinity] };
    for (let i = 0; i < 30 * 240; i += 1) {
      planes.update(1 / 30);
      const plane = planes.fleet()[0];
      if (!plane || plane.y > 0.5) continue;
      span.x[0] = Math.min(span.x[0], plane.x); span.x[1] = Math.max(span.x[1], plane.x);
      span.z[0] = Math.min(span.z[0], plane.z); span.z[1] = Math.max(span.z[1], plane.z);
    }
    const ran = { x: span.x[1] - span.x[0], z: span.z[1] - span.z[0] };
    const long = b.w >= b.h ? "x" : "z";
    const short = long === "x" ? "z" : "x";
    assert.ok(ran[long] > ran[short] * 1.5,
      `orientation ${orientation}: the aircraft ran ${ran.x.toFixed(0)} m east-west and `
      + `${ran.z.toFixed(0)} m north-south on a ${b.w}×${b.h} airport`);
    assert.ok(ran[long] > b[long === "x" ? "w" : "h"] * TILE * 0.7,
      `the ground run is only ${ran[long].toFixed(0)} m of a ${b[long === "x" ? "w" : "h"] * TILE} m side`);
  }
});

test("it comes in from outside the region and leaves the same way", () => {
  const state = city();
  const planes = createPlanes(state, createModel(state));
  const plan = airfieldOf(state.buildings[0]);
  let far = 0;
  let high = 0;
  for (let i = 0; i < 30 * 600; i += 1) {
    planes.update(1 / 30);
    const plane = planes.fleet()[0];
    if (!plane) continue;
    const along = plan.axis === "x" ? plane.x : plane.z;
    if (along < plan.runway.x0 - TILE * 4 || along > plan.runway.x1 + TILE * 4) far += 1;
    if (plane.y > TILE) high += 1;
  }
  assert.ok(far > 0, "the plane never leaves the airfield's own tiles");
  assert.ok(high > 0, "the plane never gets off the ground");
});

test("life: false leaves it where it is", () => {
  const state = city();
  const frozen = createPlanes(state, createModel(state), { life: false });
  const before = frozen.fleet().map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`);
  run(frozen, 120);
  assert.deepEqual(frozen.fleet().map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`), before);

  const moving = createPlanes(state, createModel(state));
  run(moving, 120);
  assert.notDeepEqual(moving.fleet().map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`), before,
    "the unfrozen plane did not move either, so this proves nothing");
});

test("the same seconds in different steps put it in the same place", () => {
  const state = city();
  const coarse = createPlanes(state, createModel(state));
  const fine = createPlanes(state, createModel(state));
  for (let i = 0; i < 20; i += 1) coarse.update(1 / 10);
  run(fine, 2);
  const a = coarse.fleet()[0];
  const b = fine.fleet()[0];
  assert.ok(Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.z - b.z) < 1e-6,
    `${a.x},${a.y},${a.z} against ${b.x},${b.y},${b.z}`);
});

test("the plane asks nobody for the time", () => {
  const source = readFileSync(join(repoRoot, "client", "life", "plane.js"), "utf8");
  for (const pattern of [/Date\.now/, /performance\.now/, /new Date/, /requestAnimationFrame/]) {
    assert.equal(pattern.test(source), false, `client/life/plane.js uses ${pattern}`);
  }
});
