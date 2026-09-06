// Instanced meshes for everything repeated.
//
// One InstancedMesh per (variant, material) pair. Buildings come in four
// silhouettes per category, chosen deterministically from the building's id, so
// a street is a street rather than a row of identical boxes — and it still
// costs a couple of dozen draw calls, because each variant is one instanced
// mesh however many of them stand in the city.

import * as THREE from "three";
import { buildingColour, PLAYER_COLOURS, OVERLAY_COLOURS } from "./palette.js";
import { PALETTES, makeMaterial, slabGeometry, flatGeometry, faceContrastFor } from "./style-assets.js";
import { bandAt, BAND } from "../ui/overlays.js";
import {
  buildingVariants, treeVariants, carVariants, tuftVariants, lampGeometry,
  TREE_VARIANTS, CAR_VARIANTS, TUFT_VARIANTS,
} from "./building-kit.js";
import { buildingParams } from "../world/params.js";
import { jitter } from "../world/hash.js";
import { setFaceContrast } from "./detail-kit.js";
import { DIR4 } from "../../shared/grid.js";
import { TIER, setCosts, inBounds, planForChunk, tilePixels } from "./lod.js";
import {
  ZONE_RESIDENTIAL, ZONE_COMMERCIAL, ZONE_INDUSTRIAL, ZONE_NONE,
  TERRAIN_FOREST, TERRAIN_GRASS, TERRAIN_MARSH, FLAG_RUINED, NET_PRESENT,
} from "../constants-mirror.js";

/** Parked cars and flowers carry the only strong accent colours in the scene,
 * which is what the reference uses them for. */
export const CAR_COLOURS = [0xe0e4e8, 0x3f4a58, 0xc84a4a, 0x4a7fc8, 0xd8b84a, 0x5aa86a];
const FLOWER_COLOURS = [0xf2e27a, 0xf0f0f0, 0xe8a0c8, 0xf0c060];

const dummy = new THREE.Object3D();
const tint = new THREE.Color();

