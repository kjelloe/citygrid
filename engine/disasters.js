// Major disasters (gamedesign.md §12).
//
// The design's four requirements are the whole design of this file:
//
//   *Telegraphable* — every disaster spends a month as a WARNING before it
//     strikes, and the warning names the place. A disaster the player could not
//     have prepared for is a punishment, not an event.
//   *Recoverable*   — nothing here makes a tile permanently unbuildable. Damage
//     is ruins to clear, networks to relay, buildings to rebuild. The player is
//     always left with a city that play can repair.
//   *Connected to existing systems* — a wildfire ignites through `fire.js`, an
//     explosion raises `pollution`, contamination raises `healthRisk`, a
//     blackout clears the powered flag the supply pass sets. Nothing invents a
//     private mechanic that only disasters can see.
//   *Optional*      — `options.disasters` turns the whole file off.
//
// Only ONE disaster is live at a time. Two at once is not more dramatic, it is
// unreadable — the player cannot tell which thing broke their city, and the
// design asks for meaningful choices rather than random punishment.

import { registerMonthly } from "./reducer.js";
import { rules, difficultyOf } from "./rules.js";
import { idiv, clamp } from "../shared/idiv.js";
import { tileAt, xOf, yOf } from "../shared/grid.js";
import { nextInt, nextRange, chanceIn } from "../shared/prng.js";
import { isWater } from "./terrain.js";
import { igniteAt } from "./fire.js";
import {
  FLAG_POWERED, FLAG_WATERED, FLAG_RUINED,
  TERRAIN_FOREST, ZONE_NONE, ZONE_INDUSTRIAL,
} from "./constants.js";

export var DISASTER_NONE = 0;
export var DISASTER_WILDFIRE = 1;
export var DISASTER_EARTHQUAKE = 2;
export var DISASTER_FLOOD = 3;
export var DISASTER_STORM = 4;
export var DISASTER_EXPLOSION = 5;
export var DISASTER_BLACKOUT = 6;
export var DISASTER_CONTAMINATION = 7;

export var DISASTER_KINDS = [
  DISASTER_WILDFIRE, DISASTER_EARTHQUAKE, DISASTER_FLOOD, DISASTER_STORM,
  DISASTER_EXPLOSION, DISASTER_BLACKOUT, DISASTER_CONTAMINATION,
];

/** Names for events and for the HUD. Kept here rather than in the client so a
 * disaster added to the engine cannot be one the interface has never heard of. */
export var DISASTER_NAMES = [
  "none", "wildfire", "earthquake", "flood", "storm",
  "explosion", "blackout", "contamination",
];

export var PHASE_NONE = 0;
export var PHASE_WARNING = 1;
export var PHASE_ACTIVE = 2;

// The record itself lives in state.js, which allocates, copies and hashes it.
// This file gives its fields meaning.

export function disasterName(kind) {
  if (kind < 0 || kind >= DISASTER_NAMES.length) return "none";
  return DISASTER_NAMES[kind];
}

// --- choosing where ---------------------------------------------------------

/** Somewhere the player has actually built. A wildfire in an empty corner of a
 * 128x128 region is a weather report, not an event. */
function developedSpot(state) {
  var count = state.width * state.height;
  var best = -1;
  var tries = 0;
  while (tries < 200) {
    var index = nextInt(state.rng, count);
    if (state.tiles.buildingId[index] !== 0) return index;
    if (best < 0 && state.tiles.zone[index] !== ZONE_NONE) best = index;
    tries += 1;
  }
  return best;
}

function industrialSpot(state) {
  var i;
  var candidates = 0;
  var chosen = -1;
  for (i = 0; i < state.buildings.length; i += 1) {
    if (state.buildings[i].zone !== ZONE_INDUSTRIAL) continue;
    candidates += 1;
    // Reservoir sampling: one pass, no array, and deterministic from the state
    // PRNG like everything else.
    if (nextInt(state.rng, candidates) === 0) chosen = i;
  }
  if (chosen < 0) return -1;
  return tileAt(state.width, state.buildings[chosen].x, state.buildings[chosen].y);
}

function forestSpot(state) {
  var count = state.width * state.height;
  var tries = 0;
  while (tries < 200) {
    var index = nextInt(state.rng, count);
    if (state.tiles.terrain[index] === TERRAIN_FOREST) return index;
    tries += 1;
  }
  return developedSpot(state);
}

function waterSideSpot(state) {
  var count = state.width * state.height;
  var tries = 0;
  while (tries < 300) {
    var index = nextInt(state.rng, count);
    if (isWater(state.tiles.terrain[index])) continue;
    var x = xOf(state.width, index);
    var y = yOf(state.width, index);
    var dx;
    var dy;
    for (dy = -2; dy <= 2; dy += 1) {
      for (dx = -2; dx <= 2; dx += 1) {
        var nx = x + dx;
        var ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
        if (isWater(state.tiles.terrain[tileAt(state.width, nx, ny)])) return index;
      }
    }
    tries += 1;
  }
  return -1;
}

