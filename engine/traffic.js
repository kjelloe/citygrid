// Traffic: where people actually drive.
//
// `plan.md` §2.4 asks for monthly commuter flow (residents → jobs) assigned
// over the road graph with capacity-aware integer routing on a SAMPLED set of
// origin/destination pairs, replacing the reference implementation's broken
// random walk.
//
// The shape of the algorithm is chosen by the budget. A Dijkstra per
// origin/destination pair is the textbook answer and is far too slow: a
// saturated 128x128 region has thousands of homes and thousands of jobs, and
// even sampling a few hundred pairs means a few hundred searches a month.
//
// So it is inverted. ONE multi-source breadth-first sweep outward from every
// job tile builds a distance field over the whole road network — O(road tiles),
// once. Then each sampled home walks DOWNHILL through that field to the nearest
// work, adding its load to every tile it crosses. Total cost is
// O(road tiles + samples × route length), which is a few tens of thousands of
// integer operations a month rather than a few million.
//
// What this buys, in the design's terms (§8.4): shortest available routes,
// destination attractiveness (more jobs on a tile pull the field harder), and
// road capacity (load above capacity is congestion). What it does not model is
// route choice under congestion — everyone takes the shortest path even when it
// is full. That is the honest limitation of a distance field, it is recorded in
// `playtest-notes.md`, and it is why congestion here reads as "this road is
// over capacity" rather than "traffic rerouted around it".

import { registerMonthly } from "./reducer.js";
import { rules } from "./rules.js";
import { idiv, clamp } from "../shared/idiv.js";
import { tileAt, xOf, yOf, DIR4 } from "../shared/grid.js";
import { hasNet } from "./network.js";
// `new` is not allowed in engine/ (ruling 004); scratch arrays come from here.
import { i32 } from "../shared/arrays.js";
import { ZONE_RESIDENTIAL, ZONE_COMMERCIAL, ZONE_INDUSTRIAL } from "./constants.js";

/** Not reachable. Chosen rather than -1 so the downhill walk can compare
 * without a special case on every neighbour. */
var UNREACHABLE = 0x3fffffff;

function isRoad(state, index) {
  return hasNet(state.tiles.road[index]);
}

/** A tile is a job if a commercial or industrial building stands on it. The
 * field is seeded from the ROAD tiles beside those buildings, because people
 * drive on roads and not through factories. */
function seedJobs(state, distance, queue) {
  var count = 0;
  var i;
  for (i = 0; i < state.buildings.length; i += 1) {
    var building = state.buildings[i];
    if (building.zone !== ZONE_COMMERCIAL && building.zone !== ZONE_INDUSTRIAL) continue;
    var dx;
    var dy;
    var d;
    for (dy = -1; dy <= building.h; dy += 1) {
      for (dx = -1; dx <= building.w; dx += 1) {
        var nx = building.x + dx;
        var ny = building.y + dy;
        if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
        var index = tileAt(state.width, nx, ny);
        if (!isRoad(state, index)) continue;
        // Distance zero, and a job tile reached from two workplaces is still
        // distance zero — attractiveness is expressed by how MANY homes end up
        // walking here, not by making the field negative.
        if (distance[index] === 0) continue;
        distance[index] = 0;
        queue[count] = index;
        count += 1;
      }
    }
  }
  return count;
}

/** One sweep outward from every job at once. This is the whole cost of routing. */
function sweep(state, distance, queue, seeded) {
  var head = 0;
  var tail = seeded;
  var width = state.width;
  var height = state.height;
  while (head < tail) {
    var index = queue[head];
    head += 1;
    var x = xOf(width, index);
    var y = yOf(width, index);
    var next = distance[index] + 1;
    var d;
    for (d = 0; d < 4; d += 1) {
      var nx = x + DIR4[d].dx;
      var ny = y + DIR4[d].dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      var neighbourIndex = tileAt(width, nx, ny);
      if (!isRoad(state, neighbourIndex)) continue;
      if (distance[neighbourIndex] <= next) continue;
      distance[neighbourIndex] = next;
      queue[tail] = neighbourIndex;
      tail += 1;
    }
  }
}

/** A road tile beside this building, or -1 if it has no road access at all —
 * which is itself the answer to "why does nobody live here". */
function roadBeside(state, building) {
  var dx;
  var dy;
  for (dy = -1; dy <= building.h; dy += 1) {
    for (dx = -1; dx <= building.w; dx += 1) {
      var nx = building.x + dx;
      var ny = building.y + dy;
      if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
      var index = tileAt(state.width, nx, ny);
      if (isRoad(state, index)) return index;
    }
  }
  return -1;
}

