// The ink and grade pass, as source (slice P2; spec §7.4, ruling 033).
//
// Shaders are strings, so this module imports nothing and node can read them.
// That matters more here than anywhere else in the renderer: a shader that does
// not compile is a black screen, and a shader that compiles with a uniform
// nobody sets is a picture that is subtly wrong forever and throws nothing.
//
// **Why a depth second difference.** Ruling 017 recorded the pixel style's
// weakness and P1 repeated it: a LUMINANCE edge test fires on every window,
// sill and roof tile, and with L3 facades in front of it the image turns to
// mud. The second difference of linearised depth is zero across any plane at
// any angle — a road seen at a grazing angle has a depth that varies LINEARLY
// across the screen, and the Laplacian of a linear function is nought — so it
// fires only where the surface actually breaks: silhouettes strongly, creases
// faintly. That is the whole reason the pass exists and the one thing its gate
// photographs.

import { getConfig } from "../world/config.js";

export const GRADE_NAMES = Object.freeze(["day", "sunset", "night"]);

export function gradeFor(name) {
  const grades = getConfig().grades;
  return grades[name] ?? grades.day;
}

export const VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** Ink and grade in one pass. FXAA is the second; three was the plan and two is
 * what it takes, because the grade is a per-pixel function of the inked colour
 * and there is nothing between them that needs a texture fetch of its own. */
export const INK = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform float uNear;
uniform float uFar;
uniform float uOrtho;
uniform float uInk;
uniform float uConvex;
uniform float uConcave;
uniform float uThreshold;
uniform float uWidth;
uniform vec3 uInkColour;
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;
uniform float uLift;
uniform float uGain;
uniform float uSaturation;

vec3 linearToSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

/** Depth in METRES from the eye. Under an orthographic camera the buffer is
 * already linear between the planes, which is why this branches rather than
 * running the perspective formula on a value it does not apply to. */
float linearDepth(float d) {
  if (uOrtho > 0.5) return uNear + d * (uFar - uNear);
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}

float depthAt(vec2 uv) {
  return linearDepth(texture2D(tDepth, uv).x);
}

void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;

  // A line is uWidth TEXELS wide, and the target is supersampled: at one
  // texel the ink is a single sub-pixel and averages away to a grey haze in the
  // downsample, which is what the first version drew.
  // Called reach, not step: a local named step shadows the GLSL builtin and the
  // whole shader stops compiling — which three reports to the console and
  // otherwise swallows, so the picture is simply the pass not happening.
  vec2 reach = uTexel * uWidth;
  float centre = depthAt(vUv);
  float dx0 = depthAt(vUv - vec2(reach.x, 0.0));
  float dx1 = depthAt(vUv + vec2(reach.x, 0.0));
  float dy0 = depthAt(vUv - vec2(0.0, reach.y));
  float dy1 = depthAt(vUv + vec2(0.0, reach.y));

  // The second difference. Zero across a plane however it is turned; positive
  // where the surface is nearer than its neighbourhood (a silhouette) and
  // negative where it is further (a crease).
  float lap = (dx0 + dx1 + dy0 + dy1) - 4.0 * centre;
  // Divided by the distance, so a line is the same width near and far rather
  // than thickening as the city recedes.
  float e = lap / max(centre, 0.001);

  // POSITIVE means the neighbours are further away than the centre: the centre
  // is a near feature and this is a silhouette. Negative is a crease. Having
  // these the wrong way round drew every roof ridge as heavily as the roofline
  // and the roofline faintly, which is the picture upside down.
  float convex = max(e, 0.0) * uConvex;
  float concave = max(-e, 0.0) * uConcave;
  float ink = clamp((convex + concave - uThreshold) * uInk, 0.0, 1.0);
  c = mix(c, uInkColour, ink);

  // Split tone: the darks go one way and the lights the other, which is what
  // makes a picture read as drawn rather than as photographed.
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c * uShadowTint, c * uHighlightTint, smoothstep(0.2, 0.8, l));
  c = mix(vec3(l), c, uSaturation);
  c = c * uGain + uLift;

  gl_FragColor = vec4(clamp(linearToSRGB(c), 0.0, 1.0), 1.0);
}
`;

/** FXAA, on the graded image. Short, because the input is a flat-shaded city
 * with hard edges rather than a photograph. */
export const FXAA = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 uTexel;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  vec3 m = texture2D(tDiffuse, vUv).rgb;
  float lm = luma(m);
  float lnw = luma(texture2D(tDiffuse, vUv + vec2(-uTexel.x, -uTexel.y)).rgb);
  float lne = luma(texture2D(tDiffuse, vUv + vec2(uTexel.x, -uTexel.y)).rgb);
  float lsw = luma(texture2D(tDiffuse, vUv + vec2(-uTexel.x, uTexel.y)).rgb);
  float lse = luma(texture2D(tDiffuse, vUv + vec2(uTexel.x, uTexel.y)).rgb);

  float lo = min(lm, min(min(lnw, lne), min(lsw, lse)));
  float hi = max(lm, max(max(lnw, lne), max(lsw, lse)));
  if (hi - lo < 0.06) { gl_FragColor = vec4(m, 1.0); return; }

  vec2 dir = vec2(-((lnw + lne) - (lsw + lse)), ((lnw + lsw) - (lne + lse)));
  float scale = 1.0 / (max(abs(dir.x), abs(dir.y)) + 0.03);
  dir = clamp(dir * scale, -2.0, 2.0) * uTexel;

  vec3 a = 0.5 * (texture2D(tDiffuse, vUv + dir * (1.0 / 3.0 - 0.5)).rgb
                + texture2D(tDiffuse, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(tDiffuse, vUv - dir * 0.5).rgb
                           + texture2D(tDiffuse, vUv + dir * 0.5).rgb);
  float lb = luma(b);
  gl_FragColor = vec4((lb < lo || lb > hi) ? a : b, 1.0);
}
`;

/** Every uniform the ink shader declares, so the pipeline can be checked
 * against it rather than trusted. */
export function uniformsOf(source) {
  return [...source.matchAll(/^uniform\s+\w+\s+(\w+);/gm)].map((m) => m[1]).sort();
}
