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
import { CMD_PLACE_ROAD, CMD_PAINT_ZONE } from "./commands.js";
import { RESULT } from "../shared/protocol.js";
import { tileAt, xOf, yOf, encodeRuns, inBounds } from "../shared/grid.js";
import { hasNet } from "./network.js";
import { isBuildable } from "./terrain.js";
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
    built: 0,
    zoned: 0,
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
