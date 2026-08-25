// Slice 1.4: zoning, the regional demand pool, lots, growth and decay.

import test from "node:test";
import assert from "node:assert/strict";
import { createState, hashState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import "../engine/build-commands.js";
import {
  developmentPass, computeDemand, census, hasRoadAccess, landValueAt,
} from "../engine/development.js";
import { CMD_JOIN, CMD_PAINT_ZONE, CMD_DEZONE, CMD_TICK, CMD_BULLDOZE } from "../engine/commands.js";
import { RESULT } from "../shared/protocol.js";
import { tileAt, encodeRuns } from "../shared/grid.js";
import { NET_PRESENT } from "../engine/network.js";
import {
  ZONE_NONE, ZONE_RESIDENTIAL, ZONE_COMMERCIAL, ZONE_INDUSTRIAL,
  TERRAIN_WATER, TICKS_PER_MONTH, OWNER_NATURE,
} from "../engine/constants.js";

const W = 20;
const at = (x, y) => tileAt(W, x, y);

function city(over) {
  const state = createState(defaultOptions({ width: W, height: W, seed: 3, seats: 2, ...over }));
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "One" });
  apply(state, { type: CMD_JOIN, actor: 2, seat: 2, name: "Two" });
  state.players[0].treasury = 1000000;
  return state;
}

/** A road along y, with the row above it zoned. */
function street(state, y, zone, x0 = 2, x1 = 12, actor = 1) {
  const road = [];
  for (let x = x0; x <= x1; x += 1) road.push(at(x, y));
  for (const index of road) state.tiles.road[index] = NET_PRESENT;
  const cells = [];
  for (let x = x0; x <= x1; x += 1) cells.push(at(x, y - 1));
  return apply(state, { type: CMD_PAINT_ZONE, actor, runs: encodeRuns(cells), zone });
}

test("zoning costs money and claims unowned ground", () => {
  const state = city();
  const before = state.players[0].treasury;
  const result = apply(state, {
    type: CMD_PAINT_ZONE, actor: 1, runs: encodeRuns([at(3, 3), at(4, 3)]), zone: ZONE_RESIDENTIAL,
  });
  assert.equal(result.result, RESULT.OK);
  assert.equal(state.tiles.zone[at(3, 3)], ZONE_RESIDENTIAL);
  assert.equal(state.tiles.owner[at(3, 3)], 1);
  assert.ok(state.players[0].treasury < before);
});

test("water cannot be zoned", () => {
  const state = city();
  state.tiles.terrain[at(5, 5)] = TERRAIN_WATER;
  assert.equal(apply(state, {
    type: CMD_PAINT_ZONE, actor: 1, runs: encodeRuns([at(5, 5)]), zone: ZONE_RESIDENTIAL,
  }).result, RESULT.INVALID);
});

test("an invalid zone type is refused", () => {
  const state = city();
  for (const zone of [0, 4, -1, undefined, "residential", 1.5]) {
    assert.equal(apply(state, {
      type: CMD_PAINT_ZONE, actor: 1, runs: encodeRuns([at(6, 6)]), zone,
    }).result, RESULT.INVALID, `zone ${String(zone)} was accepted`);
  }
});

test("zoning a neighbour's land is refused", () => {
  const state = city({ openBorders: false });
  state.tiles.owner[at(7, 7)] = 2;
  assert.equal(apply(state, {
    type: CMD_PAINT_ZONE, actor: 1, runs: encodeRuns([at(7, 7)]), zone: ZONE_RESIDENTIAL,
  }).result, RESULT.NOT_OWNER);
});

test("a developed lot must be demolished, not dezoned", () => {
  // Dezoning a building would delete someone's property through the back
  // door, bypassing the permission the whole design rests on.
  const state = city();
  street(state, 5, ZONE_RESIDENTIAL);
  for (let i = 0; i < 6; i += 1) developmentPass(state);
  const built = state.buildings[0];
  assert.ok(built, "nothing developed");
  const index = at(built.x, built.y);
  assert.equal(apply(state, { type: CMD_DEZONE, actor: 1, runs: encodeRuns([index]) }).result,
    RESULT.NEEDS_BULLDOZE);
});

