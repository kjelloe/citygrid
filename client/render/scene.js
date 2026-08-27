// The renderer: scene, lights, and the draw loop.
//
// It reads state and draws it. It never writes to state — that rule is what
// lets the same simulation run headless in a test, in a worker, and on a
// server, with the renderer as one of several possible readers.

import * as THREE from "three";
import { createCamera, applyZoom, applyPose, clampToMap } from "./camera.js";
import { createTerrain, updateTerrain, markAllDirty } from "./terrain.js";
import { createInstances, updateInstances } from "./instances.js";
import { UI } from "./palette.js";
import { STYLES, createPost } from "./styles.js";
import { PALETTES, lightingFor } from "./style-assets.js";

export function createRenderer(canvas, state, options = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: options.antialias !== false,
    preserveDrawingBuffer: options.preserveDrawingBuffer === true,
  });
  renderer.setPixelRatio(options.pixelRatio ?? 1);
  renderer.setSize(canvas.width, canvas.height, false);
  const styleName = options.style && STYLES[options.style] ? options.style : "plain";
  const palette = PALETTES[styleName] ?? PALETTES.plain;
  renderer.setClearColor(palette.sky);

  const scene = new THREE.Scene();

  // Lighting is part of the style, not a constant. The pixel style asks for
  // none at all — its faces are shaded in the vertices, because a lit gradient
  // across a face is exactly what pixel art does not have.
  const lights = lightingFor(styleName);
  if (lights.key > 0) {
    const key = new THREE.DirectionalLight(lights.keyColour, lights.key);
    const sun = lights.sunHeight ?? 120;
    key.position.set(state.width * 0.6, sun, state.height * 0.35);
    key.target.position.set(state.width / 2, 0, state.height / 2);
    scene.add(key.target);

    // Soft shadows, off in reduced-effects mode. They are what makes a
    // building sit on the ground rather than hover above it, and the reference
    // leans on them heavily.
    if (options.shadows !== false) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      key.castShadow = true;
      const reach = Math.max(state.width, state.height) * 0.75;
      key.shadow.camera.left = -reach;
      key.shadow.camera.right = reach;
      key.shadow.camera.top = reach;
      key.shadow.camera.bottom = -reach;
      key.shadow.camera.near = 1;
      key.shadow.camera.far = 400;
      key.shadow.mapSize.set(options.shadowMap ?? 2048, options.shadowMap ?? 2048);
      key.shadow.bias = -0.0012;
    }
    scene.add(key);
  }
  scene.add(new THREE.HemisphereLight(lights.hemiSky, lights.hemiGround, lights.hemi));

  const view = createCamera(canvas.width / canvas.height);
  view.targetX = state.width / 2;
  view.targetZ = state.height / 2;
  view.span = Math.max(state.width, state.height) * 0.7;
  applyZoom(view, canvas.width / canvas.height);
  applyPose(view);

  const terrain = createTerrain(state, styleName);
  for (const chunk of terrain.chunks) chunk.mesh.receiveShadow = true;
  scene.add(terrain.group);
  const pools = createInstances(scene, styleName);
  for (const mesh of Object.values(pools)) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }

  const ghost = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.3, 1),
    new THREE.MeshBasicMaterial({ color: UI.ghostValid, transparent: true, opacity: 0.5 }),
  );
  ghost.visible = false;
  scene.add(ghost);

  const style = STYLES[styleName];
  let post = createPost(renderer, style, canvas.width, canvas.height);
  const stats = { chunksRebuilt: 0, instances: 0, frames: 0, style: style.name };

  function resize(width, height) {
    renderer.setSize(width, height, false);
    applyZoom(view, width / height);
    if (post) post.resize(width, height);
  }

  function worldChanged() {
    markAllDirty(terrain);
  }

  function showGhost(x, y, valid) {
    ghost.visible = true;
    ghost.position.set(x + 0.5, state.tiles.elevation[y * state.width + x] * 0.02 + 0.15, y + 0.5);
    ghost.material.color.setHex(valid ? UI.ghostValid : UI.ghostInvalid);
  }

  function hideGhost() {
    ghost.visible = false;
  }

  function draw(drawOptions = {}) {
    stats.chunksRebuilt = updateTerrain(state, terrain);
    stats.instances = updateInstances(state, pools, { ...drawOptions, style: styleName });
    clampToMap(view, state.width, state.height);
    if (post) post.render(scene, view.camera);
    else renderer.render(scene, view.camera);
    stats.frames += 1;
    return stats;
  }

  function dispose() {
    if (post) post.dispose();
    renderer.dispose();
  }

  return { renderer, scene, view, terrain, pools, style, draw, resize, worldChanged, showGhost, hideGhost, stats, dispose };
}
