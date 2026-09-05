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
import { buildingParams, zoneTint } from "../world/params.js";
import { jitter } from "../world/hash.js";
import { setFaceContrast } from "./detail-kit.js";
import { DIR4 } from "../../shared/grid.js";
import { TIER, setCosts, inBounds } from "./lod.js";
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
  make("mark", flatGeometry(styleName, 0.06, 1, 0.056), 0xffffff, 60000);
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
  // Zoned but not yet built. Without this a painted zone is INVISIBLE until
  // something develops on it — the player draws a district and the map shows
  // nothing back (found in playtest, P29). A flat tint just above the ground,
  // not a block: it is a plan for the land, not a thing standing on it.
  make("zone", flatGeometry(styleName, 0.92, 0.92, 0.02), 0xffffff, 40000);
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

const HEIGHT_SCALE = 0.02;

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
function connect(hubPool, armPool, tile, x, y, height, colour) {
  const cx = x + 0.5;
  const cy = y + 0.5;
  push(hubPool, cx, height, cy, 1, 1, 1, colour);
  const mask = tile & 15;
  for (let d = 0; d < 4; d += 1) {
    if ((mask & (1 << d)) === 0) continue;
    const dir = DIR4[d];
    // Half a tile long, so it stops exactly on the boundary the neighbour's
    // own arm starts from. Rotated a quarter turn when it runs east-west.
    push(armPool, cx + dir.dx * 0.25, height, cy + dir.dy * 0.25,
      1, 1, 1, colour, dir.dx === 0 ? 0 : Math.PI / 2);
  }
}

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
function roadMarkings(pool, mask, x, y, height, colour) {
  const cx = x + 0.5;
  const cy = y + 0.5;
  let bits = 0;
  for (let d = 0; d < 4; d += 1) if (mask & (1 << d)) bits += 1;
  if (bits < 2) return;

  // North and south, or east and west: a road running through.
  const straight = mask === 5 || mask === 10;
  if (straight) {
    push(pool, cx, height, cy, 1, 1, 0.34, colour, (mask & 10) !== 0 ? Math.PI / 2 : 0);
    return;
  }

  const inner = bits >= 3 ? JUNCTION_GAP : 0;
  const length = 0.5 - inner;
  for (let d = 0; d < 4; d += 1) {
    if ((mask & (1 << d)) === 0) continue;
    const dir = DIR4[d];
    const centre = inner + length / 2;
    push(pool, cx + dir.dx * centre, height, cy + dir.dy * centre,
      1, 1, length, colour, dir.dx === 0 ? 0 : Math.PI / 2);
  }
}