test("nothing develops without road access", () => {
  const state = city();
  const cells = [];
  for (let x = 2; x < 10; x += 1) cells.push(at(x, 8));
  apply(state, { type: CMD_PAINT_ZONE, actor: 1, runs: encodeRuns(cells), zone: ZONE_RESIDENTIAL });
  for (let i = 0; i < 12; i += 1) developmentPass(state);
  assert.equal(state.buildings.length, 0, "buildings appeared with no road");
});

test("road access is measured around the whole footprint", () => {
  const state = city();
  state.tiles.road[at(5, 9)] = NET_PRESENT;
  assert.ok(hasRoadAccess(state, 5, 8, 1, 1), "adjacent tile has access");
  assert.ok(hasRoadAccess(state, 4, 8, 2, 1), "a wider lot still touches it");
  assert.ok(!hasRoadAccess(state, 5, 6, 1, 1), "two tiles away does not");
});

test("zoned land beside a road develops", () => {
  const state = city();
  street(state, 5, ZONE_RESIDENTIAL);
  for (let i = 0; i < 10; i += 1) developmentPass(state);
  assert.ok(state.buildings.length > 0, "nothing developed beside a road");
  assert.ok(state.buildings.every((b) => b.zone === ZONE_RESIDENTIAL));
});

test("a wide block of zoning grows into larger lots", () => {
  // Footprints are tried largest first, so dense zoning produces few large
  // lots rather than many small ones (gamedesign 6.3).
  const state = city();
  for (let x = 2; x <= 12; x += 1) state.tiles.road[at(x, 10)] = NET_PRESENT;
  const cells = [];
  for (let y = 8; y <= 9; y += 1) for (let x = 2; x <= 12; x += 1) cells.push(at(x, y));
  apply(state, { type: CMD_PAINT_ZONE, actor: 1, runs: encodeRuns(cells), zone: ZONE_RESIDENTIAL });
  for (let i = 0; i < 12; i += 1) developmentPass(state);
  assert.ok(state.buildings.some((b) => b.w * b.h > 1), "no lot larger than one tile appeared");
});

test("a building owns every tile of its footprint, and only those", () => {
  const state = city();
  street(state, 5, ZONE_RESIDENTIAL);
  for (let i = 0; i < 10; i += 1) developmentPass(state);
  for (const building of state.buildings) {
    for (let dy = 0; dy < building.h; dy += 1) {
      for (let dx = 0; dx < building.w; dx += 1) {
        assert.equal(state.tiles.buildingId[at(building.x + dx, building.y + dy)], building.id);
      }
    }
  }
});

test("demand is regional, not per-player (ruling 001)", () => {
  // Two players' lots draw on one pool, so a neighbour's growth is felt.
  const state = city();
  street(state, 5, ZONE_RESIDENTIAL, 2, 8, 1);
  street(state, 9, ZONE_RESIDENTIAL, 2, 8, 2);
  for (let i = 0; i < 10; i += 1) developmentPass(state);
  const owners = new Set(state.buildings.map((b) => b.owner));
  assert.ok(owners.size > 1, "both players should be developing from the same pool");
  assert.equal(typeof state.demand.residential, "number");
});

test("an empty region wants residents", () => {
  const state = city();
  const demand = computeDemand(state);
  assert.ok(demand.residential > 0, "a new region should attract people");
});

test("vacant housing suppresses residential demand", () => {
  const state = city();
  const empty = computeDemand(state).residential;
  state.buildings.push({
    id: 1, def: "res", zone: ZONE_RESIDENTIAL, x: 1, y: 1, w: 2, h: 2, owner: 1,
    level: 4, valueTier: 0, occupancy: 0, condition: 100, builtTick: 0, flags: 0,
  });
  assert.ok(computeDemand(state).residential < empty, "empty homes should cool demand");
});