/** Walk downhill to work, laying load on every tile crossed.
 *
 * Returns the number of tiles travelled, which is the commute length the
 * satisfaction and land-value effects care about. */
function drive(state, distance, load, from, weight, limit) {
  var index = from;
  var steps = 0;
  var width = state.width;
  var height = state.height;
  while (steps < limit) {
    load[index] += weight;
    if (distance[index] === 0) return steps;
    var x = xOf(width, index);
    var y = yOf(width, index);
    var best = -1;
    var bestDistance = distance[index];
    var d;
    for (d = 0; d < 4; d += 1) {
      var nx = x + DIR4[d].dx;
      var ny = y + DIR4[d].dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      var neighbourIndex = tileAt(width, nx, ny);
      if (!isRoad(state, neighbourIndex)) continue;
      if (distance[neighbourIndex] < bestDistance) {
        bestDistance = distance[neighbourIndex];
        best = neighbourIndex;
      }
    }
    // No neighbour is closer: this home cannot reach any work by road.
    if (best < 0) return -1;
    index = best;
    steps += 1;
  }
  return -1;
}

export function trafficPass(state) {
  var events = [];
  var config = rules().traffic;
  var count = state.width * state.height;
  var i;

  // Fade what was there. Traffic is a monthly average, not a permanent mark on
  // the road, and without decay a street that was busy once stays busy forever.
  for (i = 0; i < count; i += 1) {
    state.tiles.traffic[i] = idiv(state.tiles.traffic[i] * config.decayPercent, 100);
  }

  if (state.buildings.length === 0) return events;

  var distance = i32(count);
  for (i = 0; i < count; i += 1) distance[i] = UNREACHABLE;
  var queue = i32(count);
  var seeded = seedJobs(state, distance, queue);
  if (seeded === 0) return events;
  sweep(state, distance, queue, seeded);

  var load = i32(count);
  var commuters = 0;
  var stranded = 0;
  var totalLength = 0;
  var routed = 0;

  for (i = 0; i < state.buildings.length; i += 1) {
    var home = state.buildings[i];
    if (home.zone !== ZONE_RESIDENTIAL) continue;
    if (home.occupancy <= 0) continue;
    var start = roadBeside(state, home);
    if (start < 0) { stranded += 1; continue; }
    if (distance[start] >= UNREACHABLE) { stranded += 1; continue; }
    // One car per so many residents: this is the sampling. Every home is
    // routed, but each contributes a load proportional to its size rather than
    // one route per commuter, which is what keeps the cost linear in BUILDINGS
    // rather than in people.
    var weight = 1 + idiv(home.occupancy, config.residentsPerCar);
    var length = drive(state, distance, load, start, weight, config.maxCommute);
    if (length < 0) { stranded += 1; continue; }
    commuters += weight;
    totalLength += length;
    routed += 1;
  }

  // Load to the traffic layer, scaled against capacity. 255 means "at or over
  // capacity", so the overlay's bands mean the same thing at every city size.
  var congested = 0;
  for (i = 0; i < count; i += 1) {
    if (load[i] === 0) continue;
    var level = clamp(idiv(load[i] * 255, config.roadCapacity), 0, 255);
    if (level > state.tiles.traffic[i]) state.tiles.traffic[i] = level;
    if (level >= config.congestedAt) {
      congested += 1;
      // Traffic pollutes. This is the connection to the rest of the simulation
      // — a congested street is a worse place to live, through the pollution
      // layer that land value already reads, rather than through a private
      // traffic penalty nothing else can see.
      state.tiles.pollution[i] = clamp(
        state.tiles.pollution[i] + config.congestionPollution, 0, 255,
      );
    }
  }

  state.traffic.commuters = commuters;
  state.traffic.congested = congested;
  state.traffic.stranded = stranded;
  state.traffic.averageCommute = routed > 0 ? idiv(totalLength, routed) : 0;

  if (congested > config.congestionAlertTiles) {
    events.push({ kind: "congestion", tiles: congested });
  }
  if (stranded > 0 && stranded >= idiv(routed + stranded, 4)) {
    // A quarter of homes with no route to work is a road network problem the
    // player can actually fix, and is worth saying out loud.
    events.push({ kind: "noRouteToWork", homes: stranded });
  }
  return events;
}

// Before civic (10), so land value and desirability are computed against THIS
// month's traffic rather than last month's.
registerMonthly("traffic", trafficPass, 5);