// --- the damage each kind does ----------------------------------------------

function forEachInRadius(state, cx, cy, radius, visit) {
  var dx;
  var dy;
  for (dy = -radius; dy <= radius; dy += 1) {
    for (dx = -radius; dx <= radius; dx += 1) {
      var nx = cx + dx;
      var ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
      // A circle rather than a square: a square blast reads as a bug.
      if (dx * dx + dy * dy > radius * radius) continue;
      visit(tileAt(state.width, nx, ny), nx, ny);
    }
  }
}

/** Knocks a building down to ruins the player can clear.
 *
 * Ruins rather than empty ground, deliberately: the design asks disasters to be
 * recoverable AND to be felt. A tile that silently empties has cost the player
 * nothing to put right. */
function wreck(state, index, events) {
  var id = state.tiles.buildingId[index];
  if (id === 0) return 0;
  var i;
  var removed = 0;
  for (i = state.buildings.length - 1; i >= 0; i -= 1) {
    if (state.buildings[i].id !== id) continue;
    var b = state.buildings[i];
    var dx;
    var dy;
    for (dy = 0; dy < b.h; dy += 1) {
      for (dx = 0; dx < b.w; dx += 1) {
        var t = tileAt(state.width, b.x + dx, b.y + dy);
        state.tiles.buildingId[t] = 0;
        state.tiles.flags[t] |= FLAG_RUINED;
      }
    }
    state.buildings.splice(i, 1);
    removed = 1;
    events.push({ kind: "wrecked", id: id, x: b.x, y: b.y });
    break;
  }
  return removed;
}

/** Cuts networks. Recoverable by definition — the player relays the pipe. */
function severNetworks(state, index) {
  state.tiles.road[index] = 0;
  state.tiles.wire[index] = 0;
  state.tiles.pipe[index] = 0;
}

function strike(state, disaster, events) {
  var config = rules().disasters;
  var kind = disaster.kind;
  var cx = disaster.x;
  var cy = disaster.y;
  var radius = disaster.radius;
  var wrecked = 0;

  if (kind === DISASTER_WILDFIRE) {
    // Through the existing fire system, so it spreads, is fought by fire cover
    // and burns out the way any other fire does.
    forEachInRadius(state, cx, cy, radius, function (index) {
      if (chanceIn(state.rng, 1, 3)) igniteAt(state, index);
    });
  } else if (kind === DISASTER_EARTHQUAKE) {
    forEachInRadius(state, cx, cy, radius, function (index) {
      if (chanceIn(state.rng, 1, 3)) wrecked += wreck(state, index, events);
      if (chanceIn(state.rng, 1, 4)) severNetworks(state, index);
    });
  } else if (kind === DISASTER_FLOOD) {
    forEachInRadius(state, cx, cy, radius, function (index) {
      if (chanceIn(state.rng, 1, 4)) wrecked += wreck(state, index, events);
      // Standing water is a health problem long after it drains.
      state.tiles.healthRisk[index] = clamp(state.tiles.healthRisk[index] + 60, 0, 255);
      if (chanceIn(state.rng, 1, 5)) severNetworks(state, index);
    });
  } else if (kind === DISASTER_STORM) {
    forEachInRadius(state, cx, cy, radius, function (index) {
      if (chanceIn(state.rng, 1, 6)) wrecked += wreck(state, index, events);
      // A storm takes the wires down and leaves the roads.
      if (chanceIn(state.rng, 1, 2)) state.tiles.wire[index] = 0;
    });
  } else if (kind === DISASTER_EXPLOSION) {
    forEachInRadius(state, cx, cy, radius, function (index) {
      wrecked += wreck(state, index, events);
      state.tiles.pollution[index] = clamp(state.tiles.pollution[index] + 90, 0, 255);
      if (chanceIn(state.rng, 1, 2)) igniteAt(state, index);
    });
  } else if (kind === DISASTER_BLACKOUT) {
    // No structural damage at all. The supply pass will restore the flag once
    // the disaster clears, which is what makes this the recoverable one — and
    // what makes it a test of whether the city can survive without power.
    var i;
    for (i = 0; i < state.tiles.flags.length; i += 1) {
      state.tiles.flags[i] &= ~FLAG_POWERED;
    }
  } else if (kind === DISASTER_CONTAMINATION) {
    forEachInRadius(state, cx, cy, radius, function (index) {
      state.tiles.flags[index] &= ~FLAG_WATERED;
      state.tiles.healthRisk[index] = clamp(state.tiles.healthRisk[index] + 90, 0, 255);
    });
  }

  disaster.damage = wrecked;

  // Emergency relief.
  //
  // Measured, not assumed: a 200-game soak produced two cities that a disaster
  // made genuinely unrecoverable — emptied from ~1000 residents with nothing in
  // the treasury. The chain is an economic death spiral, not the blast: the
  // explosion takes the industry, jobs go, residents leave, tax revenue
  // collapses below upkeep, and the treasury bleeds to zero with nothing left
  // to rebuild from.
  //
  // §12 asks disasters to be recoverable and to be "a source of meaningful
  // choices rather than random punishment". A city that cannot rebuild has been
  // handed no choice at all. So a strike tops the treasury up TO a floor —
  // never above it, and only when a disaster caused the shortfall. It is not a
  // faucet: a solvent city gets nothing, and the floor buys a rebuild, not a
  // city.
  var i;
  for (i = 0; i < state.players.length; i += 1) {
    var player = state.players[i];
    if (player.treasury >= config.reliefFloor) continue;
    var grant = config.reliefFloor - player.treasury;
    if (grant > config.reliefCap) grant = config.reliefCap;
    player.treasury += grant;
    events.push({ kind: "disasterRelief", seat: player.seat, amount: grant });
  }

  events.push({
    kind: "disasterStruck",
    disaster: disasterName(kind),
    x: cx,
    y: cy,
    radius: radius,
    wrecked: wrecked,
  });
}

