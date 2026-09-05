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
import { choosePlan, countScene, setBudget, getBudget, visibleBounds, stepDown } from "./lod.js";
import { PALETTES, lightingFor } from "./style-assets.js";
import { createModel } from "../world/model.js";

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
  let shadowLight;
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
    shadowLight = key;
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

  // The derived city model (ruling 032): corridors, lots, the height function.
  // Rebuilt whole with the terrain when the world changes; the renderer reads
  // it and never writes it.
  let model = createModel(state);

  const terrain = createTerrain(state, styleName);
  for (const chunk of terrain.chunks) chunk.mesh.receiveShadow = true;
  scene.add(terrain.group);
  const pools = createInstances(scene, styleName);
  for (const [name, mesh] of Object.entries(pools)) {
    // Flat ground-level pieces receive shadows but do not cast them: a road
    // casting a shadow onto the ground it lies on is a second render of a
    // thing that changes nothing.
    const flat = name === "road" || name === "mark" || name === "pipe";
    mesh.castShadow = !flat;
    mesh.receiveShadow = true;
  }

  const ghost = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.3, 1),
    new THREE.MeshBasicMaterial({ color: UI.ghostValid, transparent: true, opacity: 0.5 }),
  );
  ghost.visible = false;
  scene.add(ghost);

  // The drag preview. Flat quads rather than boxes: a hundred translucent boxes
  // overlapping each other reads as fog, and the preview only has to say WHICH
  // TILES, not how tall the thing will be.
  const ghostQuad = new THREE.PlaneGeometry(1, 1);
  ghostQuad.rotateX(-Math.PI / 2);
  const ghostArea = new THREE.InstancedMesh(
    ghostQuad,
    new THREE.MeshBasicMaterial({ color: UI.ghostValid, transparent: true, opacity: 0.42, depthWrite: false }),
    4096,
  );
  ghostArea.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ghostArea.count = 0;
  ghostArea.visible = false;
  ghostArea.frustumCulled = false;
  scene.add(ghostArea);

  const style = STYLES[styleName];
  let post = createPost(renderer, style, canvas.width, canvas.height);
  if (options.triangleBudget) setBudget(options.triangleBudget);
  let counts = countScene(state);
  const stats = {
    chunksRebuilt: 0, instances: 0, triangles: 0, frames: 0,
    style: style.name, lod: "", tilePixels: 0, budget: getBudget(),
  };

  function resize(width, height) {
    renderer.setSize(width, height, false);
    applyZoom(view, width / height);
    if (post) post.resize(width, height);
  }

  function worldChanged() {
    model = createModel(state);
    markAllDirty(terrain);
  }

  function showGhost(x, y, valid) {
    ghost.visible = true;
    ghost.position.set(x + 0.5, state.tiles.elevation[y * state.width + x] * 0.02 + 0.15, y + 0.5);
    ghost.material.color.setHex(valid ? UI.ghostValid : UI.ghostInvalid);
  }

  function hideGhost() {
    ghost.visible = false;
    ghostArea.count = 0;
    ghostArea.visible = false;
  }

  /** The preview for a drag: every tile the command would touch, before it is
   * issued. A single-tile ghost is enough to place a building; it is not enough
   * to zone a block, and a player dragging a rectangle they cannot see is
   * guessing. */
  function showGhostTiles(tiles, valid) {
    ghost.visible = false;
    const limit = Math.min(tiles.length, ghostArea.instanceMatrix.count);
    for (let i = 0; i < limit; i += 1) {
      const { x, y } = tiles[i];
      const h = state.tiles.elevation[y * state.width + x] * 0.02 + 0.09;
      ghostMarker.position.set(x + 0.5, h, y + 0.5);
      ghostMarker.scale.set(0.94, 1, 0.94);
      ghostMarker.updateMatrix();
      ghostArea.setMatrixAt(i, ghostMarker.matrix);
    }
    ghostArea.count = limit;
    ghostArea.visible = limit > 0;
    ghostArea.material.color.setHex(valid ? UI.ghostValid : UI.ghostInvalid);
    ghostArea.instanceMatrix.needsUpdate = true;
  }

  const ghostMarker = new THREE.Object3D();

  function draw(drawOptions = {}) {
    stats.chunksRebuilt = updateTerrain(state, terrain);
    const bounds = visibleBounds(view, canvas.width / canvas.height);
    counts = countScene(state, bounds);
    const plan = choosePlan(counts, view, canvas.height, { budget: drawOptions.budget });

    clampToMap(view, state.width, state.height);

    // The estimate gets us close in one pass. What makes the budget a promise
    // rather than a hope is this loop.
    //
    // Nothing computed here is the truth. The pool sum misses terrain; the
    // model missed the shadow pass, then indexed geometry, then frustum
    // culling, then a tier-0 tree it had priced at zero. Every time one term
    // was fixed another was found. So the loop asks the only thing that cannot
    // be wrong — three's own counter, after an actual render — and if that is
    // over budget it steps down the ladder and renders again.
    //
    // On a normal frame the estimate is already right and this renders once.
    let result;
    stats.rebuilds = 0;
    for (;;) {
      result = updateInstances(state, pools, { ...drawOptions, style: styleName, plan, bounds });
      if (shadowLight) shadowLight.castShadow = plan.shadows && options.shadows !== false;
      if (post) post.render(scene, view.camera);
      else renderer.render(scene, view.camera);
      plan.actual = renderer.info.render.triangles;
      if (plan.actual <= plan.budget || !stepDown(plan)) break;
      stats.rebuilds += 1;
    }
    plan.overBudget = plan.actual > plan.budget;

    stats.instances = result.instances;
    stats.counted = Math.round(result.triangles);
    stats.overBudget = plan.overBudget;
    stats.lod = plan.reason;
    stats.shadows = plan.shadows;
    stats.tilePixels = plan.tilePixels;
    stats.budget = plan.budget;
    stats.estimate = plan.estimate;
    stats.triangles = plan.actual;
    stats.corridors = model.stats.corridors;
    stats.lots = model.stats.lots;
    stats.frames += 1;
    return stats;
  }

  function dispose() {
    if (post) post.dispose();
    renderer.dispose();
  }

  return { renderer, scene, view, terrain, pools, style, get model() { return model; }, draw, setBudget, resize, worldChanged, showGhost, showGhostTiles, hideGhost, stats, dispose };
}
