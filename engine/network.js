// Roads, wires and pipes: placement, auto-connect and removal.
//
// A network tile stores its own 4-neighbour adjacency mask (north 1, east 2,
// south 4, west 8) plus a present bit, so the renderer picks one of sixteen
// shapes from the tile value alone and never recomputes connectivity.

import { RESULT } from "../shared/protocol.js";
import { tileAt, xOf, yOf, DIR4, neighbour, decodeRuns, inBounds } from "../shared/grid.js";
import { isWater } from "./terrain.js";
import { canDemolish, canConnectAcross } from "./permissions.js";
import { buildCost, rules } from "./rules.js";
import { stage, charge, reject, peek } from "./transaction.js";
import { TERRAIN_FOREST, TERRAIN_ROCK, OWNER_NATURE } from "./constants.js";

/** Present bit, above the four adjacency bits. A tile is "there" even when it
 * connects to nothing, which is why presence is not just mask != 0. */
export var NET_PRESENT = 16;

/** The road's KIND, above the presence bit (T1a, A60). A road layer value is
 * four adjacency bits, `NET_PRESENT`, and this — so everything that reads
 * `hasNet` is unchanged and an avenue is a road that happens to be wider.
 *
 * The layer is a `u8`, so 64 and 128 are still free for whatever T2 needs. */
export var NET_AVENUE = 32;

/** Bits above the mask that belong to the TILE rather than to its shape, and
 * which `reshape` must therefore carry: the kind. Without this an avenue
 * forgets what it is the moment a neighbour is laid beside it. */
var NET_KEEP = NET_AVENUE;

export function isAvenue(value) {
  return (value & NET_AVENUE) !== 0;
}

export function hasNet(value) {
  return (value & NET_PRESENT) !== 0;
}

export function maskOf(value) {
  return value & 15;
}

/** The layer a network command writes, and what it costs. */
export var NETWORKS = {
  road: { layer: "road", cost: "road", waterCost: "roadOverWater" },
  // A second road kind, and a second price (T1a). Same layer, same shape rule,
  // same permission — a bit and a cost is the whole of it in the engine.
  avenue: { layer: "road", cost: "avenue", waterCost: "avenueOverWater", bits: NET_AVENUE },
  wire: { layer: "wire", cost: "wire", waterCost: "wireOverWater" },
  pipe: { layer: "pipe", cost: "pipe", waterCost: "pipeOverWater" },
  // The third kind (T2, A66). It shares a tile with a road — that is a level
  // crossing — and never with a building. Until G1 it was the only kind that
  // refused one (`clearOfBuildings` on this line alone, Q116); every kind
  // refuses one now, so the rule is in `placeNetwork` and the spec says
  // nothing about it.
  rail: { layer: "rail", cost: "rail", waterCost: "railOverWater" },
};

/** Is there a road within `development.roadAccessRadius` of this rectangle?
 *
 * Here rather than in `development.js` since T2, because the gate rules ask it
 * too and `development.js` reads the gates' demand terms — one of the two had
 * to move or the import graph grows a cycle (CLAUDE.md: acyclic imports). */
export function hasRoadAccess(state, x, y, w, h) {
  var radius = rules().development.roadAccessRadius;
  for (var dy = -radius; dy < h + radius; dy += 1) {
    for (var dx = -radius; dx < w + radius; dx += 1) {
      var inside = dx >= 0 && dy >= 0 && dx < w && dy < h;
      if (inside) continue;
      var nx = x + dx;
      var ny = y + dy;
      if (!inBounds(state.width, state.height, nx, ny)) continue;
      if (hasNet(state.tiles.road[tileAt(state.width, nx, ny)])) return true;
    }
  }
  return false;
}

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
  // The kind is the tile's own and survives every reshape; the mask is not.
  var keep = peek(tx, index, layer) & NET_KEEP;
  stage(tx, index, layer, NET_PRESENT | mask | keep);
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

/** Are these two tiles four-neighbours? A run's cells arrive in order, so the
 * grade along a street is the step between consecutive ones — and a run that
 * jumps (two separate strokes in one command) has no grade between them. */
function isAdjacent(state, a, b) {
  var ax = xOf(state.width, a);
  var ay = yOf(state.width, a);
  var bx = xOf(state.width, b);
  var by = yOf(state.width, b);
  var dx = ax > bx ? ax - bx : bx - ax;
  var dy = ay > by ? ay - by : by - ay;
  return dx + dy === 1;
}

