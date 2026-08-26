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

export function createRenderer(canvas, state, options = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: options.antialias !== false,
    preserveDrawingBuffer: options.preserveDrawingBuffer === true,
  });
  renderer.setPixelRatio(options.pixelRatio ?? 1);
  renderer.setSize(canvas.width, canvas.height, false);
  renderer.setClearColor(0x9fc7de);

  const scene = new THREE.Scene();

  // Two lights and no shadows by default: a key light for shape and a fill so
  // the north faces are not black. Shadows are a reduced-effects casualty and
  // arrive with the style probe if the chosen style wants them.
  const key = new THREE.DirectionalLight(0xfff4e0, 2.1);
  key.position.set(0.6, 1, 0.35);
  scene.add(key);
  scene.add(new THREE.HemisphereLight(0xbcd8ff, 0x6b7a55, 1.1));

  const view = createCamera(canvas.width / canvas.height);
  view.targetX = state.width / 2;
  view.targetZ = state.height / 2;
  view.span = Math.max(state.width, state.height) * 0.7;
  applyZoom(view, canvas.width / canvas.height);
  applyPose(view);

  const terrain = createTerrain(state);
  scene.add(terrain.group);
  const pools = createInstances(scene);

  const ghost = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.3, 1),
    new THREE.MeshBasicMaterial({ color: UI.ghostValid, transparent: true, opacity: 0.5 }),
  );
  ghost.visible = false;
  scene.add(ghost);

  const style = STYLES[options.style] ?? STYLES.plain;
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
    stats.instances = updateInstances(state, pools, drawOptions);
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
