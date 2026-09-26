// The Outside: gate buildings, not a second simulation (slice T2, A65).
//
// Beyond the map is modelled as a handful of buildings whose catalogue entry
// carries a `gate` field. When one is LIVE it does three things and no more:
// it adds integer terms to the regional demand pool, it seeds the commuter
// field as a sink, and it takes a fare from the residents within its range.
//
// None of it is state. Liveness is a flood over `tiles.rail` from the map's
// edge, recomputed on every ask — a line that is cut is a station that is dead
// the same month, with no record to keep in step and nothing to migrate. The
// flood is one pass over the layer per call, from EVERY edge rail tile inward,
// so the cost does not grow with the number of stations.
//
// `hashState` must be unable to see any of this: ask twice and the state is
// byte-identical (`test/rail.test.js`).

import { rules } from "./rules.js";
import { definition } from "./catalogue.js";
import { tileAt, xOf, yOf, DIR4, neighbour } from "./../shared/grid.js";
import { u8, i32 } from "../shared/arrays.js";
import { hasNet, hasRoadAccess } from "./network.js";
import { waterBodies, bodyAt } from "./terrain.js";
import { FLAG_POWERED, ZONE_RESIDENTIAL } from "./constants.js";

/** Which tiles of the rail layer are joined to a map edge.
 *
 * A `u8` per tile: 1 where a rail tile is part of a run that touches the edge.
 * Seeded from every edge rail tile at once rather than flooded per station,
 * because a city with six stations on one line would otherwise flood the same
 * network six times.
 */
export function railReach(state) {
  var width = state.width;
  var height = state.height;
  var total = width * height;
  var mark = u8(total);
  var queue = i32(total);
  var count = 0;
  var x;
  var y;
  var i;

  for (x = 0; x < width; x += 1) {
    var top = tileAt(width, x, 0);
    if (hasNet(state.tiles.rail[top]) && mark[top] === 0) { mark[top] = 1; queue[count] = top; count += 1; }
    var bottom = tileAt(width, x, height - 1);
    if (hasNet(state.tiles.rail[bottom]) && mark[bottom] === 0) { mark[bottom] = 1; queue[count] = bottom; count += 1; }
  }
  for (y = 0; y < height; y += 1) {
    var left = tileAt(width, 0, y);
    if (hasNet(state.tiles.rail[left]) && mark[left] === 0) { mark[left] = 1; queue[count] = left; count += 1; }
    var right = tileAt(width, width - 1, y);
    if (hasNet(state.tiles.rail[right]) && mark[right] === 0) { mark[right] = 1; queue[count] = right; count += 1; }
  }

  var head = 0;
  while (head < count) {
    var index = queue[head];
    head += 1;
    var cx = xOf(width, index);
    var cy = yOf(width, index);
    for (i = 0; i < DIR4.length; i += 1) {
      var n = neighbour(width, height, cx, cy, DIR4[i]);
      if (n < 0 || mark[n] !== 0) continue;
      if (!hasNet(state.tiles.rail[n])) continue;
      mark[n] = 1;
      queue[count] = n;
      count += 1;
    }
  }
  return mark;
}

/** Does any tile of the ring around this building's footprint carry rail that
 * reaches an edge? `reach` may be omitted, at the cost of a flood per call. */
function lineFrom(state, building, reach) {
  var marks = reach ? reach : railReach(state);
  var dx;
  var dy;
  for (dy = -1; dy <= building.h; dy += 1) {
    for (dx = -1; dx <= building.w; dx += 1) {
      var nx = building.x + dx;
      var ny = building.y + dy;
      if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
      if (marks[tileAt(state.width, nx, ny)] === 1) return true;
    }
  }
  return false;
}

/** Is any tile of the footprint powered? */
function powered(state, building) {
  var dx;
  var dy;
  for (dy = 0; dy < building.h; dy += 1) {
    for (dx = 0; dx < building.w; dx += 1) {
      var index = tileAt(state.width, building.x + dx, building.y + dy);
      if ((state.tiles.flags[index] & FLAG_POWERED) !== 0) return true;
    }
  }
  return false;
}

