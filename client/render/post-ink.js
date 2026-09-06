// The ink pipeline (slice P2; spec §7.4, ruling 033).
//
// Two full-screen passes over a target that carries a depth texture: ink and
// grade together, then FXAA. The plan said three; the grade is a per-pixel
// function of the inked colour with nothing between them that needs its own
// texture fetch, so folding it in saves a pass and a target on the one style
// that is already the most expensive thing the renderer draws.
//
// The pass is a FINISH (ruling 017): `painted` earns its name from the anime
// rig, the toon ramp and its palette first, and the ink is what it wears.

import * as THREE from "three";
import { VERTEX, INK, FXAA, gradeFor } from "./ink-shaders.js";

/** A 1.5× supersample on a screen that has none of its own. The ink is a
 * one-pixel line and a one-pixel line on a 1× screen crawls; on a 2× screen
 * the panel is already doing this. */
const SUPERSAMPLE = 1.5;

function fullScreen(material) {
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  return scene;
}

export function createInkPost(renderer, style, width, height) {
  const scale = renderer.getPixelRatio() >= 1.5 ? 1 : SUPERSAMPLE;
  const size = (w, h) => [Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale))];
  let [w, h] = size(width, height);

  const depth = new THREE.DepthTexture(w, h);
  depth.type = THREE.UnsignedIntType;
  const target = new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    depthTexture: depth,
  });
  // The target holds LINEAR colour; the ink pass encodes sRGB on the way out.
  // Not doing that cost the pixel style a mean brightness of 78 → 25, and it
  // looks exactly like a lighting bug.
  target.texture.colorSpace = THREE.LinearSRGBColorSpace;

  const inked = new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  });

  const inkMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: target.texture },
      tDepth: { value: depth },
      uTexel: { value: new THREE.Vector2(1 / w, 1 / h) },
      uNear: { value: 0.5 },
      uFar: { value: 4000 },
      uOrtho: { value: 0 },
      uInk: { value: style.ink ?? 1 },
      uConvex: { value: style.inkConvex ?? 1 },
      uConcave: { value: style.inkConcave ?? 0.35 },
      uThreshold: { value: style.inkThreshold ?? 0.006 },
      uWidth: { value: style.inkWidth ?? 1.5 },
      uInkColour: { value: new THREE.Color(0x2a2f3a) },
      uShadowTint: { value: new THREE.Color(0xb9c6e0) },
      uHighlightTint: { value: new THREE.Color(0xfff2d8) },
      uLift: { value: 0 },
      uGain: { value: 1 },
      uSaturation: { value: 1 },
    },
    vertexShader: VERTEX,
    fragmentShader: INK,
    depthTest: false,
    depthWrite: false,
  });

  const fxaaMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: inked.texture },
      uTexel: { value: new THREE.Vector2(1 / w, 1 / h) },
    },
    vertexShader: VERTEX,
    fragmentShader: FXAA,
    depthTest: false,
    depthWrite: false,
  });

  const inkScene = fullScreen(inkMaterial);
  const fxaaScene = fullScreen(fxaaMaterial);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  /** What the SCENE cost, snapshotted before the passes overwrite it.
   *
   * `renderer.info.render` is reset by every `render()` call, so reading it
   * after a post pass gives the full-screen quad: two triangles and one draw
   * call. The budget's measurement loop believed that for as long as any post
   * pass has existed, which meant the ladder never stepped down for `pixel`
   * (found in P2). */
  const sceneInfo = { triangles: 0, calls: 0 };

  function setGrade(name) {
    const grade = gradeFor(name);
    const u = inkMaterial.uniforms;
    u.uShadowTint.value.setHex(grade.shadowTint);
    u.uHighlightTint.value.setHex(grade.highlightTint);
    u.uInkColour.value.setHex(grade.inkColour);
    u.uLift.value = grade.lift;
    u.uGain.value = grade.gain;
    u.uSaturation.value = grade.saturation;
    u.uInk.value = (style.ink ?? 1) * grade.ink;
  }
  setGrade("day");

  return {
    target,
    material: inkMaterial,
    sceneInfo,
    setGrade,

    render(sceneToDraw, sceneCamera) {
      // The depth linearisation needs the camera's own planes, and under an
      // orthographic camera the buffer is linear already (spec §7.4).
      const ortho = sceneCamera.isOrthographicCamera === true;
      inkMaterial.uniforms.uNear.value = sceneCamera.near;
      inkMaterial.uniforms.uFar.value = sceneCamera.far;
      inkMaterial.uniforms.uOrtho.value = ortho ? 1 : 0;

      renderer.setRenderTarget(target);
      renderer.render(sceneToDraw, sceneCamera);
      sceneInfo.triangles = renderer.info.render.triangles;
      sceneInfo.calls = renderer.info.render.calls;

      renderer.setRenderTarget(inked);
      renderer.render(inkScene, camera);
      renderer.setRenderTarget(null);
      renderer.render(fxaaScene, camera);
    },

    resize(nextWidth, nextHeight) {
      [w, h] = size(nextWidth, nextHeight);
      target.setSize(w, h);
      inked.setSize(w, h);
      depth.image.width = w;
      depth.image.height = h;
      inkMaterial.uniforms.uTexel.value.set(1 / w, 1 / h);
      fxaaMaterial.uniforms.uTexel.value.set(1 / w, 1 / h);
    },

    dispose() {
      target.dispose();
      inked.dispose();
      depth.dispose();
      inkMaterial.dispose();
      fxaaMaterial.dispose();
    },
  };
}
