// Slice 2.1/2.2: power and water. One implementation, because they are the
// same problem — a supply network is a connected component, everything
// touching it produces or consumes, and shortfall is shared.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";
import { createState, hashState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import "../engine/build-commands.js";
import "../engine/development.js";
import { supplyPass, utilitiesPass } from "../engine/utilities.js";
import { developmentPass } from "../engine/development.js";
import { catalogue, definition, definitionIds } from "../engine/catalogue.js";
import { CMD_JOIN, CMD_PLACE_BUILDING, CMD_PLACE_WIRE, CMD_PLACE_PIPE, CMD_PAINT_ZONE } from "../engine/commands.js";
import { RESULT } from "../shared/protocol.js";
import { tileAt, encodeRuns } from "../shared/grid.js";
import { NET_PRESENT } from "../engine/network.js";
import {
  FLAG_POWERED, FLAG_WATERED, TERRAIN_WATER, ZONE_RESIDENTIAL, ZONE_NONE,
} from "../engine/constants.js";

const W = 24;
const at = (x, y) => tileAt(W, x, y);
const buildings = JSON.parse(readFileSync(join(repoRoot, "data", "buildings.json"), "utf8"));

function city(over) {
  const state = createState(defaultOptions({ width: W, height: W, seed: 11, seats: 2, ...over }));
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "One" });
  apply(state, { type: CMD_JOIN, actor: 2, seat: 2, name: "Two" });
  state.players[0].treasury = 1000000;
  state.players[1].treasury = 1000000;
  return state;
}

const place = (state, def, x, y, actor = 1) =>
  apply(state, { type: CMD_PLACE_BUILDING, actor, def, x, y });

test("the engine's catalogue mirrors data/buildings.json", () => {
  const mirror = catalogue();
  for (const id of Object.keys(buildings)) {
    if (id === "note") continue;
    assert.deepEqual(mirror[id], buildings[id], `${id} has drifted from the JSON`);
  }
  assert.deepEqual(definitionIds(), Object.keys(buildings).filter((k) => k !== "note").sort());
});

test("every catalogue entry is complete and integral", () => {
  for (const id of definitionIds()) {
    const def = definition(id);
    assert.ok(def.w >= 1 && def.h >= 1, `${id} has no footprint`);
    assert.ok(Number.isInteger(def.cost) && def.cost >= 0, `${id} has a bad cost`);
    assert.ok(Number.isInteger(def.power), `${id} has a non-integer power figure`);
    assert.ok(Number.isInteger(def.water), `${id} has a non-integer water figure`);
    assert.ok(typeof def.category === "string", `${id} has no category`);
  }
});

test("a plant is placed, paid for, and occupies its whole footprint", () => {
  const state = city();
  const before = state.players[0].treasury;
  assert.equal(place(state, "coalPlant", 5, 5).result, RESULT.OK);
  const built = state.buildings[0];
  assert.equal(built.def, "coalPlant");
  for (let dy = 0; dy < 3; dy += 1) {
    for (let dx = 0; dx < 3; dx += 1) {
      assert.equal(state.tiles.buildingId[at(5 + dx, 5 + dy)], built.id);
    }
  }
  assert.ok(state.players[0].treasury < before);
});

test("a footprint that would overlap anything is refused", () => {
  const state = city();
  place(state, "coalPlant", 5, 5);
  assert.equal(place(state, "gasPlant", 6, 6).result, RESULT.NEEDS_BULLDOZE);
  assert.equal(place(state, "gasPlant", 23, 23).result, RESULT.INVALID, "off the edge");
  state.tiles.road[at(12, 12)] = NET_PRESENT;
  assert.equal(place(state, "gasPlant", 12, 12).result, RESULT.NEEDS_BULLDOZE, "on a road");
});