export function createInstances(scene, styleName = "plain") {
  // Before ANY geometry: the shading is baked in at build time, so this has to
  // be set first or the style gets the previous style's faces.
  setFaceContrast(faceContrastFor(styleName));
  const palette = PALETTES[styleName] ?? PALETTES.plain;
  const pools = {};

  const make = (name, geometry, colour, capacity) => {
    const material = makeMaterial(styleName, colour);
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    mesh.count = 0;
    mesh.frustumCulled = false;
    scene.add(mesh);
    pools[name] = mesh;
  };

  // WHITE, not the palette colour. three multiplies material colour by instance
  // colour, and every one of these pools is also given its colour per instance
  // at push time — so passing it here too drew each of them at the SQUARE of
  // its colour. A mid-grey road (0x6f7278, 0.44) came out at 0.19, which is why
  // the ground read as near-black asphalt in every style.
  // No road pool. A road is painted into the terrain mesh (`terrain.js`), where
  // it is seamless by construction and costs nothing — see the note there.
  // A unit-length stripe, scaled per instance: one centred dash on a straight
  // run, an arm per direction at a corner or a junction. Four a tile at an X,
  // where there used to be one.
  // Every lift is applied at push time now (slice V4) so the whole table of
  // them is in one place and each can be reasoned about against the slope.
  make("mark", flatGeometry(styleName, 0.06, 1, 0), 0xffffff, 60000);
  make("wire", slabGeometry(styleName, 0.035, 0.34, 0.035), 0xffffff, 24000);
  // A hub and four possible arms per tile, so a run READS as a run. A square
  // per tile left a dotted line with a gap at every boundary — the playtest
  // called it "just a dot on each tile" (P32).
  //
  // ONE WIDTH from end to end. N27 gave the hub 0.20 and the arm 0.14, and at
  // city zoom the arm falls under a pixel while the hub survives: a bead on a
  // string, which is the same complaint again (P33). Quads, not boxes: N28
  // skirted these too and it cost 48,600 triangles for wire and pipe together
  // (P35). They are drawn well clear of the ground, and that offset already
  // carries a run over any step it crosses.
  make("wireHub", flatGeometry(styleName, 0.16, 0.16, 0), 0xffffff, 40000);
  make("wireArm", flatGeometry(styleName, 0.16, 0.56, 0), 0xffffff, 80000);
  // Wider and softer than the wire: a main under the street rather than a
  // cable over it. Its own silhouette, so the two never need a legend.
  make("pipeHub", flatGeometry(styleName, 0.28, 0.28, 0), 0xffffff, 40000);
  make("pipeArm", flatGeometry(styleName, 0.28, 0.56, 0), 0xffffff, 80000);
  make("ruin", slabGeometry(styleName, 0.7, 0.14, 0.7), 0xffffff, 6000);
  // A garden plot under every house. In the reference this is doing far more
  // work than it looks: it is what stops a suburb reading as buildings dropped
  // onto a road surface, and it is why the green there is foreground rather
  // than leftover background.
  make("lawn", flatGeometry(styleName, 1, 1, 0.055), 0xffffff, 12000);

  // The overlay pass. One tint quad per tile, plus a per-band MARK — a dot, a
  // bar, a cross — because §16 and §30 both say never colour alone, and a
  // legend under the map does not help someone comparing two tiles in it.
  //
  // Four pools, whichever overlay is showing, so the cost of an overlay does
  // not depend on which one it is.
  make("ovl", flatGeometry(styleName, 0.98, 0.98, 0.075), 0xffffff, 24000);
  make("ovlGood", flatGeometry(styleName, 0.2, 0.2, 0.08), 0xffffff, 24000);
  make("ovlFair", flatGeometry(styleName, 0.5, 0.14, 0.08), 0xffffff, 24000);
  make("ovlSevere", flatGeometry(styleName, 0.62, 0.14, 0.08), 0xffffff, 24000);

  // One pool per (category, variant, detail tier). Only one tier is populated
  // at a time — an orthographic camera puts every building at the same zoom —
  // so the extra pools cost memory, not draw calls.
  const measured = { building: {}, tree: {} };
  for (const tier of [TIER.FULL, TIER.SHAPE, TIER.BLOCK]) {
    let sample = 0;
    for (const kind of ["residential", "commercial", "industrial", "civic"]) {
      const geometries = buildingVariants(kind, tier);
      const capacity = kind === "civic" ? 1200 : 6000;
      for (let v = 0; v < geometries.length; v += 1) {
        const { walls, roof } = geometries[v];
        make(`${kind}${v}_${tier}`, walls, 0xffffff, capacity);
        sample += triangleCount(walls);
        // The roof is a second mesh sharing the walls' matrix, so it can take
        // its own colour. It costs one draw call per variant, not per building.
        if (roof) {
          make(`${kind}${v}_${tier}_roof`, roof, 0xffffff, capacity);
          sample += triangleCount(roof);
        }
      }
    }
    measured.building[tier] = Math.round(sample / 16);

    const trees = treeVariants(tier);
    let treeSample = 0;
    for (let v = 0; v < trees.length; v += 1) {
      make(`tree${v}_${tier}`, trees[v], 0xffffff, 14000);
      treeSample += triangleCount(trees[v]);
    }
    measured.tree[tier] = Math.round(treeSample / trees.length);
  }
  const cars = carVariants();
  // Twice what the parked cars ever needed: the moving ones (V1) share these
  // pools, and the High tier does not cap them. A pool that overflows drops
  // instances silently, which reads as cars vanishing at the edge of a jam.
  for (let v = 0; v < cars.length; v += 1) make(`car${v}`, cars[v], 0xffffff, 12000);
  const tufts = tuftVariants();
  for (let v = 0; v < tufts.length; v += 1) make(`tuft${v}`, tufts[v], 0xffffff, 30000);
  make("lamp", lampGeometry(), 0xffffff, 8000);

  // The budget is spent against MEASURED costs, not remembered ones — and the
  // GROUND and the PROPS are measured too now. They were remembered, and the
  // memory went stale the moment a road became a skirted box: the table still
  // said "one upward quad" while three drew twelve, and a prop was priced at 90
  // whatever it was (P35). Last thing in this function, because it can only
  // measure pools that exist.
  const propSample = [
    triangleCount(pools.lamp.geometry),
    ...cars.map(triangleCount),
    ...tufts.map(triangleCount),
  ];
  setCosts({
    ...measured,
    car: Math.round(propSample.slice(1, 1 + cars.length).reduce((a, b) => a + b, 0) / cars.length),
    prop: { 2: Math.round(propSample.reduce((a, b) => a + b, 0) / propSample.length), 1: 0, 0: 0 },
    road: 0,  // painted into the terrain mesh
    marking: triangleCount(pools.mark.geometry),
    pole: triangleCount(pools.wire.geometry),
    wireHub: triangleCount(pools.wireHub.geometry),
    wireArm: triangleCount(pools.wireArm.geometry),
    pipeHub: triangleCount(pools.pipeHub.geometry),
    pipeArm: triangleCount(pools.pipeArm.geometry),
  });

  return pools;
}

