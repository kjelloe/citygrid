// Where the trees are (slice V8; spec §6.6).
//
// At city zoom a tree is an instanced cone, and that is right: at eighteen
// pixels a tile there is nothing else to see. Standing under one, a cone is a
// cone — and the L2 kit was still what a walker saw inside a baked chunk,
// because the tree pass was the one thing in `updateInstances` never gated on
// whether the chunk had been baked.
//
// This file exists so that both passes agree about WHERE a tree is. Two copies
// of "a tree is at `jitter(index, 7)` across the tile" is a tree that jumps a
// few metres sideways the moment its chunk bakes and jumps back when the player
// walks away, and nothing goes red for it.
//
// Pure, in `client/world/`, and every number in it is a hash of a tile index —
// so a wood looks planted rather than tiled and none of it is remembered.

import { getConfig } from "./config.js";
import { jitter } from "./hash.js";
import {
  TERRAIN_FOREST, TERRAIN_GRASS, TERRAIN_WATER, TERRAIN_SHALLOW, TERRAIN_ROCK, NET_PRESENT,
} from "../constants-mirror.js";
import { frontEdgeOf, OUTWARD } from "./lots.js";
import { doorPoint } from "./street-furniture.js";
import { houseLots } from "./homes.js";

/** The species a tree can be. Not a variant number: the L3 kit builds a
 * different SHAPE for each, and a name is what a reader can check.
 *
 * Six since S5. The first three are the wood's own, chosen by hash — and the
 * hash is over THREE, as it always was, so no existing wood changed species.
 * A willow grows where the land meets water, a conifer where it meets rock, a
 * street tree in a pit in front of a shop, and an orchard tree in a row in a
 * back garden. */
export const TREE_KINDS = ["conifer", "round", "twin", "willow", "street", "orchard"];
const WILD = 3;
/** How many grass tiles on a shore carry a willow. */
const SHORE_WILLOW = 0.3;
/** How many small houses have an orchard row in the back garden. */
const ORCHARD_SHARE = 0.35;

const SIDES = [[0, -1], [1, 0], [0, 1], [-1, 0]];
function touches(state, x, y, kinds) {
  for (const [dx, dy] of SIDES) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
    if (kinds.includes(state.tiles.terrain[ny * state.width + nx])) return true;
  }
  return false;
}

/** A wild tree's species (S5): a function of the terrain round it and a hash of
 * its tile, nothing else. */
export function wildSpecies(state, x, y, index) {
  if (touches(state, x, y, [TERRAIN_WATER, TERRAIN_SHALLOW])) return "willow";
  if (touches(state, x, y, [TERRAIN_ROCK])) return "conifer";
  return TREE_KINDS[Math.floor(jitter(index, 3) * WILD) % WILD];
}

/**
 * The tree on one tile, in metres.
 *
 * The seeds are the ones `instances.js` has used since V3 — 3, 5, 7, 11, 13 —
 * so nothing moves now that the answer lives in one place.
 */
export function treeAt(index, x, y, cfg = getConfig(), kind = undefined) {
  const tileM = cfg.tileM;
  const species = kind ?? TREE_KINDS[Math.floor(jitter(index, 3) * WILD) % WILD];
  const variant = TREE_KINDS.indexOf(species);
  return {
    x: (x + 0.2 + jitter(index, 7) * 0.6) * tileM,
    z: (y + 0.2 + jitter(index, 11) * 0.6) * tileM,
    variant,
    kind: species,
    scale: 0.72 + jitter(index, 5) * 0.6,
    spin: jitter(index, 13) * Math.PI * 2,
  };
}

/** The wild tree on one tile, if it has one: forest with no building and no
 * road, of its terrain's species; or a willow on some of the grass that meets
 * the water. */
function wildAt(state, x, y, index, cfg) {
  if (state.tiles.buildingId[index] !== 0) return undefined;
  if ((state.tiles.road[index] & NET_PRESENT) !== 0) return undefined;
  const terrain = state.tiles.terrain[index];
  if (terrain === TERRAIN_FOREST) return treeAt(index, x, y, cfg, wildSpecies(state, x, y, index));
  if (terrain === TERRAIN_GRASS && (state.tiles.zone?.[index] ?? 0) === 0 && jitter(index, 17) < SHORE_WILLOW
    && touches(state, x, y, [TERRAIN_WATER, TERRAIN_SHALLOW])) {
    return treeAt(index, x, y, cfg, "willow");
  }
  return undefined;
}