test("a surface pump needs a shore; a groundwater pump does not", () => {
  // This is what makes a dry region a different game rather than an
  // impossible one (ruling in worldgen: groundwater works anywhere).
  const state = city();
  assert.equal(place(state, "waterPump", 8, 8).result, RESULT.INVALID, "no water nearby");
  assert.equal(place(state, "groundwaterPump", 8, 8).result, RESULT.OK);
  state.tiles.terrain[at(15, 15)] = TERRAIN_WATER;
  assert.equal(place(state, "waterPump", 15, 16).result, RESULT.OK, "beside water");
});

test("placing on a neighbour's land is refused", () => {
  const state = city({ openBorders: false });
  for (let dy = 0; dy < 3; dy += 1) {
    for (let dx = 0; dx < 3; dx += 1) state.tiles.owner[at(10 + dx, 10 + dy)] = 2;
  }
  assert.equal(place(state, "coalPlant", 10, 10).result, RESULT.NOT_OWNER);
});

test("an unknown definition is refused", () => {
  const state = city();
  for (const def of ["fusionReactor", "", undefined, 42, "__proto__", "constructor"]) {
    assert.equal(apply(state, { type: CMD_PLACE_BUILDING, actor: 1, def, x: 3, y: 3 }).result,
      RESULT.INVALID, `${String(def)} was accepted`);
  }
});

test("a plant with no wire supplies nobody", () => {
  // Capacity exists, but it has to reach the city.
  const state = city();
  place(state, "coalPlant", 4, 4);
  place(state, "groundwaterPump", 4, 9);
  const report = supplyPass(state, "power");
  assert.equal(report.capacity, 700, "the plant is counted");
  assert.ok(report.starved > 0, "the pump should be unserved");
});

test("an unconnected consumer counts as unmet demand, not absent demand", () => {
  // Reporting it as zero makes the number useless for deciding whether to
  // build a plant — which is exactly how the deputy ended up building none.
  const state = city();
  place(state, "hospital", 6, 6);
  const report = supplyPass(state, "power");
  assert.ok(report.demand > 0, `unconnected demand was reported as ${report.demand}`);
});

test("a wire joins a plant to a consumer", () => {
  const state = city();
  place(state, "coalPlant", 2, 2);
  place(state, "hospital", 2, 8);
  const wire = [];
  for (let y = 5; y <= 7; y += 1) wire.push(at(2, y));
  assert.equal(apply(state, { type: CMD_PLACE_WIRE, actor: 1, runs: encodeRuns(wire) }).result, RESULT.OK);
  const report = supplyPass(state, "power");
  assert.equal(report.starved, 0, "everything should be served");
  assert.ok((state.tiles.flags[at(2, 8)] & FLAG_POWERED) !== 0, "the hospital is powered");
});

test("two separate networks do not share supply", () => {
  // The failure this prevents: a plant on one side of the map silently
  // powering a district it has no connection to.
  const state = city();
  place(state, "coalPlant", 2, 2);
  apply(state, { type: CMD_PLACE_WIRE, actor: 1, runs: encodeRuns([at(2, 5), at(2, 6)]) });
  place(state, "hospital", 18, 18);
  apply(state, { type: CMD_PLACE_WIRE, actor: 1, runs: encodeRuns([at(18, 17), at(17, 17)]) });
  const report = supplyPass(state, "power");
  assert.equal(report.components, 2);
  assert.ok((state.tiles.flags[at(18, 18)] & FLAG_POWERED) === 0, "the far hospital must be dark");
});

test("a component short of capacity browns out entirely, not at random", () => {
  // "Some of your city, chosen by lottery" is unreadable and unfixable from
  // the player's side.
  const state = city();
  place(state, "windTurbine", 2, 2);
  const wire = [];
  for (let x = 2; x <= 20; x += 1) wire.push(at(x, 4));
  apply(state, { type: CMD_PLACE_WIRE, actor: 1, runs: encodeRuns(wire) });
  for (let i = 0; i < 6; i += 1) place(state, "hospital", 4 + i * 3, 5);
  const report = supplyPass(state, "power");
  assert.ok(report.demand > report.capacity, "the test needs a genuine shortfall");
  assert.equal(report.served, 0, "nobody should be served in a browned-out component");
});

