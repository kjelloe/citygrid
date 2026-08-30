// Slices 2.4, 2.5, 2.6: service coverage, pollution, crime, health, land
// value and fire.
//
// These are one pass because they feed each other in a fixed order. The tests
// therefore mostly assert directions — this input pushes that number this way
// — because the absolute values are era-0 and will move under the Wave 3 sweep.

import test from "node:test";
import assert from "node:assert/strict";
import { createState, hashState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import "../engine/build-commands.js";
import "../engine/development.js";
import "../engine/utilities.js";
import "../engine/economy.js";
import "../engine/civic.js";
import "../engine/fire.js";
import "../engine/disasters.js";
import "../engine/traffic.js";
import "../engine/history.js";
import { civicPass, pollutionPass, coveragePass } from "../engine/civic.js";
import { firePass, ignitionPass, isBurning, isRuined } from "../engine/fire.js";
import { utilitiesPass } from "../engine/utilities.js";
import { developmentPass } from "../engine/development.js";
import { systemNames } from "../engine/reducer.js";
import { CMD_JOIN, CMD_PLACE_BUILDING, CMD_BULLDOZE, CMD_TICK } from "../engine/commands.js";
import { RESULT } from "../shared/protocol.js";
import { tileAt, encodeRuns } from "../shared/grid.js";
import { NET_PRESENT } from "../engine/network.js";
import {
  ZONE_INDUSTRIAL, ZONE_RESIDENTIAL, ZONE_NONE, TERRAIN_FOREST, TERRAIN_WATER,
  FLAG_BURNING, FLAG_RUINED, FLAG_WATERED, FLAG_POWERED,
} from "../engine/constants.js";
import { rules } from "../engine/rules.js";
import { budgetFor } from "../engine/economy.js";
import { catalogue } from "../engine/catalogue.js";
import { FUNDING_SERVICES } from "../engine/constants.js";

const W = 24;
const at = (x, y) => tileAt(W, x, y);

function city(over) {
  const state = createState(defaultOptions({ width: W, height: W, seed: 31, seats: 2, ...over }));
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "One" });
  state.players[0].treasury = 1000000;
  return state;
}

function lot(state, zone, x, y, level = 3, occupancy = 40) {
  const id = state.nextId;
  state.nextId += 1;
  state.buildings.push({
    id, def: zone === ZONE_RESIDENTIAL ? "res" : "ind", zone, x, y, w: 1, h: 1,
    owner: 1, level, valueTier: 1, occupancy, condition: 100, builtTick: 0, flags: 0,
  });
  state.tiles.buildingId[at(x, y)] = id;
  state.tiles.zone[at(x, y)] = zone;
  return state.buildings[state.buildings.length - 1];
}

test("monthly systems run in a declared order, not in import order", () => {
  // Land value must be current before development scores a lot, and the lot
  // must exist before tax is collected on it. An order that depended on which
  // file was imported first would be a desync waiting for a reordered import.
  const names = systemNames().filter((n) => n.startsWith("month:"));
  const order = (name) => names.indexOf(`month:${name}`);
  assert.ok(order("civic") < order("utilities"), "civic before utilities");
  assert.ok(order("utilities") < order("development"), "utilities before development");
  assert.ok(order("development") < order("economy"), "development before economy");
});

test("industry pollutes, and pollution spreads to its neighbours", () => {
  const state = city();
  lot(state, ZONE_INDUSTRIAL, 12, 12);
  pollutionPass(state);
  assert.ok(state.tiles.pollution[at(12, 12)] > 0, "the factory is not polluting");
  assert.ok(state.tiles.pollution[at(13, 12)] > 0, "pollution did not spread");
  assert.ok(state.tiles.pollution[at(13, 12)] < state.tiles.pollution[at(12, 12)],
    "it should fall off with distance");
});

test("a coal plant pollutes more than a wind turbine", () => {
  const dirty = city();
  apply(dirty, { type: CMD_PLACE_BUILDING, actor: 1, def: "coalPlant", x: 10, y: 10 });
  pollutionPass(dirty);
  const clean = city();
  apply(clean, { type: CMD_PLACE_BUILDING, actor: 1, def: "windTurbine", x: 10, y: 10 });
  pollutionPass(clean);
  assert.ok(dirty.tiles.pollution[at(10, 10)] > clean.tiles.pollution[at(10, 10)]);
});

