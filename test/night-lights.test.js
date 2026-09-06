// The night light pool (slice E6; spec §7.3).
//
// Eight point lights for a city of a thousand lamps, so which eight is the
// whole question. Two things go wrong and neither throws: the pool churns as
// the player walks, which is a strobe, or the same lamp is handed out twice,
// which is a light that is quietly double strength.

import test from "node:test";
import assert from "node:assert/strict";
import { nearestLamps, lampsOf } from "../client/render/night-lights.js";

const line = (n, spacing = 10) => Array.from({ length: n }, (_, i) => ({ id: i, x: i * spacing, y: 0, z: 0 }));

test("the nearest lamps come back, nearest first", () => {
  const chosen = nearestLamps(line(20), { x: 55, y: 2, z: 0 }, 3);
  assert.deepEqual(chosen.map((l) => l.id), [5, 6, 4]);
});

test("the cap is a cap, and zero means none", () => {
  assert.equal(nearestLamps(line(20), { x: 0, z: 0 }, 8).length, 8);
  assert.equal(nearestLamps(line(3), { x: 0, z: 0 }, 8).length, 3);
  assert.deepEqual(nearestLamps(line(20), { x: 0, z: 0 }, 0), []);
  assert.deepEqual(nearestLamps([], { x: 0, z: 0 }, 8), []);
});

test("no lamp is handed out twice", () => {
  const chosen = nearestLamps(line(40), { x: 130, y: 2, z: 0 }, 8);
  assert.equal(new Set(chosen.map((l) => l.id)).size, chosen.length);
});

test("a lamp already lit is not dropped for one a metre nearer", () => {
  const lamps = line(20);
  const eye = { x: 24, y: 2, z: 0 };
  const held = nearestLamps(lamps, eye, 2);
  // Walk a step; without hysteresis the pool would swap on this move.
  const after = nearestLamps(lamps, { x: 26, y: 2, z: 0 }, 2, held);
  assert.deepEqual(after.map((l) => l.id).sort(), held.map((l) => l.id).sort());
});

test("but it is dropped once the player has really walked past it", () => {
  const lamps = line(20);
  const held = nearestLamps(lamps, { x: 24, y: 2, z: 0 }, 2);
  const after = nearestLamps(lamps, { x: 74, y: 2, z: 0 }, 2, held);
  assert.notDeepEqual(after.map((l) => l.id).sort(), held.map((l) => l.id).sort());
  assert.deepEqual(after.map((l) => l.id), [7, 8]);
});

test("the choice is stable: same input, same answer", () => {
  const lamps = line(20);
  const eye = { x: 33, y: 2, z: 0 };
  assert.deepEqual(nearestLamps(lamps, eye, 4), nearestLamps(lamps, eye, 4));
  // Even when two lamps are exactly the same distance away.
  const tied = [{ id: 2, x: -5, y: 0, z: 0 }, { id: 1, x: 5, y: 0, z: 0 }];
  assert.deepEqual(nearestLamps(tied, { x: 0, z: 0 }, 1)[0].id, 1);
});

test("lamps are gathered from the chunks that hold them", () => {
  const entries = [{ lamps: [{ id: 1 }, { id: 2 }] }, {}, { lamps: [{ id: 3 }] }];
  assert.deepEqual(lampsOf(entries).map((l) => l.id), [1, 2, 3]);
  assert.deepEqual(lampsOf([]), []);
});