/** Does this building touch a rail tile at all, reaching the edge or not?
 * The placement rule — `needsRail` — asks this and nothing else, because a
 * line that does not reach the edge is a station a player may build and then
 * finish the line to. */
export function touchesRail(state, x, y, w, h) {
  var dx;
  var dy;
  for (dy = -1; dy <= h; dy += 1) {
    for (dx = -1; dx <= w; dx += 1) {
      var nx = x + dx;
      var ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
      if (hasNet(state.tiles.rail[tileAt(state.width, nx, ny)])) return true;
    }
  }
  return false;
}

/**
 * Whether a gate is open, and if not, which of the three reasons it is not.
 *
 * `{ gate, live, reason }`, with `reason` one of `""`, `"noLine"`,
 * `"unpowered"`, `"noRoad"` — or `undefined` for a building that is not a gate
 * at all. The order is the order a player would fix them in: a station with no
 * line is not yet a station, one with no power has not been connected, one
 * with no road is finished but unreachable.
 */
export function gateStatus(state, building, reach) {
  if (!building) return undefined;
  var def = definition(building.def);
  if (!def || !def.gate) return undefined;
  // The WAY OUT first, and it is different for each kind of gate: a rail line
  // that reaches the edge, or a body of water that does. It comes before the
  // power and the road because it is the one a player cannot fix by building
  // something else — a terminal on a lake is in the wrong place, not
  // unfinished (T4, A68).
  if (def.gate === "sea") {
    var body = bodyAt(state, waterBodies(state), building.x, building.y, building.w, building.h);
    if (!body || !body.edge) return { gate: def.gate, live: false, reason: "noSea" };
  } else if (!lineFrom(state, building, reach)) {
    return { gate: def.gate, live: false, reason: "noLine" };
  }
  if (!powered(state, building)) return { gate: def.gate, live: false, reason: "unpowered" };
  if (!hasRoadAccess(state, building.x, building.y, building.w, building.h)) {
    return { gate: def.gate, live: false, reason: "noRoad" };
  }
  return { gate: def.gate, live: true, reason: "" };
}

/** The demand the Outside adds this month: the terms of every live gate. */
export function gateTerms(state) {
  var out = { residential: 0, commercial: 0, industrial: 0 };
  var config = rules().gate;
  var reach = railReach(state);
  for (var i = 0; i < state.buildings.length; i += 1) {
    var status = gateStatus(state, state.buildings[i], reach);
    if (!status || !status.live) continue;
    var terms = config[status.gate];
    if (!terms) continue;
    out.residential += terms.residential;
    out.commercial += terms.commercial;
    out.industrial += terms.industrial;
  }
  return out;
}

/** This seat's fare income: every resident within a live gate's range pays it
 * once. A resident in range of two gates pays twice — two doors out of the
 * region are worth more than one, and the alternative is a nearest-gate walk
 * over every home every month. */
export function gateFare(state, seat) {
  var config = rules().gate;
  var reach = railReach(state);
  var total = 0;
  var i;
  var k;
  for (i = 0; i < state.buildings.length; i += 1) {
    var gate = state.buildings[i];
    if (gate.owner !== seat) continue;
    var status = gateStatus(state, gate, reach);
    if (!status || !status.live) continue;
    var terms = config[status.gate];
    if (!terms) continue;
    var cx = gate.x + (gate.w >> 1);
    var cy = gate.y + (gate.h >> 1);
    for (k = 0; k < state.buildings.length; k += 1) {
      var home = state.buildings[k];
      if (home.zone !== ZONE_RESIDENTIAL || home.occupancy <= 0) continue;
      var dx = home.x - cx;
      var dy = home.y - cy;
      if (dx < 0) dx = -dx;
      if (dy < 0) dy = -dy;
      if (dx + dy > terms.range) continue;
      total += home.occupancy * terms.farePerResident;
    }
  }
  return total;
}
