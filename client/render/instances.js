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
  variantFor, VARIANTS, TREE_VARIANTS, CAR_VARIANTS, TUFT_VARIANTS,
} from "./building-kit.js";
import { setFaceContrast } from "./detail-kit.js";
import { TIER, setCosts, inBounds } from "./lod.js";
import {
  ZONE_RESIDENTIAL, ZONE_COMMERCIAL, ZONE_INDUSTRIAL, ZONE_NONE,
  TERRAIN_FOREST, TERRAIN_GRASS, TERRAIN_MARSH, FLAG_RUINED, NET_PRESENT,
} from "../constants-mirror.js";

/** Parked cars and flowers carry the only strong accent colours in the scene,
 * which is what the reference uses them for. */
const CAR_COLOURS = [0xe0e4e8, 0x3f4a58, 0xc84a4a, 0x4a7fc8, 0xd8b84a, 0x5aa86a];
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
  make("road", flatGeometry(styleName, 1, 1, 0.05), 0xffffff, 24000);
  make("mark", flatGeometry(styleName, 0.06, 0.34, 0.056), 0xffffff, 24000);
  make("wire", slabGeometry(styleName, 0.035, 0.34, 0.035), 0xffffff, 24000);
  make("wireLine", flatGeometry(styleName, 0.5, 0.5, 0.02), 0xffffff, 40000);
  make("pipe", flatGeometry(styleName, 0.42, 0.42, 0.05), 0xffffff, 24000);
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
  // The budget is spent against MEASURED costs, not remembered ones.
  setCosts(measured);
  const cars = carVariants();
  for (let v = 0; v < cars.length; v += 1) make(`car${v}`, cars[v], 0xffffff, 6000);
  const tufts = tuftVariants();
  for (let v = 0; v < tufts.length; v += 1) make(`tuft${v}`, tufts[v], 0xffffff, 30000);
  make("lamp", lampGeometry(), 0xffffff, 8000);

  return pools;
}