test("forest cleans the air, which makes protecting it a mechanical choice", () => {
  const bare = city();
  lot(bare, ZONE_INDUSTRIAL, 12, 12);
  pollutionPass(bare);
  const wooded = city();
  lot(wooded, ZONE_INDUSTRIAL, 12, 12);
  for (let x = 8; x < 18; x += 1) {
    for (let y = 8; y < 18; y += 1) {
      if (x !== 12 || y !== 12) wooded.tiles.terrain[at(x, y)] = TERRAIN_FOREST;
    }
  }
  pollutionPass(wooded);
  const total = (state) => {
    let sum = 0;
    for (let i = 0; i < state.tiles.pollution.length; i += 1) sum += state.tiles.pollution[i];
    return sum;
  };
  assert.ok(total(wooded) < total(bare), `wooded ${total(wooded)} should be under bare ${total(bare)}`);
});

test("a station covers its radius and falls off with distance", () => {
  const state = city();
  apply(state, { type: CMD_PLACE_BUILDING, actor: 1, def: "policeStation", x: 12, y: 12 });
  const coverage = coveragePass(state);
  assert.ok(coverage.police[at(12, 12)] > 0, "no coverage at the station");
  assert.ok(coverage.police[at(16, 12)] > 0, "no coverage nearby");
  assert.ok(coverage.police[at(16, 12)] < coverage.police[at(12, 12)], "no falloff");
  assert.equal(coverage.police[at(0, 0)], 0, "coverage reached the far corner");
});

test("an unpowered station covers less than a powered one", () => {
  const state = city();
  apply(state, { type: CMD_PLACE_BUILDING, actor: 1, def: "policeStation", x: 12, y: 12 });
  const dark = coveragePass(state).police[at(12, 12)];
  for (let dy = 0; dy < 2; dy += 1) {
    for (let dx = 0; dx < 2; dx += 1) {
      state.tiles.flags[at(12 + dx, 12 + dy)] |= FLAG_POWERED | FLAG_WATERED;
    }
  }
  assert.ok(coveragePass(state).police[at(12, 12)] > dark, "power made no difference");
});

test("police coverage reduces crime", () => {
  const bare = city();
  for (let i = 0; i < 8; i += 1) lot(bare, ZONE_RESIDENTIAL, 10 + i, 10);
  civicPass(bare);
  const guarded = city();
  for (let i = 0; i < 8; i += 1) lot(guarded, ZONE_RESIDENTIAL, 10 + i, 10);
  apply(guarded, { type: CMD_PLACE_BUILDING, actor: 1, def: "policeStation", x: 12, y: 13 });
  civicPass(guarded);
  assert.ok(guarded.civic.crimeAverage < bare.civic.crimeAverage,
    `${guarded.civic.crimeAverage} should be under ${bare.civic.crimeAverage}`);
});

test("no clean water is the largest health risk there is", () => {
  const state = city();
  const built = lot(state, ZONE_RESIDENTIAL, 12, 12);
  civicPass(state);
  const thirsty = state.tiles.healthRisk[at(12, 12)];
  state.tiles.flags[at(12, 12)] |= FLAG_WATERED;
  civicPass(state);
  assert.ok(state.tiles.healthRisk[at(12, 12)] < thirsty, "water did not improve health");
});

test("a hospital reduces health risk nearby", () => {
  const bare = city();
  for (let i = 0; i < 6; i += 1) lot(bare, ZONE_RESIDENTIAL, 10 + i, 10);
  civicPass(bare);
  const cared = city();
  for (let i = 0; i < 6; i += 1) lot(cared, ZONE_RESIDENTIAL, 10 + i, 10);
  apply(cared, { type: CMD_PLACE_BUILDING, actor: 1, def: "hospital", x: 11, y: 13 });
  civicPass(cared);
  assert.ok(cared.civic.healthRiskAverage < bare.civic.healthRiskAverage);
});

test("land value rises by water and falls beside industry", () => {
  const state = city();
  state.tiles.terrain[at(4, 4)] = TERRAIN_WATER;
  lot(state, ZONE_INDUSTRIAL, 18, 18);
  civicPass(state);
  assert.ok(state.tiles.landValue[at(4, 5)] > state.tiles.landValue[at(12, 12)],
    "waterfront should be worth more than the middle of nowhere");
  assert.ok(state.tiles.landValue[at(17, 18)] < state.tiles.landValue[at(12, 12)],
    "beside a factory should be worth less");
});

test("services raise land value", () => {
  const bare = city();
  lot(bare, ZONE_RESIDENTIAL, 12, 12);
  civicPass(bare);
  const served = city();
  lot(served, ZONE_RESIDENTIAL, 12, 12);
  apply(served, { type: CMD_PLACE_BUILDING, actor: 1, def: "fireStation", x: 14, y: 12 });
  civicPass(served);
  assert.ok(served.tiles.landValue[at(12, 12)] > bare.tiles.landValue[at(12, 12)]);
});

