// Zoning, the regional demand pool, and the growth and decay of lots.
//
// Ruling 001: demand is REGIONAL. Residents and firms belong to the region,
// not to a player, and each month the pool is allocated to whichever lots are
// best served. With one seat that is simply a city growing where it is best
// served; with sixteen it is the whole competition, and it is the same code.

import { RESULT, LIMITS } from "../shared/protocol.js";
import { register, ok, fail, registerMonthly } from "./reducer.js";
import { CMD_PAINT_ZONE, CMD_DEZONE } from "./commands.js";
import { begin, commit, stage, charge, reject, peek, failed } from "./transaction.js";
import { cellsFromRuns, hasNet } from "./network.js";
import { canZone, canDemolish } from "./permissions.js";
import { rules, buildCost, difficultyOf } from "./rules.js";
import { isBuildable } from "./terrain.js";
import { idiv, clamp } from "../shared/idiv.js";
import { tileAt, xOf, yOf, DIR4, DIR8, neighbour, inBounds } from "../shared/grid.js";
import { nextInt, chance } from "../shared/prng.js";
import { isIntArray, isIntInRange } from "./validate.js";
import {
  ZONE_NONE, ZONE_RESIDENTIAL, ZONE_COMMERCIAL, ZONE_INDUSTRIAL,
  OWNER_NATURE, FLAG_ZONE_CENTRE, FLAG_POWERED, FLAG_WATERED, FLAG_RUINED,
} from "./constants.js";

// --- zoning ----------------------------------------------------------------

register(CMD_PAINT_ZONE, function paintZone(state, command) {
  if (!isIntArray(command.runs, LIMITS.CELLS_PER_COMMAND)) return fail(RESULT.INVALID);
  if (!isIntInRange(command.zone, ZONE_RESIDENTIAL, ZONE_INDUSTRIAL)) return fail(RESULT.INVALID);
  var indices = cellsFromRuns(state, command.runs, LIMITS.CELLS_PER_COMMAND);
  if (!indices) return fail(RESULT.INVALID);

  var tx = begin(state, command.actor);
  for (var i = 0; i < indices.length; i += 1) {
    var index = indices[i];
    if (!isBuildable(state.tiles.terrain[index])) {
      reject(tx, RESULT.INVALID);
      return fail(tx.result);
    }
    var permitted = canZone(state, command.actor, index);
    if (permitted !== RESULT.OK) return fail(permitted);
    if (peek(tx, index, "zone") === command.zone) continue;

    charge(tx, buildCost(state, "zone"));
    stage(tx, index, "zone", command.zone);
    if (state.tiles.owner[index] === OWNER_NATURE) stage(tx, index, "owner", command.actor);
  }
  if (failed(tx)) return fail(tx.result);
  var outcome = commit(tx);
  if (outcome.result !== RESULT.OK) return fail(outcome.result);
  return ok([{ kind: "zoned", actor: command.actor, tiles: outcome.tiles, zone: command.zone }]);
});

register(CMD_DEZONE, function dezone(state, command) {
  if (!isIntArray(command.runs, LIMITS.CELLS_PER_COMMAND)) return fail(RESULT.INVALID);
  var indices = cellsFromRuns(state, command.runs, LIMITS.CELLS_PER_COMMAND);
  if (!indices) return fail(RESULT.INVALID);

  var tx = begin(state, command.actor);
  for (var i = 0; i < indices.length; i += 1) {
    var index = indices[i];
    if (peek(tx, index, "zone") === ZONE_NONE) continue;
    var permitted = canDemolish(state, command.actor, index);
    if (permitted !== RESULT.OK) return fail(permitted);
    // A developed lot is a building, and a building is not dezoned away — it
    // is demolished, which is a different act with different permissions.
    if (state.tiles.buildingId[index] !== 0) return fail(RESULT.NEEDS_BULLDOZE);
    charge(tx, buildCost(state, "dezone"));
    stage(tx, index, "zone", ZONE_NONE);
  }
  if (failed(tx)) return fail(tx.result);
  var outcome = commit(tx);
  if (outcome.result !== RESULT.OK) return fail(outcome.result);
  return ok([{ kind: "dezoned", actor: command.actor, tiles: outcome.tiles }]);
});