function reset(pools) {
  for (const mesh of Object.values(pools)) mesh.count = 0;
}

/** Adds one instance to a pool. Exported for `client/life/`, which poses the
 * moving cars into the same pools the parked ones use — so a car is one
 * instance whether it is driving or parked, and the budget counts it once. */
export function pushInstance(mesh, x, y, z, sx, sy, sz, colour, rotation = 0) {
  push(mesh, x, y, z, sx, sy, sz, colour, rotation);
}

function push(mesh, x, y, z, sx, sy, sz, colour, rotation = 0) {
  const i = mesh.count;
  if (i >= mesh.instanceMatrix.count) return;
  dummy.position.set(x, y, z);
  dummy.scale.set(sx, sy, sz);
  dummy.rotation.set(0, rotation, 0);
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
  tint.setHex(colour);
  mesh.instanceColor.setXYZ(i, tint.r, tint.g, tint.b);
  mesh.count = i + 1;
}

// Heights come from the model now (slice V4, ruling 038). See `terrain.js` for
// why the flattening constant went.

/** Triangles in a geometry. An INDEXED geometry has fewer vertices than
 * triangle corners — a PlaneGeometry has four vertices and two triangles — so
 * dividing the vertex count by three undercounts it, and a cost model built on
 * that is wrong in exactly the places that matter most. */
export function triangleCount(geometry) {
  if (geometry.index) return geometry.index.count / 3;
  return geometry.getAttribute("position").count / 3;
}

/** Water mains, as a trace in the surface. Not from the palette: it is the same
 * blue in every style because it stands for water, like the pipe overlay. */
const PIPE_COLOUR = 0x4a86a8;

/** Draws one tile of a network as a hub plus an arm towards every neighbour it
 * is joined to.
 *
 * The low four bits of a network tile are its connection mask, in `DIR4`
 * order — the same mask the road renderer turns into centre markings. An arm
 * reaches from the centre to the tile edge, so two neighbouring tiles each draw
 * half and the join is seamless.
 *
 * An isolated tile still gets its hub: a single pole with nothing attached is
 * something the player placed and must be able to see.
 */
function connect(hubPool, armPool, tile, x, y, lift, colour, at) {
  const cx = x + 0.5;
  const cy = y + 0.5;
  push(hubPool, cx, at(cx, cy) + lift, cy, 1, 1, 1, colour);
  const mask = tile & 15;
  for (let d = 0; d < 4; d += 1) {
    if ((mask & (1 << d)) === 0) continue;
    const dir = DIR4[d];
    // Half a tile long, so it stops exactly on the boundary the neighbour's
    // own arm starts from. Rotated a quarter turn when it runs east-west.
    //
    // Sampled at the ARM's own centre rather than at the tile's (slice V4): an
    // arm reaching into the next tile at this tile's height is the flat-layer
    // problem in miniature, and on a slope the run would step.
    const ax = cx + dir.dx * 0.25;
    const az = cy + dir.dy * 0.25;
    push(armPool, ax, at(ax, az) + lift, az,
      1, 1, 1, colour, dir.dx === 0 ? 0 : Math.PI / 2);
  }
}

