// Ambient motion (slice S6, spec §9.4). `client/world/motion.js` is every
// formula and constant; `client/render/motion-material.js` is the shader patch,
// and loads in node because it never imports three.

import test from "node:test";
import assert from "node:assert/strict";
import { MOTION, ANIMATED, motionTime, sway, rotorAngle, craneAngle, flagWave, puff } from "../client/world/motion.js";
import { addMotion, MOTION_GLSL, motionUniforms, setMotionTime } from "../client/render/motion-material.js";

const PHASES = [0, 0.7, 2.1, 4.4, 9.9];

test("life off is t = 0, whatever the clock says", () => {
  // Reduced motion turns life off in game.js, and `?life=0` is life off, so
  // one rule stills both.
  assert.equal(motionTime(37.5, { life: false }), 0);
  assert.equal(motionTime(37.5), 37.5);
  assert.equal(motionTime(NaN), 0);
  assert.equal(motionTime(-3), 0);
});

test("every animated pool has a still state at t = 0", () => {
  assert.deepEqual(Object.values(ANIMATED).sort(), ["crane", "flag", "rotor", "smoke", "sway"]);
  for (const phase of PHASES) {
    for (const h of [0, 0.3, 1]) assert.equal(sway(0, h, phase), 0, `sway at t=0, h ${h}`);
    assert.equal(rotorAngle(0, phase), 0);
    assert.equal(craneAngle(0, phase), 0);
    // Smoke and flag hold a rest pose at t = 0: the same whichever clock was
    // frozen, which is what makes two frozen screenshots the same bytes.
    for (let k = 0; k < MOTION.smoke.puffs; k += 1) {
      assert.deepEqual(puff(motionTime(99, { life: false }), k), puff(0, k));
    }
    assert.equal(flagWave(motionTime(99, { life: false }), 0.5, phase), flagWave(0, 0.5, phase));
  }
});

test("the motion is bounded: nothing bounces", () => {
  for (let t = 0; t < 120; t += 0.37) {
    for (const phase of PHASES) {
      assert.ok(Math.abs(sway(t, 1, phase)) <= MOTION.sway.amp + 1e-9);
      assert.ok(Math.abs(sway(t, 0, phase)) === 0, "the base of a tree moved");
      assert.ok(Math.abs(craneAngle(t, phase)) <= MOTION.crane.amp + 1e-9);
      assert.ok(Math.abs(flagWave(t, 1, phase)) <= MOTION.flag.amp + 1e-9);
      // A magnitude: at the pole the formula is amp · 0 · sin(…), which is -0
      // half the time, and strict equality tells -0 from 0.
      assert.equal(Math.abs(flagWave(t, 0, phase)), 0, "the cloth moved at the pole");
    }
  }
  assert.ok(MOTION.sway.amp <= 0.06, "a sway past 6% of a tree's height is a tree in a gale");
  assert.ok(MOTION.sway.speed < 2 && MOTION.crane.speed < 0.3, "restrained movement, per the spec");
});

test("a puff rises, drifts, grows and fades, and is gone at the top", () => {
  for (let k = 0; k < MOTION.smoke.puffs; k += 1) {
    for (let t = 0; t < 30; t += 0.5) {
      const p = puff(t, k);
      assert.ok(p.f >= 0 && p.f < 1);
      assert.ok(p.alpha >= 0 && p.alpha <= 1);
      assert.ok(p.rise >= 0 && p.rise <= MOTION.smoke.rise);
    }
  }
  assert.ok(puff(MOTION.smoke.period * 0.999, 0).alpha < 0.01, "a puff is still visible as it wraps");
});

test("the shader patch chains, keys its program by kind, and takes its numbers from motion.js", () => {
  let before = 0;
  const material = { onBeforeCompile: () => { before += 1; } };
  addMotion(material, "sway", 0.4);
  const shader = {
    uniforms: {},
    vertexShader: "#include <common>\nvoid main() {\n#include <begin_vertex>\n}",
    fragmentShader: "#include <common>\nvoid main() {\n#include <dithering_fragment>\n}",
  };
  material.onBeforeCompile(shader);
  assert.equal(before, 1, "the style's own patch was dropped");
  assert.equal(shader.uniforms.uTime, motionUniforms.uTime, "not the shared clock");
  assert.ok(shader.vertexShader.includes(MOTION.sway.amp.toFixed(4)), "the sway amplitude is not motion.js's");
  assert.ok(shader.vertexShader.includes(MOTION.sway.speed.toFixed(4)));
  const other = {};
  addMotion(other, "rotor");
  assert.notEqual(material.customProgramCacheKey(), other.customProgramCacheKey(),
    "two kinds of motion share one compiled program");
  const smoke = {};
  addMotion(smoke, "smoke", 0.08);
  assert.equal(smoke.transparent, true);
  const puffShader = { uniforms: {}, vertexShader: shader.vertexShader.replace(/uniform float uTime;[\s\S]*/, "#include <common>\n#include <begin_vertex>"),
    fragmentShader: "#include <common>\n#include <dithering_fragment>" };
  smoke.onBeforeCompile({ uniforms: {}, vertexShader: "#include <common>\n#include <begin_vertex>", fragmentShader: puffShader.fragmentShader });
  const compiled = { uniforms: {}, vertexShader: "#include <common>\n#include <begin_vertex>", fragmentShader: "#include <common>\n#include <dithering_fragment>" };
  smoke.onBeforeCompile(compiled);
  assert.ok(compiled.fragmentShader.includes("smoothstep"), "a puff is a square of one alpha");
  assert.ok(compiled.fragmentShader.includes(MOTION.smoke.opacity.toFixed(4)), "the puff's opacity is not motion.js's");
  assert.equal(smoke.depthWrite, false);
  for (const kind of Object.keys(MOTION_GLSL)) assert.equal(typeof MOTION_GLSL[kind](1), "string");
  setMotionTime(3.5);
  assert.equal(motionUniforms.uTime.value, 3.5);
  setMotionTime(0);
});
