// Ambient motion (slice S6, spec §9.4). `client/world/motion.js` is every
// formula and constant; `client/render/motion-material.js` is the shader patch,
// and loads in node because it never imports three.

import test from "node:test";
import assert from "node:assert/strict";
import { MOTION, ANIMATED, motionTime, sway, rotorAngle, radarAngle, craneAngle, flagWave, puff, rippleAt } from "../client/world/motion.js";
import { addMotion, MOTION_GLSL, motionUniforms, setMotionTime } from "../client/render/motion-material.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";

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
  assert.deepEqual(Object.values(ANIMATED).sort(),
    ["crane", "fire", "flag", "radar", "rotor", "smoke", "sway"]);
  for (const phase of PHASES) {
    for (const h of [0, 0.3, 1]) assert.equal(sway(0, h, phase), 0, `sway at t=0, h ${h}`);
    assert.equal(rotorAngle(0, phase), 0);
    assert.equal(radarAngle(0, phase), 0);
    assert.equal(craneAngle(0, phase), 0);
    // Smoke and flag hold a rest pose at t = 0: the same whichever clock was
    // frozen, which is what makes two frozen screenshots the same bytes.
    for (const spec of [MOTION.smoke, MOTION.fire]) {
      for (let k = 0; k < spec.puffs; k += 1) {
        assert.deepEqual(puff(motionTime(99, { life: false }), k, spec), puff(0, k, spec));
      }
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

test("a fire is a denser column than a chimney, and the chimney is unchanged (Q107, A114)", () => {
  // B1b made smoke draw for the first time since S6, and what it drew was one
  // thin column nobody can see from the city camera — which is the one place a
  // fire has to be noticed. §9.4's restraint is about the city's resting tone.
  assert.deepEqual(MOTION.smoke, { puffs: 6, period: 7, rise: 1.4, drift: 0.55, grow: 1.6, opacity: 0.6 },
    "the chimney moved; A114 says it does not");
  assert.ok(MOTION.fire.puffs > MOTION.smoke.puffs, "a fire has no more puffs than a chimney");
  assert.ok(MOTION.fire.opacity > MOTION.smoke.opacity, "a fire is no denser than a chimney");
  // The same SHAPE, so a fire reads as smoke rather than as a different effect:
  // one puff's rise, drift and growth are the chimney's.
  for (const key of ["period", "rise", "drift", "grow"]) {
    assert.equal(MOTION.fire[key], MOTION.smoke[key], `a fire's ${key} is not the chimney's`);
  }
  // And the puff arithmetic takes the spec, so the two columns are the same
  // function at two settings rather than two copies of it.
  const a = puff(3, 0, MOTION.fire);
  const b = puff(3, 0, MOTION.smoke);
  assert.equal(a.rise, b.rise, "the first puff of each rises differently");
  assert.notEqual(puff(3, 7, MOTION.fire).f, undefined, "a fire has a seventh puff");
});

// --- the water's ripple (S18b) ----------------------------------------------

test("the ripple is a slow swell, bounded and still at rest", () => {
  // S18 asks for "a slow normal ripple as a uniform" on the water surface. The
  // numbers live beside the other motions so node can hold them and the GLSL
  // can read them — one copy, the rule this file exists for.
  assert.ok(MOTION.ripple, "no ripple in the motion table");
  const { amp, speed, wave } = MOTION.ripple;
  assert.ok(amp > 0 && amp <= 0.2, `a ripple ${amp} m high is a swell, not a surface`);
  assert.ok(speed > 0 && speed < 1.5, `a ripple at ${speed} rad/s is chop`);
  assert.ok(wave > 5, `a wavelength of ${wave} m is a cross-hatch at city zoom`);

  // Still when the clock is: `?life=0` freezes the water like everything else.
  for (const [x, z] of [[0, 0], [37, 12], [-120, 400]]) {
    // `Math.abs`, because the answer at a trough is `-0` and `strictEqual`
    // tells -0 from 0 (Object.is). The claim is "flat", not "positive zero".
    assert.ok(Math.abs(rippleAt(x, z, 0)) < 1e-12, "the water is not flat at time zero");
  }
  // And bounded, everywhere, forever.
  for (let t = 0; t < 40; t += 0.37) {
    for (const [x, z] of [[0, 0], [11, 23], [310, -47]]) {
      assert.ok(Math.abs(rippleAt(x, z, t)) <= amp + 1e-9,
        `the ripple reached ${rippleAt(x, z, t)} m at t=${t}`);
    }
  }
  // Alive, and smooth. Two crossed waves do not repeat on a single axis — the
  // first version of this assertion asked them to and was wrong about the
  // function rather than about the water — so what is checked is that the
  // surface VARIES across a span, and that it never steps: a swell that jumps
  // between neighbouring metres is a cross-hatch, which is the defect S4 spent
  // a slice on.
  const t = 3.3;
  const heights = [];
  for (let x = 0; x <= 100; x += 1) heights.push(rippleAt(x, 40, t));
  assert.ok(Math.max(...heights) - Math.min(...heights) > amp * 0.5, "the water is flat while alive");
  for (let i = 1; i < heights.length; i += 1) {
    assert.ok(Math.abs(heights[i] - heights[i - 1]) < amp * 0.5,
      `the surface steps ${(heights[i] - heights[i - 1]).toFixed(3)} m in a metre`);
  }
});

// --- the table against the calls (the omissions round, 2026-10-06) ----------

/** Every `addMotion(…, "kind")` in the renderer, as [pool-or-null, kind]. */
function motionCalls() {
  const calls = [];
  for (const file of ["instances.js", "water.js"]) {
    const source = readFileSync(join(repoRoot, "client", "render", file), "utf8");
    for (const m of source.matchAll(/addMotion\(\s*(?:pools[.[]`?([A-Za-z0-9_]*)|([A-Za-z0-9_]+))[^,]*,\s*"([a-z]+)"/g)) {
      calls.push([m[1] ?? null, m[3]]);
    }
  }
  return calls;
}

test("ANIMATED is the renderer's own list, not a second copy of it", () => {
  // `ANIMATED` says "a pool not listed here does not move", and for the life of
  // the project nothing in `client/` has read it — `instances.js` names the pool
  // and the kind in each of its own `addMotion` calls. The two agreed, which is
  // the state a table is in right up to the slice that changes one of them
  // (the `VARIANTS` lesson). So the claim is checked against the calls.
  const calls = motionCalls();
  assert.ok(calls.length >= 8, `only ${calls.length} addMotion calls found — the scan, not the renderer`);

  // Water is a MESH, not a pool: one surface for the whole map (E8), so the
  // ripple is driven from `water.js` and is deliberately not in `ANIMATED`.
  const meshKinds = calls.filter(([pool]) => pool === null).map(([, kind]) => kind);
  assert.deepEqual([...new Set(meshKinds)].sort(), ["ripple"]);
  assert.ok(!Object.values(ANIMATED).includes("ripple"), "the water is listed as a pool");

  const posed = calls.filter(([pool]) => pool !== null);
  assert.deepEqual([...new Set(posed.map(([, kind]) => kind))].sort(), Object.values(ANIMATED).sort(),
    "a pool moves by a kind ANIMATED does not list, or ANIMATED lists one no pool uses");
  for (const [pool, kind] of posed) {
    const listed = ANIMATED[pool] ?? ANIMATED[Object.keys(ANIMATED).find((k) => pool.startsWith(k)) ?? ""];
    assert.equal(listed, kind, `the renderer moves ${pool} by "${kind}"; ANIMATED says "${listed}"`);
  }

  // And every motion in the table has a shader body, both ways.
  assert.deepEqual(Object.keys(MOTION).sort(), Object.keys(MOTION_GLSL).sort(),
    "a motion has numbers and no shader, or a shader and no numbers");
});

test("the ripple's shader carries the metre numbers converted to tiles", () => {
  // The water mesh is built in TILES and `MOTION.ripple` is in metres, so the
  // shader divides by the caller's tile size. A copied constant brings its
  // units with it (the E7 lesson): a 6 cm swell left in metres on a 20 m tile
  // is a 1.2 m sea, and nothing in node or in a frozen shot would say so.
  const { amp, speed, wave } = MOTION.ripple;
  for (const tileM of [20, 8]) {
    const glsl = MOTION_GLSL.ripple(tileM);
    assert.ok(glsl.includes((amp / tileM).toFixed(4)), `the swell is not ${amp} m at ${tileM} m a tile`);
    assert.ok(glsl.includes((wave / tileM).toFixed(4)), `the wavelength is not ${wave} m at ${tileM} m a tile`);
    assert.ok(glsl.includes(speed.toFixed(4)), "the shader's speed is not motion.js's");
    // Per second is per second: the one number that must NOT be divided.
    assert.ok(!glsl.includes((speed / tileM).toFixed(4)), "the ripple's speed was converted to tiles");
    assert.ok(!glsl.includes(`${amp.toFixed(4)} * rippleShape`), "the swell is in metres on a tile mesh");
    // It is a field, not a thing: no per-instance phase, or every tile of the
    // one water mesh would ride its own wave.
    assert.ok(!glsl.includes("motionPhase"), "the water's swell is phased per instance");
    assert.ok(glsl.includes("position.x") && glsl.includes("position.z"),
      "the swell does not come from where the vertex is");
  }
});
