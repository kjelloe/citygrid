// State: structure-of-arrays for the per-tile fields, entity lists for the
// rest, and one explicitly ordered hash.
//
// The hashed field list lives HERE and in test/fixtures' local copy. Changing
// a hash must always be a two-file act (CLAUDE.md).

import { u8, u16, i32, copyU8, copyU16, copyI32, fill } from "../shared/arrays.js";
import { makeRng, copyRng } from "../shared/prng.js";
import { newHash, hashByte, hashBytes, digest } from "../shared/statehash.js";
import {
  makeSink, writeU8, writeI32, writeI64, writeString, writeBool, finish,
} from "../shared/canonical.js";
import { OPTION_FIELDS, copyOptions } from "./options.js";
import { TERRAIN_GRASS, OWNER_NATURE, HISTORY_FIELDS, FUNDING_SERVICES } from "./constants.js";

/** Per-tile arrays, in hash order. Appending is safe; reordering is not. */
export var TILE_LAYERS = [
  { name: "terrain", kind: "u8" },
  { name: "elevation", kind: "u8" },
  { name: "zone", kind: "u8" },
  { name: "road", kind: "u8" },
  { name: "wire", kind: "u8" },
  { name: "pipe", kind: "u8" },
  { name: "flags", kind: "u8" },
  { name: "owner", kind: "u8" },
  { name: "district", kind: "u8" },
  { name: "pollution", kind: "u8" },
  { name: "crime", kind: "u8" },
  { name: "landValue", kind: "u8" },
  { name: "traffic", kind: "u8" },
  { name: "fireRisk", kind: "u8" },
  { name: "healthRisk", kind: "u8" },
  { name: "buildingId", kind: "u16" },
];

function allocLayer(kind, length) {
  if (kind === "u16") return u16(length);
  if (kind === "i32") return i32(length);
  return u8(length);
}

function copyLayer(kind, source) {
  if (kind === "u16") return copyU16(source);
  if (kind === "i32") return copyI32(source);
  return copyU8(source);
}

/** The disaster record. Defined here rather than imported from disasters.js:
 * state.js is the bottom of the import graph and must stay there, and this is a
 * plain record of integers like `supply` beside it. `disasters.js` gives the
 * fields meaning; state.js only has to allocate, copy and hash them. */
function copyQuestEntries(list) {
  var out = [];
  var i;
  for (i = 0; i < list.length; i += 1) {
    out.push({ id: list[i].id, startedTick: list[i].startedTick, choice: list[i].choice });
  }
  return out;
}

function copyQuestVars(list) {
  var out = [];
  var i;
  for (i = 0; i < list.length; i += 1) out.push({ name: list[i].name, value: list[i].value });
  return out;
}

function makeDisaster() {
  return { kind: 0, phase: 0, ticks: 0, x: 0, y: 0, radius: 0, damage: 0 };
}

function copyDisaster(d) {
  return { kind: d.kind, phase: d.phase, ticks: d.ticks, x: d.x, y: d.y, radius: d.radius, damage: d.damage };
}

