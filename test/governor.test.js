// The frame-time governor (slice V2, ruling 040).
//
// The triangle budget is enforced by measurement and cannot see fill rate: a
// post pass, a shadow map and a supersample are all invisible to
// `renderer.info.render.triangles`. On a phone those are the whole cost, so a
// second instrument is needed — one that watches the clock and gives things up.
//
// Pure, so it can be tested without a browser: it is fed frame times and
// answers what may still draw.

import test from "node:test";
import assert from "node:assert/strict";
import { createGovernor, SACRIFICE } from "../client/render/governor.js";

/** Feeds `count` frames of `ms` each. */
function run(governor, ms, count) {
  for (let i = 0; i < count; i += 1) governor.sample(ms);
  return governor;
}

test("a governor inside its target gives nothing up", () => {
  const governor = createGovernor({ targetMs: 33 });
  run(governor, 16, 600);
  assert.deepEqual(governor.disabled(), [], "it sacrificed a pass while comfortably in budget");
  for (const name of SACRIFICE) assert.equal(governor.allows(name), true, `${name} was disabled`);
});

test("p95 ignores a single stall, and catches a sustained one", () => {
  // One long frame is a garbage collection or a chunk build. Turning the ink
  // off because of it would make the picture flicker between styles.
  const spike = createGovernor({ targetMs: 33 });
  run(spike, 16, 100);
  spike.sample(400);
  run(spike, 16, 100);
  assert.deepEqual(spike.disabled(), [], "one stall was enough to sacrifice a pass");

  const sustained = createGovernor({ targetMs: 33 });
  run(sustained, 50, 100);
  assert.equal(sustained.disabled()[0], SACRIFICE[0], "a sustained overrun gave up nothing");
});

test("it takes a second over target before giving anything up", () => {
  // Frames, not samples: 20 frames at 50 ms is a second of misery; 20 frames at
  // 5 ms over is not, and the first is what the player feels.
  const governor = createGovernor({ targetMs: 33 });
  run(governor, 16, 60);          // a settled p95 inside target
  run(governor, 50, 10);          // 500 ms over — not yet
  assert.deepEqual(governor.disabled(), [], "half a second was enough");
  run(governor, 50, 12);          // past a second
  assert.deepEqual(governor.disabled(), [SACRIFICE[0]]);
});

test("the order of sacrifice is fixed, and it stops when it runs out", () => {
  // Ink first because it is three full-screen passes for a finish; shadows
  // next; the supersample last, because dropping it is the one the player sees
  // as "blurry" rather than "different".
  assert.deepEqual(SACRIFICE, ["ink", "shadows", "supersample"]);
  const governor = createGovernor({ targetMs: 16 });
  for (let i = 0; i < SACRIFICE.length + 2; i += 1) run(governor, 100, 60);
  assert.deepEqual(governor.disabled(), [...SACRIFICE], "it did not walk the whole ladder");
  assert.equal(governor.allows("shadows"), false);
  // Nothing left to give is not an error, and not a loop.
  run(governor, 100, 60);
  assert.deepEqual(governor.disabled(), [...SACRIFICE]);
});

test("a sacrifice is remembered even when the frames come good again", () => {
  // Because they came good BECAUSE of the sacrifice. A governor that gave the
  // pass straight back would oscillate once a second for the whole session.
  // Ten frames to fill the minimum window, then just over a second of misery.
  const governor = createGovernor({ targetMs: 33 });
  run(governor, 100, 21);
  assert.deepEqual(governor.disabled(), ["ink"]);
  run(governor, 8, 600);
  assert.deepEqual(governor.disabled(), ["ink"], "it handed the pass back and will now oscillate");
});

test("reset forgets, because a new tier is a new question", () => {
  const governor = createGovernor({ targetMs: 33 });
  run(governor, 100, 120);
  assert.ok(governor.disabled().length > 0);
  governor.reset();
  assert.deepEqual(governor.disabled(), []);
  assert.equal(governor.p95(), 0, "the window survived the reset");
});

test("p95 is the 95th percentile of the window, not the mean", () => {
  const governor = createGovernor({ targetMs: 33, window: 100 });
  for (let i = 0; i < 95; i += 1) governor.sample(10);
  for (let i = 0; i < 5; i += 1) governor.sample(90);
  // A mean would be 14 and would say everything is fine while one frame in
  // twenty hitches.
  assert.ok(governor.p95() >= 60, `p95 came out at ${governor.p95()}`);
});

test("the window is bounded, so a long session costs no memory", () => {
  const governor = createGovernor({ targetMs: 33, window: 60 });
  run(governor, 16, 10000);
  assert.equal(governor.size(), 60);
});