/** How far the centre markings sit above the road surface, in tile units.
 *
 * It used to be baked into the geometry. Since V4 every lift is applied at push
 * time against a height sampled at the piece's own position, so the whole table
 * of them is in one place and each can be reasoned about against a slope. */
const MARK_LIFT = 0.056;

/** How far a junction's markings stop short of the tile centre.
 *
 * A road does not paint its centre line through a crossroads — the lines stop
 * at the junction and the box is left clear. Without this a T reads as a
 * three-armed star and an X as a plus sign, neither of which is a road. */
const JUNCTION_GAP = 0.22;

/** The centre markings for one road tile, drawn from its connection mask.
 *
 * The mask is the same low four bits the network ribbons read (ruling 030), and
 * the three cases are what a person recognises as a road:
 *
 *   straight — one dash across the tile centre, the lane divider
 *   corner   — two arms meeting AT the centre, so the elbow has no hole in it
 *   T or X   — an arm per approach, stopping short of the middle
 *
 * A stub with one connection or none gets nothing: there is no lane to divide,
 * and a lone dash on the end of a road reads as a mistake.
 */
function roadMarkings(pool, mask, x, y, lift, colour, at) {
  const cx = x + 0.5;
  const cy = y + 0.5;
  let bits = 0;
  for (let d = 0; d < 4; d += 1) if (mask & (1 << d)) bits += 1;
  if (bits < 2) return;

  // North and south, or east and west: a road running through.
  const straight = mask === 5 || mask === 10;
  if (straight) {
    push(pool, cx, at(cx, cy) + lift, cy, 1, 1, 0.34, colour, (mask & 10) !== 0 ? Math.PI / 2 : 0);
    return;
  }

  const inner = bits >= 3 ? JUNCTION_GAP : 0;
  const length = 0.5 - inner;
  for (let d = 0; d < 4; d += 1) {
    if ((mask & (1 << d)) === 0) continue;
    const dir = DIR4[d];
    const centre = inner + length / 2;
    // Each arm at its own height (slice V4): a junction on a slope has four
    // approaches at four heights, and one shared y sinks half of them.
    const mx = cx + dir.dx * centre;
    const mz = cy + dir.dy * centre;
    push(pool, mx, at(mx, mz) + lift, mz,
      1, 1, length, colour, dir.dx === 0 ? 0 : Math.PI / 2);
  }
}

