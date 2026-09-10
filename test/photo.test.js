// The photo camera's arithmetic (slice F1, `specs/plan.md` §10 bonus 4).
//
// A free camera: position and look set directly, no orbit target, no collision
// and no gravity. It is the fourth mode ruling 034 has to answer for, and the
// only one where the player can put the eye anywhere — which is what makes it
// the instrument for the questions a gate cannot see (Q73, the grey slab of
// unbuilt zoning), and what makes it worth keeping pure.
//
// In `client/world/` and not beside the camera for the reason everything else
// here is: node can load this and `camera.js` imports three.

import test from "node:test";
import assert from "node:assert/strict";
import {
  photoSpeed, photoStep, photoLook, PHOTO_MAX_PITCH, PHOTO_CROSS_SECONDS,
} from "../client/world/photo.js";

const eye = (x = 10, y = 2, z = 10) => ({ x, y, z });
const still = { forward: 0, strafe: 0, fast: false };

test("standing still moves nobody", () => {
  const before = eye();
  const after = photoStep(before, 0, 0, still, 1, 40);
  assert.deepEqual(after, before);
});

test("forward follows where the camera is LOOKING, pitch included", () => {
  // The whole of a free camera: there is no other way up or down, so a forward
  // that ignores the pitch is a camera that can only ever fly level. Looking
  // straight down and pressing forward has to descend.
  const down = photoStep(eye(), 0, -Math.PI / 2, { ...still, forward: 1 }, 1, 40);
  assert.ok(down.y < eye().y, `looking down and moving forward went to y ${down.y}`);
  const up = photoStep(eye(), 0, Math.PI / 2, { ...still, forward: 1 }, 1, 40);
  assert.ok(up.y > eye().y, `looking up and moving forward went to y ${up.y}`);
});

test("and level flight stays level", () => {
  const level = photoStep(eye(), 0.7, 0, { ...still, forward: 1 }, 1, 40);
  assert.ok(Math.abs(level.y - eye().y) < 1e-9, `drifted to y ${level.y}`);
});

test("strafe is horizontal whatever the camera is looking at", () => {
  // Sidestepping while looking at the ground must not fly you into it.
  for (const pitch of [0, -1.2, 1.2]) {
    const side = photoStep(eye(), 0.3, pitch, { ...still, strafe: 1 }, 1, 40);
    assert.ok(Math.abs(side.y - eye().y) < 1e-9, `strafing at pitch ${pitch} moved y to ${side.y}`);
    assert.ok(Math.hypot(side.x - 10, side.z - 10) > 1, "strafing went nowhere");
  }
});

test("forward and back are opposite, and strafing left and right are too", () => {
  const f = photoStep(eye(), 0.4, 0.2, { ...still, forward: 1 }, 1, 40);
  const b = photoStep(eye(), 0.4, 0.2, { ...still, forward: -1 }, 1, 40);
  assert.ok(Math.abs((f.x - 10) + (b.x - 10)) < 1e-9);
  assert.ok(Math.abs((f.z - 10) + (b.z - 10)) < 1e-9);
  assert.ok(Math.abs((f.y - 2) + (b.y - 2)) < 1e-9);
});

test("a diagonal is not faster than a straight line", () => {
  // The oldest bug in free cameras. Pressing two keys must not be a speed-up.
  const straight = photoStep(eye(), 0, 0, { ...still, forward: 1 }, 1, 40);
  const diagonal = photoStep(eye(), 0, 0, { ...still, forward: 1, strafe: 1 }, 1, 40);
  const d = (p) => Math.hypot(p.x - 10, p.y - 2, p.z - 10);
  assert.ok(Math.abs(d(diagonal) - d(straight)) < 1e-9,
    `${d(diagonal).toFixed(3)} m diagonally against ${d(straight).toFixed(3)} straight`);
});

test("the speed follows the zoom, so it is usable from the air and the pavement", () => {
  // A camera that crosses the visible city in a fixed number of seconds is one
  // control the player learns once. A fixed speed in tiles is either unusable
  // at a span of 4 or unusable at 160.
  assert.ok(photoSpeed(160) > photoSpeed(40), "a wide view is not faster");
  assert.ok(photoSpeed(40) > photoSpeed(8), "a close view is not slower");
  for (const span of [8, 40, 160]) {
    const seconds = span / photoSpeed(span);
    assert.ok(Math.abs(seconds - PHOTO_CROSS_SECONDS) < 1e-9,
      `a span of ${span} takes ${seconds.toFixed(1)}s to cross, not ${PHOTO_CROSS_SECONDS}`);
  }
});

