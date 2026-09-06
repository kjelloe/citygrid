// The renderer: scene, lights, and the draw loop.
//
// It reads state and draws it. It never writes to state — that rule is what
// lets the same simulation run headless in a test, in a worker, and on a
// server, with the renderer as one of several possible readers.

import * as THREE from "three";
import { createCamera, applyZoom, applyPose, clampToMap, setMode } from "./camera.js";
import { createTerrain, updateTerrain, markAllDirty } from "./terrain.js";
import { createInstances, updateInstances, pushInstance, CAR_COLOURS } from "./instances.js";
import { UI } from "./palette.js";
import { STYLES, createPost } from "./styles.js";
import { choosePlan, countScene, setBudget, getBudget, visibleBounds, stepDown } from "./lod.js";
import { PALETTES, lightingFor } from "./style-assets.js";
import { createModel } from "../world/model.js";
import { createTraffic } from "../life/traffic.js";
import { tierConfig } from "../world/config.js";
import { createGovernor } from "./governor.js";
import { createSky } from "./sky.js";
import { createStreetChunks } from "./street-chunks.js";

/** What the device would give us, capped by the tier (ruling 040). A cap, not a
 * replacement: a tier must never make a 1× screen render at 2×. */
function ratioFor(tier, options) {
  if (options.pixelRatio !== undefined) return options.pixelRatio;
  const device = globalThis.devicePixelRatio ?? 1;
  return Math.max(1, Math.min(device, tier.pixelRatio));
}

