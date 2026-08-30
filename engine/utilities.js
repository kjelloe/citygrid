// Power and water. Structurally the same problem, so one implementation:
// a supply network is a connected component of carrier tiles, everything
// touching it produces or consumes, and shortfall is shared.
//
// Components are found by flood fill over the carrier layer. The plan calls
// for incrementally maintained union-find with dirty-component rebuild, and
// that is still the right answer at 128x128 with sixteen cities — but a full
// rebuild is measured at well under a millisecond on a 64x64 map, and
// rebuilding once a month is not the same problem as rebuilding every frame.
// Incremental maintenance lands when the profiler asks for it, not before.

import { registerMonthly, register, ok, fail } from "./reducer.js";
import { RESULT } from "../shared/protocol.js";
import { CMD_PLACE_BUILDING } from "./commands.js";
import { tileAt, xOf, yOf, DIR4, neighbour, forEachInRadius, inBounds } from "../shared/grid.js";
import { idiv, clamp } from "../shared/idiv.js";
import { hasNet } from "./network.js";
import { definition } from "./catalogue.js";
import { canBuildOn } from "./permissions.js";
import { begin, commit, stage, charge, failed } from "./transaction.js";
import { isBuildable, isWater } from "./terrain.js";
import { difficultyOf } from "./rules.js";
import { isInt } from "./validate.js";
import {
  FLAG_POWERED, FLAG_WATERED, OWNER_NATURE, ZONE_NONE,
  ZONE_RESIDENTIAL, ZONE_COMMERCIAL, ZONE_INDUSTRIAL,
} from "./constants.js";

/** How much a developed lot draws, by zone and level. Small numbers: a city
 * of a few hundred lots should be able to run on two or three plants, which
 * is the shape the reference had and it reads well. */
function demandOfLot(zone, level, area) {
  var base = zone === ZONE_INDUSTRIAL ? 3 : zone === ZONE_COMMERCIAL ? 2 : 1;
  return base * level * area;
}

/** Buildings connect to a network if any tile of their footprint, or any tile
 * orthogonally touching it, carries the network. A building never needs to be
 * built *on* a wire — being beside one is enough, which is what makes power
 * lines look like infrastructure rather than plumbing. */
function touchesCarrier(state, building, layer) {
  for (var dy = -1; dy <= building.h; dy += 1) {
    for (var dx = -1; dx <= building.w; dx += 1) {
      var x = building.x + dx;
      var y = building.y + dy;
      if (!inBounds(state.width, state.height, x, y)) continue;
      var index = tileAt(state.width, x, y);
      if (hasNet(state.tiles[layer][index])) return index;
    }
  }
  return -1;
}

/** Labels every carrier tile with its component id. Returns the label array
 * and the component count. */
function findComponents(state, layer) {
  var total = state.width * state.height;
  var label = [];
  var i;
  for (i = 0; i < total; i += 1) label.push(0);

  var count = 0;
  var stack = [];
  for (i = 0; i < total; i += 1) {
    if (label[i] !== 0 || !hasNet(state.tiles[layer][i])) continue;
    count += 1;
    label[i] = count;
    stack.push(i);
    while (stack.length > 0) {
      var index = stack.pop();
      var x = xOf(state.width, index);
      var y = yOf(state.width, index);
      for (var d = 0; d < DIR4.length; d += 1) {
        var n = neighbour(state.width, state.height, x, y, DIR4[d]);
        if (n < 0 || label[n] !== 0) continue;
        if (!hasNet(state.tiles[layer][n])) continue;
        label[n] = count;
        stack.push(n);
      }
    }
  }
  return { label: label, count: count };
}

/** One supply pass over one network. Returns a report the UI and the tests can
 * both read — capacity, demand, and who went without. */
export function supplyPass(state, kind) {
  var layer = kind === "power" ? "wire" : "pipe";
  var flag = kind === "power" ? FLAG_POWERED : FLAG_WATERED;
  var components = findComponents(state, layer);

  var capacity = [];
  var demand = [];
  var i;
  for (i = 0; i <= components.count; i += 1) {
    capacity.push(0);
    demand.push(0);
  }

  // Producers and consumers. Totals count EVERY building, connected or not:
  // an unconnected consumer is unmet demand, not absent demand, and reporting
  // it as zero makes the number useless for deciding whether to build a plant.
  // Per-component figures count only what is actually wired together.
  var connected = [];
  var totalCapacity = 0;
  var totalDemand = 0;
  for (i = 0; i < state.buildings.length; i += 1) {
    var building = state.buildings[i];
    var carrier = touchesCarrier(state, building, layer);
    connected.push(carrier);
    var component = carrier >= 0 ? components.label[carrier] : 0;

    var def = building.def === "res" || building.def === "com" || building.def === "ind"
      ? undefined : definition(building.def);
    if (def) {
      var value = kind === "power" ? def.power : def.water;
      if (value > 0) {
        totalCapacity += value;
        if (carrier >= 0) capacity[component] += value;
      } else if (value < 0) {
        totalDemand += -value;
        if (carrier >= 0) demand[component] += -value;
      }
    } else {
      var want = demandOfLot(building.zone, building.level, building.w * building.h);
      totalDemand += want;
      if (carrier >= 0) demand[component] += want;
    }
  }

  // Allocate. A component that cannot meet its demand supplies nobody fully —
  // brown-out rather than a lottery, because "some of your city at random"
  // is unreadable and unfixable from the player's side.
  // A component must actually have a producer. Treating "no demand" as
  // satisfied marked every stretch of unconnected wire as powered, which made
  // the supplied-carrier test meaningless: any wire anywhere counted.
  var satisfied = [];
  for (i = 0; i <= components.count; i += 1) {
    satisfied.push(capacity[i] > 0 && capacity[i] >= demand[i]);
  }

  // Mark the carrier tiles of satisfied components. Development reads this to
  // decide whether a zoned tile could be supplied at all, and the overlay will
  // read the same bits.
  for (i = 0; i < state.width * state.height; i += 1) {
    if (!hasNet(state.tiles[layer][i])) continue;
    if (satisfied[components.label[i]]) state.tiles.flags[i] |= flag;
    else state.tiles.flags[i] &= ~flag;
  }

  var served = 0;
  var starved = 0;
  for (i = 0; i < state.buildings.length; i += 1) {
    var lot = state.buildings[i];
    var link = connected[i];
    var supplied = link >= 0 && satisfied[components.label[link]];
    for (var dy = 0; dy < lot.h; dy += 1) {
      for (var dx = 0; dx < lot.w; dx += 1) {
        var index = tileAt(state.width, lot.x + dx, lot.y + dy);
        if (supplied) state.tiles.flags[index] |= flag;
        else state.tiles.flags[index] &= ~flag;
      }
    }
    if (supplied) served += 1;
    else starved += 1;
  }

  return {
    kind: kind,
    components: components.count,
    capacity: totalCapacity,
    demand: totalDemand,
    served: served,
    starved: starved,
  };
}