export function updateInstances(state, pools, options = {}) {
  reset(pools);
  const styleName = options.style ?? "plain";
  const palette = PALETTES[styleName] ?? PALETTES.plain;
  const ground = (index) => state.tiles.elevation[index] * HEIGHT_SCALE;
  const showOwner = options.territory === true;
  // The LOD plan decides what exists this frame. Callers may still force
  // things off (reduced-effects mode), but never on.
  const plan = options.plan ?? { buildings: TIER.FULL, treeDetail: TIER.FULL, trees: true, props: true };
  const buildingTier = plan.buildings;
  const treeTier = plan.treeDetail;
  const trees = plan.trees && options.trees !== false;
  const props = plan.props && options.props !== false;
  const bounds = options.bounds;
  const markings = plan.markings !== false;
  const poles = plan.poles !== false;
  // The utility ribbons. Sub-pixel below about twelve pixels a tile, and the
  // largest single thing on screen on a wired city, so they are both a
  // resolvability gate and a ladder rung (slice V2).
  const networks = plan.networks !== false;

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

      if (state.tiles.road[index] & NET_PRESENT) {
        // The road surface itself is the terrain mesh's colour; only the
        // markings are instanced. Below a few pixels a tile they are invisible
        // and there are thousands of them.
        if (markings) {
          roadMarkings(pools.mark, state.tiles.road[index] & 15, x, y, h, palette.roadMark);
        }
      }
      // Zoned ground, drawn under everything else. It fades out as the lot
      // develops: an empty plot needs to say "this is zoned", a built one is
      // already saying it with a building.
      const zone = state.tiles.zone[index];
      if (zone !== 0 && state.tiles.buildingId[index] === 0) {
        push(pools.zone, x + 0.5, h + 0.012, y + 0.5, 1, 1, 1, zoneTint(zone, palette));
      }

      // Wire and pipe are drawn like roads are: joined. The connection mask is
      // the low four bits the network pass already maintains, so an arm is
      // drawn towards each neighbour that is actually part of the same run and
      // the line closes across the tile boundary.
      if (networks && (state.tiles.wire[index] & NET_PRESENT)) {
        // ABOVE the road surface (0.05), not under it. Both networks were drawn
        // below it, so a run crossing a street broke in two — the boundary gap
        // again, one tile wide (P33).
        connect(pools.wireHub, pools.wireArm, state.tiles.wire[index], x, y, h + 0.07, palette.wire);
        // A pole per tile is a picket fence down every street, and it buries
        // the city in clutter — every third, and only where one is resolvable.
        if (poles && ((x + y) % 3 === 0)) {
          push(pools.wire, x + 0.5, h, y + 0.5, 1, 1, 1, palette.wire);
        }
      }
      if (networks && (state.tiles.pipe[index] & NET_PRESENT)) {
        connect(pools.pipeHub, pools.pipeArm, state.tiles.pipe[index], x, y, h + 0.064, PIPE_COLOUR);
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
          push(pools.lamp,
            x + 0.5 + (horizontal ? 0 : side), h, y + 0.5 + (horizontal ? side : 0),
            1, 1, 1, palette.lamp ?? 0x9aa0a6, horizontal ? 0 : Math.PI / 2);
        } else if (roll > 0.44) {
          const side = jitter(index, 47) > 0.5 ? 0.26 : -0.26;
          const v = Math.floor(jitter(index, 53) * CAR_VARIANTS) % CAR_VARIANTS;
          push(pools[`car${v}`],
            x + 0.5 + (horizontal ? (jitter(index, 59) - 0.5) * 0.5 : side),
            h, y + 0.5 + (horizontal ? side : (jitter(index, 61) - 0.5) * 0.5),
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
          push(pools[`tuft${v}`],
            x + 0.12 + jitter(index, 79 + k) * 0.76, h, y + 0.12 + jitter(index, 83 + k) * 0.76,
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
        push(pools[`tree${v}_${treeTier}`],
          x + 0.2 + jitter(index, 7) * 0.6, h, y + 0.2 + jitter(index, 11) * 0.6,
          scale, scale, scale, palette.tree ?? palette.terrain[TERRAIN_FOREST],
          jitter(index, 13) * Math.PI * 2);
      }
    }
  }

  for (const building of state.buildings) {
    if (!inBounds(bounds, building.x, building.y)) continue;
    const index = building.y * state.width + building.x;
    const h = ground(index);
    const cx = building.x + building.w / 2;
    const cz = building.y + building.h / 2;

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
    if (p.lawn) push(pools.lawn, cx, h, cz, building.w, building.h, 1, p.lawn);

    const pool = pools[`${p.kind}${p.variant}_${buildingTier}`];
    if (!pool) continue;
    const roofPool = pools[`${p.kind}${p.variant}_${buildingTier}_roof`];
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
      const h = ground(index);
      push(pools.ovl, x + 0.5, h, y + 0.5, 1, 1, 1, OVERLAY_COLOURS[band]);
      const mark = MARKS[band];
      if (mark) push(mark, x + 0.5, h, y + 0.5, 1, 1, 1, 0x1b1d21);
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
  return { instances: Object.values(pools).reduce((sum, mesh) => sum + mesh.count, 0), triangles };
}