export function createState(options) {
  var width = options.width;
  var height = options.height;
  var count = width * height;

  var tiles = {};
  for (var i = 0; i < TILE_LAYERS.length; i += 1) {
    tiles[TILE_LAYERS[i].name] = allocLayer(TILE_LAYERS[i].kind, count);
  }
  fill(tiles.terrain, TERRAIN_GRASS);
  fill(tiles.owner, OWNER_NATURE);

  return {
    options: copyOptions(options),
    tick: 0,
    rng: makeRng(options.seed),
    width: width,
    height: height,
    tiles: tiles,
    players: [],
    buildings: [],
    requests: [],
    contracts: [],
    nextId: 1,
    scanCursor: 0,
    treasury: options.startingTreasury,
    tax: 7,
    population: 0,
    jobs: 0,
    // Regional demand pool (ruling 001). Residents and firms belong to the
    // region, not to a player; allocation between seats happens at the lot.
    demand: { residential: 0, commercial: 0, industrial: 0 },
    // At most one disaster at a time (gamedesign.md §12). Integers only, like
    // everything else in state, and hashed — a client that disagreed about
    // whether a flood was coming would disagree about everything after it.
    disaster: makeDisaster(),
    // Derived from the road graph every month, and hashed: it feeds pollution,
    // which feeds land value, which feeds what gets built.
    traffic: { commuters: 0, congested: 0, stranded: 0, averageCommute: 0 },
    // Quest progress is hashed: two clients that disagree about which quests
    // are running will disagree about the rewards those quests paid out.
    // Everything in here is kept SORTED, so canonical serialisation never
    // depends on the order things happened to be added.
    quests: { active: [], completed: [], vars: [] },
    // One integer sample a month, oldest first, capped at HISTORY_CAP. Hashed
    // and saved: a loaded city with empty graphs is a city that has forgotten
    // twenty years the player remembers.
    history: { samples: [] },
    // Department funding (§9.4), as a percentage per service. Hashed: it
    // changes what the police actually cover and what the city pays for them,
    // so two clients that disagreed about it would disagree about crime.
    funding: makeFunding(),
    // Derived every month from hashed inputs, so it is deliberately NOT
    // hashed: it cannot diverge unless its inputs already have, and hashing
    // it would only add a second place to forget when it changes shape.
    supply: {
      power: { capacity: 0, demand: 0, served: 0, starved: 0, components: 0 },
      water: { capacity: 0, demand: 0, served: 0, starved: 0, components: 0 },
    },
    civic: {
      crimeAverage: 0, pollutionAverage: 0, landValueAverage: 0,
      healthRiskAverage: 0, firePercent: 0, policePercent: 0, developed: 0,
    },
  };
}

/** Deep copy. Every nested mutable array is copied — three separate aliasing
 * bugs in a sibling project came from forgetting one, and a shared nested
 * object lets a backward replay scrub read the future. */
export function copyState(state) {
  var tiles = {};
  for (var i = 0; i < TILE_LAYERS.length; i += 1) {
    var layer = TILE_LAYERS[i];
    tiles[layer.name] = copyLayer(layer.kind, state.tiles[layer.name]);
  }
  return {
    options: copyOptions(state.options),
    tick: state.tick,
    rng: copyRng(state.rng),
    width: state.width,
    height: state.height,
    tiles: tiles,
    players: copyPlayers(state.players),
    buildings: copyBuildings(state.buildings),
    requests: copyRequests(state.requests),
    contracts: copyContracts(state.contracts),
    nextId: state.nextId,
    scanCursor: state.scanCursor,
    treasury: state.treasury,
    tax: state.tax,
    population: state.population,
    jobs: state.jobs,
    demand: {
      residential: state.demand.residential,
      commercial: state.demand.commercial,
      industrial: state.demand.industrial,
    },
    supply: {
      power: copySupply(state.supply.power),
      water: copySupply(state.supply.water),
    },
    disaster: copyDisaster(state.disaster),
    quests: {
      active: copyQuestEntries(state.quests.active),
      completed: state.quests.completed.slice(),
      vars: copyQuestVars(state.quests.vars),
    },
    history: { samples: copyHistorySamples(state.history.samples) },
    funding: copyFunding(state.funding),
    traffic: {
      commuters: state.traffic.commuters,
      congested: state.traffic.congested,
      stranded: state.traffic.stranded,
      averageCommute: state.traffic.averageCommute,
    },
    civic: {
      crimeAverage: state.civic.crimeAverage,
      pollutionAverage: state.civic.pollutionAverage,
      landValueAverage: state.civic.landValueAverage,
      healthRiskAverage: state.civic.healthRiskAverage,
      firePercent: state.civic.firePercent,
      policePercent: state.civic.policePercent,
      developed: state.civic.developed,
    },
  };
}

function copySupply(s) {
  return {
    capacity: s.capacity, demand: s.demand, served: s.served,
    starved: s.starved, components: s.components,
  };
}

export function copyPlayers(players) {
  var out = [];
  for (var i = 0; i < players.length; i += 1) {
    var p = players[i];
    out.push({
      seat: p.seat,
      name: p.name,
      colour: p.colour,
      status: p.status,
      treasury: p.treasury,
      requestPolicy: p.requestPolicy,
      joinedTick: p.joinedTick,
      lastSeenTick: p.lastSeenTick,
    });
  }
  return out;
}