test("and the modifier is a modifier, not a different camera", () => {
  const normal = photoStep(eye(), 0, 0, { ...still, forward: 1 }, 1, 40);
  const fast = photoStep(eye(), 0, 0, { ...still, forward: 1, fast: true }, 1, 40);
  const d = (p) => Math.hypot(p.x - 10, p.z - 10);
  assert.ok(d(fast) > d(normal), "the fast modifier did nothing");
  assert.ok(d(fast) <= d(normal) * 6, "the fast modifier is a teleport");
});

test("distance is a rate: two half-steps are one whole one", () => {
  // `client/life/` and this take their time as a delta from the caller, which
  // is what makes `?life=0` freeze and what stops the camera being a function
  // of the frame rate the way the traffic was (D7, Q76).
  const one = photoStep(eye(), 0.3, 0.2, { ...still, forward: 1 }, 1, 40);
  let two = eye();
  for (let i = 0; i < 100; i += 1) two = photoStep(two, 0.3, 0.2, { ...still, forward: 1 }, 0.01, 40);
  for (const k of ["x", "y", "z"]) {
    assert.ok(Math.abs(one[k] - two[k]) < 1e-9, `${k}: ${one[k]} in one step, ${two[k]} in a hundred`);
  }
});

test("looking wraps in yaw and clamps in pitch", () => {
  // Wrapped, because a player who spins for a minute accumulates a yaw big
  // enough to lose precision in — `yawBy`'s reasoning, and the same answer.
  const spun = photoLook(0, 0, Math.PI * 10, 0);
  assert.ok(spun.yaw >= 0 && spun.yaw < Math.PI * 2, `yaw ${spun.yaw}`);
  // Clamped, because at exactly straight down the look direction is parallel to
  // the up vector and `lookAt` has no answer — the same reason `camera.js`
  // stops at 82° from the other side.
  const under = photoLook(0, 0, 0, -Math.PI);
  const over = photoLook(0, 0, 0, Math.PI);
  assert.ok(Math.abs(under.pitch) <= PHOTO_MAX_PITCH + 1e-9, `pitch ${under.pitch}`);
  assert.ok(Math.abs(over.pitch) <= PHOTO_MAX_PITCH + 1e-9, `pitch ${over.pitch}`);
  assert.ok(PHOTO_MAX_PITCH < Math.PI / 2, "the clamp allows looking straight down");
});

test("the photo camera can look further down than the city camera ever could", () => {
  // The point of the mode. The orbit camera stops at 82° because it is on an
  // orbit; a free camera hanging over a roof looking at it is a shot the game
  // has never been able to take.
  assert.ok(PHOTO_MAX_PITCH > 82 * (Math.PI / 180));
});

// --- the fourth mode, through the arithmetic everything shares (ruling 034) --
//
// A mode is not a mode until `eyeOf`, `tilePixels`, `visibleBounds` and the
// atmosphere all have an answer for it. R1.6 exists because two copies of the
// eye arithmetic disagreed; a fourth mode that half of them fall through to the
// orthographic branch for is the same defect with a new name.

import { eyeOf, PITCH } from "../client/world/orbit.js";
import { tilePixels, visibleBounds, usesChunkPlans } from "../client/render/lod.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";
import { fogFor } from "../client/render/atmosphere.js";
import { getConfig } from "../client/world/config.js";

const photoView = (over = {}) => ({
  mode: "photo", aspect: 16 / 9, fov: 50, span: 40, yaw: 0, pitch: 0,
  targetX: 20, targetZ: 20, groundY: 0, eye: { x: 20, y: 3, z: 20 },
  persp: { far: 4000 },
  ...over,
});

test("eyeOf puts the photo camera where it was put, looking where it looks", () => {
  const view = photoView({ yaw: Math.PI / 2, pitch: -0.5 });
  const e = eyeOf(view);
  assert.deepEqual({ x: e.x, y: e.y, z: e.z }, { x: 20, y: 3, z: 20 },
    "the eye was moved onto an orbit it is not on");
  // The street convention, so the two free-look modes agree.
  assert.ok(Math.abs(e.fy - Math.sin(-0.5)) < 1e-9, `looking down gives fy ${e.fy}`);
  assert.ok(Math.abs(Math.hypot(e.fx, e.fy, e.fz) - 1) < 1e-9, "the look is not a unit vector");
});