/** While a disaster is ACTIVE it keeps doing its thing each month. Only the two
 * that are states rather than moments — a blackout, a contaminated supply —
 * have anything to do here. */
function sustain(state, disaster) {
  var i;
  if (disaster.kind === DISASTER_BLACKOUT) {
    for (i = 0; i < state.tiles.flags.length; i += 1) state.tiles.flags[i] &= ~FLAG_POWERED;
  } else if (disaster.kind === DISASTER_CONTAMINATION) {
    forEachInRadius(state, disaster.x, disaster.y, disaster.radius, function (index) {
      state.tiles.flags[index] &= ~FLAG_WATERED;
    });
  }
}

// --- the pass ---------------------------------------------------------------

function chooseKind(state) {
  return DISASTER_KINDS[nextInt(state.rng, DISASTER_KINDS.length)];
}

function spotFor(state, kind) {
  if (kind === DISASTER_WILDFIRE) return forestSpot(state);
  if (kind === DISASTER_EXPLOSION) return industrialSpot(state);
  if (kind === DISASTER_FLOOD || kind === DISASTER_CONTAMINATION) return waterSideSpot(state);
  return developedSpot(state);
}

export function disasterPass(state) {
  var events = [];
  if (!state.options.disasters) return events;
  var disaster = state.disaster;
  var config = rules().disasters;

  if (disaster.phase === PHASE_ACTIVE) {
    disaster.ticks -= 1;
    if (disaster.ticks > 0) {
      sustain(state, disaster);
      return events;
    }
    events.push({ kind: "disasterOver", disaster: disasterName(disaster.kind) });
    disaster.kind = DISASTER_NONE;
    disaster.phase = PHASE_NONE;
    return events;
  }

  if (disaster.phase === PHASE_WARNING) {
    disaster.ticks -= 1;
    if (disaster.ticks > 0) return events;
    disaster.phase = PHASE_ACTIVE;
    disaster.ticks = nextRange(state.rng, config.durationLow, config.durationHigh);
    strike(state, disaster, events);
    return events;
  }

  // Nothing running. Roll for one — but only once the city is big enough to
  // lose something. Wiping out a player's first four houses is not a
  // meaningful choice, it is a reason to stop playing.
  if (state.population < config.minPopulation) return events;
  // Frequency is the difficulty's, not this file's. `disasterOneIn` already
  // existed and is what the difficulty table is FOR; adding a second knob would
  // have meant two numbers that both had to be tuned and could disagree.
  if (!chanceIn(state.rng, 1, difficultyOf(state).disasterOneIn)) return events;

  var kind = chooseKind(state);
  var index = spotFor(state, kind);
  if (index < 0) return events;

  disaster.kind = kind;
  disaster.phase = PHASE_WARNING;
  // One month of warning. The design asks for telegraphing; this is the
  // cheapest honest version of it, and it is what makes the difference between
  // an event and a punishment.
  disaster.ticks = config.warningMonths;
  disaster.x = xOf(state.width, index);
  disaster.y = yOf(state.width, index);
  disaster.radius = nextRange(state.rng, config.radiusLow, config.radiusHigh);
  disaster.damage = 0;
  events.push({
    kind: "disasterWarning",
    disaster: disasterName(kind),
    x: disaster.x,
    y: disaster.y,
    months: disaster.ticks,
  });
  return events;
}

// After fire (35) so a wildfire's ignitions are fought on the next pass rather
// than in the same one, and after the supply pass so a blackout's cleared flags
// are not immediately restored in the tick that created them.
registerMonthly("disasters", disasterPass, 60);
