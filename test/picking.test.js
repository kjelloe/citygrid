// Picking against a height field (slice V4; ruling 038, spec §8.1).
//
// Picking has intersected a plane at y = 0 since the renderer was written, and
// on flat ground that is exact. With relief it is wrong in the one direction
// that matters: the ray keeps going past the hill it hit and lands on a tile
// further away, so clicking the near face of a hill builds on the far side of
// it. The error grows with the slope and with how far the camera is tilted,
// which means it is smallest where you test it and largest where you play.
//
// `picking.js` builds the ray with three; the march is pure and lives in
// `client/world/raymarch.js`, so all of this runs in node against a height
// field written by hand.

import test from "node:test";
import assert from "node:assert/strict";
import { marchGround } from "../client/world/raymarch.js";
import { DEFAULTS } from "../client/world/config.js";

const T = DEFAULTS.tileM;

/** A ray from a point, normalised. */
function ray(from, towards) {
  const d = [towards[0] - from[0], towards[1] - from[1], towards[2] - from[2]];
  const len = Math.hypot(...d);
  return { ox: from[0], oy: from[1], oz: from[2], dx: d[0] / len, dy: d[1] / len, dz: d[2] / len };
}

const flat = (y) => () => y;

/** A ramp climbing eastward: y = x × slope. */
const ramp = (slope) => (x) => x * slope;

/** A step: everything east of `at` is `high` metres up. */
const step = (at, high) => (x) => (x >= at ? high : 0);

// --- the flat case, which must not move --------------------------------------

test("on flat ground the march lands where the plane did", () => {
  // Straight down onto a field at y = 0.
  const hit = marchGround(ray([100, 500, 250], [100, 0, 250]), flat(0));
  assert.ok(hit, "the ray missed the ground");
  assert.ok(Math.abs(hit.x - 100) < 0.05 && Math.abs(hit.z - 250) < 0.05,
    `landed at ${hit.x.toFixed(2)}, ${hit.z.toFixed(2)}`);
});

test("a flat field raised to y = h is hit at y = h", () => {
  const hit = marchGround(ray([100, 500, 250], [100, 0, 250]), flat(12));
  assert.ok(Math.abs(hit.y - 12) < 0.05, `hit at y = ${hit.y}`);
});

test("an oblique ray onto flat ground is still exact", () => {
  // The isometric case: down and along, at the camera's own pitch.
  const from = [0, 200, 0];
  const hit = marchGround(ray(from, [200, 0, 200]), flat(0));
  assert.ok(Math.abs(hit.x - 200) < 0.1 && Math.abs(hit.z - 200) < 0.1,
    `landed at ${hit.x.toFixed(2)}, ${hit.z.toFixed(2)}`);
});

// --- the case the plane gets wrong -------------------------------------------

test("on a slope the pick lands on the visible face, not the y = 0 shadow", () => {
  // A ray coming down from the west onto a ramp climbing east. The plane
  // intersection runs on until y = 0 and reports a point further east than the
  // hill it actually struck.
  const field = ramp(0.25);
  const shot = ray([0, 40, 0], [200, 0, 0]);
  const hit = marchGround(shot, field);
  assert.ok(hit, "the ray missed the hill");
  // Where the plane would have said: solve y = 0 along the ray.
  const t = -shot.oy / shot.dy;
  const planeX = shot.ox + shot.dx * t;
  assert.ok(hit.x < planeX - 5,
    `the march landed at ${hit.x.toFixed(1)} and the plane at ${planeX.toFixed(1)} — no closer`);
  // And it is ON the surface.
  assert.ok(Math.abs(hit.y - field(hit.x)) < 0.2,
    `hit at y = ${hit.y.toFixed(2)} where the ground is ${field(hit.x).toFixed(2)}`);
});

test("the near face of a step is what gets picked, not the far side", () => {
  // The sharpest version: a cliff. A ray that clears the cliff top must land
  // beyond it; a ray that does not must land on it.
  const field = step(100, 20);
  const onto = marchGround(ray([60, 40, 0], [140, 0, 0]), field);
  assert.ok(onto.x >= 100 - 1 && onto.x <= 112,
    `a ray at the cliff landed at ${onto.x.toFixed(1)}`);
  assert.ok(Math.abs(onto.y - 20) < 0.5, `it landed at y = ${onto.y.toFixed(2)}, not on the top`);
});

test("the march converges tightly enough to pick the right tile", () => {
  // A tile is 20 m. The answer has to be good to a fraction of that, or the
  // pick lands one tile out on a slope, which is exactly the bug being fixed.
  const field = ramp(0.2);
  for (let z = 0; z < 200; z += 37) {
    const shot = ray([10, 60, z], [180, 0, z]);
    const hit = marchGround(shot, field);
    assert.ok(Math.abs(hit.y - field(hit.x)) < T / 20,
      `off the surface by ${Math.abs(hit.y - field(hit.x)).toFixed(3)} m at z = ${z}`);
  }
});

// --- the edges ---------------------------------------------------------------

test("a ray that never meets the ground reports nothing", () => {
  // Pointing up, and pointing along above the hills. Returning a made-up point
  // would put a building where the player did not click.
  assert.equal(marchGround(ray([0, 10, 0], [0, 100, 0]), flat(0)), undefined);
  assert.equal(marchGround({ ox: 0, oy: 50, oz: 0, dx: 1, dy: 0, dz: 0 }, flat(0)), undefined);
});

test("a ray that starts underground reports nothing rather than a hit behind it", () => {
  assert.equal(marchGround(ray([50, -5, 50], [60, -8, 50]), flat(0)), undefined);
});

test("the march gives up rather than running for ever", () => {
  // A ray parallel to a ground it never reaches must terminate. The far limit
  // is the map's own diagonal; beyond that there is nothing to pick.
  const shot = { ox: 0, oy: 1000, oz: 0, dx: 0.0001, dy: -0.0001, dz: 0 };
  const started = Date.now();
  marchGround(shot, flat(0), { far: 4000 });
  assert.ok(Date.now() - started < 200, "the march did not terminate promptly");
});

test("a coarse field and a fine one agree on where the ground is", () => {
  // The step size is a performance choice and must not be a correctness one.
  const field = ramp(0.15);
  const shot = ray([0, 50, 30], [200, 0, 30]);
  const coarse = marchGround(shot, field, { step: T });
  const fine = marchGround(shot, field, { step: T / 8 });
  assert.ok(Math.abs(coarse.x - fine.x) < 0.5,
    `${coarse.x.toFixed(2)} against ${fine.x.toFixed(2)}`);
});
