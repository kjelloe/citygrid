// Roads, wires and pipes: placement, auto-connect and removal.
//
// A network tile stores its own 4-neighbour adjacency mask (north 1, east 2,
// south 4, west 8) plus a present bit, so the renderer picks one of sixteen
// shapes from the tile value alone and never recomputes connectivity.

import { RESULT } from "../shared/protocol.js";
import { tileAt, xOf, yOf, DIR4, neighbour, decodeRuns } from "../shared/grid.js";
import { isWater, isBuildable } from "./terrain.js";
import { canBuildOn, canDemolish, canConnectAcross } from "./permissions.js";
import { buildCost } from "./rules.js";
import { stage, charge, reject, peek, failed } from "./transaction.js";
import { TERRAIN_FOREST, TERRAIN_ROCK, OWNER_NATURE } from "./constants.js";

/** Present bit, above the four adjacency bits. A tile is "there" even when it
 * connects to nothing, which is why presence is not just mask != 0. */
export var NET_PRESENT = 16;

export function hasNet(value) {
  return (value & NET_PRESENT) !== 0;
}

export function maskOf(value) {
  return value & 15;
}

/** The layer a network command writes, and what it costs. */
export var NETWORKS = {
  road: { layer: "road", cost: "road", waterCost: "roadOverWater" },
  wire: { layer: "wire", cost: "wire", waterCost: "wireOverWater" },
  pipe: { layer: "pipe", cost: "pipe", waterCost: "pipeOverWater" },
};

/** Recomputes one tile's shape from its neighbours, reading through the
 * transaction so a tile placed earlier in the same drag is already visible. */
function reshape(tx, index, layer) {
  var state = tx.state;
  var width = state.width;
  var x = xOf(width, index);
  var y = yOf(width, index);
  var mask = 0;
  for (var d = 0; d < DIR4.length; d += 1) {
    var n = neighbour(width, state.height, x, y, DIR4[d]);
    if (n < 0) continue;
    if (hasNet(peek(tx, n, layer))) mask |= 1 << d;
  }
  stage(tx, index, layer, NET_PRESENT | mask);
}

/** After a tile changes, its four neighbours must re-examine themselves — this
 * is what makes a corner become a corner when the next tile arrives. */
function reshapeNeighbours(tx, index, layer) {
  var state = tx.state;
  var x = xOf(state.width, index);
  var y = yOf(state.width, index);
  for (var d = 0; d < DIR4.length; d += 1) {
    var n = neighbour(state.width, state.height, x, y, DIR4[d]);
    if (n < 0) continue;
    if (hasNet(peek(tx, n, layer))) reshape(tx, n, layer);
  }
}

export function placeNetwork(tx, kind, indices) {
  var spec = NETWORKS[kind];
  if (!spec) {
    reject(tx, RESULT.INVALID);
    return;
  }
  var state = tx.state;
  var placed = [];
  var i;

  for (i = 0; i < indices.length; i += 1) {
    var index = indices[i];
    if (index < 0 || index >= state.width * state.height) {
      reject(tx, RESULT.INVALID);
      return;
    }
    var terrain = state.tiles.terrain[index];
    if (terrain === TERRAIN_ROCK) {
      reject(tx, RESULT.INVALID);
      return;
    }

    // Crossing someone's land needs consent even when the surface is theirs to
    // keep — the road belongs to the builder, the ground does not.
    var permitted = canConnectAcross(state, tx.actor, index);
    if (permitted !== RESULT.OK) {
      reject(tx, permitted);
      return;
    }

    if (hasNet(peek(tx, index, spec.layer))) continue; // already there: free

    var water = isWater(terrain);
    charge(tx, buildCost(state, water ? spec.waterCost : spec.cost));
    if (!water && terrain === TERRAIN_FOREST) charge(tx, buildCost(state, "clearForest"));

    // Building claims unowned ground for the builder. This is the moment
    // ownership is created, and it is why the owner layer exists from the very
    // first placement command rather than being retrofitted.
    if (state.tiles.owner[index] === OWNER_NATURE) {
      stage(tx, index, "owner", tx.actor);
    }
    placed.push(index);
  }

  for (i = 0; i < placed.length; i += 1) reshape(tx, placed[i], spec.layer);
  for (i = 0; i < placed.length; i += 1) reshapeNeighbours(tx, placed[i], spec.layer);
}

export function removeNetwork(tx, kind, indices) {
  var spec = NETWORKS[kind];
  if (!spec) {
    reject(tx, RESULT.INVALID);
    return;
  }
  var state = tx.state;
  var removed = [];
  for (var i = 0; i < indices.length; i += 1) {
    var index = indices[i];
    if (!hasNet(peek(tx, index, spec.layer))) continue;
    var permitted = canDemolish(state, tx.actor, index);
    if (permitted !== RESULT.OK) {
      reject(tx, permitted);
      return;
    }
    stage(tx, index, spec.layer, 0);
    removed.push(index);
  }
  for (var k = 0; k < removed.length; k += 1) reshapeNeighbours(tx, removed[k], spec.layer);
  return removed.length;
}

/** Expands a run-length encoded cell list, refusing anything out of bounds or
 * absurdly large before a single tile is touched. */
export function cellsFromRuns(state, runs, limit) {
  if (!runs || runs.length % 2 !== 0) return undefined;
  var total = 0;
  for (var i = 1; i < runs.length; i += 2) {
    if (runs[i] <= 0) return undefined;
    total += runs[i];
  }
  if (total === 0 || total > limit) return undefined;
  var indices = decodeRuns(runs);
  var count = state.width * state.height;
  for (var k = 0; k < indices.length; k += 1) {
    if (indices[k] < 0 || indices[k] >= count) return undefined;
  }
  return indices;
}