export function createRenderer(canvas, state, options = {}) {
  // The tier is a rendering preference and nothing else (ruling 040). Explicit
  // options still win, because the gates and the screenshot harness set them
  // one at a time and must not have to know which tier holds which value.
  let tierName = options.tier ?? "high";
  let tier = tierConfig(tierName);
  const governor = createGovernor({ targetMs: tier.frameMs });

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: options.antialias ?? tier.antialias,
    preserveDrawingBuffer: options.preserveDrawingBuffer === true,
  });
  renderer.setPixelRatio(ratioFor(tier, options));
  renderer.setSize(canvas.width, canvas.height, false);
  const styleName = options.style && STYLES[options.style] ? options.style : "plain";
  const palette = PALETTES[styleName] ?? PALETTES.plain;
  renderer.setClearColor(palette.sky);

  const scene = new THREE.Scene();

  // A sky and a distance haze, in perspective only (slice V5). An orthographic
  // view has no horizon — the map fills the frame or the clear colour does —
  // and a dome behind it would be a flat wash with a seam.
  const sky = createSky(palette);
  scene.add(sky);

  /** A haze that starts beyond what the camera is looking at and reaches a few
   * spans past it, so the far edge of the map fades into the sky rather than
   * ending at a line.
   *
   * The distances are in TILE units — the whole scene is — and they follow the
   * zoom, or the same numbers would be invisible on a 64-tile map and opaque on
   * a 128-tile one. Off in orthographic for the same reason the sky is: there
   * is no horizon to fade into. */
  function applyAtmosphere() {
    const on = view.mode === "city";
    sky.visible = on;
    if (!on) { scene.fog = null; return; }
    const reach = Math.max(view.span, 12);
    scene.fog = new THREE.Fog(palette.sky, reach * 1.4, reach * 5);
  }

  const antialiasAtBuild = options.antialias ?? tier.antialias;
  /** 0 in the tier table means uncapped (ruling 040). */
  const carCap = () => (options.carCap ?? tier.carCap) || Infinity;

  /** Shadow map size and whether the pass runs at all. Re-applied when the
   * tier changes; the per-frame `castShadow` is decided in `draw`. */
  /** Keeps the shadow frustum over what the camera is looking at, snapped to a
   * shadow texel.
   *
   * It was fixed over the whole map, which is fine for a 64×64 at city zoom and
   * becomes 2048 px over 2.6 km — 1.3 m a texel — at street level. Following it
   * costs nothing and buys back the resolution; SNAPPING it is what stops every
   * cast edge crawling as the view pans, which on a row of fences reads as
   * shimmer (spec §7.2).
   */
  function followShadow() {
    if (!shadowLight || !renderer.shadowMap.enabled) return;
    const cam = shadowLight.shadow.camera;
    const extent = cam.right - cam.left;
    if (!(extent > 0)) return;
    const texel = extent / (shadowLight.shadow.mapSize.x || 1);
    const tx = Math.round(view.targetX / texel) * texel;
    const tz = Math.round(view.targetZ / texel) * texel;
    const dx = shadowLight.position.x - shadowLight.target.position.x;
    const dz = shadowLight.position.z - shadowLight.target.position.z;
    shadowLight.target.position.set(tx, 0, tz);
    shadowLight.position.set(tx + dx, shadowLight.position.y, tz + dz);
    shadowLight.target.updateMatrixWorld();
    cam.updateProjectionMatrix();
  }

  function applyShadowMap() {
    const on = (options.shadows ?? tier.shadows) !== false;
    renderer.shadowMap.enabled = on;
    if (!on || !shadowLight) return;
    const map = options.shadowMap ?? tier.shadowMap ?? 2048;
    if (shadowLight.shadow.mapSize.x === map) return;
    shadowLight.shadow.mapSize.set(map, map);
    // A resized map needs its old texture thrown away or three keeps drawing
    // into the first one.
    shadowLight.shadow.map?.dispose();
    shadowLight.shadow.map = null;
  }

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

    // Soft shadows. They are what makes a building sit on the ground rather
    // than hover above it, and the reference leans on them heavily.
    //
    // The camera is ALWAYS configured; whether it renders is decided per frame
    // by the tier, the ladder and the governor. Configuring it only when
    // shadows happened to be on at boot meant a player switching Low → High
    // got a light that had been told to cast into a shadow map nobody had
    // sized (ruling 040 — a tier changes at runtime).
    shadowLight = key;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Tight enough to be worth following: a quarter of the map rather than
    // three quarters, which quadruples the texel density at the same map size.
    const reach = Math.max(state.width, state.height) * 0.28;
    key.shadow.camera.left = -reach;
    key.shadow.camera.right = reach;
    key.shadow.camera.top = reach;
    key.shadow.camera.bottom = -reach;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 400;
    key.shadow.bias = -0.0012;
    // Both of these have been in the rig table since it was written and NOTHING
    // READ THEM (found in P1) — the same shape as P35's stale cost table. A
    // number in a table that nothing consults is a decision nobody took.
    //
    // `radius` is the softness of the edge; `intensity` is how dark the shadow
    // goes, and for the anime rig it must be less than 1 or the long shadows a
    // low sun casts swallow the cool fill that is supposed to colour them.
    key.shadow.radius = lights.shadowRadius ?? 4;
    key.shadow.intensity = lights.shadowIntensity ?? 1;
    applyShadowMap();
    scene.add(key);
  }

  // The rest of the rig, built only when the style asks for it (spec §7.2).
  //
  // The anime rig's fill is the interesting light: strong, cool, from the
  // opposite quarter, and it is what carries the unlit side. Without it a toon
  // ramp's shadow is simply the dark end of the ramp and the picture reads as a
  // render with fewer values rather than as a drawing. The up-light is the
  // bounce off the ground that keeps the underside of an eave off black.
  if (lights.fill > 0) {
    const fill = new THREE.DirectionalLight(lights.fillColour ?? 0xffffff, lights.fill);
    fill.position.set(state.width * 0.4, (lights.sunHeight ?? 120) * 0.55, state.height * 0.75);
    fill.target.position.set(state.width / 2, 0, state.height / 2);
    scene.add(fill.target);
    scene.add(fill);
  }
  if (lights.up > 0) {
    const up = new THREE.DirectionalLight(lights.upColour ?? 0xffffff, lights.up);
    up.position.set(state.width / 2, -40, state.height / 2);
    up.target.position.set(state.width / 2, 0, state.height / 2);
    scene.add(up.target);
    scene.add(up);
  }
  scene.add(new THREE.HemisphereLight(lights.hemiSky, lights.hemiGround, lights.hemi));

  const view = createCamera(canvas.width / canvas.height, options.mode ?? "city");
  view.targetX = state.width / 2;
  view.targetZ = state.height / 2;
  view.span = Math.max(state.width, state.height) * 0.7;
  applyZoom(view, canvas.width / canvas.height);
  applyPose(view);
  applyAtmosphere();

  // The derived city model (ruling 032): corridors, lots, the height function.
  // Rebuilt whole with the terrain when the world changes; the renderer reads
  // it and never writes it.
  let model = createModel(state);
  // The cars (slice V1, ruling 037). Renderer-local: the engine says how busy a
  // road is and this decides what busy looks like. `life: false` freezes them
  // where they settled, so a screenshot is the same picture twice.
  let traffic = createTraffic(state, model, { cap: carCap(), life: options.life });

  // The baked street cache (slice E2). It draws nothing until a chunk is close
  // enough to be worth baking and the tier allows any.
  const streets = createStreetChunks(scene, { style: styleName });

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

  /** May this style's post pass run? Two gates, both from ruling 040: the tier
   * lists the passes it allows at all, and the governor can take one away when
   * the frame time says so. Neither is visible to the triangle budget — a pass
   * is fill rate, and `renderer.info.render.triangles` cannot see fill. */
  function postAllowed() {
    const pass = style.postPass;
    if (!style.post) return false;
    if (pass === undefined) return true;
    if (options.post === false) return false;
    return tier.post.includes(pass) && governor.allows(pass);
  }
  let post = postAllowed() ? createPost(renderer, style, canvas.width, canvas.height) : undefined;
  setBudget(options.triangleBudget ?? tier.budget);
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
    // The lane graph is part of the model, so the cars have to start again on
    // the new one: a car holding a link id from a graph that no longer exists
    // is a car in a field.
    traffic = createTraffic(state, model, { cap: carCap(), life: options.life });
    streets.clear();
    markAllDirty(terrain);
  }

  /** A tile centre's height in tile units — the ghost and its area preview sit
   * on the same ground everything else does. */
  const tileHeight = (x, y) => model.heightAt((x + 0.5) * model.tileM, (y + 0.5) * model.tileM) / model.tileM;

  function showGhost(x, y, valid) {
    ghost.visible = true;
    // On the ground, not on a remembered flattening of it (slice V4).
    ghost.position.set(x + 0.5, tileHeight(x, y) + 0.15, y + 0.5);
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
      const h = tileHeight(x, y) + 0.09;
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
    // The haze follows the zoom, so it is re-derived rather than remembered.
    if (view.mode === "city") applyAtmosphere();
    // The frame time the caller measured. The budget cannot see fill rate, so
    // this is the second instrument (ruling 040): a rolling p95 that gives up a
    // post pass, then shadows, then the supersample.
    // The cars move on wall-clock time, not on the game clock: a paused city
    // still has traffic on it, and a city at ×4 does not have cars at ×4.
    traffic.update(drawOptions.dt ?? (drawOptions.frameMs ?? 0) / 1000);
    if (drawOptions.frameMs > 0) {
      const before = governor.disabled().length;
      governor.sample(drawOptions.frameMs);
      if (governor.disabled().length !== before) applyGovernor();
    }
    followShadow();
    stats.chunksRebuilt = updateTerrain(state, terrain, model);
    const bounds = visibleBounds(view, canvas.width / canvas.height);
    counts = countScene(state, bounds);
    counts.cars = traffic.count();
    const plan = choosePlan(counts, view, canvas.height, {
      budget: drawOptions.budget,
      streetChunks: drawOptions.streetChunks ?? tier.streetChunks,
    });
    plan.mode = view.mode;

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
      result = updateInstances(state, pools, {
        ...drawOptions, style: styleName, plan, bounds, model,
        // For the per-chunk plan (V5): under orthographic these are ignored.
        view, canvasHeight: canvas.height,
      });
      // After the instanced pass, into the same pools the parked cars use — so
      // a car costs one instance whether it is driving or parked, and the
      // budget's measurement loop sees it either way.
      if (plan.cars !== false && drawOptions.life !== false) {
        result.instances += traffic.pose(pools, pushInstance, CAR_COLOURS);
      }
      if (shadowLight) {
        shadowLight.castShadow = plan.shadows
          && (drawOptions.shadows ?? options.shadows ?? tier.shadows) !== false
          && governor.allows("shadows");
      }
      if (post) post.render(scene, view.camera);
      else renderer.render(scene, view.camera);
      plan.actual = renderer.info.render.triangles;
      if (plan.actual <= plan.budget || !stepDown(plan)) break;
      stats.rebuilds += 1;
    }
    plan.overBudget = plan.actual > plan.budget;

    // At most one chunk baked per frame, nearest first (spec §6.4). After the
    // budget loop, because the ladder may have dropped the radius.
    stats.streets = streets.update(state, model, view, plan, drawOptions.now ?? Date.now());
    stats.instances = result.instances;
    // How many distinct per-chunk plans the frame used. 1 under orthographic
    // by construction; more than 1 under perspective is the proof that the
    // policy is per chunk and not per frame (slice V5).
    stats.chunkPlans = result.chunkPlans ?? 1;
    stats.chunkTiers = result.chunkTiers ?? 1;
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
    stats.tier = tierName;
    stats.cars = traffic.count();
    stats.frameP95 = governor.p95();
    stats.given = governor.disabled();
    stats.frames += 1;
    return stats;
  }

  function dispose() {
    if (post) post.dispose();
    renderer.dispose();
  }

  /** What the governor's decision changes, applied without a rebuild. Shadows
   * and the budget are read every frame; the post pass is an object that has to
   * be created or thrown away. */
  function applyGovernor() {
    const wanted = postAllowed();
    if (wanted && !post) post = createPost(renderer, style, canvas.width, canvas.height);
    else if (!wanted && post) { post.dispose(); post = undefined; }
  }

  /** A tier change at runtime. Budget, shadows, caps and the post list re-apply
   * immediately; pixel ratio and antialias are constructor arguments of the
   * WebGL context, so the caller is told what it would take to honour them. */
  /** Switches projection (ruling 034). The target, yaw, pitch and span are
   * shared, so the city does not move; the sky and the fog follow the mode. */
  function setProjection(mode) {
    const next = setMode(view, mode);
    applyAtmosphere();
    return next;
  }

  function setTier(name) {
    tierName = name;
    tier = tierConfig(name);
    governor.reset();
    setBudget(tier.budget);
    applyGovernor();
    applyShadowMap();
    const ratio = ratioFor(tier, options);
    if (renderer.getPixelRatio() !== ratio) {
      renderer.setPixelRatio(ratio);
      renderer.setSize(canvas.width, canvas.height, false);
      if (post) post.resize(canvas.width, canvas.height);
    }
    // Antialias is a constructor argument of the WebGL context and cannot be
    // changed on a live one, so the caller is told rather than lied to.
    return { rebuild: (options.antialias ?? tier.antialias) !== antialiasAtBuild };
  }

  return { renderer, scene, view, terrain, pools, style, setTier, setProjection, get traffic() { return traffic; }, get tier() { return tierName; }, governor, get model() { return model; }, draw, setBudget, resize, worldChanged, showGhost, showGhostTiles, hideGhost, stats, dispose };
}
