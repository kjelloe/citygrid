// Fire: ignition, spread, response and ruins.
//
// The one civic system the player watches happen rather than reads in an
// overlay, so it runs on the fast tick. Everything it needs was computed by
// the civic pass: fireRisk already folds in building type, level and how well
// the fire service covers the tile.

import { registerFast, registerMonthly } from "./reducer.js";
import { rules } from "./rules.js";
import { definition } from "./catalogue.js";
import { idiv, clamp } from "../shared/idiv.js";
import { tileAt, xOf, yOf, DIR4, neighbour } from "../shared/grid.js";
import { nextInt, chance, chanceIn } from "../shared/prng.js";
import { isWater } from "./terrain.js";
import {
  FLAG_BURNING, FLAG_RUINED, TERRAIN_FOREST, TERRAIN_GRASS, ZONE_NONE,
} from "./constants.js";

export function isBurning(state, index) {
  return (state.tiles.flags[index] & FLAG_BURNING) !== 0;
}

/** The one way a tile catches fire. Exported so disasters ignite through the
 * fire system rather than inventing a second kind of burning that fire cover
 * cannot fight. */
export function igniteAt(state, index) {
  return ignite(state, index);
}

function ignite(state, index) {
  if (isWater(state.tiles.terrain[index])) return false;
  if (isBurning(state, index)) return false;
  state.tiles.flags[index] |= FLAG_BURNING;
  return true;
}

/** Extinguishing chance rises with fire cover. A tile with no cover at all
 * still goes out eventually — fires burn themselves out — but slowly enough
 * that the surrounding block is usually gone by then. */
function extinguishOdds(state, index) {
  var fire = rules().fire;
  var risk = state.tiles.fireRisk[index];
  // fireRisk already has coverage subtracted from it, so low risk on a
  // developed tile means the fire service is nearby.
  return clamp(fire.baseExtinguish + (fire.riskReference - risk), 1, 99);
}

function buildingAt(state, index) {
  var id = state.tiles.buildingId[index];
  if (!id) return undefined;
  for (var i = 0; i < state.buildings.length; i += 1) {
    if (state.buildings[i].id === id) return state.buildings[i];
  }
  return undefined;
}

function destroy(state, index, events) {
  var building = buildingAt(state, index);
  if (building) {
    // The whole lot goes, not one tile of it: half a burnt building is not a
    // state the rest of the simulation knows how to reason about.
    for (var dy = 0; dy < building.h; dy += 1) {
      for (var dx = 0; dx < building.w; dx += 1) {
        var tile = tileAt(state.width, building.x + dx, building.y + dy);
        state.tiles.buildingId[tile] = 0;
        state.tiles.flags[tile] |= FLAG_RUINED;
        state.tiles.flags[tile] &= ~FLAG_BURNING;
      }
    }
    for (var i = 0; i < state.buildings.length; i += 1) {
      if (state.buildings[i].id === building.id) {
        state.buildings.splice(i, 1);
        break;
      }
    }
    events.push({ kind: "burntDown", id: building.id, x: building.x, y: building.y, owner: building.owner });
    return;
  }
  if (state.tiles.terrain[index] === TERRAIN_FOREST) {
    state.tiles.terrain[index] = TERRAIN_GRASS;
  }
  state.tiles.flags[index] &= ~FLAG_BURNING;
}

/** One fast tick of every active fire. */
export function firePass(state) {
  var fire = rules().fire;
  var events = [];
  var total = state.width * state.height;
  var burning = [];
  var i;

  for (i = 0; i < total; i += 1) {
    if (isBurning(state, i)) burning.push(i);
  }
  if (burning.length === 0) return events;

  for (i = 0; i < burning.length; i += 1) {
    var index = burning[i];

    if (chanceIn(state.rng, extinguishOdds(state, index), 100)) {
      state.tiles.flags[index] &= ~FLAG_BURNING;
      events.push({ kind: "fireOut", x: xOf(state.width, index), y: yOf(state.width, index) });
      continue;
    }

    // Spread before damage, so a fire that is about to consume its building
    // has already had the chance to reach the next one.
    var x = xOf(state.width, index);
    var y = yOf(state.width, index);
    for (var d = 0; d < DIR4.length; d += 1) {
      var n = neighbour(state.width, state.height, x, y, DIR4[d]);
      if (n < 0) continue;
      var fuel = state.tiles.buildingId[n] !== 0
        ? state.tiles.fireRisk[n] + fire.buildingFuel
        : state.tiles.terrain[n] === TERRAIN_FOREST ? fire.forestFuel : 0;
      if (fuel <= 0) continue;
      if (chanceIn(state.rng, fuel, fire.spreadDivisor)) {
        if (ignite(state, n)) {
          events.push({ kind: "fireSpread", x: xOf(state.width, n), y: yOf(state.width, n) });
        }
      }
    }

    if (chanceIn(state.rng, fire.damagePerTick, 100)) destroy(state, index, events);
  }
  return events;
}

/** Monthly ignition roll. Disasters proper (wildfire, flood, storm) arrive in
 * slice 3.2; this is the routine house fire that teaches the player what a
 * fire station is for. */
export function ignitionPass(state) {
  var fire = rules().fire;
  var events = [];
  if (state.buildings.length === 0) return events;

  // One roll per month against the riskiest thing in the city, so a well
  // covered city is genuinely safer rather than merely slower to burn.
  var attempts = fire.attemptsPerMonth;
  for (var a = 0; a < attempts; a += 1) {
    var building = state.buildings[nextInt(state.rng, state.buildings.length)];
    var index = tileAt(state.width, building.x, building.y);
    var risk = state.tiles.fireRisk[index];
    if (risk <= 0) continue;
    if (!chanceIn(state.rng, risk, fire.ignitionDivisor)) continue;
    if (ignite(state, index)) {
      events.push({
        kind: "fireStarted", x: building.x, y: building.y,
        owner: building.owner, id: building.id,
      });
    }
  }
  return events;
}

/** Ruins block building until they are cleared, and they drag the
 * neighbourhood down while they stand — which is what makes rebuilding after a
 * fire urgent rather than optional. */
export function clearRuin(state, index) {
  state.tiles.flags[index] &= ~FLAG_RUINED;
}

export function isRuined(state, index) {
  return (state.tiles.flags[index] & FLAG_RUINED) !== 0;
}

registerFast("fire", firePass, 10);
registerMonthly("ignition", ignitionPass, 35);