export function updateInstances(state, pools, options = {}) {
  reset(pools);
  const styleName = options.style ?? "plain";
  const palette = PALETTES[styleName] ?? PALETTES.plain;
  const model = options.model;
  const tileM = model.tileM;
  /** A tile CENTRE's height, in tile units. Everything that stands on a tile
   * uses this; anything that spans more than one samples at its own position,
   * because a flat quad at its tile's height does not meet its neighbour on a
   * slope (ruling 030's amendment, spec §5.6). */
  const ground = (index) => {
    const x = index % state.width;
    const y = (index - x) / state.width;
    return model.heightAt((x + 0.5) * tileM, (y + 0.5) * tileM) / tileM;
  };
  /** Any point's height, in tile units, from tile coordinates. */
  const at = (x, z) => model.heightAt(x * tileM, z * tileM) / tileM;
  /** The MEAN of a tile's four corners, in tile units.
   *
   * A flat quad covering a whole tile cannot follow a slope, and there is no
   * placement that is right on a cliff — only a least wrong one. Seating it on
   * the highest corner was tried and is worse than it sounds: on the steepest
   * slope of a `hilly` map the overlay hovered as a visible sheet above the
   * grass, which reads as a bug rather than as a diagnostic. The mean grazes
   * the surface instead, half in and half out, which at a glance reads as a
   * wash lying on the ground.
   *
   * The zone tint took the other way out and stopped being a quad at all
   * (`world/ground-colour.js`); the overlay cannot, because it is toggled at
   * runtime and folding it into the mesh would rebuild every chunk on every
   * switch. Recorded in spec §5.6 and as a question. */
  const tileMid = (x, y) => (
    model.cornerHeightAt(x, y) + model.cornerHeightAt(x + 1, y)
    + model.cornerHeightAt(x, y + 1) + model.cornerHeightAt(x + 1, y + 1)
  ) / 4 / tileM;
  const showOwner = options.territory === true;
  // The LOD plan decides what exists this frame. Callers may still force
  // things off (reduced-effects mode), but never on.
  const plan = options.plan ?? { buildings: TIER.FULL, treeDetail: TIER.FULL, trees: true, props: true };
  // A plan per CHUNK, not per frame (slice V5, spec §8.2).
  //
  // An orthographic camera puts every tile at the same size, so one plan for the
  // frame was the whole truth. A perspective camera does not, and drawing the
  // horizon at the same fidelity as the tile under the cursor is most of a
  // frame spent on things a pixel wide. A chunk's plan is the frame's plan with
  // whatever that chunk's own distance cannot resolve taken away — never
  // anything added back, so a far chunk can never come out finer than a near
  // one.
  const CHUNK = 16;
  const chunkPlans = new Map();
  const planAt = (x, y) => {
    if (options.canvasHeight === undefined || plan.mode !== "city") return plan;
    const key = ((y / CHUNK) | 0) * 4096 + ((x / CHUNK) | 0);
    let found = chunkPlans.get(key);
    if (found) return found;
    const cx = (((x / CHUNK) | 0) + 0.5) * CHUNK;
    const cz = (((y / CHUNK) | 0) + 0.5) * CHUNK;
    found = planForChunk(plan, tilePixels(options.view, options.canvasHeight, { x: cx, z: cz }));
    chunkPlans.set(key, found);
    return found;
  };

  const bounds = options.bounds;


  // Only what the camera can see. Everything below is per-tile work, and on a
  // 128x128 region at street zoom that is 16k tiles of which perhaps 300 are
  // visible.
  const x0 = bounds ? Math.max(0, Math.floor(bounds.x0)) : 0;
  const x1 = bounds ? Math.min(state.width - 1, Math.ceil(bounds.x1)) : state.width - 1;
  const y0 = bounds ? Math.max(0, Math.floor(bounds.y0)) : 0;
  const y1 = bounds ? Math.min(state.height - 1, Math.ceil(bounds.y1)) : state.height - 1;

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const index = y * state.width + x;
      const h = ground(index);
      // This tile's chunk decides what it may draw; under orthographic every
      // chunk gets the frame's plan and nothing changes.
      const local = planAt(x, y);
      const markings = local.markings !== false;
      const poles = local.poles !== false;
      const networks = local.networks !== false;
      const props = local.props !== false && options.props !== false;
      const trees = local.trees !== false && options.trees !== false;
      const treeTier = local.treeDetail;

      if (state.tiles.road[index] & NET_PRESENT) {
        // The road surface itself is the terrain mesh's colour; only the
        // markings are instanced. Below a few pixels a tile they are invisible
        // and there are thousands of them.
        if (markings) {
          roadMarkings(pools.mark, state.tiles.road[index] & 15, x, y, MARK_LIFT, palette.roadMark, at);
        }
      }
      // Zoned ground is a COLOUR of the terrain mesh since V4, not a quad on
      // top of it — see `client/world/ground-colour.js`.

      // Wire and pipe are drawn like roads are: joined. The connection mask is
      // the low four bits the network pass already maintains, so an arm is
      // drawn towards each neighbour that is actually part of the same run and
      // the line closes across the tile boundary.
      if (networks && (state.tiles.wire[index] & NET_PRESENT)) {
        // ABOVE the road surface (0.05), not under it. Both networks were drawn
        // below it, so a run crossing a street broke in two — the boundary gap
        // again, one tile wide (P33).
        connect(pools.wireHub, pools.wireArm, state.tiles.wire[index], x, y, 0.07, palette.wire, at);
        // A pole per tile is a picket fence down every street, and it buries
        // the city in clutter — every third, and only where one is resolvable.
        if (poles && ((x + y) % 3 === 0)) {
          push(pools.wire, x + 0.5, h, y + 0.5, 1, 1, 1, palette.wire);
        }
      }
      if (networks && (state.tiles.pipe[index] & NET_PRESENT)) {
        connect(pools.pipeHub, pools.pipeArm, state.tiles.pipe[index], x, y, 0.064, PIPE_COLOUR, at);
      }
      if (state.tiles.flags[index] & FLAG_RUINED) {
        push(pools.ruin, x + 0.5, h, y + 0.5, 1, 1, 1, 0x5a5048);
      }

      const paved = (state.tiles.road[index] & NET_PRESENT) !== 0;
      if (paved && props) {
        // Street furniture and parked cars, placed off the centre line and
        // aligned to the road. A road with nothing on it reads as a corridor;
        // a road with a lamp and a parked car reads as a street.
        const mask = state.tiles.road[index] & 15;
        const horizontal = (mask & 2) !== 0 || (mask & 8) !== 0;
        const roll = jitter(index, 41);
        if (roll > 0.72) {
          const side = jitter(index, 43) > 0.5 ? 0.34 : -0.34;
          const lx = x + 0.5 + (horizontal ? 0 : side);
          const lz = y + 0.5 + (horizontal ? side : 0);
          push(pools.lamp, lx, at(lx, lz), lz,
            1, 1, 1, palette.lamp ?? 0x9aa0a6, horizontal ? 0 : Math.PI / 2);
        } else if (roll > 0.44) {
          const side = jitter(index, 47) > 0.5 ? 0.26 : -0.26;
          const v = Math.floor(jitter(index, 53) * CAR_VARIANTS) % CAR_VARIANTS;
          const px = x + 0.5 + (horizontal ? (jitter(index, 59) - 0.5) * 0.5 : side);
          const pz = y + 0.5 + (horizontal ? side : (jitter(index, 61) - 0.5) * 0.5);
          push(pools[`car${v}`], px, at(px, pz), pz,
            1, 1, 1, CAR_COLOURS[Math.floor(jitter(index, 67) * CAR_COLOURS.length)],
            horizontal ? 0 : Math.PI / 2);
        }
      }

      // Grass detail. The reference's fields are covered in tufts and flowers,
      // and they are most of the reason its ground does not look like a
      // bedsheet. Sparse enough to stay cheap, dense enough to read.
      if (props && !paved && state.tiles.buildingId[index] === 0
        && (state.tiles.terrain[index] === TERRAIN_GRASS || state.tiles.terrain[index] === TERRAIN_MARSH)) {
        const count = jitter(index, 71) > 0.55 ? 2 : 1;
        for (let k = 0; k < count; k += 1) {
          const v = Math.floor(jitter(index, 73 + k) * TUFT_VARIANTS) % TUFT_VARIANTS;
          const tx = x + 0.12 + jitter(index, 79 + k) * 0.76;
          const tz = y + 0.12 + jitter(index, 83 + k) * 0.76;
          push(pools[`tuft${v}`], tx, at(tx, tz), tz,
            1, 0.8 + jitter(index, 89 + k) * 0.6, 1,
            v === 1 ? FLOWER_COLOURS[Math.floor(jitter(index, 97 + k) * FLOWER_COLOURS.length)]
              : palette.terrain[TERRAIN_GRASS], jitter(index, 101 + k) * Math.PI * 2);
        }
      }

      // Forest is drawn as actual trees rather than as a green tile. Species,
      // size, offset and spin all come from the tile index, so a wood looks
      // planted rather than tiled — and none of it has to be remembered.
      if (trees && state.tiles.terrain[index] === TERRAIN_FOREST
        && state.tiles.buildingId[index] === 0 && !paved) {
        const v = Math.floor(jitter(index, 3) * TREE_VARIANTS) % TREE_VARIANTS;
        const scale = 0.72 + jitter(index, 5) * 0.6;
        const rx = x + 0.2 + jitter(index, 7) * 0.6;
        const rz = y + 0.2 + jitter(index, 11) * 0.6;
        push(pools[`tree${v}_${treeTier}`], rx, at(rx, rz), rz,
          scale, scale, scale, palette.tree ?? palette.terrain[TERRAIN_FOREST],
          jitter(index, 13) * Math.PI * 2);
      }
    }
  }

  for (const building of state.buildings) {
    if (!inBounds(bounds, building.x, building.y)) continue;
    const cx = building.x + building.w / 2;
    const cz = building.y + building.h / 2;
    // Seated on the LOWEST corner of its lot (ruling 038), which is what the
    // model already computed. Seating on the tile's own height put a building
    // that spans a slope half in the air at one corner and half buried at the
    // other; a plinth makes the difference up, and under the lawn that reads
    // as the ground the house was cut into.
    const lot = model.lotOf(building.id);
    const h = lot ? lot.seat / tileM : at(cx, cz);

    // Zone and value tier set the family; the model sets the individual —
    // variant, colour, roof, height, spin — from the building's id, so the
    // box drawn here and the facade drawn at street level are the same house
    // (ruling 032).
    const family = showOwner
      ? PLAYER_COLOURS[building.owner] ?? palette.civic
      : building.zone === ZONE_NONE
        ? palette.civic
        : buildingColour(building.zone, building.valueTier, palette);
    const p = buildingParams(building, palette, family, showOwner);
    // The lawn takes the building's seat, not its own tile's height: it is the
    // ground the house was cut into, so on a slope the uphill half of it is
    // buried and that is what a plinth looks like from above (spec §5.6).
    if (p.lawn) push(pools.lawn, cx, h, cz, building.w, building.h, 1, p.lawn);

    const tier = planAt(building.x, building.y).buildings;
    const pool = pools[`${p.kind}${p.variant}_${tier}`];
    if (!pool) continue;
    const roofPool = pools[`${p.kind}${p.variant}_${tier}_roof`];
    push(pool, cx, h, cz, building.w * 0.98, p.height, building.h * 0.98, p.colour, p.spin);
    if (roofPool) push(roofPool, cx, h, cz, building.w * 0.98, p.height, building.h * 0.98, p.roof, p.spin);
  }

  // --- the overlay pass -----------------------------------------------------
  //
  // One traversal of the visible tiles, whichever overlay is showing. The band
  // functions are pure and tested (client/ui/overlays.js); this only turns a
  // band into a tint and a mark.
  if (options.overlay) {
    const MARKS = [pools.ovlGood, pools.ovlFair, pools.ovlSevere];
    for (let index = 0; index < state.tiles.terrain.length; index += 1) {
      const x = index % state.width;
      const y = (index - x) / state.width;
      if (!inBounds(bounds, x, y)) continue;
      const band = bandAt(state, options.overlay, index);
      // Grey is not drawn. A tile with nothing to say is more useful showing
      // the city than showing a wash of grey over it.
      if (band === BAND.NONE) continue;
      const mid = tileMid(x, y);
      push(pools.ovl, x + 0.5, mid, y + 0.5, 1, 1, 1, OVERLAY_COLOURS[band]);
      const mark = MARKS[band];
      if (mark) push(mark, x + 0.5, mid, y + 0.5, 1, 1, 1, 0x1b1d21);
    }
  }

  let triangles = 0;
  for (const mesh of Object.values(pools)) {
    // An empty pool is hidden rather than drawn with zero instances, so unused
    // tiers cost nothing at all.
    mesh.visible = mesh.count > 0;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    if (mesh.visible) triangles += mesh.count * triangleCount(mesh.geometry);
  }
  return {
    instances: Object.values(pools).reduce((sum, mesh) => sum + mesh.count, 0),
    triangles,
    // How many chunks were planned separately. One under orthographic by
    // construction; more than one under perspective is the proof that the
    // policy is per chunk and not per frame (slice V5).
    chunkPlans: Math.max(1, chunkPlans.size),
    // And how many of them actually DIFFER. Sixteen chunks all planned the
    // same way is a per-chunk policy that is doing nothing.
    chunkTiers: Math.max(1, new Set([...chunkPlans.values()].map(
      (p) => `${p.buildings}${p.treeDetail}${p.props ? 1 : 0}${p.markings ? 1 : 0}${p.trees ? 1 : 0}${p.cars ? 1 : 0}`,
    )).size),
  };
}