/** Does this run cross water in a way a bridge can be built over (S13, A84)?
 *
 * The engine has always allowed a road over water and charged
 * `build.roadOverWater` for it; A84 believed otherwise, because no 64x64 deputy
 * city had ever paved one, and H7's played 96 has ten road tiles standing on
 * shallow water (A111). So the rule is not permission. It is:
 *
 *   - a crossing may be at most `build.bridgeSpan` tiles of water long, and
 *   - it must reach dry land at BOTH ends — a pier is not a bridge, and a road
 *     that stops in the river leaves the far bank where it was.
 *
 * Answered as a result code rather than silently, because the player is looking
 * at the water they just tried to pave.
 */
function crossingRefusal(state, indices) {
  var span = rules().build.bridgeSpan;
  var run = 0;
  for (var i = 0; i < indices.length; i += 1) {
    var wet = isWater(state.tiles.terrain[indices[i]]);
    if (!wet) { run = 0; continue; }
    // A crossing has to START from land: the first cell of the run cannot be
    // water, or the road begins in the river.
    if (i === 0) return RESULT.INVALID;
    run += 1;
    if (run > span) return RESULT.INVALID;
    // And it has to END on land, which is the next cell of the run — a run
    // that finishes wet is a pier.
    if (i === indices.length - 1) return RESULT.INVALID;
    // Cells arrive in order; a jump to a non-neighbour is a second stroke in
    // one command, and the water either side of the jump is two crossings.
    if (!isAdjacent(state, indices[i - 1], indices[i])) return RESULT.INVALID;
  }
  return RESULT.OK;
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

  // The crossing rule is about the RUN rather than about a tile, so it is asked
  // once before the loop that stages them (S13) — and only of the ROAD layer. A
  // bridge is what carries a vehicle and a person; a cable and a pipe cross
  // water on their own terms and always have, which is what `wireOverWater` and
  // `pipeOverWater` are, and the deputy's carrier search crosses a river every
  // time it joins two banks to one grid. A rail crossing is a bridge too and is
  // left for the slice that draws one.
  if (spec.layer === "road") {
    var crossing = crossingRefusal(state, indices);
    if (crossing !== RESULT.OK) {
      reject(tx, crossing);
      return;
    }
  }

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
    // And not up a cliff (J3, A112). Era 20 put the slope rule in `canZone` and
    // this never got it, so the city stayed off the steep ground and the STREETS
    // did not — on a played `hilly` 128 the deputy paves a 500% hillside to
    // reach the next flat patch, and 218 of 612 corridors came out steeper than
    // any grading can flatten.
    //
    // Along the RUN, not in every direction. A lot refuses ground too rough to
    // stand on, which is `slopeAt`'s max step to any neighbour; a road refuses a
    // CLIMB too steep to drive, and a street running along a contour across a
    // hillside has a gentle grade and a steep neighbour. The first cut used
    // `slopeAt` and took a played `hilly` city from 1,872 residents to 217,
    // because most of a hill is beside something steep.
    //
    // Water is exempt: a water tile's elevation is its BED, and a crossing is
    // S13's question (A111) rather than a grade.
    if (i > 0 && isAdjacent(state, indices[i - 1], index)
      && !isWater(terrain) && !isWater(state.tiles.terrain[indices[i - 1]])) {
      var rise = state.tiles.elevation[index] - state.tiles.elevation[indices[i - 1]];
      if (rise < 0) rise = -rise;
      if (rise > rules().development.maxRoadSlope) {
        reject(tx, RESULT.TOO_STEEP);
        return;
      }
    }
    // A line through a building is not a level crossing (A66, and A85 for the
    // other three kinds). It is checked before ownership on purpose: a player
    // burying their OWN park under a road was the old behaviour, so the answer
    // has to be the one that says what to do about it rather than a permission
    // code (G1).
    if (state.tiles.buildingId[index] !== 0) {
      reject(tx, RESULT.NEEDS_BULLDOZE);
      return;
    }

    // Crossing someone's land needs consent even when the surface is theirs to
    // keep — the road belongs to the builder, the ground does not.
    var permitted = canConnectAcross(state, tx.actor, index);
    if (permitted !== RESULT.OK) {
      reject(tx, permitted);
      return;
    }

    var already = peek(tx, index, spec.layer);
    if (hasNet(already)) {
      // Already there: free — UNLESS this is a wider kind over a plain one
      // (T1a). Upgrading a street to an avenue is the gesture a player reaches
      // for on the road their traffic is actually using, and it is what makes
      // the kind worth having: the deputy's first avenue, laid on fresh ground
      // at the town's edge, carried exactly zero commuters on four played
      // cities. It costs the avenue's own price, because it is a rebuild.
      if (spec.bits && (already & spec.bits) !== spec.bits) {
        charge(tx, buildCost(state, spec.cost));
        stage(tx, index, spec.layer, already | spec.bits);
        placed.push(index);
      }
      continue;
    }

    // The kind goes on before the shape does, so `reshape` has it to carry.
    if (spec.bits) stage(tx, index, spec.layer, peek(tx, index, spec.layer) | spec.bits);

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