// --- the census ------------------------------------------------------------

export function census(state) {
  var residents = 0;
  var commercialJobs = 0;
  var industrialJobs = 0;
  var housing = 0;
  var lots = { residential: 0, commercial: 0, industrial: 0 };
  var development = rules().development;

  for (var i = 0; i < state.buildings.length; i += 1) {
    var building = state.buildings[i];
    var area = building.w * building.h;
    if (building.zone === ZONE_RESIDENTIAL) {
      housing += development.residentsPerLevel[building.level - 1] * area;
      residents += building.occupancy;
      lots.residential += 1;
    } else if (building.zone === ZONE_COMMERCIAL) {
      commercialJobs += development.commercialJobsPerLevel[building.level - 1] * area;
      lots.commercial += 1;
    } else if (building.zone === ZONE_INDUSTRIAL) {
      industrialJobs += development.industrialJobsPerLevel[building.level - 1] * area;
      lots.industrial += 1;
    }
  }
  return {
    residents: residents,
    housing: housing,
    commercialJobs: commercialJobs,
    industrialJobs: industrialJobs,
    jobs: commercialJobs + industrialJobs,
    lots: lots,
  };
}

// --- the regional demand pool ----------------------------------------------

/** Tax drag, straight from the reference's table: 7% is already a net
 * negative, which is what makes a low-tax neighbour genuinely attractive. */
function taxDrag(state) {
  var tax = rules().tax;
  var rate = clamp(state.tax === undefined ? tax.default : state.tax, tax.min, tax.max);
  return idiv(tax.dragTable[rate] * 100, tax.dragScale);
}

export function computeDemand(state) {
  var counts = census(state);
  var population = rules().population;
  var demandRules = rules().demand;
  var elasticity = difficultyOf(state).demandElasticity;

  var workers = idiv(counts.residents * population.workingAgePercent, 100);
  var drag = taxDrag(state);

  // Residential: people come when there is work to be had and somewhere to
  // live. Vacant housing suppresses it, which is what stops a zoned-everything
  // city from growing forever — but only at half weight, because at full
  // weight it also counts buildings that are merely still filling up, and it
  // strangled every city at around 450 residents.
  var vacancy = counts.housing - counts.residents;
  var residential = (counts.jobs - workers) * 4 - idiv(vacancy, 2) + demandRules.residentialBase + drag;

  // Commercial: shops follow shoppers.
  var shoppersWanted = idiv(counts.residents, population.shoppersPerCommercialJob);
  var commercial = (shoppersWanted - counts.commercialJobs) * 6 + demandRules.commercialBase + drag;

  // Industrial: factories follow available labour.
  var industryWanted = idiv(workers * population.industryPerWorkerPercent, 100);
  var industrial = (industryWanted - counts.industrialJobs) * 5 + demandRules.industrialBase + drag;

  return {
    residential: clamp(idiv(residential * elasticity, 100), -demandRules.residentialCap, demandRules.residentialCap),
    commercial: clamp(idiv(commercial * elasticity, 100), -demandRules.commercialCap, demandRules.commercialCap),
    industrial: clamp(idiv(industrial * elasticity, 100), -demandRules.industrialCap, demandRules.industrialCap),
  };
}

/** Two parts old, one part new — a lag of roughly the response window in the
 * ruleset, without keeping a history buffer in hashed state. */
function smoothTo(current, target) {
  return idiv(current * 2 + target, 3);
}

function demandFor(state, zone) {
  if (zone === ZONE_RESIDENTIAL) return state.demand.residential;
  if (zone === ZONE_COMMERCIAL) return state.demand.commercial;
  if (zone === ZONE_INDUSTRIAL) return state.demand.industrial;
  return 0;
}