function reset(pools) {
  for (const mesh of Object.values(pools)) mesh.count = 0;
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

/** Nudges a colour per building: a little lightness, a little hue. Enough that
 * neighbours differ, little enough that the zone is still readable at a
 * glance, which is what the colour is actually for. */
function varyColour(hex, id, amount = 1) {
  const shift = (salt) => (jitter(id, salt) - 0.5) * amount;
  const light = 1 + shift(23) * 0.34;
  const r = ((hex >> 16) & 0xff) * light * (1 + shift(29) * 0.2);
  const g = ((hex >> 8) & 0xff) * light * (1 + shift(31) * 0.16);
  const b = (hex & 0xff) * light * (1 + shift(37) * 0.22);
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return (clamp(r) << 16) | (clamp(g) << 8) | clamp(b);
}

/** Which roof a building gets. Deterministic from its id, like its variant, so
 * a house keeps its roof for its whole life without the colour ever entering
 * game state.
 *
 * Houses draw from tile and slate; everything else from flat felt greys. That
 * split is doing real work — it is most of what tells a terrace from an office
 * block in the reference, at a zoom where no other detail is legible. */
function roofColour(building, kind, palette) {
  const set = kind === "residential" ? palette.roof.house : palette.roof.flat;
  const pick = set[Math.floor(jitter(building.id, 53) * set.length) % set.length];
  // Half the usual scatter. A roof colour is a material — tile, slate, felt —
  // and materials vary less than paint does; at full scatter the terracottas
  // slid into maroon and the palette stopped reading as tile at all.
  return varyColour(pick, building.id * 3 + 11, 0.5);
}

/** A small deterministic hash, for per-tile variation that never touches game
 * state — the world looks varied without the variation having to be saved,
 * replayed or agreed between clients. */
function darken(hex, factor) {
  const r = Math.round(((hex >> 16) & 0xff) * factor);
  const g = Math.round(((hex >> 8) & 0xff) * factor);
  const b = Math.round((hex & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

function jitter(index, salt) {
  let h = (((index + 1) * 2654435761) ^ (salt * 40503)) >>> 0;
  h ^= h >>> 13;
  return (h >>> 8) / 0xffffff;
}

/** Water mains, as a trace in the surface. Not from the palette: it is the same
 * blue in every style because it stands for water, like the pipe overlay. */
const PIPE_COLOUR = 0x4a86a8;

/** The tint for an empty zoned lot: the zone's own colour, lightened towards
 * the ground so it reads as a marking on the land rather than a painted
 * surface. Kjell's call (P29): subtle, and gone once the lot is built. */
function zoneTint(zone, palette) {
  const base = palette.zone[zone] ?? 0x888888;
  const r = (base >> 16) & 0xff;
  const g = (base >> 8) & 0xff;
  const b = base & 0xff;
  const lift = (v) => Math.min(255, Math.round(v * 0.82 + 255 * 0.18));
  return (lift(r) << 16) | (lift(g) << 8) | lift(b);
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
        push(pools.road, x + 0.5, h, y + 0.5, 1, 1, 1, palette.road);
        // Centre markings, turned to follow the road's own direction. Below a
        // few pixels a tile they are invisible and there are thousands of them.
        if (markings) {
          const mask = state.tiles.road[index] & 15;
          const horizontal = (mask & 2) !== 0 || (mask & 8) !== 0;
          push(pools.mark, x + 0.5, h, y + 0.5, 1, 1, 1, palette.roadMark, horizontal ? Math.PI / 2 : 0);
        }
      }
      // Zoned ground, drawn under everything else. It fades out as the lot
      // develops: an empty plot needs to say "this is zoned", a built one is
      // already saying it with a building.
      const zone = state.tiles.zone[index];
      if (zone !== 0 && state.tiles.buildingId[index] === 0) {
        push(pools.zone, x + 0.5, h + 0.012, y + 0.5, 1, 1, 1, zoneTint(zone, palette));
      }

      // A CONTINUOUS run on every wired tile, with poles standing on every
      // third. Poles alone were the whole of it, and LOD drops them below 14
      // pixels a tile — so a power line the player had just drawn disappeared
      // the moment they zoomed out (P29).
      if (state.tiles.wire[index] & NET_PRESENT) {
        push(pools.wireLine, x + 0.5, h + 0.016, y + 0.5, 1, 1, 1, palette.wire);
        // A pole per tile is a picket fence down every street, and it buries
        // the city in clutter.
        if (poles && ((x + y) % 3 === 0)) {
          push(pools.wire, x + 0.5, h, y + 0.5, 1, 1, 1, palette.wire);
        }
      }
      // Pipes are underground, so what is drawn is the trace of one: a narrow
      // marking in the surface. `underground` gated this on an option nothing
      // ever passed, so water mains have never been drawn at all (P29).
      if (state.tiles.pipe[index] & NET_PRESENT) {
        push(pools.pipe, x + 0.5, h + 0.014, y + 0.5, 1, 1, 1, PIPE_COLOUR);
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

    const kind = building.zone === ZONE_RESIDENTIAL ? "residential"
      : building.zone === ZONE_COMMERCIAL ? "commercial"
        : building.zone === ZONE_INDUSTRIAL ? "industrial"
          : "civic";
    const variant = variantFor(building.id, VARIANTS);
    // Houses stand on a garden, not on tarmac. Civic buildings get one too —
    // a school or a clinic in the reference has grounds.
    if (kind === "residential" || kind === "civic") {
      push(pools.lawn, cx, h, cz, building.w, building.h, 1,
        varyColour(palette.lawn, building.id * 5 + 3, 0.6));
    }

    const pool = pools[`${kind}${variant}_${buildingTier}`];
    if (!pool) continue;
    const roofPool = pools[`${kind}${variant}_${buildingTier}_roof`];

    // Zone and value tier set the family; a deterministic per-building shift
    // sets the individual. Four silhouettes and one colour would still be a
    // row of clones — the reference's charm is that no two neighbours match.
    const family = showOwner
      ? PLAYER_COLOURS[building.owner] ?? palette.civic
      : building.zone === ZONE_NONE
        ? palette.civic
        : buildingColour(building.zone, building.valueTier, palette);
    const colour = showOwner ? family : varyColour(family, building.id);

    // Height reads development level; a little per-building variation stops a
    // terrace looking extruded from a single profile.
    const base = building.zone === ZONE_NONE
      ? 0.55 + building.w * 0.18
      : 0.45 + building.level * 0.5;
    const height = base * (0.88 + jitter(building.id, 17) * 0.3);
    // Quarter turns, so front doors do not all face the same way.
    const spin = building.w === building.h
      ? Math.floor(jitter(building.id, 19) * 4) * (Math.PI / 2)
      : 0;
    push(pool, cx, h, cz, building.w * 0.98, height, building.h * 0.98, colour, spin);
    if (roofPool) {
      // Same matrix, different colour. In the territory overlay the roof takes
      // a darkened owner colour instead, so ownership still reads at a glance
      // rather than being hidden under a terracotta hat.
      const roof = showOwner ? darken(family, 0.62) : roofColour(building, kind, palette);
      push(roofPool, cx, h, cz, building.w * 0.98, height, building.h * 0.98, roof, spin);
    }
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