export function copyBuildings(buildings) {
  var out = [];
  for (var i = 0; i < buildings.length; i += 1) {
    var b = buildings[i];
    out.push({
      id: b.id,
      def: b.def,
      zone: b.zone,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      owner: b.owner,
      level: b.level,
      valueTier: b.valueTier,
      occupancy: b.occupancy,
      condition: b.condition,
      builtTick: b.builtTick,
      flags: b.flags,
    });
  }
  return out;
}

/** Local for the same reason as the copiers below. Written through
 * `FUNDING_SERVICES` rather than as a literal so the record and the hash cannot
 * name different services. */
function makeFunding() {
  var out = {};
  var i;
  for (i = 0; i < FUNDING_SERVICES.length; i += 1) out[FUNDING_SERVICES[i]] = 100;
  return out;
}

function copyFunding(funding) {
  var out = {};
  var i;
  for (i = 0; i < FUNDING_SERVICES.length; i += 1) {
    out[FUNDING_SERVICES[i]] = funding[FUNDING_SERVICES[i]];
  }
  return out;
}

/** Local, like `copyDisaster` and `copyQuestEntries` above: `engine/history.js`
 * imports the reducer, and the reducer imports this file. */
function copyHistorySamples(samples) {
  var out = [];
  var i;
  var f;
  for (i = 0; i < samples.length; i += 1) {
    var sample = samples[i];
    var copy = {};
    for (f = 0; f < HISTORY_FIELDS.length; f += 1) {
      copy[HISTORY_FIELDS[f]] = sample[HISTORY_FIELDS[f]];
    }
    out.push(copy);
  }
  return out;
}

export function copyRequests(requests) {
  var out = [];
  for (var i = 0; i < requests.length; i += 1) {
    var r = requests[i];
    out.push({
      id: r.id,
      from: r.from,
      to: r.to,
      runs: r.runs.slice(),
      title: r.title,
      reason: r.reason,
      offer: r.offer,
      createdTick: r.createdTick,
      expiresTick: r.expiresTick,
      status: r.status,
    });
  }
  return out;
}

export function copyContracts(contracts) {
  var out = [];
  for (var i = 0; i < contracts.length; i += 1) {
    var c = contracts[i];
    out.push({
      id: c.id,
      from: c.from,
      to: c.to,
      kind: c.kind,
      units: c.units,
      price: c.price,
      status: c.status,
      createdTick: c.createdTick,
    });
  }
  return out;
}

/** The canonical serialization. Explicit order everywhere; nothing iterates
 * object keys, because key order is an implementation detail and a hash
 * cannot rest on one. */
