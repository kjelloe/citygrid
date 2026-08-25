// The deputy mayor: an AI that runs a seat.
//
// It is a bonus feature (it runs a departed player's city under a readable
// doctrine) and the project's primary measurement instrument at the same time.
// Every soak and every sweep city is played by these, so doctrine is gated
// like gameplay code, because it IS the gameplay being measured.
//
// Deliberately simple and legible: a player should be able to read the
// doctrine name and predict roughly what their city will look like when they
// come back.

import { apply } from "./reducer.js";
import { CMD_PLACE_ROAD, CMD_PAINT_ZONE, CMD_PLACE_WIRE, CMD_PLACE_PIPE, CMD_PLACE_BUILDING } from "./commands.js";
import { definition } from "./catalogue.js";
import { budgetFor } from "./economy.js";
import { RESULT } from "../shared/protocol.js";
import { tileAt, xOf, yOf, encodeRuns, inBounds } from "../shared/grid.js";
import { hasNet } from "./network.js";
import { isBuildable, isWater } from "./terrain.js";
import { idiv, clamp } from "../shared/idiv.js";
import { nextInt, chance } from "../shared/prng.js";
import {
  ZONE_NONE, ZONE_RESIDENTIAL, ZONE_COMMERCIAL, ZONE_INDUSTRIAL, OWNER_NATURE,
} from "./constants.js";

export var DOCTRINE_EXPAND = "expand";
export var DOCTRINE_HOLD = "hold";
export var DOCTRINE_BALANCE = "balance";
export var DOCTRINE_GREEN = "green";

/** A deputy keeps its own scratch state OUTSIDE the game state: where it was
 * last building, which way it is heading. None of it is hashed, because two
 * clients running the same replay must not need the same deputy mood. */
export function makeDeputy(seat, doctrine) {
  return {
    seat: seat,
    doctrine: doctrine ? doctrine : DOCTRINE_EXPAND,
    cursorX: -1,
    cursorY: -1,
    hubX: -1,
    hubY: -1,
    built: 0,
    zoned: 0,
    utilities: 0,
    refusals: 0,
  };
}

function treasuryOf(state, seat) {
  for (var i = 0; i < state.players.length; i += 1) {
    if (state.players[i].seat === seat) return state.players[i].treasury;
  }
  return 0;
}

/** Picks somewhere to start: near the middle of the seat's own district when
 * there is one, otherwise near the middle of the map. */