// --- lots ------------------------------------------------------------------

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

/** Is this rectangle free, zoned the same way, owned by the same player, and
 * on buildable ground? */
function lotFree(state, x, y, w, h, zone, owner) {
  for (var dy = 0; dy < h; dy += 1) {
    for (var dx = 0; dx < w; dx += 1) {
      if (!inBounds(state.width, state.height, x + dx, y + dy)) return false;
      var index = tileAt(state.width, x + dx, y + dy);
      if (state.tiles.zone[index] !== zone) return false;
      if (state.tiles.buildingId[index] !== 0) return false;
      if (state.tiles.owner[index] !== owner) return false;
      if (!isBuildable(state.tiles.terrain[index])) return false;
    }
  }
  return true;
}

/** Footprints are tried largest first, so a dense block of zoning grows into
 * few large lots rather than many small ones (gamedesign 6.3). */
var FOOTPRINTS = [{ w: 2, h: 2 }, { w: 2, h: 1 }, { w: 1, h: 2 }, { w: 1, h: 1 }];

function chooseFootprint(state, x, y, zone, owner) {
  for (var i = 0; i < FOOTPRINTS.length; i += 1) {
    var shape = FOOTPRINTS[i];
    if (!lotFree(state, x, y, shape.w, shape.h, zone, owner)) continue;
    if (!hasRoadAccess(state, x, y, shape.w, shape.h)) continue;
    return shape;
  }
  return undefined;
}

/** The simple land value that carried slice 1.4 before civic.js existed. Kept
 * only so a test can drive development without the whole civic pass; the real
 * model lives in civic.js and runs first every month. */
export function landValueAt(state, index) {
  var development = rules().development;
  var value = development.baseLandValue;
  var x = xOf(state.width, index);
  var y = yOf(state.width, index);
  for (var d = 0; d < DIR8.length; d += 1) {
    var n = neighbour(state.width, state.height, x, y, DIR8[d]);
    if (n < 0) continue;
    var terrain = state.tiles.terrain[n];
    if (terrain === 3 || terrain === 4) value += 8;
    if (terrain === 2) value += 4;
    if (state.tiles.zone[n] === ZONE_INDUSTRIAL) value -= 6;
  }
  return clamp(value, 1, 250);
}

/** Is there a working supply within reach of this tile? Reach is generous —
 * a lot connects to a nearby line rather than needing one on its doorstep. */
function couldBeSupplied(state, x, y) {
  var reach = rules().development.supplyReach;
  var power = false;
  var water = false;
  for (var dy = -reach; dy <= reach; dy += 1) {
    for (var dx = -reach; dx <= reach; dx += 1) {
      var nx = x + dx;
      var ny = y + dy;
      if (!inBounds(state.width, state.height, nx, ny)) continue;
      var index = tileAt(state.width, nx, ny);
      var flags = state.tiles.flags[index];
      if (hasNet(state.tiles.wire[index]) && (flags & FLAG_POWERED) !== 0) power = true;
      if (hasNet(state.tiles.pipe[index]) && (flags & FLAG_WATERED) !== 0) water = true;
      if (power && water) return true;
    }
  }
  return false;
}

function scoreLot(state, index, zone) {
  var development = rules().development;
  var demand = demandFor(state, zone);
  var value = state.tiles.landValue[index];

  var score = idiv(demand * development.demandWeight, 100);
  score += idiv((value - 100) * development.landValueWeight, 100);
  return score;
}

// --- growth and decay ------------------------------------------------------