/**
 * Every tree whose position is inside `box` (metres).
 *
 * Without a model, the wild trees only — the same conditions the instanced pass
 * has always used: no building, no road. With one, the city's whole list
 * (`treesFor`), which adds the trees a LOT plants: street trees, orchards and
 * a park's ring. A baked chunk that forgot any of the conditions would put a
 * tree through the middle of a house.
 */
export function treesIn(state, box, cfg = getConfig(), model = undefined) {
  const inside = (t) => t.x >= box.x0 && t.x < box.x1 && t.z >= box.z0 && t.z < box.z1;
  if (model) return treesFor(state, model, cfg).list.filter(inside);
  const tileM = cfg.tileM;
  const x0 = Math.max(0, Math.floor(box.x0 / tileM));
  const x1 = Math.min(state.width - 1, Math.ceil(box.x1 / tileM));
  const z0 = Math.max(0, Math.floor(box.z0 / tileM));
  const z1 = Math.min(state.height - 1, Math.ceil(box.z1 / tileM));
  const out = [];
  for (let y = z0; y <= z1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const tree = wildAt(state, x, y, y * state.width + x, cfg);
      if (tree && inside(tree)) out.push(tree);
    }
  }
  return out;
}

/** A tree a lot planted, at a point in metres. */
function lotTree(key, x, z, kind, base) {
  return {
    x, z, variant: TREE_KINDS.indexOf(kind), kind,
    scale: base + jitter(key, 5) * 0.2,
    spin: jitter(key, 13) * Math.PI * 2,
  };
}

/**
 * The back gardens of a small house lot (S5): per house, the strip between the
 * back of the house and the back of the lot, with a flower bed along the house,
 * a shed in the far corner and — on a third of lots — an orchard row across it
 * instead of the shed. Metres, in the world frame both passes share, so the
 * instanced pass and the baked street put them in one place.
 *
 * `at(u, v)` is a point in the strip: `u` across the house, `v` from the house
 * (0) to the back fence (1).
 */
export function backGardens(lot) {
  const b = lot.building;
  if (!b || b.zone !== 1 || (b.level ?? 0) > 2) return [];
  const orchard = jitter(b.id * 16, 2) < ORCHARD_SHARE;
  const turn = lot.frontage === 0 || lot.frontage === 2 ? 0 : Math.PI / 2;
  const out = [];
  const homes = houseLots(lot, b.level ?? 0).lots;
  for (const home of homes) {
    // To the back of the lot — or to the next house behind: a deep lot holds
    // one house behind another, and a strip to the lot's back put the front
    // house's shed inside the back one.
    const behind = homes.filter((o) => o !== home);
    const acrossX = (o) => o.x0 < home.x1 && o.x1 > home.x0;
    const acrossZ = (o) => o.z0 < home.z1 && o.z1 > home.z0;
    let at;
    let depth;
    if (lot.frontage === 0) {
      const end = Math.min(lot.z1, ...behind.filter((o) => acrossX(o) && o.z0 >= home.z1).map((o) => o.z0));
      depth = end - home.z1;
      at = (u, v) => ({ x: home.x0 + u * (home.x1 - home.x0), z: home.z1 + v * depth });
    } else if (lot.frontage === 2) {
      const end = Math.max(lot.z0, ...behind.filter((o) => acrossX(o) && o.z1 <= home.z0).map((o) => o.z1));
      depth = home.z0 - end;
      at = (u, v) => ({ x: home.x0 + u * (home.x1 - home.x0), z: home.z0 - v * depth });
    } else if (lot.frontage === 1) {
      const end = Math.max(lot.x0, ...behind.filter((o) => acrossZ(o) && o.x1 <= home.x0).map((o) => o.x1));
      depth = home.x0 - end;
      at = (u, v) => ({ x: home.x0 - v * depth, z: home.z0 + u * (home.z1 - home.z0) });
    } else {
      const end = Math.min(lot.x1, ...behind.filter((o) => acrossZ(o) && o.x0 >= home.x1).map((o) => o.x0));
      depth = end - home.x1;
      at = (u, v) => ({ x: home.x1 + v * depth, z: home.z0 + u * (home.z1 - home.z0) });
    }
    // A one-tile lot leaves about two metres behind the house: room for a bed
    // and a small shed (1.8 by 1.4 m in the kit) side by side, not for an
    // orchard tree, whose crown is five across. Those grow on the deep lots.
    if (depth < 1.2) continue;
    const width = home.frontageLen;
    out.push({
      at, depth, width, turn, index: home.houseIndex, id: b.id * 16 + home.houseIndex,
      orchard: orchard && depth >= 6,
      shed: !orchard && depth >= 1.8 && jitter(b.id * 16 + home.houseIndex, 229) < 0.5,
    });
  }
  return out;
}

