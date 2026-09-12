// The shader half of ambient motion (slice S6).
//
// Chains an `onBeforeCompile` patch onto a pool's material — after any patch
// already there, such as the toon style's shadow tint — and displaces vertices
// by the one clock in `motionUniforms`. The formulas are the ones in
// `client/world/motion.js`, and the NUMBERS are injected from there, so the
// constants exist once. No per-instance work: the phase comes from where the
// instance stands, and a smoke puff's place in its column from its index.
//
// No `three` import: a material is patched through strings and a `{ value }`,
// which is what lets node test this module.

import { MOTION } from "../world/motion.js";

/** One clock for every patched material. `setMotionTime` is called once a frame. */
export const motionUniforms = { uTime: { value: 0 } };

export function setMotionTime(t) {
  motionUniforms.uTime.value = t;
}

const n = (v) => Number(v).toFixed(4);

const PHASE = `
  vec3 motionAt = vec3(0.0);
  #ifdef USE_INSTANCING
    motionAt = instanceMatrix[3].xyz;
  #endif
  float motionPhase = motionAt.x * 1.7 + motionAt.z * 2.3;`;

/** The vertex displacement for each kind, given the geometry's own size. */
export const MOTION_GLSL = {
  sway: (height) => `${PHASE}
  float swayH = clamp(position.y / ${n(height)}, 0.0, 1.0);
  float swayD = ${n(MOTION.sway.amp)} * ${n(height)} * swayH * swayH
    * sin(${n(MOTION.sway.speed)} * uTime) * (0.6 + 0.4 * cos(motionPhase));
  transformed.x += swayD;
  transformed.z += swayD * 0.6;`,
  rotor: () => `${PHASE}
  float rotorA = ${n(MOTION.rotor.speed)} * uTime * (0.85 + 0.15 * cos(motionPhase));
  transformed.xy = vec2(cos(rotorA) * transformed.x - sin(rotorA) * transformed.y,
    sin(rotorA) * transformed.x + cos(rotorA) * transformed.y);`,
  crane: (slewFrom) => `${PHASE}
  if (position.y > ${n(slewFrom)}) {
    float craneA = ${n(MOTION.crane.amp)} * sin(${n(MOTION.crane.speed)} * uTime) * (0.7 + 0.3 * cos(motionPhase));
    transformed.xz = vec2(cos(craneA) * transformed.x - sin(craneA) * transformed.z,
      sin(craneA) * transformed.x + cos(craneA) * transformed.z);
  }`,
  flag: (length) => `${PHASE}
  float flagU = clamp(position.x / ${n(length)}, 0.0, 1.0);
  transformed.z += ${n(MOTION.flag.amp)} * ${n(length)} * flagU
    * sin(${n(MOTION.flag.speed)} * uTime - flagU * ${n(MOTION.flag.wave)} + motionPhase);`,
  smoke: (radius) => `
  // How far from the puff's centre, as a share of its half-size: one of x and
  // z is zero on each of the two crossed quads.
  vMotionRound = length(vec2(position.x + position.z, position.y)) / ${n(radius)};
  float puffK = float(gl_InstanceID % ${MOTION.smoke.puffs});
  float puffF = fract(uTime / ${n(MOTION.smoke.period)} + puffK / ${n(MOTION.smoke.puffs)});
  transformed *= 0.5 + puffF * ${n(MOTION.smoke.grow)};
  transformed.y += puffF * ${n(MOTION.smoke.rise)};
  transformed.x += puffF * ${n(MOTION.smoke.drift)};
  vMotionFade = (1.0 - puffF) * min(1.0, puffF * 6.0);`,
};

/** Patches `material` to move as `kind`. `size` is the geometry measure the
 * formula needs: a tree's height, a flag's length, where a crane's jib begins. */
export function addMotion(material, kind, size = 1) {
  const body = MOTION_GLSL[kind];
  if (!body) throw new Error(`no motion called ${kind}`);
  const fades = kind === "smoke";
  const already = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (typeof already === "function") already(shader, renderer);
    shader.uniforms.uTime = motionUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\nuniform float uTime;\n${fades ? "varying float vMotionFade;\nvarying float vMotionRound;" : ""}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${body(size)}`);
    if (fades) {
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vMotionFade;\nvarying float vMotionRound;")
        // Round and soft, not a square: a flat quad of one alpha read as a
        // grey cardboard panel near the camera (S6, looked at).
        .replace("#include <dithering_fragment>", `#include <dithering_fragment>
  gl_FragColor.a *= vMotionFade * ${n(MOTION.smoke.opacity)} * (1.0 - smoothstep(0.35, 1.0, vMotionRound));`);
    }
  };
  // Every patched material's `onBeforeCompile` is the same closure text, and
  // three keys its program cache on that text by default — so a sway and a
  // rotor would share one compiled program. Keyed by kind and size instead.
  const before = typeof material.customProgramCacheKey === "function"
    && Object.prototype.hasOwnProperty.call(material, "customProgramCacheKey")
    ? material.customProgramCacheKey.bind(material) : () => "";
  material.customProgramCacheKey = () => `${before()}|motion:${kind}:${n(size)}`;
  if (fades) {
    material.transparent = true;
    material.depthWrite = false;
  }
  material.needsUpdate = true;
  return material;
}