function addBuilding(state, x, y, shape, zone, owner) {
  var id = state.nextId;
  state.nextId += 1;
  var building = {
    id: id,
    def: zone === ZONE_RESIDENTIAL ? "res" : zone === ZONE_COMMERCIAL ? "com" : "ind",
    zone: zone,
    x: x,
    y: y,
    w: shape.w,
    h: shape.h,
    owner: owner,
    level: 1,
    valueTier: 0,
    // Half full on opening day. Starting empty meant every new building spiked
    // the vacancy figure, which crashed the very demand that had just built it.
    occupancy: zone === ZONE_RESIDENTIAL
      ? idiv(rules().development.residentsPerLevel[0] * shape.w * shape.h, 2)
      : 0,
    condition: 100,
    builtTick: state.tick,
    flags: 0,
  };
  state.buildings.push(building);
  for (var dy = 0; dy < shape.h; dy += 1) {
    for (var dx = 0; dx < shape.w; dx += 1) {
      var index = tileAt(state.width, x + dx, y + dy);
      state.tiles.buildingId[index] = id;
      if (dx === 0 && dy === 0) state.tiles.flags[index] |= FLAG_ZONE_CENTRE;
    }
  }
  return building;
}

function removeBuilding(state, building) {
  for (var dy = 0; dy < building.h; dy += 1) {
    for (var dx = 0; dx < building.w; dx += 1) {
      var index = tileAt(state.width, building.x + dx, building.y + dy);
      state.tiles.buildingId[index] = 0;
      state.tiles.flags[index] &= ~FLAG_ZONE_CENTRE;
    }
  }
  for (var i = 0; i < state.buildings.length; i += 1) {
    if (state.buildings[i].id === building.id) {
      state.buildings.splice(i, 1);
      return;
    }
  }
}

function tierFor(value) {
  var thresholds = rules().development.landValueForTier;
  var tier = 0;
  for (var i = 0; i < thresholds.length; i += 1) {
    if (value >= thresholds[i]) tier = i;
  }
  return tier;
}

/** One monthly pass: refresh land value, refresh demand, then grow, upgrade
 * and decay. Registered rather than called, so the reducer never imports it. */