/** The trees the city's lots plant (S5): a street tree on the pavement in front
 * of a shop, a row of three in a third of small houses' back gardens, and a
 * ring round a park that leaves its path clear. */
function lotTrees(model) {
  const out = [];
  for (const lot of model.lots) {
    const b = lot.building;
    if (!b) continue;
    const key = b.id * 16;
    if (b.zone === 2 && lot.facing !== false && lot.frontageLen >= 8) {
      const front = frontEdgeOf(lot);
      const door = doorPoint(front, OUTWARD[lot.frontage]);
      const ax = front.x1 - front.x0;
      const az = front.z1 - front.z0;
      const len = Math.hypot(ax, az) || 1;
      const shift = (jitter(key, 1) < 0.5 ? -1 : 1) * 0.32 * lot.frontageLen;
      out.push(lotTree(key, door.x + (ax / len) * shift, door.z + (az / len) * shift, "street", 0.62));
    }
    for (const garden of backGardens(lot)) {
      if (!garden.orchard) continue;
      [0.2, 0.5, 0.8].forEach((u, k) => {
        const p = garden.at(u, 0.5);
        out.push(lotTree(garden.id * 4 + k, p.x, p.z, "orchard", 0.55));
      });
    }
    if ((b.def ?? "") === "park") {
      const w = lot.x1 - lot.x0;
      const d = lot.z1 - lot.z0;
      // Near the fence and small: at full size a one-tile park's ring met in
      // the middle and hid its own lawn, benches and pond — a copse, not a park.
      const ix = w * 0.07;
      const iz = d * 0.07;
      const cx = (lot.x0 + lot.x1) / 2;
      const cz = (lot.z0 + lot.z1) / 2;
      // The path runs front to back through the middle, turned with the lot.
      const alongZ = lot.frontage === 0 || lot.frontage === 2;
      const clear = (x, z) => (alongZ ? Math.abs(x - cx) < w * 0.15 : Math.abs(z - cz) < d * 0.15);
      let k = 0;
      const edge = (ax, az, bx, bz) => {
        const n = Math.max(2, Math.round(Math.hypot(bx - ax, bz - az) / 9));
        for (let i = 0; i < n; i += 1) {
          const t = (i + 0.5) / n;
          const x = ax + (bx - ax) * t;
          const z = az + (bz - az) * t;
          k += 1;
          if (clear(x, z)) continue;
          out.push(lotTree(key + 7 + k, x, z, jitter(key + k, 19) < 0.5 ? "round" : "twin", 0.4));
        }
      };
      edge(lot.x0 + ix, lot.z0 + iz, lot.x1 - ix, lot.z0 + iz);
      edge(lot.x1 - ix, lot.z0 + iz, lot.x1 - ix, lot.z1 - iz);
      edge(lot.x1 - ix, lot.z1 - iz, lot.x0 + ix, lot.z1 - iz);
      edge(lot.x0 + ix, lot.z1 - iz, lot.x0 + ix, lot.z0 + iz);
    }
  }
  return out;
}

/** Every tree in the city, derived once per model: the instanced pass, the
 * street baker and the estimate all ask, every frame, and the answer changes
 * only when the world does — which is when there is a new model. */
const byModel = new WeakMap();
export function treesFor(state, model, cfg = getConfig()) {
  let found = byModel.get(model);
  if (found) return found;
  const list = [];
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const tree = wildAt(state, x, y, y * state.width + x, cfg);
      if (tree) list.push(tree);
    }
  }
  list.push(...lotTrees(model));
  found = { list, tileM: cfg.tileM };
  byModel.set(model, found);
  return found;
}
