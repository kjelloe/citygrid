// Instanced meshes for everything repeated.
//
// One InstancedMesh per (variant, material) pair. Buildings come in four
// silhouettes per category, chosen deterministically from the building's id, so
// a street is a street rather than a row of identical boxes — and it still
// costs a couple of dozen draw calls, because each variant is one instanced
// mesh however many of them stand in the city.

import * as THREE from "three";
import { buildingColour, PLAYER_COLOURS } from "./palette.js";
import { PALETTES, makeMaterial, slabGeometry } from "./style-assets.js";
import {
  buildingVariants, treeVariants, carVariants, tuftVariants, lampGeometry,
  variantFor, VARIANTS, TREE_VARIANTS, CAR_VARIANTS, TUFT_VARIANTS,
} from "./building-kit.js";
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

  make("road", slabGeometry(styleName, 1, 0.05, 1), palette.road, 24000);
  make("mark", slabGeometry(styleName, 0.06, 0.055, 0.34), palette.roadMark, 24000);
  make("wire", slabGeometry(styleName, 0.035, 0.34, 0.035), palette.wire, 24000);
  make("pipe", slabGeometry(styleName, 0.9, 0.05, 0.9), 0x4a86a8, 24000);
  make("ruin", slabGeometry(styleName, 0.7, 0.14, 0.7), 0x5a5048, 6000);

  for (const kind of ["residential", "commercial", "industrial", "civic"]) {
    const geometries = buildingVariants(kind);
    for (let v = 0; v < geometries.length; v += 1) {
      make(`${kind}${v}`, geometries[v], 0xffffff, kind === "civic" ? 1200 : 6000);
    }
  }
  const trees = treeVariants();
  for (let v = 0; v < trees.length; v += 1) make(`tree${v}`, trees[v], 0xffffff, 14000);
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

/** Nudges a colour per building: a little lightness, a little hue. Enough that
 * neighbours differ, little enough that the zone is still readable at a
 * glance, which is what the colour is actually for. */
function varyColour(hex, id) {
  const shift = (salt) => jitter(id, salt) - 0.5;
  const light = 1 + shift(23) * 0.34;
  const r = ((hex >> 16) & 0xff) * light * (1 + shift(29) * 0.2);
  const g = ((hex >> 8) & 0xff) * light * (1 + shift(31) * 0.16);
  const b = (hex & 0xff) * light * (1 + shift(37) * 0.22);
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return (clamp(r) << 16) | (clamp(g) << 8) | clamp(b);
}

/** A small deterministic hash, for per-tile variation that never touches game
 * state — the world looks varied without the variation having to be saved,
 * replayed or agreed between clients. */
function jitter(index, salt) {
  let h = (((index + 1) * 2654435761) ^ (salt * 40503)) >>> 0;
  h ^= h >>> 13;
  return (h >>> 8) / 0xffffff;
}

export function updateInstances(state, pools, options = {}) {
  reset(pools);
  const styleName = options.style ?? "plain";
  const palette = PALETTES[styleName] ?? PALETTES.plain;
  const ground = (index) => state.tiles.elevation[index] * HEIGHT_SCALE;
  const showOwner = options.territory === true;
  const underground = options.underground === true;
  const trees = options.trees !== false;
  const props = options.props !== false;

  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const index = y * state.width + x;
      const h = ground(index);

      if (state.tiles.road[index] & NET_PRESENT) {
        push(pools.road, x + 0.5, h, y + 0.5, 1, 1, 1, palette.road);
        // Centre markings, turned to follow the road's own direction.
        const mask = state.tiles.road[index] & 15;
        const horizontal = (mask & 2) !== 0 || (mask & 8) !== 0;
        push(pools.mark, x + 0.5, h, y + 0.5, 1, 1, 1, palette.roadMark, horizontal ? Math.PI / 2 : 0);
      }
      // A pole every third tile rather than on every one. A pole per tile is
      // a picket fence down every street, and it buries the city in clutter.
      if ((state.tiles.wire[index] & NET_PRESENT) && ((x + y) % 3 === 0)) {
        push(pools.wire, x + 0.5, h, y + 0.5, 1, 1, 1, palette.wire);
      }
      if (underground && (state.tiles.pipe[index] & NET_PRESENT)) {
        push(pools.pipe, x + 0.5, h + 0.01, y + 0.5, 1, 1, 1, 0x4a86a8);
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
        push(pools[`tree${v}`],
          x + 0.2 + jitter(index, 7) * 0.6, h, y + 0.2 + jitter(index, 11) * 0.6,
          scale, scale, scale, palette.tree ?? palette.terrain[TERRAIN_FOREST],
          jitter(index, 13) * Math.PI * 2);
      }
    }
  }

  for (const building of state.buildings) {
    const index = building.y * state.width + building.x;
    const h = ground(index);
    const cx = building.x + building.w / 2;
    const cz = building.y + building.h / 2;

    const kind = building.zone === ZONE_RESIDENTIAL ? "residential"
      : building.zone === ZONE_COMMERCIAL ? "commercial"
        : building.zone === ZONE_INDUSTRIAL ? "industrial"
          : "civic";
    const variant = variantFor(building.id, VARIANTS);
    const pool = pools[`${kind}${variant}`];
    if (!pool) continue;

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
  }

  for (const mesh of Object.values(pools)) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }
  return Object.values(pools).reduce((sum, mesh) => sum + mesh.count, 0);
}
