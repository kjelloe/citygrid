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
import { choosePlan, countScene, setBudget, getBudget, visibleBounds, stepDown, inFootprint, inBounds } from "./lod.js";
import { PALETTES, lightingFor } from "./style-assets.js";
import { createModel } from "../world/model.js";
import { createTraffic } from "../life/traffic.js";
import { tierConfig } from "../world/config.js";
import { createGovernor } from "./governor.js";
import { createSky } from "./sky.js";
import { createStreetChunks } from "./street-chunks.js";
import { createCollision } from "../world/collision.js";
import { createTimeOfDay, phaseOf } from "./time-of-day.js";
import { nearestLamps, lampsOf } from "./night-lights.js";
import { CHUNK } from "../world/chunks.js";
import { getConfig } from "../world/config.js";
import { createWalker } from "../life/walker.js";

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
    const on = view.mode !== "ortho";
    sky.visible = on;
    const hour = timeOfDay.current;
    // The dome's gradient is baked into its vertex colours (spec §7.2), so the
    // hour is a TINT on it rather than a rebuild: a basic material multiplies
    // vertex colour by `material.color`, and the ratio of the hour's sky to the
    // palette's keeps the gradient's shape while moving where it sits.
    if (sky.material) {
      const base = new THREE.Color(palette.sky);
      const want = new THREE.Color(hour.sky);
      sky.material.color.setRGB(
        Math.min(1, want.r / Math.max(base.r, 1e-3)),
        Math.min(1, want.g / Math.max(base.g, 1e-3)),
        Math.min(1, want.b / Math.max(base.b, 1e-3)),
      );
    }
    // The dome is a 1,800-unit sphere and street mode's far plane is 100, so at
    // eye height the sky is entirely BEHIND it: what the player sees there is
    // the clear colour, and it has to know the hour too (slice E6).
    renderer.setClearColor(hour.sky);
    if (!on) { scene.fog = null; return; }
    const reach = Math.max(view.span, 12);
    scene.fog = new THREE.Fog(hour.sky, reach * hour.fogNear, reach * hour.fogFar);
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
  let keyLight;
  let hemiLight;
  const lights = lightingFor(styleName);
  // The hour (E6, spec §7.3). Pure and delta-driven, so `life: false` freezes
  // the sun where it stood along with the traffic and the walker.
  const timeOfDay = createTimeOfDay(options.time ?? "day");
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
    keyLight = key;
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
  hemiLight = new THREE.HemisphereLight(lights.hemiSky, lights.hemiGround, lights.hemi);
  scene.add(hemiLight);

  /** The lamp pool: `tier.lamps` point lights, moved to whichever lamps are
   * nearest, rather than created and destroyed as the player walks (spec §7.3).
   * A light that appears and vanishes at 60 Hz is a strobe. */
  const lampPool = [];
  let litLamps = [];
  function applyNightLights(night) {
    const cap = night > 0.35 ? (options.lamps ?? tier.lamps ?? 0) : 0;
    while (lampPool.length < cap) {
      const light = new THREE.PointLight(0xffdca8, 0, 30, 2);
      light.visible = false;
      lampPool.push(light);
      scene.add(light);
    }
    if (cap === 0) {
      litLamps = [];
      for (const light of lampPool) light.visible = false;
      return;
    }
    const eye = view.mode === "street" && view.eye
      ? { x: view.eye.x * model.tileM, y: view.eye.y * model.tileM, z: view.eye.z * model.tileM }
      : { x: view.targetX * model.tileM, y: 0, z: view.targetZ * model.tileM };
    litLamps = nearestLamps(lampsOf(streets.entries()), eye, cap, litLamps);
    for (let i = 0; i < lampPool.length; i += 1) {
      const lamp = litLamps[i];
      lampPool[i].visible = Boolean(lamp);
      if (!lamp) continue;
      lampPool[i].position.set(lamp.x / model.tileM, lamp.y / model.tileM, lamp.z / model.tileM);
      // The pool is in TILE units like the rest of the scene, so the reach is
      // too: 26 m of useful light is a little over a tile.
      // The reach is in TILE units like the rest of the scene. A lamp pools
      // about thirty metres of light, and the intensity is low because the
      // player can stand directly under one: at 1.6 the pavement blew out to
      // white and took the shopfront behind it with it.
      lampPool[i].distance = 30 / model.tileM;
      lampPool[i].intensity = 0.7 * night;
    }
  }

  /** Everything the hour touches, in one place. */
  function applyHour() {
    const hour = timeOfDay.applyTo(lights);
    if (keyLight) {
      keyLight.intensity = hour.key;
      keyLight.color.setHex(hour.keyColour);
      keyLight.position.set(state.width * 0.6, hour.sunHeight, state.height * 0.35);
    }
    if (hemiLight) {
      hemiLight.intensity = hour.hemi;
      hemiLight.color.setHex(hour.hemiSky);
      hemiLight.groundColor.setHex(hour.hemiGround);
    }
    streets.setNight(hour.night);
    applyNightLights(hour.night);
    applyAtmosphere();
  }

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

  // The walker (slice E4). Both halves are pure and neither knows a camera
  // exists: the collision world is the lots as solids, and the walker takes its
  // time as a delta, so `life: false` freezes it exactly as it freezes traffic.
  let collision = createCollision(model);
  let walker = createWalker(collision);

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
    collision = createCollision(model);
    // Where the walker stands is a fact about the OLD lots; a rebuild can put a
    // building on top of it, so it is settled onto the new ground.
    const was = { ...walker.pose };
    walker = createWalker(collision);
    walker.teleport(was.x, was.z, was.yaw, was.pitch);
    streets.clear();
    markAllDirty(terrain);
  }

  /**
   * Drops the eye onto the pavement nearest a tile and switches to street mode
   * (spec §8.1). Returns false when there is no street to stand on — the mode
   * is a place, not a setting, and entering it in the middle of a field would
   * leave the player with no way to tell what had happened.
   */
  function enterStreet(tileX, tileZ) {
    const x = ((tileX ?? view.targetX) + 0.5) * model.tileM;
    const z = ((tileZ ?? view.targetZ) + 0.5) * model.tileM;
    const near = model.nearestCorridor(x, z, model.tileM * 3);
    if (!near) return false;
    // On the PAVEMENT, facing along the street. Two things have to be right or
    // the mode reads as broken on arrival: standing in the middle of the
    // carriageway (which is where "offset away from the corridor" puts you when
    // the tile you picked IS the road tile, because the offset is then zero),
    // and facing across the street into a wall.
    const cfg = getConfig();
    const kerbside = cfg.road.width / 2 + cfg.road.sidewalk / 2;
    const tangent = tangentAt(near);
    let dx = x - near.x;
    let dz = z - near.z;
    if (Math.hypot(dx, dz) < cfg.road.width / 2) {
      // Already over the carriageway: step onto the pavement on the side the
      // camera is coming from.
      const side = Math.sign(-Math.sin(view.yaw) * tangent.z + Math.cos(view.yaw) * tangent.x) || 1;
      dx = -tangent.z * side;
      dz = tangent.x * side;
    }
    const off = Math.hypot(dx, dz) || 1;
    walker.teleport(
      near.x + (dx / off) * kerbside, near.z + (dz / off) * kerbside,
      Math.atan2(-tangent.x, -tangent.z), 0,
    );
    poseFromWalker();
    setProjection("street");
    return true;
  }

  /** Which way the street runs where `near` landed on it. */
  function tangentAt(near) {
    const points = near.corridor?.points;
    if (!points || points.length < 2) return { x: 1, z: 0 };
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < points.length; i += 1) {
      const d = Math.hypot(points[i].x - near.x, points[i].z - near.z);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    const a = points[Math.max(0, best - 1)];
    const b = points[Math.min(points.length - 1, best + 1)];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
  }

  /** Back to the city, over the place the walker was standing. */
  function leaveStreet(mode = "city") {
    view.targetX = walker.pose.x / model.tileM;
    view.targetZ = walker.pose.z / model.tileM;
    return setProjection(mode === "street" ? "city" : mode);
  }

  /** The camera reads the walker; the walker never hears about the camera. */
  function poseFromWalker() {
    const t = model.tileM;
    view.eye = { x: walker.pose.x / t, y: walker.pose.y / t, z: walker.pose.z / t };
    view.targetX = view.eye.x;
    view.targetZ = view.eye.z;
    view.yaw = walker.pose.yaw;
    view.pitch = walker.pose.pitch;
    applyPose(view);
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
    // The hour, before anything is measured: it decides the sky, the fog and
    // how many point lights the frame is about to carry.
    if (drawOptions.time !== undefined) timeOfDay.set(drawOptions.time);   // spec §7.3
    timeOfDay.update(drawOptions.dt ?? (drawOptions.frameMs ?? 0) / 1000);
    applyHour();
    followShadow();
    stats.chunksRebuilt = updateTerrain(state, terrain, model);
    const bounds = visibleBounds(view, canvas.width / canvas.height);
    counts = countScene(state, bounds);
    counts.cars = traffic.count();
    // What a baked street chunk actually cost, last frame (slice E3).
    const held = stats.streets;
    counts.streetPerChunk = held?.live > 0 ? held.triangles / held.live : 0;
    // How many baked chunks are ON SCREEN, not how many are held. A chunk is
    // one mesh and three culls it whole, so charging the budget for the eight
    // the cache is holding when two are in the frustum put the estimate 51%
    // over at close zoom (slice E5) — the same failure as N30's "charged 49k
    // for ground never drawn", one lane along.
    counts.bakedChunks = countVisible(streets.keys, bounds);
    const plan = choosePlan(counts, view, canvas.height, {
      budget: drawOptions.budget,
      streetChunks: drawOptions.streetChunks ?? tier.streetChunks,
    });
    plan.mode = view.mode;

    if (view.mode === "street") {
      // The walker moves on wall-clock time like the cars do, and for the same
      // reason: a paused city is still a place you can walk around.
      walker.update(drawOptions.dt ?? (drawOptions.frameMs ?? 0) / 1000, drawOptions.move);
      poseFromWalker();
    }
    else clampToMapAndGround();



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
        // The baked chunks draw their own markings, poles and wires (slice E3).
        bakedChunks: streets.keys,
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
    stats.time = timeOfDay.target;
    stats.night = timeOfDay.current.night;
    stats.lamps = litLamps.length;
    // How many lamps the cache holds against how many are LIT: the pool is
    // capped by the tier, and a gate that only saw the cap could not tell a
    // full pool from an empty city.
    stats.lampsHeld = lampsOf(streets.entries()).length;
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

  /** How many of the cache's chunks the camera can actually see. The same
   * "any corner or the centre" rule `countScene` uses for the terrain, because
   * they are the same 16-tile chunks. */
  function countVisible(keys, bounds) {
    let n = 0;
    for (const key of keys) {
      const cx = key % 4096;
      const cy = (key - cx) / 4096;
      const x0 = cx * CHUNK;
      const z0 = cy * CHUNK;
      const inside = bounds.footprint
        ? inFootprint(bounds, x0 + CHUNK / 2, z0 + CHUNK / 2)
          || inFootprint(bounds, x0, z0) || inFootprint(bounds, x0 + CHUNK, z0)
          || inFootprint(bounds, x0, z0 + CHUNK) || inFootprint(bounds, x0 + CHUNK, z0 + CHUNK)
        : inBounds(bounds, x0 + CHUNK / 2, z0 + CHUNK / 2);
      if (inside) n += 1;
    }
    return n;
  }

  /** The city camera's clamp and its ground orbit, which street mode has
   * neither of: a walker is already on the ground and is kept off the map edge
   * by the map's own edge. */
  function clampToMapAndGround() {
    clampToMap(view, state.width, state.height);
    // The camera orbits the ground under its target, in the scene's tile units.
    const groundY = model.cornerHeightAt(Math.round(view.targetX), Math.round(view.targetZ)) / model.tileM;
    if (groundY !== view.groundY) { view.groundY = groundY; applyPose(view); }
  }

  /** The hour, by name (E6). `auto` is the caller's business: `game.js` maps
   * the game clock onto a preset and hands the name down, because the renderer
   * has no clock of its own and must not grow one. */
  function setTime(name) {
    timeOfDay.set(name);
    return timeOfDay.target;
  }

  return { renderer, scene, view, terrain, pools, style, setTier, setProjection, setTime,
    get night() { return timeOfDay.current.night; },
    enterStreet, leaveStreet, get walker() { return walker; }, get collision() { return collision; }, get traffic() { return traffic; }, get tier() { return tierName; }, governor, get model() { return model; }, draw, setBudget, resize, worldChanged, showGhost, showGhostTiles, hideGhost, stats, dispose };
}