export function developmentPass(state) {
  var events = [];
  var development = rules().development;
  var i;

  // Demand moves toward its target rather than jumping to it: "changes should
  // not produce their full effect instantly; the response should occur over
  // several simulation periods" (gamedesign 9.3). Without this the pool
  // slams between its caps every month and growth comes in waves.
  var target = computeDemand(state);
  state.demand = {
    residential: smoothTo(state.demand.residential, target.residential),
    commercial: smoothTo(state.demand.commercial, target.commercial),
    industrial: smoothTo(state.demand.industrial, target.industrial),
  };

  // Grow: empty zoned tiles with road access and demand behind them.
  //
  // Only a slice of the map is assessed each month, rotating. Assessing the
  // whole map every month made the entire city move as one: everything
  // developed together, vacancy spiked together, demand crashed together, and
  // everything was abandoned together. 28,604 developments against 27,852
  // abandonments in forty years — the same street built and demolished
  // forever. The reference splits its map scan across cycles for the same
  // reason.
  var slices = development.scanSlices;
  var sliceHeight = idiv(state.height + slices - 1, slices);
  var fromY = state.scanCursor * sliceHeight;
  var toY = fromY + sliceHeight;
  if (toY > state.height) toY = state.height;
  state.scanCursor = (state.scanCursor + 1) % slices;

  for (var y = fromY; y < toY; y += 1) {
    for (var x = 0; x < state.width; x += 1) {
      var index = tileAt(state.width, x, y);
      var zone = state.tiles.zone[index];
      if (zone === ZONE_NONE) continue;
      if (state.tiles.buildingId[index] !== 0) continue;
      if (demandFor(state, zone) <= 0) continue;
      // gamedesign 8.2 lists electricity and water as development conditions:
      // nothing is built where nothing can be supplied. Without this, decayed
      // lots regrew the same month they were abandoned and an unpowered
      // district looked healthy while cycling through ruins.
      if (!couldBeSupplied(state, x, y)) continue;
      // Ruins block the ground until someone clears them, which is what makes
      // rebuilding after a fire an act rather than a wait.
      if ((state.tiles.flags[index] & FLAG_RUINED) !== 0) continue;
      if (scoreLot(state, index, zone) < development.growthThreshold) continue;
      if (!chance(state.rng, development.growthOneIn)) continue;

      var owner = state.tiles.owner[index];
      var shape = chooseFootprint(state, x, y, zone, owner);
      if (!shape) continue;
      var built = addBuilding(state, x, y, shape, zone, owner);
      events.push({ kind: "developed", zone: zone, x: x, y: y, owner: owner, id: built.id });
    }
  }

  // Upgrade and decay existing lots — only those in this month's slice.
  var doomed = [];
  for (i = 0; i < state.buildings.length; i += 1) {
    var building = state.buildings[i];
    if (building.y < fromY || building.y >= toY) continue;
    // Only ZONED lots grow and decay. A power plant, a pump or a fire station
    // is placed deliberately and stays until it is demolished deliberately.
    // Without this guard they scored as abandoned zoned lots — zone NONE means
    // no demand, and the unsupplied penalty finished the job — and the
    // deputy's power stations were quietly torn down the month after they
    // were built. Ten built, ten demolished, capacity permanently zero.
    if (building.zone === ZONE_NONE) continue;
    var centre = tileAt(state.width, building.x, building.y);
    var score = scoreLot(state, centre, building.zone);
    // An unsupplied lot cannot grow and will eventually be left. This is the
    // teaching loop the whole utility system exists for: zone, watch it
    // develop, watch it fail, connect it.
    // Forced negative rather than penalised: with demand high enough, a
    // penalty is simply absorbed and an unpowered tower block keeps growing.
    // Nobody lives without power because the housing market is tight.
    var flags = state.tiles.flags[centre];
    if ((flags & FLAG_POWERED) === 0 || (flags & FLAG_WATERED) === 0) {
      score = -development.unsuppliedScore;
    }
    building.valueTier = tierFor(state.tiles.landValue[centre]);

    // Condition is the memory that stops a single bad month from emptying a
    // street. One month of hardship is weather; four is a decision. Without
    // it the city churned through 11,810 abandonments in forty years against
    // 11,899 developments — building and demolishing the same street forever,
    // and never giving the player time to notice, let alone react.
    if (score >= development.growthThreshold) {
      building.condition = clamp(building.condition + development.conditionRecovery, 0, 100);
      if (building.level < development.levels && chance(state.rng, development.growthOneIn)) {
        building.level += 1;
        events.push({ kind: "upgraded", id: building.id, level: building.level });
      }
    } else if (score <= development.decayThreshold) {
      building.condition -= development.conditionDecay;
      if (building.condition <= 0) {
        building.condition = 0;
        if (building.level > 1) {
          building.level -= 1;
          building.condition = development.conditionAfterDowngrade;
          events.push({ kind: "downgraded", id: building.id, level: building.level });
        } else {
          doomed.push(building);
        }
      }
    }
  }
  for (i = 0; i < doomed.length; i += 1) {
    events.push({ kind: "abandoned", id: doomed[i].id, x: doomed[i].x, y: doomed[i].y });
    removeBuilding(state, doomed[i]);
  }

  // Occupancy follows housing, and both follow the regional pool.
  var counts = census(state);
  var wanted = counts.housing;
  var filled = 0;
  for (i = 0; i < state.buildings.length; i += 1) {
    var lot = state.buildings[i];
    if (lot.zone !== ZONE_RESIDENTIAL) continue;
    var capacity = development.residentsPerLevel[lot.level - 1] * lot.w * lot.h;
    // Occupancy rises toward capacity while demand is positive and falls when
    // it is negative — people move out before the building falls down.
    var target = state.demand.residential > 0 ? capacity : idiv(capacity * 3, 4);
    if (lot.occupancy < target) lot.occupancy += Math.max(1, idiv(capacity, 2));
    if (lot.occupancy > target) lot.occupancy -= Math.max(1, idiv(capacity, 8));
    lot.occupancy = clamp(lot.occupancy, 0, capacity);
    filled += lot.occupancy;
  }

  state.population = filled;
  state.jobs = counts.jobs;
  return events;
}

registerMonthly("development", developmentPass, 30);