test("and it is the street's answer, not the orbit's", () => {
  const shared = { aspect: 16 / 9, fov: 50, span: 40, yaw: 1.1, pitch: -0.3, groundY: 0,
    targetX: 20, targetZ: 20, eye: { x: 20, y: 3, z: 20 } };
  const asStreet = eyeOf({ ...shared, mode: "street" });
  const asPhoto = eyeOf({ ...shared, mode: "photo" });
  assert.deepEqual(asPhoto, asStreet);
});

test("tilePixels uses the perspective formula, not the orthographic fallback", () => {
  // The bug this is here to prevent: `mode !== "city" && mode !== "street"`
  // returns `canvasHeight / verticalSpan`, which is the ORTHO answer — it
  // ignores where the eye is, so a photo camera two metres off the ground would
  // be priced as though it were on the orbit.
  const low = tilePixels(photoView({ eye: { x: 20, y: 0.1, z: 20 } }), 720, { x: 20, z: 20 });
  const high = tilePixels(photoView({ eye: { x: 20, y: 30, z: 20 } }), 720, { x: 20, z: 20 });
  assert.ok(low > high * 5,
    `a tile underfoot is ${low.toFixed(0)} px and from 600 m up ${high.toFixed(0)} — the eye is being ignored`);
  const ortho = 720 / 40;
  assert.ok(Math.abs(low - ortho) > 1, "the photo camera fell through to the orthographic branch");
});

test("visibleBounds draws a footprint for it, the way it does under any perspective", () => {
  // A box round the diagonal is what the orthographic branch gives, and it is
  // the wrong shape for a wedge: at a low pitch it either cuts the distance off
  // or pays for a huge area behind the eye (V5).
  const bounds = visibleBounds(photoView({ pitch: -0.2 }), 16 / 9, 0);
  assert.ok(bounds.footprint && bounds.footprint.length >= 3,
    "no footprint, so the photo camera is being priced as a box");
});

test("the fog is the street's near the ground and the city's from the air", () => {
  // `fogFor` had two answers and a mode each. The photo camera is both places,
  // so it picks by where the eye actually is — down among the buildings a fixed
  // reach in metres, from the air a multiple of the span (V8).
  const hour = { fogNear: 1.4, fogFar: 5, sky: "#fff" };
  const cfg = getConfig();
  const ground = fogFor(photoView({ eye: { x: 20, y: 0.08, z: 20 }, persp: { far: 100 } }), hour, cfg);
  const air = fogFor(photoView({ eye: { x: 20, y: 40, z: 20 } }), hour, cfg);
  const street = fogFor({ ...photoView(), mode: "street", persp: { far: 100 } }, hour, cfg);
  const city = fogFor({ ...photoView(), mode: "city" }, hour, cfg);
  assert.deepEqual(ground, street, "at eye height the photo camera does not get the street's fog");
  assert.deepEqual(air, city, "from the air the photo camera does not get the city's fog");
});

test("ortho still has no fog, and photo is not ortho", () => {
  const hour = { fogNear: 1.4, fogFar: 5, sky: "#fff" };
  assert.equal(fogFor({ ...photoView(), mode: "ortho" }, hour, getConfig()), undefined);
  assert.ok(fogFor(photoView(), hour, getConfig()) !== undefined, "the photo camera has no horizon");
});

test("the estimate and the renderer agree about which modes plan per chunk", () => {
  // What broke `ui_smoke`'s street row while F1 was in progress: the estimate
  // was taught to price every perspective mode per chunk, and `instances.js`
  // draws per chunk only in `city`. The estimate then priced distant chunks
  // cheaply, the ladder stopped stepping down, and the frame came back empty.
  // One function, read by both, so they cannot drift apart again.
  assert.equal(usesChunkPlans("city"), true);
  assert.equal(usesChunkPlans("photo"), true, "the photo camera is an orbit camera without the orbit");
  assert.equal(usesChunkPlans("street"), false, "street mode's chunks come from the street cache");
  assert.equal(usesChunkPlans("ortho"), false);
  assert.equal(usesChunkPlans(undefined), false);

  const source = readFileSync(join(repoRoot, "client", "render", "instances.js"), "utf8");
  assert.match(source, /usesChunkPlans\(/,
    "instances.js decides per-chunk planning for itself again");
  assert.equal(/plan\.mode !== "city"/.test(source), false,
    "instances.js still carries its own list of modes");
});
