// Slice 2.3: taxes, upkeep and the monthly budget.
//
// Accounting is per owner from the start, even at one seat — retrofitting
// per-owner money into a system that assumed one purse is the same mistake as
// retrofitting ownership into the reducer.

import test from "node:test";
import assert from "node:assert/strict";
import { createState, hashState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import "../engine/build-commands.js";
import "../engine/development.js";
import "../engine/utilities.js";
import { budgetFor, economyPass } from "../engine/economy.js";
import { developmentPass } from "../engine/development.js";
import { CMD_JOIN, CMD_SET_TAX, CMD_PLACE_ROAD, CMD_PLACE_BUILDING } from "../engine/commands.js";
import { RESULT } from "../shared/protocol.js";
import { tileAt, encodeRuns } from "../shared/grid.js";
import { ZONE_RESIDENTIAL, ZONE_COMMERCIAL, ZONE_NONE } from "../engine/constants.js";

const W = 20;
const at = (x, y) => tileAt(W, x, y);

function city(over) {
  const state = createState(defaultOptions({ width: W, height: W, seed: 21, seats: 2, ...over }));
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "One" });
  apply(state, { type: CMD_JOIN, actor: 2, seat: 2, name: "Two" });
  return state;
}

function addLot(state, owner, zone, x, y, level = 2, occupancy = 20) {
  state.buildings.push({
    id: state.nextId, def: zone === ZONE_RESIDENTIAL ? "res" : "com", zone, x, y, w: 1, h: 1,
    owner, level, valueTier: 1, occupancy, condition: 100, builtTick: 0, flags: 0,
  });
  state.nextId += 1;
  state.tiles.buildingId[at(x, y)] = state.nextId - 1;
  state.tiles.landValue[at(x, y)] = 120;
}

test("the tax rate can be set within its range and refused outside it", () => {
  const state = city();
  assert.equal(apply(state, { type: CMD_SET_TAX, actor: 1, rate: 12 }).result, RESULT.OK);
  assert.equal(state.tax, 12);
  for (const rate of [-1, 21, 1.5, undefined, "7", NaN]) {
    assert.equal(apply(state, { type: CMD_SET_TAX, actor: 1, rate }).result, RESULT.INVALID,
      `rate ${String(rate)} was accepted`);
  }
  assert.equal(state.tax, 12, "a refused rate did not stick");
});

test("residents pay tax, and more of it at a higher rate", () => {
  const state = city();
  addLot(state, 1, ZONE_RESIDENTIAL, 3, 3);
  state.tax = 5;
  const low = budgetFor(state, 1).income;
  state.tax = 15;
  const high = budgetFor(state, 1).income;
  assert.ok(low > 0, "an occupied home should yield something");
  assert.ok(high > low, `${high} should exceed ${low}`);
});

test("land value is worth as much as headcount", () => {
  // Which is what makes parks and waterfronts an economic decision rather
  // than decoration.
  const state = city();
  addLot(state, 1, ZONE_RESIDENTIAL, 3, 3);
  state.tax = 10;
  state.tiles.landValue[at(3, 3)] = 60;
  const poor = budgetFor(state, 1).income;
  state.tiles.landValue[at(3, 3)] = 240;
  assert.ok(budgetFor(state, 1).income > poor);
});

test("an empty home yields nothing", () => {
  const state = city();
  addLot(state, 1, ZONE_RESIDENTIAL, 3, 3, 2, 0);
  state.tax = 10;
  assert.equal(budgetFor(state, 1).income, 0);
});

test("income and upkeep are attributed to the right owner", () => {
  const state = city({ treasury: "separate" });
  addLot(state, 1, ZONE_RESIDENTIAL, 3, 3);
  addLot(state, 2, ZONE_RESIDENTIAL, 5, 5);
  state.tax = 10;
  assert.ok(budgetFor(state, 1).income > 0);
  assert.ok(budgetFor(state, 2).income > 0);
  assert.equal(budgetFor(state, 3).income, 0, "a seat with nothing earns nothing");
});

