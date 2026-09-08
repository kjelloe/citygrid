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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";
import { createGovernor, SACRIFICE } from "../client/render/governor.js";
import { getConfig } from "../client/world/config.js";

const TIERS = getConfig().tiers;

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
  assert.deepEqual(SACRIFICE, ["pixel", "ink", "shadows", "supersample"]);
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
  assert.deepEqual(governor.disabled(), [SACRIFICE[0]]);
  run(governor, 8, 600);
  assert.deepEqual(governor.disabled(), [SACRIFICE[0]], "it handed the pass back and will now oscillate");
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

// --- the review's finding (R1.4) ---------------------------------------------

test("the pixel pass is on the ladder, and it goes first", () => {
  // It was not on the ladder at all, so `allows("pixel")` was always true: the
  // one post pass a phone actually runs could never be given up, and the
  // ladder's first rung was a pass no tier below High even has.
  assert.equal(SACRIFICE[0], "pixel", `the ladder starts with ${SACRIFICE[0]}`);
  assert.ok(SACRIFICE.indexOf("pixel") < SACRIFICE.indexOf("ink"));
  assert.ok(SACRIFICE.indexOf("supersample") === SACRIFICE.length - 1,
    "the supersample is the bluntest sacrifice and goes last");
});

test("the supersample rung is read by something (R1.4)", () => {
  // It was on the ladder and nothing consulted it: the governor gave it up and
  // the renderer went on rendering at 2x. A rung nobody reads is a decision
  // nobody takes — the same shape as `shadowRadius` in P1's rig table.
  const scene = readFileSync(join(repoRoot, "client", "render", "scene.js"), "utf8");
  assert.match(scene, /governor\.allows\("supersample"\)/,
    "nothing reads the supersample rung");
  assert.match(scene, /renderer\.setPixelRatio\(ratio\)/,
    "the supersample rung is read and then not acted on");
});

test("every rung the ladder names is read by the renderer", () => {
  const scene = readFileSync(join(repoRoot, "client", "render", "scene.js"), "utf8");
  for (const rung of SACRIFICE) {
    // `pixel` and `ink` are read through `postAllowed(pass)`, which takes the
    // style's own pass name; the other two are named directly.
    const read = scene.includes(`allows("${rung}")`) || scene.includes("governor.allows(pass)");
    assert.ok(read, `nothing in the renderer reads the ${rung} rung`);
  }
});

// --- what the first real device said (slice D5) -----------------------------
//
// Kjell's desktop card, 2026-09-08, build `cbbd27806158`: an RTX 4090 at a
// locked 60 fps — p50 16.7 ms and p95 16.8 ms on every one of the nine sweep
// steps — reporting `pixel,ink,shadows,supersample` given up on every one of
// them. The whole ladder, on the fastest machine anyone has run this on, four
// seconds after the city loaded, permanently. The frame time never complained
// because there was nothing wrong with it.
//
// The cause is arithmetic. `high.frameMs` was **16**, and a display locked to
// 60 Hz delivers 16.666… ms. `p95() <= targetMs` is then false forever, the
// patience window fills four times over, and the governor spends the ladder on
// a machine that is hitting its target exactly. `low` and `medium` had the same
// bug one refresh rate up: 33 ms against a 33.33 ms interval at 30 Hz.

/** The interval a display locked to `hz` actually delivers. */
const vsync = (hz) => 1000 / hz;

test("a machine locked to its refresh rate is not a machine in trouble", () => {
  // The whole finding, as one assertion. 16.7 is not "over 16" in any sense a
  // player would recognise.
  for (const [hz, targetMs] of [[60, TIERS.high.frameMs], [30, TIERS.low.frameMs]]) {
    const governor = createGovernor({ targetMs });
    run(governor, vsync(hz), 600);
    assert.deepEqual(governor.disabled(), [],
      `at a locked ${hz} Hz (${vsync(hz).toFixed(1)} ms) the ${targetMs} ms target gave up passes`);
  }
});

test("every tier's target leaves room above the refresh rate it aims at", () => {
  // A target equal to the interval is unmeetable by construction, and the
  // failure is silent: the picture degrades and the frame time stays perfect.
  // The rule is a threshold with headroom, not the period itself.
  assert.ok(TIERS.high.frameMs > vsync(60), `high aims at ${TIERS.high.frameMs} ms of a 16.7 ms frame`);
  assert.ok(TIERS.low.frameMs > vsync(30), `low aims at ${TIERS.low.frameMs} ms of a 33.3 ms frame`);
  assert.ok(TIERS.medium.frameMs > vsync(30), `medium aims at ${TIERS.medium.frameMs} ms of a 33.3 ms frame`);
});

test("a target with headroom still catches the frame rate below it", () => {
  // Headroom is not indifference. One refresh interval late — 60 Hz dropping to
  // 30, or 30 to 15 — has to still cost a pass, or the governor is decoration.
  for (const [hz, targetMs] of [[60, TIERS.high.frameMs], [30, TIERS.low.frameMs]]) {
    const governor = createGovernor({ targetMs });
    run(governor, vsync(hz) * 2, 600);
    assert.ok(governor.disabled().length > 0,
      `at half of ${hz} Hz the ${targetMs} ms target gave nothing up`);
  }
});