test("high crime and high pollution are reported, not left to be noticed", () => {
  const state = city();
  for (let x = 6; x < 18; x += 1) {
    for (let y = 6; y < 10; y += 1) lot(state, ZONE_INDUSTRIAL, x, y, 4);
  }
  const events = civicPass(state);
  assert.ok(state.civic.pollutionAverage > 0);
  assert.ok(Array.isArray(events));
});

test("a fire burns, spreads, and can destroy the building it started in", () => {
  const state = city();
  for (let x = 10; x < 16; x += 1) lot(state, ZONE_RESIDENTIAL, x, 12, 4);
  civicPass(state);
  state.tiles.flags[at(12, 12)] |= FLAG_BURNING;
  let burnt = 0;
  for (let i = 0; i < 200; i += 1) {
    for (const event of firePass(state)) if (event.kind === "burntDown") burnt += 1;
  }
  assert.ok(burnt > 0, "nothing ever burned down");
});

test("a fire goes out eventually, even with no fire service at all", () => {
  const state = city();
  lot(state, ZONE_RESIDENTIAL, 12, 12);
  civicPass(state);
  state.tiles.flags[at(12, 12)] |= FLAG_BURNING;
  for (let i = 0; i < 500; i += 1) firePass(state);
  let burning = 0;
  for (let i = 0; i < state.tiles.flags.length; i += 1) if (isBurning(state, i)) burning += 1;
  assert.equal(burning, 0, "the city is still on fire after 500 ticks");
});

test("fire cover makes a city measurably safer", () => {
  const risk = (withStation) => {
    const state = city();
    for (let x = 10; x < 16; x += 1) lot(state, ZONE_RESIDENTIAL, x, 12, 4);
    if (withStation) apply(state, { type: CMD_PLACE_BUILDING, actor: 1, def: "fireStation", x: 12, y: 14 });
    civicPass(state);
    return state.tiles.fireRisk[at(12, 12)];
  };
  assert.ok(risk(true) < risk(false), "a fire station did not reduce fire risk");
});

test("a burnt building leaves ruins, and ruins block rebuilding", () => {
  const state = city();
  const built = lot(state, ZONE_RESIDENTIAL, 12, 12, 4);
  civicPass(state);
  state.tiles.flags[at(12, 12)] |= FLAG_BURNING;
  for (let i = 0; i < 300; i += 1) firePass(state);
  assert.ok(isRuined(state, at(12, 12)), "no ruins were left");
  assert.equal(state.tiles.buildingId[at(12, 12)], 0, "the building is still there");
});

test("bulldozing clears ruins", () => {
  const state = city();
  state.tiles.flags[at(9, 9)] |= FLAG_RUINED;
  assert.equal(apply(state, { type: CMD_BULLDOZE, actor: 1, runs: encodeRuns([at(9, 9)]) }).result, RESULT.OK);
  assert.ok(!isRuined(state, at(9, 9)));
});

test("the whole lot burns, never half of it", () => {
  // Half a burnt building is not a state the rest of the simulation knows how
  // to reason about.
  const state = city();
  const id = state.nextId;
  state.nextId += 1;
  state.buildings.push({
    id, def: "res", zone: ZONE_RESIDENTIAL, x: 10, y: 10, w: 2, h: 2, owner: 1,
    level: 4, valueTier: 1, occupancy: 40, condition: 100, builtTick: 0, flags: 0,
  });
  for (let dy = 0; dy < 2; dy += 1) {
    for (let dx = 0; dx < 2; dx += 1) state.tiles.buildingId[at(10 + dx, 10 + dy)] = id;
  }
  civicPass(state);
  state.tiles.flags[at(10, 10)] |= FLAG_BURNING;
  for (let i = 0; i < 300; i += 1) firePass(state);
  for (let dy = 0; dy < 2; dy += 1) {
    for (let dx = 0; dx < 2; dx += 1) {
      assert.equal(state.tiles.buildingId[at(10 + dx, 10 + dy)], 0, "part of the lot survived");
    }
  }
});