export function writeState(sink, state) {
  for (var i = 0; i < OPTION_FIELDS.length; i += 1) {
    var value = state.options[OPTION_FIELDS[i]];
    if (typeof value === "string") writeString(sink, value);
    else if (typeof value === "boolean") writeBool(sink, value);
    else writeI32(sink, value);
  }
  writeI64(sink, state.tick);
  writeI32(sink, state.rng.s | 0);
  writeI32(sink, state.width);
  writeI32(sink, state.height);
  writeI64(sink, state.treasury);
  writeU8(sink, state.tax);
  writeI32(sink, state.population);
  writeI32(sink, state.jobs);
  writeI32(sink, state.demand.residential);
  writeI32(sink, state.demand.commercial);
  writeI32(sink, state.demand.industrial);
  writeI32(sink, state.nextId);
  writeI32(sink, state.scanCursor);
  writeU8(sink, state.disaster.kind);
  writeU8(sink, state.disaster.phase);
  writeI32(sink, state.disaster.ticks);
  writeI32(sink, state.disaster.x);
  writeI32(sink, state.disaster.y);
  writeI32(sink, state.disaster.radius);
  writeI32(sink, state.disaster.damage);
  writeI32(sink, state.traffic.commuters);
  writeI32(sink, state.traffic.congested);
  writeI32(sink, state.traffic.stranded);
  writeI32(sink, state.traffic.averageCommute);

  writeI32(sink, state.quests.active.length);
  for (var q = 0; q < state.quests.active.length; q += 1) {
    writeString(sink, state.quests.active[q].id);
    writeI64(sink, state.quests.active[q].startedTick);
    writeI32(sink, state.quests.active[q].choice);
  }
  writeI32(sink, state.quests.completed.length);
  for (var qc = 0; qc < state.quests.completed.length; qc += 1) {
    writeString(sink, state.quests.completed[qc]);
  }
  writeI32(sink, state.quests.vars.length);
  for (var qv = 0; qv < state.quests.vars.length; qv += 1) {
    writeString(sink, state.quests.vars[qv].name);
    writeI32(sink, state.quests.vars[qv].value);
  }

  // Funding, in FUNDING_SERVICES order — never key order.
  for (var fs = 0; fs < FUNDING_SERVICES.length; fs += 1) {
    writeI32(sink, state.funding[FUNDING_SERVICES[fs]]);
  }

  // The history. Length first, then each sample's fields in HISTORY_FIELDS
  // order — never `for (var k in sample)`, because canonical serialisation may
  // not depend on key order.
  writeI32(sink, state.history.samples.length);
  for (var hs = 0; hs < state.history.samples.length; hs += 1) {
    var row = state.history.samples[hs];
    for (var hf = 0; hf < HISTORY_FIELDS.length; hf += 1) {
      writeI32(sink, row[HISTORY_FIELDS[hf]]);
    }
  }

  writeI32(sink, state.players.length);
  for (var p = 0; p < state.players.length; p += 1) {
    var player = state.players[p];
    writeU8(sink, player.seat);
    writeString(sink, player.name);
    writeU8(sink, player.colour);
    writeU8(sink, player.status);
    writeI64(sink, player.treasury);
    writeString(sink, player.requestPolicy);
    writeI64(sink, player.joinedTick);
    writeI64(sink, player.lastSeenTick);
  }

  writeI32(sink, state.buildings.length);
  for (var b = 0; b < state.buildings.length; b += 1) {
    var building = state.buildings[b];
    writeI32(sink, building.id);
    writeString(sink, building.def);
    writeU8(sink, building.zone);
    writeI32(sink, building.x);
    writeI32(sink, building.y);
    writeU8(sink, building.w);
    writeU8(sink, building.h);
    writeU8(sink, building.owner);
    writeU8(sink, building.level);
    writeU8(sink, building.valueTier);
    writeI32(sink, building.occupancy);
    writeU8(sink, building.condition);
    writeI64(sink, building.builtTick);
    writeU8(sink, building.flags);
  }

  writeI32(sink, state.requests.length);
  for (var r = 0; r < state.requests.length; r += 1) {
    var request = state.requests[r];
    writeI32(sink, request.id);
    writeU8(sink, request.from);
    writeU8(sink, request.to);
    writeI32(sink, request.runs.length);
    for (var k = 0; k < request.runs.length; k += 1) writeI32(sink, request.runs[k]);
    writeString(sink, request.title);
    writeString(sink, request.reason);
    writeI64(sink, request.offer);
    writeI64(sink, request.createdTick);
    writeI64(sink, request.expiresTick);
    writeString(sink, request.status);
  }

  writeI32(sink, state.contracts.length);
  for (var c = 0; c < state.contracts.length; c += 1) {
    var contract = state.contracts[c];
    writeI32(sink, contract.id);
    writeU8(sink, contract.from);
    writeU8(sink, contract.to);
    writeString(sink, contract.kind);
    writeI32(sink, contract.units);
    writeI32(sink, contract.price);
    writeString(sink, contract.status);
    writeI64(sink, contract.createdTick);
  }
}

/** Hash of everything above plus every tile layer. Tile layers are hashed as
 * raw bytes, which is why they must be typed arrays and not arrays of
 * numbers. */
export function hashState(state) {
  var sink = makeSink(4096);
  writeState(sink, state);
  var h = hashBytes(newHash(), finish(sink));
  for (var i = 0; i < TILE_LAYERS.length; i += 1) {
    var layer = state.tiles[TILE_LAYERS[i].name];
    if (TILE_LAYERS[i].kind === "u8") {
      hashBytes(h, layer);
    } else {
      for (var k = 0; k < layer.length; k += 1) {
        hashByte(h, layer[k] & 0xff);
        hashByte(h, (layer[k] >>> 8) & 0xff);
      }
    }
  }
  return digest(h);
}
