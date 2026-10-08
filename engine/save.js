// Saves. A save is state, and state is JSON-able by construction — no floats,
// no null, no Maps — so serialization is mostly a matter of not losing
// anything on the way back.
//
// Tile layers are run-length encoded, because a city map is enormously
// repetitive: mostly one terrain, mostly unzoned, mostly unowned. Storing
// 16 raw arrays of 16384 entries would be ~1 MB of JSON for a region that
// compresses to a few dozen kilobytes.

import { SAVE_VERSION } from "../shared/protocol.js";
import { createState, TILE_LAYERS, hashState, copyState } from "./state.js";
import { defaultOptions } from "./options.js";
import { HISTORY_FIELDS, FUNDING_SERVICES, FLAG_RUINED } from "./constants.js";

/** [value, count, value, count, ...] */
export function encodeLayer(array) {
  var runs = [];
  if (array.length === 0) return runs;
  var current = array[0];
  var count = 1;
  for (var i = 1; i < array.length; i += 1) {
    if (array[i] === current) {
      count += 1;
      continue;
    }
    runs.push(current, count);
    current = array[i];
    count = 1;
  }
  runs.push(current, count);
  return runs;
}

export function decodeLayer(runs, target) {
  var at = 0;
  for (var i = 0; i < runs.length; i += 2) {
    var value = runs[i];
    var count = runs[i + 1];
    for (var k = 0; k < count; k += 1) {
      if (at >= target.length) return at;
      target[at] = value;
      at += 1;
    }
  }
  return at;
}

export function toSave(state) {
  var tiles = {};
  for (var i = 0; i < TILE_LAYERS.length; i += 1) {
    var name = TILE_LAYERS[i].name;
    tiles[name] = encodeLayer(state.tiles[name]);
  }
  // **Every nested part comes off a COPY.** `toSave` is handed to a joiner by
  // `server/room.js` and held there, and a save that is a WINDOW into the live
  // state stops matching its own hash the moment the next command lands — found
  // in X1a, where the second seat to join changed the first one's save. Taking
  // them all from `copyState` rather than copying a list of them by hand is the
  // same reason the list below exists at all: a field copied in four places and
  // forgotten in the fifth is this project's most repeated mistake.
  var copy = copyState(state);
  return {
    v: SAVE_VERSION,
    options: copy.options,
    tick: state.tick,
    rng: state.rng.s,
    treasury: state.treasury,
    tax: state.tax,
    population: state.population,
    jobs: state.jobs,
    demand: {
      residential: state.demand.residential,
      commercial: state.demand.commercial,
      industrial: state.demand.industrial,
    },
    nextId: state.nextId,
    scanCursor: state.scanCursor,
    // Every nested record that reaches the hash must reach the save too. Three
    // of these were added to createState, copyState and the hash and NOT here,
    // and the result was a save that loaded a subtly different city — caught by
    // the MVP acceptance script's hash comparison, not by the save tests, whose
    // fixture had all three at their defaults.
    disaster: copy.disaster,
    traffic: copy.traffic,
    quests: copy.quests,
    history: copy.history,
    funding: copy.funding,
    players: copy.players,
    buildings: copy.buildings,
    requests: copy.requests,
    contracts: copy.contracts,
    derelicts: copy.derelicts,
    tiles: tiles,
    // The hash the save believed in when it was written. On load it is
    // recomputed and compared: a mismatch means the file was edited, or a
    // migration is wrong, and either way the player should be told rather
    // than handed a subtly different city.
    hash: hashState(state),
  };
}

/** Migrations run oldest-first, each bringing a save up one version. A save
 * from a version we have never heard of is refused rather than guessed at. */
var MIGRATIONS = {};

export function registerMigration(fromVersion, fn) {
  MIGRATIONS[fromVersion] = fn;
}

/**
 * 1 → 2: T2 appended the `rail` layer.
 *
 * A save from version 1 has no rail runs, and `fromSave` leaves the layer
 * zeroed, which is right — there was no rail before there was rail. What it
 * cannot keep is the CHECKSUM: `hash` was taken over a field list that did not
 * include the layer, so recomputing it now gives a different digest and the
 * load would be refused as "does not match its own hash". The hash is dropped
 * rather than recomputed, because a checksum this build calculated proves
 * nothing about the bytes the old build wrote; the save is verified from the
 * next time it is written.
 */
