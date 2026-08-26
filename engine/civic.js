// Pollution, service coverage, crime, health and land value.
//
// These five are one pass because they feed each other in a fixed order:
// pollution and coverage are inputs to crime and health, and all four are
// inputs to land value, which is in turn what development and the tax base
// read. Splitting them into separate passes would mean deciding, every month,
// which of them is a month stale.

import { registerMonthly } from "./reducer.js";
import { rules } from "./rules.js";
import { definition } from "./catalogue.js";
import { idiv, clamp } from "../shared/idiv.js";
import { tileAt, xOf, yOf, DIR8, neighbour, forEachInRadius, inBounds } from "../shared/grid.js";
import { isWater } from "./terrain.js";
import { hasNet } from "./network.js";
import {
  ZONE_NONE, ZONE_RESIDENTIAL, ZONE_COMMERCIAL, ZONE_INDUSTRIAL,
  TERRAIN_FOREST, FLAG_POWERED, FLAG_WATERED,
} from "./constants.js";

/** Scratch buffers for the smoothing passes. They live outside the state
 * because they are rebuilt from scratch every month and hashing them would
 * only add a second place to forget. */
var scratch = { size: 0, a: undefined, b: undefined };

function scratchFor(total) {
  if (scratch.size !== total) {
    scratch.size = total;
    scratch.a = [];
    scratch.b = [];
    for (var i = 0; i < total; i += 1) {
      scratch.a.push(0);
      scratch.b.push(0);
    }
  }
  for (var k = 0; k < total; k += 1) {
    scratch.a[k] = 0;
    scratch.b[k] = 0;
  }
  return scratch;
}

/** Box blur over the 8 neighbours. Two passes turn point sources into
 * gradients, which is what makes a pollution overlay readable rather than a
 * scatter of dots. */
function smooth(state, values, passes) {
  var total = state.width * state.height;
  var buffer = [];
  var i;
  for (i = 0; i < total; i += 1) buffer.push(0);

  for (var pass = 0; pass < passes; pass += 1) {
    for (var y = 0; y < state.height; y += 1) {
      for (var x = 0; x < state.width; x += 1) {
        var index = tileAt(state.width, x, y);
        var sum = values[index] * 2;
        var count = 2;
        for (var d = 0; d < DIR8.length; d += 1) {
          var n = neighbour(state.width, state.height, x, y, DIR8[d]);
          if (n < 0) continue;
          sum += values[n];
          count += 1;
        }
        buffer[index] = idiv(sum, count);
      }
    }
    for (i = 0; i < total; i += 1) values[i] = buffer[i];
  }
  return values;
}

// --- pollution -------------------------------------------------------------

export function pollutionPass(state) {
  var civic = rules().civic;
  var total = state.width * state.height;
  var field = scratchFor(total).a;
  var i;

  for (i = 0; i < state.buildings.length; i += 1) {
    var building = state.buildings[i];
    var source = 0;
    if (building.zone === ZONE_INDUSTRIAL) {
      source = civic.industrialPollution * building.level;
    } else if (building.zone === ZONE_COMMERCIAL) {
      source = idiv(civic.industrialPollution * building.level, 4);
    } else if (building.zone === ZONE_NONE) {
      var def = definition(building.def);
      if (def) source = def.pollution;
    }
    if (source === 0) continue;
    for (var dy = 0; dy < building.h; dy += 1) {
      for (var dx = 0; dx < building.w; dx += 1) {
        var index = tileAt(state.width, building.x + dx, building.y + dy);
        // A park's negative pollution cleans rather than dirties.
        field[index] += source;
      }
    }
  }

  // Trees clean the air a little, which is what makes "protect a forest" a
  // mechanical choice and not only a sentimental one.
  for (i = 0; i < total; i += 1) {
    if (state.tiles.terrain[i] === TERRAIN_FOREST) field[i] -= civic.forestCleaning;
  }

  smooth(state, field, 2);
  for (i = 0; i < total; i += 1) {
    state.tiles.pollution[i] = clamp(field[i], 0, 255);
  }
}

// --- service coverage ------------------------------------------------------

/** Coverage falls off with distance and with funding. Returns per-service
 * fields, not stored in tile layers: only fire coverage has a tile layer of
 * its own (fireRisk), and the rest are read here and folded into land value,
 * crime and health. */