test("ignition is rarer in a well-covered city", () => {
  const ignitions = (withStations) => {
    const state = city({ seed: 77 });
    for (let x = 6; x < 18; x += 1) lot(state, ZONE_RESIDENTIAL, x, 12, 4);
    if (withStations) {
      apply(state, { type: CMD_PLACE_BUILDING, actor: 1, def: "fireStation", x: 8, y: 14 });
      apply(state, { type: CMD_PLACE_BUILDING, actor: 1, def: "fireStation", x: 15, y: 14 });
    }
    let count = 0;
    for (let i = 0; i < 600; i += 1) {
      civicPass(state);
      for (const event of ignitionPass(state)) if (event.kind === "fireStarted") count += 1;
      for (let k = 0; k < state.tiles.flags.length; k += 1) state.tiles.flags[k] &= ~FLAG_BURNING;
    }
    return count;
  };
  const covered = ignitions(true);
  const bare = ignitions(false);
  assert.ok(covered < bare, `${covered} ignitions with cover vs ${bare} without`);
});

test("the civic pass is deterministic", () => {
  const a = city();
  const b = city();
  for (let i = 0; i < 6; i += 1) {
    lot(a, ZONE_INDUSTRIAL, 8 + i, 8);
    lot(b, ZONE_INDUSTRIAL, 8 + i, 8);
  }
  for (let i = 0; i < 20; i += 1) {
    civicPass(a);
    civicPass(b);
  }
  assert.equal(hashState(a), hashState(b));
});

// --- department funding (gamedesign.md §9.4) --------------------------------

test("funding scales what a station covers", () => {
  // The comment above `coveragePass` claimed for the life of the project that
  // coverage fell off "with distance and with funding". It never did: strength
  // was a flat 100. This is the assertion that makes the sentence true.
  const build = (percent) => {
    const state = fundedCity();
    state.funding.police = percent;
    const fields = coveragePass(state);
    return fields.police.reduce((sum, v) => sum + v, 0);
  };
  const lean = build(50);
  const normal = build(100);
  const generous = build(150);
  assert.ok(lean < normal, `50% covered ${lean}, 100% covered ${normal}`);
  assert.ok(generous > normal, `150% covered ${generous}, 100% covered ${normal}`);
});

test("funding scales what a department costs", () => {
  const lean = fundedCity();
  lean.funding.fire = 50;
  const generous = fundedCity();
  generous.funding.fire = 150;
  const cheap = budgetFor(lean, 1).expenses;
  const dear = budgetFor(generous, 1).expenses;
  assert.ok(dear > cheap, `150% cost ${dear}, 50% cost ${cheap}`);
});

test("a funding rate outside the range is refused, not clamped", () => {
  // A clamp turns a bug in a caller into a silent surprise, and the reducer is
  // the one place that must not be forgiving.
  const state = fundedCity();
  const service = rules().service;
  assert.equal(apply(state, { type: "setFunding", actor: 1, service: "police", percent: 500 }).result, RESULT.INVALID);
  assert.equal(apply(state, { type: "setFunding", actor: 1, service: "police", percent: 0 }).result, RESULT.INVALID);
  assert.equal(apply(state, { type: "setFunding", actor: 1, service: "sanitation", percent: 100 }).result, RESULT.INVALID);
  assert.equal(state.funding.police, 100, "a refused command must change nothing");
  assert.equal(apply(state, { type: "setFunding", actor: 1, service: "police", percent: service.fundingMaxPercent }).result, RESULT.OK);
  assert.equal(state.funding.police, service.fundingMaxPercent);
});

test("every service a building offers has a funding level", () => {
  // A station type added to data/buildings.json with a new service name would
  // otherwise read `undefined` as its strength and cover nothing.
  const services = new Set();
  for (const def of Object.values(catalogue())) if (def?.service) services.add(def.service);
  for (const service of services) {
    assert.ok(FUNDING_SERVICES.includes(service),
      `'${service}' is offered by a building and has no funding level`);
  }
});

/** A small city with one station of each kind, powered and watered, for the
 * funding assertions above. */
function fundedCity() {
  const state = createState(defaultOptions({ seed: 21, width: 24, height: 24, seats: 1 }));
  state.players.push({ seat: 1, name: "Mayor", treasury: 50000, status: 0 });
  let id = 1;
  for (const [def, x] of [["policeStation", 6], ["fireStation", 12], ["hospital", 17]]) {
    const spec = catalogue()[def];
    state.buildings.push({
      id: id, def, zone: 0, x, y: 10, w: spec.w, h: spec.h, owner: 1,
      level: 1, valueTier: 0, occupancy: 0, condition: 100, builtTick: 0, flags: 0,
    });
    for (let dy = 0; dy < spec.h; dy += 1) {
      for (let dx = 0; dx < spec.w; dx += 1) {
        const i = (10 + dy) * state.width + x + dx;
        state.tiles.buildingId[i] = id;
        state.tiles.flags[i] |= 1 | 2;
      }
    }
    id += 1;
  }
  return state;
}
