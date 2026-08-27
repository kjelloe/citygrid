// Render styles.
//
// Ruling 006 makes four-angle rotation a hard requirement, which selects the
// mesh pipeline. This is where the claim that the pixel-art *look* survives
// inside that pipeline gets tested: same meshes, same camera, same rotation —
// a post-process does the rest.
//
// Each style declares its camera constraints, so a style that cannot rotate
// could still be expressed here without the rest of the client having to know.

import * as THREE from "three";

export const STYLES = {
  plain: {
    name: "plain",
    label: "Clean low-poly diorama",
    freeRotation: true,
    continuousZoom: true,
    post: false,
  },
  pixel: {
    name: "pixel",
    label: "Pixel-art post-process",
    freeRotation: true,
    continuousZoom: false, // integer zoom steps keep the pixel grid stable
    post: true,
    // Divisor 4 put whole buildings inside one pixel, so the edge test fired
    // on nearly every pixel and darkened the entire image. Divisor 2 keeps the
    // pixel texture while leaving features big enough to have edges.
    resolutionDivisor: 2,
    // Six levels and a full-amplitude dither checkerboarded even the flat sky
    // and turned the whole city to mud. Ordered dithering is meant to hide a
    // quantisation step, not to become the texture.
    palette: 12,
    outline: 0.3,
    dither: 0.35,
  },
  passthrough: {
    name: "passthrough",
    label: "Post-process with no effect — a colour-space control",
    freeRotation: true,
    continuousZoom: true,
    post: true,
    resolutionDivisor: 1,
    palette: 0,
    outline: 0,
    dither: 0,
  },
  painted: {
    name: "painted",
    label: "Illustrated — warm light, deep shadow",
    freeRotation: true,
    continuousZoom: true,
    // No post-process at all. A screen-space outline fights detailed geometry:
    // with windows, sills and roof clutter, EVERY edge fires the edge test and
    // the image turns to mud — it read as dusk rather than as illustration.
    // This style is a lighting and palette treatment instead, which is what
    // separates an illustration from a photograph anyway.
    post: false,
  },
};

const VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Colour quantisation plus a Sobel-ish edge test on luminance. Outlines are
// what make low-resolution renders read as drawn rather than merely blurry,
// and the ordered dither keeps banding from looking like a compression fault.
const FRAGMENT = `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
uniform float uPalette;
uniform float uOutline;
uniform float uDither;
varying vec2 vUv;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

vec3 linearToSRGB(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  return mix(hi, lo, step(c, vec3(0.0031308)));
}

float ditherValue(vec2 pixel) {
  // 4x4 ordered Bayer matrix, unrolled — no array indexing, for old GPUs.
  float x = mod(pixel.x, 4.0);
  float y = mod(pixel.y, 4.0);
  float v = 0.0;
  if (y < 1.0)      v = x < 1.0 ? 0.0  : x < 2.0 ? 8.0  : x < 3.0 ? 2.0  : 10.0;
  else if (y < 2.0) v = x < 1.0 ? 12.0 : x < 2.0 ? 4.0  : x < 3.0 ? 14.0 : 6.0;
  else if (y < 3.0) v = x < 1.0 ? 3.0  : x < 2.0 ? 11.0 : x < 3.0 ? 1.0  : 9.0;
  else              v = x < 1.0 ? 15.0 : x < 2.0 ? 7.0  : x < 3.0 ? 13.0 : 5.0;
  return v / 16.0 - 0.5;
}

void main() {
  // Encode first, then work in perceptual space: quantising and edge-testing
  // in linear space crushes the shadows and makes every dark area one colour.
  vec3 c = linearToSRGB(texture2D(tDiffuse, vUv).rgb);

  if (uOutline > 0.0) {
    // Compare against both sides so a one-pixel step does not darken a whole
    // gradient. The threshold is deliberately high: only real silhouette
    // edges should draw a line, not every shading variation.
    float l  = luma(c);
    float lx = luma(texture2D(tDiffuse, vUv + vec2(uTexel.x, 0.0)).rgb);
    float ly = luma(texture2D(tDiffuse, vUv + vec2(0.0, uTexel.y)).rgb);
    float edge = max(abs(l - lx), abs(l - ly));
    c = mix(c, c * 0.45, smoothstep(0.14, 0.30, edge) * uOutline);
  }

  if (uPalette > 0.0) {
    vec2 pixel = vUv / uTexel;
    c += ditherValue(pixel) * uDither * (1.0 / uPalette);
    c = floor(c * uPalette + 0.5) / uPalette;
  }

  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

export function createPost(renderer, style, width, height) {
  if (!style.post) return undefined;
  const divisor = style.resolutionDivisor ?? 1;
  const w = Math.max(1, Math.floor(width / divisor));
  const h = Math.max(1, Math.floor(height / divisor));

  const target = new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
  });
  // The target holds LINEAR colour. Setting texture.colorSpace was not enough
  // in practice, so the post shader encodes explicitly on the way out — which
  // is portable and does not depend on renderer internals.
  //
  // Measured before the fix: a pass-through post-process (no quantisation, no
  // outline, no dither) dropped mean image brightness from 78 to 25. It looks
  // exactly like a lighting bug, and it is not one.
  target.texture.colorSpace = THREE.LinearSRGBColorSpace;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: target.texture },
      uTexel: { value: new THREE.Vector2(1 / w, 1 / h) },
      uPalette: { value: style.palette ?? 0 },
      uOutline: { value: style.outline ?? 0 },
      uDither: { value: style.dither ?? 0 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  return {
    target,
    material,
    render(sceneToDraw, sceneCamera) {
      renderer.setRenderTarget(target);
      renderer.render(sceneToDraw, sceneCamera);
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    },
    resize(nextWidth, nextHeight) {
      const nw = Math.max(1, Math.floor(nextWidth / divisor));
      const nh = Math.max(1, Math.floor(nextHeight / divisor));
      target.setSize(nw, nh);
      material.uniforms.uTexel.value.set(1 / nw, 1 / nh);
    },
    dispose() {
      target.dispose();
      material.dispose();
    },
  };
}
