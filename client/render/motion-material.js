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
  // The radar turns about Y, where the turbine's rotor turns about Z: one is a
  // head on a tower looking out, the other a wheel facing the wind (T5b).
  radar: () => `${PHASE}
  float radarA = ${n(MOTION.radar.speed)} * uTime * (0.9 + 0.1 * cos(motionPhase));
  transformed.xz = vec2(cos(radarA) * transformed.x - sin(radarA) * transformed.z,
    sin(radarA) * transformed.x + cos(radarA) * transformed.z);`,
  // The water's swell (S18b). No `PHASE`: this one is a FIELD, not a thing —
  // every vertex of one mesh rides the same wave, so the phase comes from where
  // the vertex is rather than from which instance it belongs to. In TILES,
  // because the water mesh is built in tiles, with the metre numbers from
  // `MOTION.ripple` divided by the caller's tile size.
  ripple: (tileM) => `
  float rippleK = 6.2831853 / ${n(MOTION.ripple.wave / tileM)};
  float rippleShape = (sin(rippleK * position.x)
    + sin(rippleK * (position.z * 0.8 + position.x * 0.3))) * 0.5;
  transformed.y += ${n(MOTION.ripple.amp / tileM)} * rippleShape * sin(${n(MOTION.ripple.speed)} * uTime);`,
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
  smoke: (radius) => smokeBody(radius, MOTION.smoke),
  // A building on fire: the same column with more in it (A114).
  fire: (radius) => smokeBody(radius, MOTION.fire),
};

const smokeBody = (radius, spec) => `
  // Where on the puff this vertex is, as a share of its half-size — the VECTOR,
  // not its length (B1b). Taking the length here made the varying constant:
  // every vertex of the two crossed quads is a CORNER, so all four carried
  // 1.41, the fragment shader interpolated 1.41 everywhere, and
  // \`smoothstep(0.35, 1.0, 1.41)\` is 1 — alpha zero across the whole puff.
  // Smoke has never drawn a visible pixel, the coal plant's included: S6's gate
  // counts instances and \`smoke-S6-smoke-t2.png\` has the plant dead centre with
  // nothing above it. Interpolating the vector puts the centre back at zero.
  vMotionRound = vec2(position.x + position.z, position.y) / ${n(radius)};
  float puffK = float(gl_InstanceID % ${spec.puffs});
  float puffF = fract(uTime / ${n(spec.period)} + puffK / ${n(spec.puffs)});
  transformed *= 0.5 + puffF * ${n(spec.grow)};
  transformed.y += puffF * ${n(spec.rise)};
  transformed.x += puffF * ${n(spec.drift)};
  vMotionFade = (1.0 - puffF) * min(1.0, puffF * 6.0);`;

/** Patches `material` to move as `kind`. `size` is the geometry measure the
 * formula needs: a tree's height, a flag's length, where a crane's jib begins. */
export function addMotion(material, kind, size = 1) {
  const body = MOTION_GLSL[kind];
  if (!body) throw new Error(`no motion called ${kind}`);
  const fades = kind === "smoke" || kind === "fire";
  const smokeSpec = kind === "fire" ? MOTION.fire : MOTION.smoke;
  const already = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (typeof already === "function") already(shader, renderer);
    shader.uniforms.uTime = motionUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\nuniform float uTime;\n${fades ? "varying float vMotionFade;\nvarying vec2 vMotionRound;" : ""}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${body(size)}`);
    if (fades) {
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vMotionFade;\nvarying vec2 vMotionRound;")
        // Round and soft, not a square: a flat quad of one alpha read as a
        // grey cardboard panel near the camera (S6, looked at).
        .replace("#include <dithering_fragment>", `#include <dithering_fragment>
  gl_FragColor.a *= vMotionFade * ${n(smokeSpec.opacity)} * (1.0 - smoothstep(0.35, 1.0, length(vMotionRound)));`);
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
