// The renderer: scene, lights, and the draw loop.
//
// It reads state and draws it. It never writes to state — that rule is what
// lets the same simulation run headless in a test, in a worker, and on a
// server, with the renderer as one of several possible readers.

import * as THREE from "three";
import { createCamera, applyZoom, applyPose, clampToMap, setMode, pitchBy } from "./camera.js";
import { createTerrain, updateTerrain, markAllDirty } from "./terrain.js";
import { createWater } from "./water.js";
import { createInstances, updateInstances, pushInstance, settlePools, CAR_COLOURS } from "./instances.js";
import { UI } from "./palette.js";
import { STYLES, createPost } from "./styles.js";
import { choosePlan, countScene, setBudget, getBudget, visibleBounds, stepDown, inFootprint, inBounds, tilePixels, usesChunkPlans, RESOLVE, createChunkCeiling } from "./lod.js";
import { PALETTES, lightingFor } from "./style-assets.js";
import { createModel } from "../world/model.js";
import { createTraffic } from "../life/traffic.js";
import { phaseForPreset } from "../world/rush.js";
import { countrysideFor } from "../world/countryside.js";
import { treesFor } from "../world/foliage.js";
import { motionTime } from "../world/motion.js";
import { setMotionTime } from "./motion-material.js";
import { tierConfig } from "../world/config.js";
import { photoStep, photoLook } from "../world/photo.js";
import { createGovernor } from "./governor.js";
import { createSky, SKY_RADIUS } from "./sky.js";
import { fogFor, skyRadiusFor } from "./atmosphere.js";
import { createStreetChunks } from "./street-chunks.js";
import { createCollision } from "../world/collision.js";
import { createTimeOfDay, phaseOf } from "./time-of-day.js";
import { nearestLamps, lampsOf } from "./night-lights.js";
import { lensColour } from "../world/signals.js";
import { CHUNK } from "../world/chunks.js";
import { getConfig } from "../world/config.js";
import { createWalker } from "../life/walker.js";
import { deriveNav } from "../world/nav.js";
import { eyeOf, PITCH } from "../world/orbit.js";
import { createPedestrians } from "../life/pedestrians.js";

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
  /** Reused every frame; see `applyAtmosphere`. */
  const SKY_BASE = new THREE.Color();
  const SKY_WANT = new THREE.Color();

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
      // Scratch colours, allocated once: `applyAtmosphere` runs twice a frame
      // in city mode and was making two of these every time (R2).
      const base = SKY_BASE.setHex(palette.sky);
      const want = SKY_WANT.setHex(hour.sky);
      sky.material.color.setRGB(
        Math.min(1, want.r / Math.max(base.r, 1e-3)),
        Math.min(1, want.g / Math.max(base.g, 1e-3)),
        Math.min(1, want.b / Math.max(base.b, 1e-3)),
      );
    }
    // The clear colour has to know the hour too (E6) — it is what shows where
    // neither the dome nor the map does.
    renderer.setClearColor(hour.sky);
    // The dome is SCALED to sit inside the far plane (V8). It was a fixed
    // 1,800-tile sphere and street mode's far plane is 100, so at eye height
    // the sky was entirely behind it: the player got a flat clear colour and
    // the dome's whole gradient was thrown away, which is exactly what a low
    // sun needs.
    sky.scale.setScalar(skyRadiusFor(view) / SKY_RADIUS);
    const haze = fogFor(view, hour);
    if (!on || !haze) { scene.fog = null; return; }
    // Mutated, not replaced: a new `Fog` every frame is an allocation a frame
    // and a uniform rebind three has to notice (R1.7).
    if (!scene.fog) scene.fog = new THREE.Fog(hour.sky, haze.near, haze.far);
    scene.fog.color.setHex(hour.sky);
    scene.fog.near = haze.near;
    scene.fog.far = haze.far;
  }

  const antialiasAtBuild = options.antialias ?? tier.antialias;
  /** 0 in the tier table means uncapped (ruling 040). */
  const carCap = () => (options.carCap ?? tier.carCap) || Infinity;
  // Zero is a real answer here and not "no limit": the Low tier has no
  // pedestrians at all (ruling 040).
  const pedCap = () => options.pedCap ?? tier.pedCap ?? 0;
  /** The crowd from the air (B7). Zero at Low, like `pedCap`. */
  const pedCapCity = () => options.pedCapCity ?? tier.pedCapCity ?? 0;

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
  // The hour a frozen city settles its traffic at (B4). A live renderer is told
  // the phase every frame; a frozen one never draws a frame before it settles.
  const startPhase = options.phase ?? phaseForPreset(options.time ?? "day");
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
    // The grade follows the hour (spec §7.4): a split tone that is right at
    // noon is a different one at midnight.
    post?.setGrade(timeOfDay.target);
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
  let traffic = createTraffic(state, model, { cap: carCap(), life: options.life, phase: startPhase });
  // The nav graph and the people on it (slice E7, spec §9.3). Same contract as
  // the cars: derived, renderer-local, never state, frozen by `life: false`.
  let nav = deriveNav(state, model);
  // Two crowds over one graph (B7). The CITY crowd is spread over every
  // pavement by demand and is the same whatever the camera does; E7's crowd
  // tops the pavements near the eye up to what the buildings ask for, reading
  // the city crowd's count so it never doubles a street.
  let crowd = createPedestrians(state, model, nav, { cap: pedCapCity(), life: options.life, spread: true });
  let pedestrians = createPedestrians(state, model, nav, {
    cap: pedCap(), life: options.life, reserve: (edgeId) => crowd.heldOn(edgeId),
  });
  // The crossings without a light ask the cars for a gap (T1, A51). Wired here
  // because `life/pedestrians.js` may not reach into `life/traffic.js`: they are
  // two independent simulations over one derived graph.
  pedestrians.setTraffic((corridor, node) => traffic.busyAt(corridor, node));
  crowd.setTraffic((corridor, node) => traffic.busyAt(corridor, node));

  /** Which person to draw at a spot, from how many pixels a tile is there: E7's
   * figure, the one from the air, or nobody (B7). Per spot under perspective,
   * where the near street and the horizon are different zooms. */
  let crowdPosed = 0;
  /** What the measured frame has said about street chunks at this view, and a
   * counter that makes a rebuilt world a new view (B7, ruling 019). */
  const chunkCeiling = createChunkCeiling();
  let worldEpoch = 0;
  function figureAt(x, z) {
    const px = usesChunkPlans(view.mode)
      ? tilePixels(view, canvas.height, { x, z })
      : tilePixels(view, canvas.height);
    if (px >= RESOLVE.peds) return "l3";
    return px >= RESOLVE.pedsCity ? "l2" : null;
  }

  // The baked street cache (slice E2). It draws nothing until a chunk is close
  // enough to be worth baking and the tier allows any.
  // `buildingName` resolves a definition to the name on its sign (S1b). Passed
  // in rather than looked up, for the reason the locale is: the renderer has no
  // catalogue and no `t()`, and a mirror of twelve names here would be a third
  // copy of the list. Absent, `defaultName` turns `coalPlant` into "Coal plant".
  const streets = createStreetChunks(scene, {
    style: styleName, locale: options.locale, buildingName: options.buildingName,
  });

  // The walker (slice E4). Both halves are pure and neither knows a camera
  // exists: the collision world is the lots as solids, and the walker takes its
  // time as a delta, so `life: false` freezes it exactly as it freezes traffic.
  let collision = createCollision(model);
  let walker = createWalker(collision);

  const terrain = createTerrain(state, styleName);
  for (const chunk of terrain.chunks) chunk.mesh.receiveShadow = true;
  scene.add(terrain.group);
  // The water's surface (E8, spec §5.5). A quad a water tile at that tile's own
  // level, after the terrain, so the shoreline is where the bed comes up
  // through it.
  let water = createWater(state, model, styleName);
  scene.add(water.group);
  const pools = createInstances(scene, styleName);
  for (const [name, mesh] of Object.entries(pools)) {
    // Flat ground-level pieces receive shadows but do not cast them: a road
    // casting a shadow onto the ground it lies on is a second render of a
    // thing that changes nothing.
    // A lamp is four triangles on a bumper; a shadow map pass for it is a
    // second render of something that changes no pixel (B4).
    const flat = name === "road" || name === "mark" || name === "pipe"
      || name === "carBrake" || name === "carTurn";
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

  /** Where the player's own walker is, when they are down in the street — the
   * cars have to stop for them too (A45: cars yield, the walker goes
   * anywhere). */
  function walkerPoint() {
    const pose = walker.pose;
    return { x: pose.x, z: pose.z };
  }

  function worldChanged() {
    worldEpoch += 1;
    model = createModel(state);
    // The lane graph is part of the model, so the cars have to start again on
    // the new one: a car holding a link id from a graph that no longer exists
    // is a car in a field.
    traffic = createTraffic(state, model, { cap: carCap(), life: options.life, phase: startPhase });
    // The nav graph is derived from the same corridors, so it goes the same
    // way: a person holding an edge id from a graph that no longer exists is a
    // person in a field (E7).
    // The bed moved with the model, so the surface over it has to be rebuilt —
    // a lake drawn against a height field that no longer exists is a sheet of
    // blue in mid-air (E8).
    scene.remove(water.group);
    water.dispose();
    water = createWater(state, model, styleName);
    scene.add(water.group);
    nav = deriveNav(state, model);
    crowd = createPedestrians(state, model, nav, { cap: pedCapCity(), life: options.life, spread: true });
    pedestrians = createPedestrians(state, model, nav, {
      cap: pedCap(), life: options.life, reserve: (edgeId) => crowd.heldOn(edgeId),
    });
    pedestrians.setTraffic((corridor, node) => traffic.busyAt(corridor, node));
    crowd.setTraffic((corridor, node) => traffic.busyAt(corridor, node));
    collision = createCollision(model);
    // Where the walker stands is a fact about the OLD lots; a rebuild can put a
    // building on top of it, so it is settled onto the new ground.
    const was = { ...walker.pose };
    walker = createWalker(collision);
    walker.teleport(was.x, was.z, was.yaw, was.pitch);
    // NOT `streets.clear()`. Every build action threw away nine baked chunks
    // and re-baked them one a frame — six frames of L2 after every road tile
    // painted. `chunkHash` exists precisely so that only the chunk that
    // actually changed is stale, and `nextBuild` compares it every frame
    // (R1.5). The cache is told the model moved; it decides what that means.
    streets.remodel(model);
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
    // Remember where to come back to, before the mode changes under us.
    if (view.mode !== "street") cameFrom = view.mode;
    poseFromWalker();
    setProjection("street");
    return true;
  }

  /**
   * Into photo mode, from wherever the camera is (F1).
   *
   * The eye starts where the player was already looking — the orbit's own eye
   * in city and ortho, the walker's in street — so the mode opens on the shot
   * they had rather than somewhere they have to fly back from. That is the
   * whole of the entry: there is no ground to stand on and nothing to collide
   * with, which is what makes it a photo camera rather than a second walker.
   */
  function enterPhoto() {
    if (view.mode === "photo") return true;
    const eye = eyeOf(view);
    cameFrom = view.mode;
    if (view.mode !== "street") {
      // Coming off the orbit: the eye is above and behind the target, and the
      // look is the orbit's own, so `pitch` has to change sign — on the orbit a
      // positive pitch is an elevation ABOVE the target and looks down; in a
      // free-look mode it is the direction the eye points.
      view.pitch = -(view.pitch ?? PITCH);
    }
    view.eye = { x: eye.x, y: eye.y, z: eye.z };
    view.targetX = eye.x;
    view.targetZ = eye.z;
    setProjection("photo");
    return true;
  }

  /** Back where the player came from, over the ground under the camera. */
  function leavePhoto(mode) {
    if (view.mode !== "photo") return view.mode;
    view.targetX = view.eye?.x ?? view.targetX;
    view.targetZ = view.eye?.z ?? view.targetZ;
    // Back onto the orbit, where a positive pitch means an elevation. The
    // camera's own clamp takes it into the orbit's range.
    view.pitch = Math.abs(view.pitch ?? PITCH);
    pitchBy(view, 0);
    view.eye = undefined;
    const wanted = mode && mode !== "photo" ? mode : cameFrom;
    return setProjection(wanted === "street" ? "city" : wanted);
  }

  /** One frame of flight. The caller supplies the delta, so the camera is a
   * rate rather than a function of the frame rate (ruling 042 §3, D7). */
  function flyPhoto(move, dt) {
    if (view.mode !== "photo" || !view.eye) return;
    view.eye = photoStep(view.eye, view.yaw, view.pitch ?? 0, move, dt, view.span);
    view.targetX = view.eye.x;
    view.targetZ = view.eye.z;
    // `applyPose` picks the near and far planes for wherever the eye now is,
    // so flying through the height where they change needs nothing special —
    // and neither does any other way of moving the eye (F1).
    applyPose(view);
  }

  /**
   * This frame, as a PNG, at the canvas's own size or twice it on High (F1).
   *
   * `preserveDrawingBuffer` is off in play, and turning it on would cost every
   * frame for the sake of the one frame a player asks to keep. So the scene is
   * drawn once more into a render target and read back — which also buys the
   * supersample: a photo at twice the canvas is what makes the export worth
   * having rather than a screenshot the player could have taken themselves.
   *
   * Returns a `Blob`, or `undefined` if the context is gone. The caller does
   * the downloading, because a module that reaches for `document` to make an
   * anchor is a renderer that cannot be tested.
   */
  async function capture({ scale = tierName === "high" ? 2 : 1 } = {}) {
    const width = Math.round(canvas.width * scale);
    const height = Math.round(canvas.height * scale);
    const target = new THREE.WebGLRenderTarget(width, height, {
      colorSpace: THREE.SRGBColorSpace,
    });
    const pixels = new Uint8Array(width * height * 4);
    try {
      renderer.setRenderTarget(target);
      renderer.render(scene, view.camera);
      renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    } finally {
      renderer.setRenderTarget(null);
      target.dispose();
    }
    // WebGL's origin is the bottom left and a canvas's is the top left, so the
    // rows come back upside down. Flipped a row at a time rather than by
    // drawing the image transformed, which would resample it.
    const image = new ImageData(width, height);
    const stride = width * 4;
    for (let y = 0; y < height; y += 1) {
      image.data.set(pixels.subarray((height - 1 - y) * stride, (height - y) * stride), y * stride);
    }
    const surface = new OffscreenCanvas(width, height);
    surface.getContext("2d").putImageData(image, 0, 0);
    return surface.convertToBlob({ type: "image/png" });
  }

  /** Mouse look, in radians. */
  function lookPhoto(dYaw, dPitch) {
    if (view.mode !== "photo") return;
    const next = photoLook(view.yaw, view.pitch ?? 0, dYaw, dPitch);
    view.yaw = next.yaw;
    view.pitch = next.pitch;
    applyPose(view);
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

  /** Where the player was before street mode. Restored on the way out: a phone
   * defaults to orthographic, so leaving always to `city` handed it a
   * projection it had never asked for (R2). */
  let cameFrom = "city";

  /** Back to the city, over the place the walker was standing. */
  function leaveStreet(mode) {
    view.targetX = walker.pose.x / model.tileM;
    view.targetZ = walker.pose.z / model.tileM;
    const wanted = mode && mode !== "street" ? mode : cameFrom;
    return setProjection(wanted);
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

  /** Last frame's visible box, for the crowd's own budget (E7). */
  let lastBounds;
  /** Seconds of ambient motion lived through (S6). Advances only while life is
   * on — reduced motion turns life off in `game.js` — so a frozen frame is
   * still, and two frozen screenshots are the same bytes. */
  let motionClock = 0;

  function draw(drawOptions = {}) {
    // The haze follows the zoom, so it is re-derived rather than remembered.
    // Photo mode too: its fog and near plane depend on the eye's HEIGHT, which
    // the player is flying up and down (F1).
    if (view.mode === "city" || view.mode === "photo") applyAtmosphere();
    // The frame time the caller measured. The budget cannot see fill rate, so
    // this is the second instrument (ruling 040): a rolling p95 that gives up a
    // post pass, then shadows, then the supersample.
    // The cars move on wall-clock time, not on the game clock: a paused city
    // still has traffic on it, and a city at ×4 does not have cars at ×4.
    const dt = drawOptions.dt ?? (drawOptions.frameMs ?? 0) / 1000;
    const living = options.life !== false && drawOptions.life !== false;
    if (living && dt > 0) motionClock += Math.min(dt, 0.25);
    setMotionTime(motionTime(motionClock, { life: living }));
    // People before cars, because the cars have to see them: A45 gives a
    // pedestrian on a crossing right of way, and a car that reads last frame's
    // positions brakes for somebody who has already gone.
    // The photo camera flies before anything is measured, so the frame is drawn
    // from where the player has moved to rather than from where they were last
    // frame. A rate, scaled by the delta the caller measured (ruling 042 §3).
    if (view.mode === "photo") flyPhoto(drawOptions.move, dt);
    crowd.update(dt);
    pedestrians.update(dt, lastBounds, eyeOf(view));
    // Everybody in a carriageway, from both crowds: a car does not drive
    // through a person because the person is being drawn from the air.
    traffic.yieldTo([...pedestrians.yields(), ...crowd.yields()],
      view.mode === "street" ? walkerPoint() : undefined);
    // The hour reaches the road (B4). Handed in, never read from a clock here:
    // `client/life/` takes its time from the caller, which is what makes
    // `?life=0` freeze it (ruling 037).
    if (drawOptions.dayPhase !== undefined) traffic.setPhase(drawOptions.dayPhase);
    traffic.update(dt);
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
    water.applyHour(timeOfDay.current);
    followShadow();
    // The overlay is a byte plane on the terrain material (ruling 041): one
    // upload when it changes, nothing rebuilt.
    terrain.setOverlay(drawOptions.overlay);
    stats.chunksRebuilt = updateTerrain(state, terrain, model);
    if (stats.chunksRebuilt > 0) terrain.refreshOverlay();
    const bounds = visibleBounds(view, canvas.width / canvas.height);
    // Kept for the NEXT frame's pedestrian step, which runs before the frame's
    // own bounds are known. One frame stale is a person on the edge of the
    // view, which is invisible; deriving the bounds twice a frame is not.
    lastBounds = bounds;
    counts = countScene(state, bounds, countrysideFor(state, model), treesFor(state, model));
    // Only the cars on screen, which is the same set `pose` writes (R1.1).
    counts.cars = traffic.count(bounds);
    counts.peds = pedestrians.count(bounds);
    const crowdSeen = crowd.countBy(bounds, figureAt);
    counts.pedsCity = crowdSeen.l2;
    counts.pedsCityNear = crowdSeen.l3;
    // What a baked street chunk actually cost, last frame (slice E3).
    const held = stats.streets;
    counts.streetPerChunk = held?.live > 0 ? held.triangles / held.live : 0;
    // How many baked chunks are ON SCREEN, not how many are held. A chunk is
    // one mesh and three culls it whole, so charging the budget for the eight
    // the cache is holding when two are in the frustum put the estimate 51%
    // over at close zoom (slice E5) — the same failure as N30's "charged 49k
    // for ground never drawn", one lane along.
    counts.bakedChunks = countVisible(streets.keys, bounds);
    // Which ones, for the estimate's per-chunk pricing (S5).
    counts.bakedKeys = new Set(streets.keys);
    // The view, as far as the street chunks are concerned: where the camera
    // is and which way it faces, the canvas, the budget and the world. While
    // none of those changes, a count of chunks the measured frame refused is
    // not asked for again (B7).
    const eye = view.camera.position;
    const turn = view.camera.quaternion;
    const viewKey = [view.mode, eye.x, eye.y, eye.z, turn.x, turn.y, turn.z, turn.w]
      .map((v) => (typeof v === "number" ? v.toFixed(3) : v)).join("|")
      + `|${canvas.width}x${canvas.height}|${drawOptions.budget ?? getBudget()}|${worldEpoch}`;
    // What the plan ASKED for, before the estimate or the measurement shed
    // anything: the shed that matters was the estimate's, made while the ninth
    // chunk was baked and could be priced (B7).
    const chunksAsked = chunkCeiling.cap(viewKey, drawOptions.streetChunks ?? tier.streetChunks);
    const plan = choosePlan(counts, view, canvas.height, {
      budget: drawOptions.budget,
      streetChunks: chunksAsked,
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
        traffic.pose(pools, pushInstance, CAR_COLOURS, bounds);
        // Settle the pools AGAIN. The moving cars go into the same pools as the
        // parked ones and they go in after `updateInstances` has already
        // written `visible = mesh.count > 0` — so on a street with no parked
        // car of that variant in view, every moving car of it was invisible,
        // and the frame's own triangle count did not include any of them
        // (R1.2).
        const settled = settlePools(pools);
        result.instances = settled.instances;
        result.triangles = settled.triangles;
      }
      if (plan.peds !== false && drawOptions.life !== false) {
        pedestrians.pose(pools, pushInstance, CAR_COLOURS, bounds, undefined, drawOptions.crowdColour);
        const settled = settlePools(pools);
        result.instances = settled.instances;
        result.triangles = settled.triangles;
      }
      crowdPosed = 0;
      if (plan.pedsCity !== false && drawOptions.life !== false) {
        crowdPosed = crowd.pose(pools, pushInstance, CAR_COLOURS, bounds, figureAt, drawOptions.crowdColour);
        const settled = settlePools(pools);
        result.instances = settled.instances;
        result.triangles = settled.triangles;
      }
      // The signal lenses (V8). Their housings are baked into the chunks; the
      // lens is what changes, so it is posed here from the SAME `phaseAt` the
      // cars read — two answers to "which way is green" is a car driving
      // through a red one.
      if (pools.signalLens) {
        const clock = traffic.clock();
        for (const entry of streets.entries()) {
          for (const head of entry.signals ?? []) {
            const lens = lensColour(model.lanes.phaseAt(head.node, clock), head.axis);
            pushInstance(pools.signalLens, head.x / model.tileM, head.y / model.tileM,
              head.z / model.tileM, 1, 1, 1, lens.hex);
          }
        }
        const settled = settlePools(pools);
        result.instances = settled.instances;
        result.triangles = settled.triangles;
      }
      // Headlights and tail lights, only when it is dark enough for them to
      // mean anything (V8). Two quads a car, so a hundred cars is 400 triangles
      // — and by day it is nothing at all.
      if (plan.cars !== false && drawOptions.life !== false) {
        const lit = traffic.poseLights(pools, pushInstance, timeOfDay.current.night, bounds);
        if (lit > 0) {
          const settled = settlePools(pools);
          result.instances = settled.instances;
          result.triangles = settled.triangles;
        }
      }
      if (shadowLight) {
        shadowLight.castShadow = plan.shadows
          && (drawOptions.shadows ?? options.shadows ?? tier.shadows) !== false
          && governor.allows("shadows");
      }
      // The dome follows the eye. It never had to while it was 1,800 tiles
      // across — the camera was always near enough to its centre — and the
      // moment V8 scaled it to sit inside street mode's 100-tile far plane it
      // became a pale ball sitting in the middle of the map.
      sky.position.copy(view.camera.position);
      if (post) post.render(scene, view.camera);
      else renderer.render(scene, view.camera);
      // The SCENE's triangles, not the full-screen quad's. A post pass renders
      // twice and three resets `info.render` on each, so reading the counter
      // after one gave 2 — and the ladder, which is the only thing that makes
      // the budget a promise, spent every frame believing the city was free
      // (found in P2, and true for as long as any post pass has existed).
      plan.actual = post ? post.sceneInfo.triangles : renderer.info.render.triangles;
      if (plan.actual <= plan.budget || !stepDown(plan)) break;
      stats.rebuilds += 1;
    }
    chunkCeiling.settle(viewKey, chunksAsked, plan.streetChunks);
    // For the gate's trail: whether the view the ceiling is keyed on moved.
    stats.viewKey = viewKey;
    stats.chunksPlanned = plan.streetChunks;
    plan.overBudget = plan.actual > plan.budget;

    // At most one chunk baked per frame, nearest first (spec §6.4). After the
    // budget loop, because the ladder may have dropped the radius.
    stats.streets = streets.update(state, model, view, plan, drawOptions.now ?? Date.now(), bounds,
      drawOptions.territory === true);
    stats.instances = result.instances;
    // How many distinct per-chunk plans the frame used. 1 under orthographic
    // by construction; more than 1 under perspective is the proof that the
    // policy is per chunk and not per frame (slice V5).
    stats.chunkPlans = result.chunkPlans ?? 1;
    stats.chunkTiers = result.chunkTiers ?? 1;
    stats.counted = Math.round(result.triangles);
    stats.drawCalls = post ? post.sceneInfo.calls : renderer.info.render.calls;
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
    // The water surface is ONE mesh for the whole map and is never culled
    // (E8, Q66). The count is what says how much of a frame that is, and it
    // was inside the estimate where nothing could read it (D6).
    stats.waterTiles = counts.waterTiles;
    stats.corridors = model.stats.corridors;
    stats.lots = model.stats.lots;
    stats.tier = tierName;
    stats.cars = traffic.count();
    // How long the traffic has lived, which is what its population is a
    // function of (D7). Two cards can only be compared row for row where their
    // rows have lived comparable amounts of time — the delta clamp means a slow
    // machine lives more slowly than the clock (Q78).
    stats.trafficS = Math.round(traffic.simulatedS() * 10) / 10;
    // On screen and in total, because the two answer different questions: the
    // budget is charged for the first and the cap is a limit on the second.
    stats.peds = pedestrians.count(bounds);
    stats.pedsHeld = pedestrians.count();
    stats.pedCap = pedCap();
    // What was POSED, beside what was counted: the first version reported the
    // count, and a city camera printed 167 people while the plan had dropped
    // every one of them (B7, R1.1's lesson one lane along).
    stats.pedsCityPosed = crowdPosed;
    stats.pedsCity = counts.pedsCity ?? 0;
    stats.pedsCityNear = counts.pedsCityNear ?? 0;
    stats.pedsCityHeld = crowd.count();
    stats.pedCapCity = pedCapCity();
    stats.nav = nav.stats;
    stats.frameP95 = governor.p95();
    stats.given = governor.disabled();
    stats.frames += 1;
    return stats;
  }

  /**
   * Everything, not just the context.
   *
   * This disposed the post pass and the WebGL context and nothing else: the
   * instanced pools, the terrain chunks, the sky, the lamp lights and every
   * baked street group survived into the next city, and `lobby_smoke` starting
   * three cities in one page leaked all of it (R2). A `renderer.dispose()` frees
   * the context's own resources; the GEOMETRIES and MATERIALS in the scene are
   * ours to free.
   */
  function dispose() {
    streets.clear();
    for (const light of lampPool) scene.remove(light);
    lampPool.length = 0;
    scene.traverse((object) => {
      object.geometry?.dispose?.();
      const material = object.material;
      if (Array.isArray(material)) for (const m of material) m.dispose?.();
      else material?.dispose?.();
    });
    scene.clear();
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
    // The `supersample` rung was in the ladder and nothing read it: the
    // governor gave it up and the renderer went on rendering at 2× (R1.4).
    // It is the last thing sacrificed and the bluntest — a phone that is still
    // dropping frames with no post pass and no shadows is a phone drawing four
    // pixels for every one it shows.
    const ratio = governor.allows("supersample") ? ratioFor(tier, options) : 1;
    if (renderer.getPixelRatio() !== ratio) {
      renderer.setPixelRatio(ratio);
      renderer.setSize(canvas.width, canvas.height, false);
      if (post) post.resize(canvas.width, canvas.height);
    }
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
    enterStreet, leaveStreet, enterPhoto, leavePhoto, flyPhoto, lookPhoto, capture,
    get walker() { return walker; }, get collision() { return collision; }, get traffic() { return traffic; }, get pedestrians() { return pedestrians; }, get crowd() { return crowd; }, get nav() { return nav; }, get tier() { return tierName; }, governor, get model() { return model; }, draw, setBudget, resize, worldChanged, showGhost, showGhostTiles, hideGhost, stats, dispose };
}