export function utilitiesPass(state) {
  var power = supplyPass(state, "power");
  var water = supplyPass(state, "water");
  var events = [];
  if (power.starved > 0 && power.demand > power.capacity) {
    events.push({ kind: "powerShortfall", short: power.demand - power.capacity, affected: power.starved });
  }
  if (water.starved > 0 && water.demand > water.capacity) {
    events.push({ kind: "waterShortfall", short: water.demand - water.capacity, affected: water.starved });
  }
  state.supply = { power: power, water: water };
  return events;
}

registerMonthly("utilities", utilitiesPass, 20);

// --- placing a building ----------------------------------------------------

/** A surface pump must be beside water; a groundwater pump may be anywhere.
 * This is what makes the "Dry" region a different game rather than an
 * impossible one. */
function surfaceWaterNearby(state, x, y, w, h) {
  for (var dy = -1; dy <= h; dy += 1) {
    for (var dx = -1; dx <= w; dx += 1) {
      var nx = x + dx;
      var ny = y + dy;
      if (!inBounds(state.width, state.height, nx, ny)) continue;
      if (isWater(state.tiles.terrain[tileAt(state.width, nx, ny)])) return true;
    }
  }
  return false;
}

/** What a building costs THIS player in THIS game. The build menu quotes it
 * and the reducer charges it, so a difficulty that makes everything 20% dearer
 * cannot leave the toolbar advertising the list price. */
export function buildingCost(state, id) {
  var def = definition(id);
  if (!def) return 0;
  return idiv(def.cost * difficultyOf(state).buildCostPercent, 100);
}

register(CMD_PLACE_BUILDING, function placeBuilding(state, command) {
  var def = definition(command.def);
  if (!def) return fail(RESULT.INVALID);
  if (!isInt(command.x) || !isInt(command.y)) return fail(RESULT.INVALID);
  var x = command.x;
  var y = command.y;
  if (!inBounds(state.width, state.height, x, y)) return fail(RESULT.INVALID);
  if (!inBounds(state.width, state.height, x + def.w - 1, y + def.h - 1)) return fail(RESULT.INVALID);

  // Every tile of the footprint must be clear, buildable and permitted.
  var dx;
  var dy;
  for (dy = 0; dy < def.h; dy += 1) {
    for (dx = 0; dx < def.w; dx += 1) {
      var index = tileAt(state.width, x + dx, y + dy);
      if (!isBuildable(state.tiles.terrain[index])) return fail(RESULT.INVALID);
      if (state.tiles.buildingId[index] !== 0) return fail(RESULT.NEEDS_BULLDOZE);
      if (hasNet(state.tiles.road[index])) return fail(RESULT.NEEDS_BULLDOZE);
      var permitted = canBuildOn(state, command.actor, index);
      if (permitted !== RESULT.OK) return fail(permitted);
    }
  }
  if (def.needsSurfaceWater === true && !surfaceWaterNearby(state, x, y, def.w, def.h)) {
    return fail(RESULT.INVALID);
  }

  var tx = begin(state, command.actor);
  charge(tx, buildingCost(state, command.def));
  for (dy = 0; dy < def.h; dy += 1) {
    for (dx = 0; dx < def.w; dx += 1) {
      var tile = tileAt(state.width, x + dx, y + dy);
      if (state.tiles.owner[tile] === OWNER_NATURE) stage(tx, tile, "owner", command.actor);
      if (state.tiles.zone[tile] !== ZONE_NONE) stage(tx, tile, "zone", ZONE_NONE);
    }
  }
  if (failed(tx)) return fail(tx.result);
  var outcome = commit(tx);
  if (outcome.result !== RESULT.OK) return fail(outcome.result);

  var id = state.nextId;
  state.nextId += 1;
  state.buildings.push({
    id: id,
    def: command.def,
    zone: ZONE_NONE,
    x: x,
    y: y,
    w: def.w,
    h: def.h,
    owner: command.actor,
    level: 1,
    valueTier: 0,
    occupancy: 0,
    condition: 100,
    builtTick: state.tick,
    flags: 0,
  });
  for (dy = 0; dy < def.h; dy += 1) {
    for (dx = 0; dx < def.w; dx += 1) {
      state.tiles.buildingId[tileAt(state.width, x + dx, y + dy)] = id;
    }
  }
  return ok([{ kind: "placed", def: command.def, id: id, x: x, y: y, actor: command.actor }]);
});