export function coveragePass(state) {
  var total = state.width * state.height;
  var fields = { fire: [], police: [], health: [] };
  var i;
  for (i = 0; i < total; i += 1) {
    fields.fire.push(0);
    fields.police.push(0);
    fields.health.push(0);
  }

  for (i = 0; i < state.buildings.length; i += 1) {
    var building = state.buildings[i];
    if (building.zone !== ZONE_NONE) continue;
    var def = definition(building.def);
    if (!def || !def.service) continue;
    var field = fields[def.service];
    if (!field) continue;

    // An unpowered or unwatered station is a building with the lights off.
    var centre = tileAt(state.width, building.x, building.y);
    var flags = state.tiles.flags[centre];
    var strength = 100;
    if ((flags & FLAG_POWERED) === 0) strength = idiv(strength, 2);
    if ((flags & FLAG_WATERED) === 0) strength = idiv(strength, 2);

    forEachInRadius(state.width, state.height, building.x, building.y, def.radius,
      function deposit(index, x, y, distance) {
        if (distance > def.radius) return;
        var falloff = 100 - idiv(distance * 100, def.radius + 1);
        field[index] += idiv(strength * falloff, 100);
      });
  }

  smooth(state, fields.fire, 1);
  smooth(state, fields.police, 1);
  smooth(state, fields.health, 1);
  return fields;
}

// --- density, crime and health ---------------------------------------------

function densityField(state) {
  var total = state.width * state.height;
  var field = [];
  var i;
  for (i = 0; i < total; i += 1) field.push(0);
  for (i = 0; i < state.buildings.length; i += 1) {
    var building = state.buildings[i];
    if (building.zone === ZONE_NONE) continue;
    var per = building.zone === ZONE_RESIDENTIAL
      ? building.occupancy
      : building.level * 8;
    var spread = idiv(per, building.w * building.h);
    for (var dy = 0; dy < building.h; dy += 1) {
      for (var dx = 0; dx < building.w; dx += 1) {
        field[tileAt(state.width, building.x + dx, building.y + dy)] += spread;
      }
    }
  }
  smooth(state, field, 2);
  return field;
}

export function crimePass(state, coverage, density) {
  var civic = rules().civic;
  var total = state.width * state.height;
  for (var i = 0; i < total; i += 1) {
    // The reference's shape: crime rises where land is cheap and people are
    // many, and falls where the police are.
    var raw = civic.crimeBase - state.tiles.landValue[i] + idiv(density[i], 2);
    raw -= idiv(coverage.police[i], civic.policeDivisor);
    state.tiles.crime[i] = clamp(raw, 0, 250);
  }
}

export function healthPass(state, coverage, density) {
  var civic = rules().civic;
  var total = state.width * state.height;
  for (var i = 0; i < total; i += 1) {
    var risk = idiv(state.tiles.pollution[i], 2) + idiv(density[i], 4);
    // No clean water is the single largest health risk there is.
    if ((state.tiles.flags[i] & FLAG_WATERED) === 0 && state.tiles.buildingId[i] !== 0) {
      risk += civic.noWaterHealthRisk;
    }
    risk -= idiv(coverage.health[i], civic.healthDivisor);
    state.tiles.healthRisk[i] = clamp(risk, 0, 250);
  }
}

// --- fire risk -------------------------------------------------------------

export function fireRiskPass(state, coverage) {
  var civic = rules().civic;
  var total = state.width * state.height;
  var i;
  for (i = 0; i < total; i += 1) state.tiles.fireRisk[i] = 0;

  for (i = 0; i < state.buildings.length; i += 1) {
    var building = state.buildings[i];
    var risk;
    if (building.zone === ZONE_INDUSTRIAL) risk = civic.industrialFireRisk;
    else if (building.zone === ZONE_NONE) {
      var def = definition(building.def);
      risk = def ? def.fireRisk : 0;
    } else risk = civic.buildingFireRisk;
    risk += building.level * 2;

    for (var dy = 0; dy < building.h; dy += 1) {
      for (var dx = 0; dx < building.w; dx += 1) {
        var index = tileAt(state.width, building.x + dx, building.y + dy);
        var covered = idiv(coverage.fire[index], civic.fireDivisor);
        state.tiles.fireRisk[index] = clamp(risk - covered, 0, 255);
      }
    }
  }
  // Woodland burns whether or not anyone lives in it.
  for (i = 0; i < total; i += 1) {
    if (state.tiles.terrain[i] === TERRAIN_FOREST) {
      state.tiles.fireRisk[i] = clamp(state.tiles.fireRisk[i] + civic.forestFireRisk, 0, 255);
    }
  }
}