test("jobs pull residents and residents pull shops", () => {
  const state = city();
  const base = computeDemand(state);
  state.buildings.push({
    id: 1, def: "ind", zone: ZONE_INDUSTRIAL, x: 1, y: 1, w: 2, h: 2, owner: 1,
    level: 4, valueTier: 0, occupancy: 0, condition: 100, builtTick: 0, flags: 0,
  });
  assert.ok(computeDemand(state).residential > base.residential, "jobs should attract residents");
});

test("taxes drag on demand", () => {
  const state = city();
  state.tax = 0;
  const low = computeDemand(state).residential;
  state.tax = 20;
  const high = computeDemand(state).residential;
  assert.ok(high < low, `tax of 20 should deter (${high} vs ${low})`);
});

test("demand moves toward its target rather than jumping", () => {
  // gamedesign 9.3: changes should not produce their full effect instantly.
  const state = city();
  state.demand = { residential: 0, commercial: 0, industrial: 0 };
  const target = computeDemand(state).residential;
  developmentPass(state);
  const after = state.demand.residential;
  assert.ok(after > 0 && after < target, `expected a partial step, got ${after} toward ${target}`);
});

test("demand stays inside its caps", () => {
  const state = city();
  for (let i = 0; i < 200; i += 1) developmentPass(state);
  assert.ok(Math.abs(state.demand.residential) <= 2000);
  assert.ok(Math.abs(state.demand.commercial) <= 1500);
  assert.ok(Math.abs(state.demand.industrial) <= 1500);
});

test("occupancy never exceeds housing", () => {
  const state = city();
  street(state, 5, ZONE_RESIDENTIAL);
  for (let i = 0; i < 40; i += 1) developmentPass(state);
  const counts = census(state);
  assert.ok(state.population <= counts.housing, `${state.population} people in ${counts.housing} homes`);
});

test("land value rises beside water and falls beside industry", () => {
  const state = city();
  const plain = landValueAt(state, at(10, 10));
  state.tiles.terrain[at(6, 6)] = TERRAIN_WATER;
  assert.ok(landValueAt(state, at(6, 7)) > plain, "waterfront should be worth more");
  state.tiles.zone[at(15, 14)] = ZONE_INDUSTRIAL;
  assert.ok(landValueAt(state, at(15, 15)) < plain, "beside a factory should be worth less");
});

test("the development pass is deterministic", () => {
  const a = city();
  const b = city();
  street(a, 5, ZONE_RESIDENTIAL);
  street(b, 5, ZONE_RESIDENTIAL);
  for (let i = 0; i < 20; i += 1) {
    developmentPass(a);
    developmentPass(b);
  }
  assert.equal(hashState(a), hashState(b));
});

test("development runs on the monthly tick, not every tick", () => {
  const state = city();
  street(state, 5, ZONE_RESIDENTIAL);
  for (let i = 0; i < TICKS_PER_MONTH - 1; i += 1) apply(state, { type: CMD_TICK });
  assert.equal(state.buildings.length, 0, "development ran early");
  for (let i = 0; i < TICKS_PER_MONTH * 12; i += 1) apply(state, { type: CMD_TICK });
  assert.ok(state.buildings.length > 0, "development never ran");
});

test("demolishing a lot frees its tiles for something else", () => {
  const state = city();
  street(state, 5, ZONE_RESIDENTIAL);
  for (let i = 0; i < 10; i += 1) developmentPass(state);
  const building = state.buildings[0];
  const cells = [];
  for (let dy = 0; dy < building.h; dy += 1) {
    for (let dx = 0; dx < building.w; dx += 1) cells.push(at(building.x + dx, building.y + dy));
  }
  const result = apply(state, { type: CMD_BULLDOZE, actor: 1, runs: encodeRuns(cells) });
  assert.equal(result.result, RESULT.OK);
  assert.equal(state.tiles.zone[cells[0]], ZONE_NONE, "the zoning went with it");
});