registerMigration(1, function railLayer(data) {
  var out = {};
  for (var key in data) {
    if (Object.hasOwn(data, key) && key !== "hash") out[key] = data[key];
  }
  out.v = 2;
  return out;
});

/**
 * 2 → 3: X3a gave a request a `kind`.
 *
 * A save from version 2 can only hold demolition requests — there was no
 * nuisance report to file — so every record gets that kind, and the checksum
 * goes for the same reason it went in the 1 → 2 migration: the digest was taken
 * over a field list without `kind` in it.
 */
registerMigration(2, function requestKind(data) {
  var out = {};
  for (var key in data) {
    if (Object.hasOwn(data, key) && key !== "hash") out[key] = data[key];
  }
  var requests = [];
  var old = data.requests ? data.requests : [];
  for (var i = 0; i < old.length; i += 1) {
    var request = {};
    for (var field in old[i]) {
      if (Object.hasOwn(old[i], field)) request[field] = old[i][field];
    }
    if (request.kind === undefined) request.kind = "demolition";
    requests.push(request);
  }
  out.requests = requests;
  out.v = 3;
  return out;
});

/**
 * 3 → 4: L1 gave a player a `debt`.
 *
 * A save from version 3 was written before anybody could borrow, so every seat
 * owes nothing — and the checksum goes, as it does in every migration here,
 * because the digest was taken over a field list without `debt` in it.
 */
registerMigration(3, function playerDebt(data) {
  var out = {};
  for (var key in data) {
    if (Object.hasOwn(data, key) && key !== "hash") out[key] = data[key];
  }
  var players = [];
  var old = data.players ? data.players : [];
  for (var i = 0; i < old.length; i += 1) {
    var player = {};
    for (var field in old[i]) {
      if (Object.hasOwn(old[i], field)) player[field] = old[i][field];
    }
    if (player.debt === undefined) player.debt = 0;
    players.push(player);
  }
  out.players = players;
  out.v = 4;
  return out;
});

/**
 * 4 → 5: X3c gave the city a list of its ruins and when each became one.
 *
 * A save from version 4 has ruins on its tiles and no record of their age, and
 * the honest default is the tick the save is loaded at: nobody can prove how
 * long they have stood, and starting their clock now means a neighbour waits
 * the full `derelictYears` rather than inheriting a right they were never given.
 * The list is left EMPTY here and filled by `fromSave` from the tile flags, so
 * the rule lives in one place.
 */
registerMigration(4, function derelictClock(data) {
  var out = {};
  for (var key in data) {
    if (Object.hasOwn(data, key) && key !== "hash") out[key] = data[key];
  }
  out.derelicts = [];
  out.v = 5;
  return out;
});

/**
 * 5 → 6: X3b gave a resolved request the seat that ANSWERED it.
 *
 * `status: APPROVED` is the same on two paths — the owner agreeing, and a
 * neighbour clearing a ruin over their head under the derelict rule (X3c) —
 * and an inbox has to say either "you approved this" or "your ruin was
 * cleared". An old save cannot be asked which it was: the actor was never
 * stored. So every request in one is given **0**, which is what the field
 * means for a request the clock resolved — nobody — and the inbox will say
 * nothing about an answerer rather than naming the wrong one.
 *
 * The stored checksum goes with it, as always: it was taken over a shorter
 * field list and cannot match a state with another field in it.
 */
registerMigration(5, function requestAnswerer(data) {
  var out = {};
  for (var key in data) {
    if (Object.hasOwn(data, key) && key !== "hash") out[key] = data[key];
  }
  var requests = [];
  for (var i = 0; i < (data.requests ? data.requests.length : 0); i += 1) {
    var old = data.requests[i];
    var request = {};
    for (var field in old) {
      if (Object.hasOwn(old, field)) request[field] = old[field];
    }
    if (request.resolvedBy === undefined) request.resolvedBy = 0;
    requests.push(request);
  }
  out.requests = requests;
  out.v = 6;
  return out;
});

export function migrate(data) {
  var working = data;
  var guard = 0;
  while (working.v < SAVE_VERSION) {
    if (!Object.hasOwn(MIGRATIONS, working.v)) {
      return { ok: false, reason: "no migration from version " + working.v };
    }
    working = MIGRATIONS[working.v](working);
    guard += 1;
    if (guard > 64) return { ok: false, reason: "migration loop" };
  }
  if (working.v > SAVE_VERSION) {
    return { ok: false, reason: "save is from a newer build (version " + working.v + ")" };
  }
  return { ok: true, data: working };
}

