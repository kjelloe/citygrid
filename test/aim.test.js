// How a picture gate points itself (S20) — `tools/lib/aim.mjs`.
//
// A shot tool is not usually worth a test; a shared library that decides where
// every camera stands is, because its mistakes are silent. Both of the ones
// made while writing it were: a camera six metres clear of every building and
// standing in the river, and a yaw computed 180° out, which pointed every
// camera at the horizon behind its subject. Neither threw, both produced a
// picture, and only looking at the frames found them.
//
// The model here is a stub with the three things the helper asks of it — lots,
// a surface and a tile size — so the test is about the aiming and not about a
// derivation.

import test from "node:test";
import assert from "node:assert/strict";
import { standBack, fitDistance, clearanceAt, frontageNormal, describe } from "../tools/lib/aim.mjs";

/** A city with one building at (100..120, 100..120) m, water east of x = 200. */
function stubModel({ water = (x) => x > 200 } = {}) {
  return {
    tileM: 20,
    lots: [{ id: 1, x0: 100, z0: 100, x1: 120, z1: 120, cx: 110, cz: 110, frontage: 0, frontageLen: 20 }],
    heightAt: () => 40,
    waterLevelAt: () => undefined,
    surfaceAt: (x) => ({ kind: water(x) ? "water" : "road" }),
  };
}

test("a camera stands back until nothing is inside the near field", () => {
  const model = stubModel();
  // The front of the building faces north (frontage 0), so the camera backs off
  // northwards — which is -z.
  const camera = standBack(model, {
    at: { x: 110, z: 100 }, away: frontageNormal({ frontage: 0 }), clear: 3, start: 1, max: 30,
  });
  assert.ok(camera, "no camera at all");
  assert.ok(camera.eye.z < 100, "the camera stood on the wrong side of the frontage");
  assert.ok(camera.clearance >= 3, `only ${camera.clearance} m clear`);
  assert.equal(camera.standingOn, "road");
});

test("a camera never stands in the water", () => {
  // The first one this helper chose was six metres clear of every building and
  // in the middle of the river: the frame was a band of city across the horizon
  // with water filling the bottom half. "Can stand there" is not only "is not
  // inside a wall".
  const model = stubModel({ water: (x) => x > 130 });
  // Every candidate position east of the building is in the river: 15 m back is
  // x = 135 and the far end of the search is x = 160.
  const east = standBack(model, {
    at: { x: 120, z: 110 }, away: { x: 1, z: 0 }, clear: 1, start: 15, max: 40,
  });
  assert.equal(east, undefined, "a camera was placed in the water");

  // With the rule off it takes the first of them, so the test above is about
  // the rule and not about the geometry.
  const wet = standBack(model, {
    at: { x: 120, z: 110 }, away: { x: 1, z: 0 }, clear: 1, start: 15, max: 40, onLand: false,
  });
  assert.ok(wet && wet.standingOn === "water", "the fixture has no water in it");
});

test("the camera looks AT its subject, not away from it", () => {
  // `client/world/orbit.js` makes a free-look camera's forward
  // `(-sin(yaw), sin(pitch), -cos(yaw))`. The first cut negated the stand-off
  // direction twice and every shot came out facing the horizon behind the
  // thing it was aimed at — the defect S20 exists to end, reproduced inside
  // the fix for it.
  const model = stubModel();
  const at = { x: 110, z: 100 };
  const camera = standBack(model, { at, away: { x: 0, z: -1 }, clear: 1, start: 10, max: 20 });
  const forward = { x: -Math.sin(camera.yaw), z: -Math.cos(camera.yaw) };
  const toSubject = { x: at.x - camera.eye.x, z: at.z - camera.eye.z };
  const len = Math.hypot(toSubject.x, toSubject.z);
  const dot = (forward.x * toSubject.x + forward.z * toSubject.z) / len;
  assert.ok(dot > 0.99, `the camera looks ${(Math.acos(dot) * 180 / Math.PI).toFixed(0)}° away from its subject`);
});

test("how far back a subject of a given width has to be seen from", () => {
  // A 20 m frontage filling the frame edge to edge under a 50° lens is about
  // 21 m away; filling a frame and a quarter is sixteen. The shop shot stood at
  // six metres (a wall) and then at 41 (a dot) before this existed.
  assert.equal(Math.round(fitDistance(20, { share: 1 })), 21);
  assert.equal(Math.round(fitDistance(20, { share: 1.25 })), 16);
  // Twice as wide, twice as far.
  assert.equal(Math.round(fitDistance(40, { share: 1 })), 43);
  // And a subject with no width does not divide by zero.
  assert.ok(Number.isFinite(fitDistance(0, { share: 1 })));
});

test("clearance is measured to the WALLS, not to the middle", () => {
  const model = stubModel();
  // Ten metres north of the north wall.
  assert.equal(clearanceAt(model, 110, 90), 10);
  // Inside the footprint is zero, not a distance to the centre.
  assert.equal(clearanceAt(model, 110, 110), 0);
});

test("a gate's subject line says what was aimed at, or that nothing could be", () => {
  const model = stubModel();
  const camera = standBack(model, { at: { x: 110, z: 100 }, away: { x: 0, z: -1 }, start: 8 });
  const line = describe("shop", { cx: 110, cz: 110, tileM: 20 }, camera);
  assert.match(line, /shop: subject 5\.5,5\.5/);
  assert.match(line, /camera \d+ m back on road/);
  assert.match(describe("shop", { cx: 1, cz: 1, tileM: 20 }, undefined), /NO CAMERA/);
});