function findStart(state, seat) {
  var bestIndex = -1;
  var bestScore = -1;
  var centreX = idiv(state.width, 2);
  var centreY = idiv(state.height, 2);
  for (var i = 0; i < state.width * state.height; i += 1) {
    if (!isBuildable(state.tiles.terrain[i])) continue;
    var owner = state.tiles.owner[i];
    if (owner !== OWNER_NATURE && owner !== seat) continue;
    var district = state.tiles.district[i];
    var mine = district === seat ? 400 : 0;
    var dx = xOf(state.width, i) - centreX;
    var dy = yOf(state.width, i) - centreY;
    var score = mine + 300 - (Math.abs(dx) + Math.abs(dy));
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex;
}

/** Lays a road segment and zones the strip on both sides of it — the pattern a
 * person actually uses, and the reason growth follows roads rather than
 * appearing in fields. */
function buildBlock(state, deputy) {
  var seat = deputy.seat;
  var horizontal = chance(state.rng, 2);
  var length = 6 + nextInt(state.rng, 6);
  var x = deputy.cursorX;
  var y = deputy.cursorY;

  var roadCells = [];
  for (var step = 0; step < length; step += 1) {
    var rx = horizontal ? x + step : x;
    var ry = horizontal ? y : y + step;
    if (!inBounds(state.width, state.height, rx, ry)) break;
    var index = tileAt(state.width, rx, ry);
    if (!isBuildable(state.tiles.terrain[index])) break;
    var owner = state.tiles.owner[index];
    if (owner !== OWNER_NATURE && owner !== seat) break;
    if (state.tiles.buildingId[index] !== 0) break;
    roadCells.push(index);
  }
  if (roadCells.length < 3) return false;

  var placed = apply(state, { type: CMD_PLACE_ROAD, actor: seat, runs: encodeRuns(roadCells) });
  if (placed.result !== RESULT.OK) {
    deputy.refusals += 1;
    return false;
  }
  deputy.built += 1;

  // Utilities follow the street, and then join the grid. Laying them per
  // block without connecting the blocks produced a map full of separate
  // networks, none of which had a power station on it: half the cities never
  // developed a single house.
  apply(state, { type: CMD_PLACE_WIRE, actor: seat, runs: encodeRuns(roadCells) });
  apply(state, { type: CMD_PLACE_PIPE, actor: seat, runs: encodeRuns(roadCells) });
  connectToHub(state, deputy, roadCells[0]);

  // What to zone: whatever the region is shortest of. The deputy reads the
  // same regional demand pool the player sees, which is what makes it a
  // measurement instrument rather than a cheat.
  var zone = pickZone(state, deputy);
  var zoneCells = [];
  for (var k = 0; k < roadCells.length; k += 1) {
    var cx = xOf(state.width, roadCells[k]);
    var cy = yOf(state.width, roadCells[k]);
    var sides = horizontal ? [[cx, cy - 1], [cx, cy + 1]] : [[cx - 1, cy], [cx + 1, cy]];
    for (var s = 0; s < sides.length; s += 1) {
      var zx = sides[s][0];
      var zy = sides[s][1];
      if (!inBounds(state.width, state.height, zx, zy)) continue;
      var zi = tileAt(state.width, zx, zy);
      if (!isBuildable(state.tiles.terrain[zi])) continue;
      if (hasNet(state.tiles.road[zi])) continue;
      if (state.tiles.zone[zi] !== ZONE_NONE) continue;
      var zOwner = state.tiles.owner[zi];
      if (zOwner !== OWNER_NATURE && zOwner !== seat) continue;
      zoneCells.push(zi);
    }
  }
  if (zoneCells.length > 0) {
    var zoned = apply(state, { type: CMD_PAINT_ZONE, actor: seat, runs: encodeRuns(zoneCells), zone: zone });
    if (zoned.result === RESULT.OK) deputy.zoned += 1;
    else deputy.refusals += 1;
  }

  // Walk on from the end of the road, so blocks chain into a neighbourhood.
  var last = roadCells[roadCells.length - 1];
  deputy.cursorX = xOf(state.width, last) + (horizontal ? 0 : nextInt(state.rng, 5) - 2);
  deputy.cursorY = yOf(state.width, last) + (horizontal ? nextInt(state.rng, 5) - 2 : 0);
  deputy.cursorX = clamp(deputy.cursorX, 1, state.width - 2);
  deputy.cursorY = clamp(deputy.cursorY, 1, state.height - 2);
  return true;
}

function pickZone(state, deputy) {
  var r = state.demand.residential;
  var c = state.demand.commercial;
  var i = state.demand.industrial;

  if (deputy.doctrine === DOCTRINE_GREEN) {
    // Green first: industry only when there is no alternative.
    if (r >= c) return ZONE_RESIDENTIAL;
    return ZONE_COMMERCIAL;
  }
  if (r >= c && r >= i) return ZONE_RESIDENTIAL;
  if (c >= i) return ZONE_COMMERCIAL;
  return ZONE_INDUSTRIAL;
}

/** Keeps the lights on. A deputy that zones without supplying is a deputy
 * that builds a slum, so utilities come before expansion — the same priority
 * a person applies without being told. */
function keepSupplied(state, deputy) {
  var supply = state.supply;
  var seat = deputy.seat;

  // Once there is zoned land, not once there is demand: nothing develops
  // without supply now, so waiting for demand would deadlock — no supply, no
  // buildings, no demand, no supply. Waiting for zoning instead is also how a
  // person does it.
  if (deputy.zoned === 0) return false;
  var needsPower = supply.power.demand + 20 > supply.power.capacity;
  var needsWater = supply.water.demand + 20 > supply.water.capacity;
  if (!needsPower && !needsWater) return false;

  // Green doctrine pays more for less: several turbines rather than one
  // chimney. It is the readable difference between the two doctrines.
  var wantsPower = deputy.doctrine === DOCTRINE_GREEN ? "windTurbine" : "coalPlant";
  var def = needsPower ? wantsPower : pickPump(state, deputy);
  if (!def) return false;

  var spot = findSpotFor(state, deputy, def);
  if (spot < 0) return false;

  var placed = apply(state, {
    type: CMD_PLACE_BUILDING, actor: seat, def: def,
    x: xOf(state.width, spot), y: yOf(state.width, spot),
  });
  if (placed.result !== RESULT.OK) {
    deputy.refusals += 1;
    return false;
  }
  deputy.utilities += 1;
  // The first plant becomes the grid hub every later block connects to.
  if (deputy.hubX < 0) {
    deputy.hubX = xOf(state.width, spot);
    deputy.hubY = yOf(state.width, spot) - 1;
    if (deputy.hubY < 0) deputy.hubY = yOf(state.width, spot) + definition(def).h;
  }
  // A plant nobody is connected to is scenery, so the carrier goes down with
  // it: a short run out from the building toward the nearest existing road,
  // which is where the city is.
  // Wire and pipe both, from the new building back to the grid.
  connectToHub(state, deputy, spot);
  runCarrier(state, deputy, spot, CMD_PLACE_WIRE, "wire");
  runCarrier(state, deputy, spot, CMD_PLACE_PIPE, "pipe");
  return true;
}

function pickPump(state, deputy) {
  // A surface pump is cheaper and stronger but needs a shore. In a dry region
  // there is no shore, and the groundwater pump is the whole answer.
  for (var i = 0; i < state.tiles.terrain.length; i += 1) {
    if (isWater(state.tiles.terrain[i])) return "waterPump";
  }
  return "groundwaterPump";
}

/** Somewhere clear, owned or ownable, and near where this deputy has been
 * building. Surface pumps additionally need a shore. */
function findSpotFor(state, deputy, defId) {
  var def = definition(defId);
  if (!def) return -1;
  var bestIndex = -1;
  var bestScore = -1;
  for (var i = 0; i < state.width * state.height; i += 1) {
    var x = xOf(state.width, i);
    var y = yOf(state.width, i);
    if (x + def.w > state.width || y + def.h > state.height) continue;
    if (!footprintClear(state, deputy.seat, x, y, def)) continue;
    if (def.needsSurfaceWater === true && !nearWater(state, x, y, def)) continue;
    // Near the deputy's work, but not on top of it.
    var distance = Math.abs(x - deputy.cursorX) + Math.abs(y - deputy.cursorY);
    var score = 200 - Math.abs(distance - 8);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function footprintClear(state, seat, x, y, def) {
  for (var dy = 0; dy < def.h; dy += 1) {
    for (var dx = 0; dx < def.w; dx += 1) {
      var index = tileAt(state.width, x + dx, y + dy);
      if (!isBuildable(state.tiles.terrain[index])) return false;
      if (state.tiles.buildingId[index] !== 0) return false;
      if (state.tiles.zone[index] !== ZONE_NONE) return false;
      if (hasNet(state.tiles.road[index])) return false;
      var owner = state.tiles.owner[index];
      if (owner !== OWNER_NATURE && owner !== seat) return false;
    }
  }
  return true;
}

function nearWater(state, x, y, def) {
  for (var dy = -1; dy <= def.h; dy += 1) {
    for (var dx = -1; dx <= def.w; dx += 1) {
      var nx = x + dx;
      var ny = y + dy;
      if (!inBounds(state.width, state.height, nx, ny)) continue;
      if (isWater(state.tiles.terrain[tileAt(state.width, nx, ny)])) return true;
    }
  }
  return false;
}

/** Joins a point to the deputy's grid hub with an L-shaped run, so every block
 * it builds ends up on one network with the power station. */
function connectToHub(state, deputy, from) {
  if (deputy.hubX < 0) return;
  var x = xOf(state.width, from);
  var y = yOf(state.width, from);
  var cells = [];
  var guard = 0;
  while ((x !== deputy.hubX || y !== deputy.hubY) && guard < 200) {
    if (x !== deputy.hubX) x += deputy.hubX > x ? 1 : -1;
    else y += deputy.hubY > y ? 1 : -1;
    guard += 1;
    if (!inBounds(state.width, state.height, x, y)) break;
    var index = tileAt(state.width, x, y);
    // Route around buildings rather than through them.
    if (state.tiles.buildingId[index] !== 0) continue;
    var owner = state.tiles.owner[index];
    if (owner !== OWNER_NATURE && owner !== deputy.seat) continue;
    cells.push(index);
  }
  if (cells.length === 0) return;
  apply(state, { type: CMD_PLACE_WIRE, actor: deputy.seat, runs: encodeRuns(cells) });
  apply(state, { type: CMD_PLACE_PIPE, actor: deputy.seat, runs: encodeRuns(cells) });
}

/** Runs a carrier line from a building toward the built-up part of the city. */
function runCarrier(state, deputy, from, command, layer) {
  var x = xOf(state.width, from);
  var y = yOf(state.width, from);
  var cells = [];
  var steps = 0;
  while (steps < 40) {
    var dx = deputy.cursorX > x ? 1 : deputy.cursorX < x ? -1 : 0;
    var dy = deputy.cursorY > y ? 1 : deputy.cursorY < y ? -1 : 0;
    if (dx === 0 && dy === 0) break;
    // One axis at a time, so the line is readable rather than a diagonal
    // staircase.
    if (dx !== 0) x += dx;
    else y += dy;
    if (!inBounds(state.width, state.height, x, y)) break;
    var index = tileAt(state.width, x, y);
    if (state.tiles.buildingId[index] !== 0) break;
    cells.push(index);
    steps += 1;
  }
  if (cells.length === 0) return;
  var result = apply(state, { type: command, actor: deputy.seat, runs: encodeRuns(cells) });
  if (result.result !== RESULT.OK) deputy.refusals += 1;
}

/** One turn of the deputy. Called on a cadence by the driver, not by the
 * reducer: a deputy is a player, and players act between ticks. */
export function deputyTurn(state, deputy) {
  if (deputy.doctrine === DOCTRINE_HOLD) return false;

  var funds = treasuryOf(state, deputy.seat);
  // Keep a reserve so a deputy never bankrupts a city it was left in charge
  // of. Doctrine decides how deep it will dig.
  var reserve = deputy.doctrine === DOCTRINE_BALANCE ? 4000 : 800;
  if (funds < reserve) return false;

  if (deputy.cursorX < 0) {
    var start = findStart(state, deputy.seat);
    if (start < 0) return false;
    deputy.cursorX = xOf(state.width, start);
    deputy.cursorY = yOf(state.width, start);
  }

  // Supply first, expansion second — but only after the cursor exists, since
  // the carrier line is run toward it.
  if (keepSupplied(state, deputy)) return true;

  // Stop expanding when a deficit is actually running the treasury down —
  // not merely because the books are negative. A new city runs a deficit by
  // design: the plant and the streets are paid for before anyone moves in.
  // Blocking on net alone deadlocked four cities out of five, permanently:
  // no expansion, no residents, no income, no expansion.
  if (funds < 6000 && budgetFor(state, deputy.seat).net < 0) return false;

  var attempts = 0;
  while (attempts < 6) {
    if (buildBlock(state, deputy)) return true;
    // Blocked: hop somewhere else rather than grinding against the same rock.
    deputy.cursorX = 1 + nextInt(state.rng, state.width - 2);
    deputy.cursorY = 1 + nextInt(state.rng, state.height - 2);
    attempts += 1;
  }
  return false;
}