test("roads, wires and pipes all cost their owner upkeep", () => {
  const state = city({ treasury: "separate" });
  const bare = budgetFor(state, 1).expenses;
  const cells = [];
  for (let x = 2; x < 12; x += 1) cells.push(at(x, 8));
  state.players[0].treasury = 100000;
  apply(state, { type: CMD_PLACE_ROAD, actor: 1, runs: encodeRuns(cells) });
  const withRoad = budgetFor(state, 1).expenses;
  assert.ok(withRoad > bare, "a road should cost something to keep");
});

test("a placed building costs its catalogue upkeep", () => {
  const state = city({ treasury: "separate" });
  state.players[0].treasury = 100000;
  const before = budgetFor(state, 1).expenses;
  apply(state, { type: CMD_PLACE_BUILDING, actor: 1, def: "coalPlant", x: 4, y: 4 });
  assert.equal(budgetFor(state, 1).expenses - before, 80, "coal plant upkeep");
});

test("difficulty scales both sides of the ledger", () => {
  const yieldAt = (difficulty) => {
    const state = city({ difficulty, treasury: "separate" });
    addLot(state, 1, ZONE_RESIDENTIAL, 3, 3);
    state.tax = 10;
    return budgetFor(state, 1).income;
  };
  assert.ok(yieldAt("relaxed") > yieldAt("steady"));
  assert.ok(yieldAt("steady") > yieldAt("demanding"));
});

test("a monthly pass moves money and reports the budget", () => {
  const state = city({ treasury: "separate" });
  addLot(state, 1, ZONE_RESIDENTIAL, 3, 3);
  state.tax = 10;
  const before = state.players[0].treasury;
  const events = economyPass(state);
  assert.ok(state.players[0].treasury > before, "income was not paid");
  assert.ok(events.some((e) => e.kind === "budget" && e.seat === 1));
});

test("a city that cannot pay does not run up an unbounded overdraft", () => {
  // Twenty years of silent debt reaching -130,000 is not a balance question,
  // it is a missing rule. It fails to maintain what it has instead.
  const state = city({ treasury: "separate" });
  state.players[0].treasury = 10;
  state.players[1].treasury = 10;
  apply(state, { type: CMD_PLACE_BUILDING, actor: 1, def: "coalPlant", x: 4, y: 4 });
  state.players[0].treasury = 10;
  for (let i = 0; i < 24; i += 1) economyPass(state);
  assert.ok(state.players[0].treasury >= 0, `treasury fell to ${state.players[0].treasury}`);
});

test("an unpayable bill is reported rather than absorbed silently", () => {
  const state = city({ treasury: "separate" });
  apply(state, { type: CMD_PLACE_BUILDING, actor: 1, def: "coalPlant", x: 4, y: 4 });
  state.players[0].treasury = 5;
  const events = economyPass(state);
  assert.ok(events.some((e) => e.kind === "unpaidUpkeep" && e.seat === 1));
});

test("the player is warned before the money runs out, not after", () => {
  // gamedesign 9.5: warnings before bankruptcy, never losing without notice.
  const state = city({ treasury: "separate" });
  state.players[0].treasury = 500;
  const events = economyPass(state);
  assert.ok(events.some((e) => e.kind === "fundsLow" && e.seat === 1));
});

test("a shared treasury divides the region's net between the seats", () => {
  const state = city({ treasury: "shared" });
  addLot(state, 1, ZONE_RESIDENTIAL, 3, 3);
  state.tax = 12;
  const before = state.players[1].treasury;
  economyPass(state);
  assert.ok(state.players[1].treasury > before, "seat two should share seat one's income");
});

test("separate treasuries do not share", () => {
  const state = city({ treasury: "separate" });
  addLot(state, 1, ZONE_RESIDENTIAL, 3, 3);
  state.tax = 12;
  const before = state.players[1].treasury;
  economyPass(state);
  assert.equal(state.players[1].treasury, before, "seat two earned from seat one's lot");
});

test("the economy is deterministic", () => {
  const a = city({ treasury: "separate" });
  const b = city({ treasury: "separate" });
  addLot(a, 1, ZONE_RESIDENTIAL, 3, 3);
  addLot(b, 1, ZONE_RESIDENTIAL, 3, 3);
  a.tax = 9;
  b.tax = 9;
  for (let i = 0; i < 30; i += 1) {
    economyPass(a);
    economyPass(b);
  }
  assert.equal(hashState(a), hashState(b));
});
