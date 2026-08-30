// Saves. A save is state, and state is JSON-able by construction — no floats,
// no null, no Maps — so serialization is mostly a matter of not losing
// anything on the way back.
//
// Tile layers are run-length encoded, because a city map is enormously
// repetitive: mostly one terrain, mostly unzoned, mostly unowned. Storing
// 16 raw arrays of 16384 entries would be ~1 MB of JSON for a region that
// compresses to a few dozen kilobytes.

import { SAVE_VERSION } from "../shared/protocol.js";
import { createState, TILE_LAYERS, hashState } from "./state.js";
import { copyOptions, defaultOptions, OPTION_FIELDS } from "./options.js";
import { HISTORY_FIELDS, FUNDING_SERVICES } from "./constants.js";

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
  return {
    v: SAVE_VERSION,
    options: copyOptions(state.options),
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
    disaster: state.disaster,
    traffic: state.traffic,
    quests: state.quests,
    history: state.history,
    funding: state.funding,
    players: state.players,
    buildings: state.buildings,
    requests: state.requests,
    contracts: state.contracts,
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