test("water flows through pipes, independently of power", () => {
  const state = city();
  state.tiles.terrain[at(1, 1)] = TERRAIN_WATER;
  place(state, "waterPump", 1, 2);
  place(state, "hospital", 1, 6);
  apply(state, { type: CMD_PLACE_PIPE, actor: 1, runs: encodeRuns([at(1, 3), at(1, 4), at(1, 5)]) });
  supplyPass(state, "water");
  assert.ok((state.tiles.flags[at(1, 6)] & FLAG_WATERED) !== 0, "the hospital has water");
  assert.ok((state.tiles.flags[at(1, 6)] & FLAG_POWERED) === 0, "but no power");
});

test("a placed building is never demolished by the development pass", () => {
  // It scored as an abandoned zoned lot — zone NONE means no demand, and the
  // unsupplied penalty finished the job. The deputy's power stations were
  // torn down the month after they were built, ten times over.
  const state = city();
  place(state, "coalPlant", 5, 5);
  const id = state.buildings[0].id;
  for (let i = 0; i < 40; i += 1) {
    utilitiesPass(state);
    developmentPass(state);
  }
  assert.ok(state.buildings.some((b) => b.id === id), "the plant was demolished");
});

test("a lot that loses its supply decays", () => {
  // It cannot grow unsupplied in the first place, so the test is what happens
  // when the plant goes away: a district cut off from power empties out.
  const state = city();
  for (let x = 2; x <= 12; x += 1) {
    state.tiles.road[at(x, 10)] = NET_PRESENT;
    state.tiles.wire[at(x, 10)] = NET_PRESENT;
    state.tiles.pipe[at(x, 10)] = NET_PRESENT;
  }
  place(state, "coalPlant", 15, 14);
  place(state, "groundwaterPump", 15, 19);
  for (let x = 13; x <= 14; x += 1) {
    state.tiles.wire[at(x, 10)] = NET_PRESENT;
    state.tiles.pipe[at(x, 10)] = NET_PRESENT;
  }
  for (let y = 10; y <= 19; y += 1) {
    state.tiles.wire[at(14, y)] = NET_PRESENT;
    state.tiles.pipe[at(14, y)] = NET_PRESENT;
  }
  const zone = [];
  for (let x = 2; x <= 11; x += 1) zone.push(at(x, 9));
  apply(state, { type: CMD_PAINT_ZONE, actor: 1, runs: encodeRuns(zone), zone: ZONE_RESIDENTIAL });
  for (let i = 0; i < 10; i += 1) {
    utilitiesPass(state);
    developmentPass(state);
  }
  const grown = state.buildings.filter((b) => b.zone === ZONE_RESIDENTIAL).length;
  assert.ok(grown > 0, "nothing grew even with supply");

  // Cut the line.
  for (let x = 13; x <= 14; x += 1) {
    state.tiles.wire[at(x, 10)] = 0;
    state.tiles.pipe[at(x, 10)] = 0;
  }
  for (let i = 0; i < 80; i += 1) {
    utilitiesPass(state);
    developmentPass(state);
  }
  const after = state.buildings.filter((b) => b.zone === ZONE_RESIDENTIAL).length;
  assert.ok(after < grown, `cut-off lots did not decay (${grown} then ${after})`);
});

test("the supply pass is deterministic and does not touch the hash by itself", () => {
  const a = city();
  const b = city();
  place(a, "coalPlant", 5, 5);
  place(b, "coalPlant", 5, 5);
  assert.equal(hashState(a), hashState(b));
  utilitiesPass(a);
  utilitiesPass(b);
  assert.equal(hashState(a), hashState(b));
});

test("supply figures survive a state copy", () => {
  const state = city();
  place(state, "coalPlant", 5, 5);
  utilitiesPass(state);
  assert.equal(state.supply.power.capacity, 700);
});
