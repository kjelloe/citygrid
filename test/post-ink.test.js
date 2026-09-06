// The ink and grade pass (slice P2; spec §7.4, ruling 033).
//
// A shader is a string until the GPU sees it, and everything that goes wrong
// with one is silent: it does not compile and the screen is black, or it
// compiles with a uniform nobody sets and the picture is subtly wrong forever.
// Both are checkable here, and so is the one thing the pass exists for — that
// the edge test is a SECOND difference of depth, which is zero across a plane
// at any angle and is therefore not the luminance test that turned the pixel
// style to mud (ruling 017, and P1 repeating it for painted).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";
import { DEFAULTS } from "../client/world/config.js";
import { INK, FXAA, VERTEX, GRADE_NAMES, gradeFor, uniformsOf } from "../client/render/ink-shaders.js";

test("the grades are data, one per time-of-day preset", () => {
  assert.deepEqual([...GRADE_NAMES], Object.keys(DEFAULTS.presets));
  const file = JSON.parse(readFileSync(join(repoRoot, "data", "cityviewer.json"), "utf8"));
  for (const name of GRADE_NAMES) {
    assert.deepEqual(gradeFor(name), file.grades[name], `${name} has drifted from the data`);
  }
  assert.deepEqual(gradeFor("teatime"), DEFAULTS.grades.day, "an unknown grade falls back");
});

test("night is drawn in a softer line than noon", () => {
  // A hard black outline on a dark street reads as a mistake.
  assert.ok(gradeFor("night").ink < gradeFor("day").ink);
  assert.ok(gradeFor("night").saturation < gradeFor("day").saturation);
});

// --- the edge test -----------------------------------------------------------

test("the ink is a SECOND difference of depth, not a luminance edge", () => {
  // Four neighbours against four times the centre: the Laplacian. Anything
  // else — a gradient magnitude, a luminance step — fires on every window in
  // an L3 facade, which is the failure this pass was built to avoid.
  assert.match(INK, /4\.0\s*\*\s*centre/, "the centre is not weighted by four");
  for (const neighbour of ["dx0", "dx1", "dy0", "dy1"]) {
    assert.ok(INK.includes(neighbour), `the ink does not sample ${neighbour}`);
  }
  assert.equal(/luma\s*\(\s*texture2D\s*\(\s*tDiffuse/.test(INK), false,
    "the ink is testing the colour buffer, which is the luminance edge again");
});

test("depth is linearised before it is differenced, and the ortho branch exists", () => {
  assert.match(INK, /float linearDepth\(float d\)/);
  assert.match(INK, /uOrtho > 0\.5/, "an orthographic depth buffer is already linear (spec §7.4)");
  assert.match(INK, /2\.0 \* uNear \* uFar/, "the perspective linearisation is missing");
  // A `pow` on depth would be a gamma curve on a distance, which is what the
  // work item warns against: it makes the line width depend on the far plane.
  const linearise = INK.slice(INK.indexOf("float linearDepth"), INK.indexOf("float depthAt"));
  assert.equal(/pow\s*\(/.test(linearise), false, "there is a pow on the depth");
});

test("a line is the same width near and far", () => {
  // Divided by the centre depth. Without it, the second difference grows with
  // distance and the horizon is drawn in a fat line.
  assert.match(INK, /lap \/ max\(centre/);
});

test("convex and concave are separate strengths", () => {
  // Union Square draws silhouettes strongly and creases faintly; one strength
  // for both makes every roof ridge as heavy as the roofline against the sky.
  assert.match(INK, /uConvex/);
  assert.match(INK, /uConcave/);
  assert.ok(INK.indexOf("uConvex") !== INK.indexOf("uConcave"));
});

// --- the grade ---------------------------------------------------------------

test("the grade is a split tone, not a tint", () => {
  assert.match(INK, /uShadowTint/);
  assert.match(INK, /uHighlightTint/);
  assert.match(INK, /smoothstep\(0\.2, 0\.8, l\)/, "the darks and the lights are not separated");
});

test("the target holds linear colour and the pass encodes on the way out", () => {
  // The lesson the pixel pass paid for: a pass-through post-process dropped
  // mean brightness from 78 to 25 because nothing encoded sRGB.
  assert.match(INK, /linearToSRGB/);
  assert.equal(/linearToSRGB/.test(FXAA), false, "FXAA runs after the encode, not before it");
});

// --- what the pipeline has to set --------------------------------------------

test("every uniform the shaders declare is one the pipeline sets", () => {
  const source = readFileSync(join(repoRoot, "client", "render", "post-ink.js"), "utf8");
  for (const name of uniformsOf(INK)) {
    assert.match(source, new RegExp(`\\b${name}\\b`), `${name} is declared and never set`);
  }
  for (const name of uniformsOf(FXAA)) {
    assert.match(source, new RegExp(`\\b${name}\\b`), `FXAA's ${name} is declared and never set`);
  }
});

test("every uniform the grade names is one the shader reads", () => {
  const declared = new Set(uniformsOf(INK));
  const wanted = { shadowTint: "uShadowTint", highlightTint: "uHighlightTint", lift: "uLift", gain: "uGain", saturation: "uSaturation", ink: "uInk", inkColour: "uInkColour" };
  for (const [field, uniform] of Object.entries(wanted)) {
    assert.ok(field in gradeFor("day"), `the grade has no ${field}`);
    assert.ok(declared.has(uniform), `the shader has no ${uniform} for ${field}`);
  }
});

test("the vertex shader is a full-screen triangle pair and nothing else", () => {
  assert.match(VERTEX, /gl_Position = vec4\(position\.xy, 0\.0, 1\.0\)/);
  assert.equal(/projectionMatrix/.test(VERTEX), false, "a full-screen quad does not need a projection");
});