export function fromSave(data) {
  if (!data || typeof data !== "object") return { ok: false, reason: "not a save" };
  if (typeof data.v !== "number") return { ok: false, reason: "no version" };

  var migrated = migrate(data);
  if (!migrated.ok) return migrated;
  var save = migrated.data;

  // Options are rebuilt through defaultOptions so that a field added since
  // the save was written gets its default instead of becoming undefined —
  // which would reach the hash and produce a different city.
  var options = defaultOptions(save.options);
  var state = createState(options);

  state.tick = save.tick;
  state.rng.s = save.rng >>> 0;
  state.treasury = save.treasury;
  state.tax = save.tax === undefined ? 7 : save.tax;
  state.population = save.population;
  state.jobs = save.jobs;
  state.demand = {
    residential: save.demand.residential,
    commercial: save.demand.commercial,
    industrial: save.demand.industrial,
  };
  state.nextId = save.nextId;
  state.scanCursor = save.scanCursor === undefined ? 0 : save.scanCursor;
  // `undefined` where a save predates the field: fall back to what createState
  // already put there rather than writing undefined into hashed state.
  if (save.disaster) state.disaster = save.disaster;
  if (save.traffic) state.traffic = save.traffic;
  if (save.quests) {
    state.quests = {
      active: save.quests.active ? save.quests.active : [],
      completed: save.quests.completed ? save.quests.completed : [],
      vars: save.quests.vars ? save.quests.vars : [],
    };
  }
  // A save written before §9.4 has no funding. Every service defaults to 100,
  // which is what the older save's behaviour was.
  state.funding = {};
  for (var fi = 0; fi < FUNDING_SERVICES.length; fi += 1) {
    var got = save.funding ? save.funding[FUNDING_SERVICES[fi]] : undefined;
    state.funding[FUNDING_SERVICES[fi]] = typeof got === "number" ? got | 0 : 100;
  }

  // A save written before slice 4.6 has no history. An empty one is correct —
  // the city genuinely has no recorded past — and it hashes to a length of
  // zero, which is what the older save's own checksum was computed against.
  state.history = { samples: [] };
  if (save.history && Array.isArray(save.history.samples)) {
    var hi;
    var hf;
    for (hi = 0; hi < save.history.samples.length; hi += 1) {
      var row = save.history.samples[hi];
      var sample = {};
      for (hf = 0; hf < HISTORY_FIELDS.length; hf += 1) {
        var value = row[HISTORY_FIELDS[hf]];
        sample[HISTORY_FIELDS[hf]] = typeof value === "number" ? value | 0 : 0;
      }
      state.history.samples.push(sample);
    }
  }
  state.players = save.players;
  state.buildings = save.buildings;
  state.requests = save.requests;
  state.derelicts = save.derelicts;
  state.contracts = save.contracts;

  for (var i = 0; i < TILE_LAYERS.length; i += 1) {
    var name = TILE_LAYERS[i].name;
    var runs = save.tiles[name];
    if (!runs) continue;
    var filled = decodeLayer(runs, state.tiles[name]);
    if (filled !== state.tiles[name].length) {
      return { ok: false, reason: "layer " + name + " is the wrong size" };
    }
  }

  // Every ruin the save did not account for starts its clock now (X3c). A
  // version-5 save lists them, so this only ever fires for a migrated one —
  // which is where the 4 -> 5 note says the rule lives, because the list has to
  // be filled AFTER the tile layers are decoded.
  if (state.derelicts.length === 0) {
    for (var r = 0; r < state.tiles.flags.length; r += 1) {
      if ((state.tiles.flags[r] & FLAG_RUINED) !== 0) {
        state.derelicts.push({ tile: r, sinceTick: state.tick });
      }
    }
  }

  var recomputed = hashState(state);
  if (save.hash && save.hash !== recomputed) {
    return { ok: false, reason: "save does not match its own hash", expected: save.hash, actual: recomputed, state: state };
  }
  return { ok: true, state: state, hash: recomputed };
}

/** Rough size of a save, for the storage budget. */
export function saveSize(save) {
  return JSON.stringify(save).length;
}
