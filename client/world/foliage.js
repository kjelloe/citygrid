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
import { TERRAIN_FOREST, NET_PRESENT } from "../constants-mirror.js";

/** The species a tree can be. Not a variant number: the L3 kit builds a
 * different SHAPE for each, and a name is what a reader can check. */
export const TREE_KINDS = ["conifer", "round", "twin"];

/**
 * The tree on one tile, in metres.
 *
 * The seeds are the ones `instances.js` has used since V3 — 3, 5, 7, 11, 13 —
 * so nothing moves now that the answer lives in one place.
 */
export function treeAt(index, x, y, cfg = getConfig()) {
  const tileM = cfg.tileM;
  const variant = Math.floor(jitter(index, 3) * TREE_KINDS.length) % TREE_KINDS.length;
  return {
    x: (x + 0.2 + jitter(index, 7) * 0.6) * tileM,
    z: (y + 0.2 + jitter(index, 11) * 0.6) * tileM,
    variant,
    kind: TREE_KINDS[variant],
    scale: 0.72 + jitter(index, 5) * 0.6,
    spin: jitter(index, 13) * Math.PI * 2,
  };
}

/**
 * Every tree whose tile centre is inside `box` (metres).
 *
 * The same three conditions the instanced pass has always used: forest terrain,
 * no building, no road. A baked chunk that forgot any of them would put a tree
 * through the middle of a house.
 */
export function treesIn(state, box, cfg = getConfig()) {
  const tileM = cfg.tileM;
  const x0 = Math.max(0, Math.floor(box.x0 / tileM));
  const x1 = Math.min(state.width - 1, Math.ceil(box.x1 / tileM));
  const z0 = Math.max(0, Math.floor(box.z0 / tileM));
  const z1 = Math.min(state.height - 1, Math.ceil(box.z1 / tileM));
  const out = [];
  for (let y = z0; y <= z1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const index = y * state.width + x;
      if (state.tiles.terrain[index] !== TERRAIN_FOREST) continue;
      if (state.tiles.buildingId[index] !== 0) continue;
      if ((state.tiles.road[index] & NET_PRESENT) !== 0) continue;
      const tree = treeAt(index, x, y, cfg);
      if (tree.x < box.x0 || tree.x >= box.x1 || tree.z < box.z0 || tree.z >= box.z1) continue;
      out.push(tree);
    }
  }
  return out;
}