// --- land value ------------------------------------------------------------

/** What a place is worth. This is the number that decides where development
 * goes, what it upgrades to, and what it pays in tax, so it is the closest
 * thing the simulation has to a single opinion about a tile. */
export function landValuePass(state, coverage, density) {
  var civic = rules().civic;
  var total = state.width * state.height;
  var field = [];
  var i;
  for (i = 0; i < total; i += 1) field.push(0);

  for (var y = 0; y < state.height; y += 1) {
    for (var x = 0; x < state.width; x += 1) {
      var index = tileAt(state.width, x, y);
      var value = civic.landValueBase;

      // Amenity: water and trees nearby.
      for (var d = 0; d < DIR8.length; d += 1) {
        var n = neighbour(state.width, state.height, x, y, DIR8[d]);
        if (n < 0) continue;
        if (isWater(state.tiles.terrain[n])) value += civic.waterfrontBonus;
        if (state.tiles.terrain[n] === TERRAIN_FOREST) value += civic.greeneryBonus;
      }

      value -= idiv(state.tiles.pollution[index] * civic.pollutionPenalty, 100);
      value -= idiv(state.tiles.crime[index] * civic.crimePenalty, 100);
      value += idiv(coverage.police[index] + coverage.fire[index] + coverage.health[index], civic.serviceValueDivisor);
      // Overcrowding cuts both ways: some density is a city, too much is a slum.
      if (density[index] > civic.crowdingThreshold) {
        value -= idiv(density[index] - civic.crowdingThreshold, 4);
      }
      field[index] = value;
    }
  }

  smooth(state, field, 1);
  for (i = 0; i < total; i += 1) {
    state.tiles.landValue[i] = clamp(field[i], 1, 250);
  }
}

// --- the pass ---------------------------------------------------------------

export function civicPass(state) {
  var events = [];
  pollutionPass(state);
  var coverage = coveragePass(state);
  var density = densityField(state);
  // Crime reads last month's land value; land value then reads this month's
  // crime. Something has to be a month stale, and land value is the number
  // everything else depends on, so it is the one kept current.
  crimePass(state, coverage, density);
  healthPass(state, coverage, density);
  fireRiskPass(state, coverage);
  landValuePass(state, coverage, density);

  state.civic = summarise(state, coverage);
  var civic = rules().civic;
  if (state.civic.crimeAverage > civic.highCrime) {
    events.push({ kind: "highCrime", average: state.civic.crimeAverage });
  }
  if (state.civic.pollutionAverage > civic.highPollution) {
    events.push({ kind: "highPollution", average: state.civic.pollutionAverage });
  }
  return events;
}

function summarise(state, coverage) {
  var total = state.width * state.height;
  var developed = 0;
  var crime = 0;
  var pollution = 0;
  var value = 0;
  var health = 0;
  var fireCovered = 0;
  var policeCovered = 0;

  for (var i = 0; i < total; i += 1) {
    pollution += state.tiles.pollution[i];
    if (state.tiles.buildingId[i] === 0) continue;
    developed += 1;
    crime += state.tiles.crime[i];
    value += state.tiles.landValue[i];
    health += state.tiles.healthRisk[i];
    if (coverage.fire[i] > 0) fireCovered += 1;
    if (coverage.police[i] > 0) policeCovered += 1;
  }
  var divisor = developed === 0 ? 1 : developed;
  return {
    crimeAverage: idiv(crime, divisor),
    pollutionAverage: idiv(pollution, total),
    landValueAverage: idiv(value, divisor),
    healthRiskAverage: idiv(health, divisor),
    firePercent: idiv(fireCovered * 100, divisor),
    policePercent: idiv(policeCovered * 100, divisor),
    developed: developed,
  };
}

registerMonthly("civic", civicPass, 10);
