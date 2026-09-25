// Rail and the station (slice T2; A65, A66).
//
// Two things that are easy to get wrong and impossible to see in a screenshot:
// whether a station is LIVE, and what a live one is worth. Live is a flood over
// `tiles.rail` from the station to an edge tile — derived on every ask, never
// stored — so a line that stops one tile short is a station that costs upkeep
// and does nothing, and the inspector has to say which of the three reasons it
// is (no line, unpowered, no road).
//
// The Outside is not a second simulation (A65). A live gate adds integer terms
// to the regional demand pool, seeds the commuter field as a sink, and yields a
// fare. Nothing about it is state.

import test from "node:test";
import assert from "node:assert/strict";
import { createState, copyState, hashState } from "../engine/state.js";
import { defaultOptions } from "../engine/options.js";
import { apply } from "../engine/reducer.js";
import { rules, buildCost } from "../engine/rules.js";
import { CMD_JOIN, CMD_PLACE_RAIL, CMD_PLACE_ROAD, CMD_PLACE_BUILDING, CMD_BULLDOZE } from "../engine/commands.js";
import { NET_PRESENT, hasNet } from "../engine/network.js";
import { FLAG_POWERED } from "../engine/constants.js";
import { gateStatus, gateTerms, gateFare, railReach } from "../engine/gates.js";
import { computeDemand } from "../engine/development.js";
import { trafficPass } from "../engine/traffic.js";
import { RESULT } from "../shared/protocol.js";
import { tileAt, encodeRuns } from "../shared/grid.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers/sources.js";
import { GATE_KEYS } from "../client/ui/inspector-model.js";
import "../engine/build-commands.js";
import "../engine/development.js";
import "../engine/economy.js";
import "../engine/utilities.js";
import "../engine/civic.js";
import "../engine/traffic.js";

const W = 24;
const at = (x, y) => tileAt(W, x, y);

function world() {
  const state = createState(defaultOptions({ width: W, height: W, seed: 5 }));
  apply(state, { type: CMD_JOIN, actor: 1, seat: 1, name: "One" });
  return state;
}

const rail = (actor, cells) => ({ type: CMD_PLACE_RAIL, actor, runs: encodeRuns(cells) });
const road = (actor, cells) => ({ type: CMD_PLACE_ROAD, actor, runs: encodeRuns(cells) });

function railRow(y, x0, x1) {
  const cells = [];
  for (let x = x0; x <= x1; x += 1) cells.push(at(x, y));
  return cells;
}

/** The station, its rail line and its road, built by the player. `reach` is
 * how far west the line runs; 0 means it touches the west edge. */
function station(state, { reach = 0, powered = true, road: withRoad = true } = {}) {
  const sx = 10;
  const sy = 10;
  // The line leaves the station's west side and runs to `reach`.
  apply(state, rail(1, railRow(sy, reach, sx - 1)));
  const placed = apply(state, { type: CMD_PLACE_BUILDING, actor: 1, x: sx, y: sy, def: "railStation" });
  if (withRoad) apply(state, road(1, [at(sx, sy - 1), at(sx + 1, sy - 1), at(sx + 2, sy - 1)]));
  const building = state.buildings.find((b) => b.def === "railStation");
  if (building && powered) {
    for (let dy = 0; dy < building.h; dy += 1) {
      for (let dx = 0; dx < building.w; dx += 1) {
        state.tiles.flags[at(building.x + dx, building.y + dy)] |= FLAG_POWERED;
      }
    }
  }
  return { placed, building };
}

// --- the layer ---------------------------------------------------------------

test("rail is its own layer, with a mask and a present bit", () => {
  const state = world();
  const cells = railRow(6, 4, 8);
  assert.equal(apply(state, rail(1, cells)).result, RESULT.OK);
  for (const i of cells) assert.ok(hasNet(state.tiles.rail[i]), `tile ${i} carries no rail`);
  // The middle of a run connects east and west and nothing else.
  assert.equal(state.tiles.rail[at(6, 6)] & 15, 2 | 8);
  // And it is not on the road layer.
  for (const i of cells) assert.equal(state.tiles.road[i], 0, "rail was written to the road layer");
});

test("rail costs the rail price, and more over water", () => {
  const state = world();
  const before = state.players[0].treasury;
  apply(state, rail(1, railRow(6, 4, 8)));
  assert.equal(before - state.players[0].treasury, 5 * buildCost(state, "rail"));
  assert.ok(rules().build.railOverWater > rules().build.rail, "crossing water is not dearer");
});

test("a rail tile may share a road tile and never a building", () => {
  // A level crossing is the one place two networks legitimately occupy one
  // tile (A66). A building is not: the station stands BESIDE its line.
  const state = world();
  apply(state, road(1, [at(6, 6)]));
  assert.equal(apply(state, rail(1, [at(6, 6)])).result, RESULT.OK, "a level crossing was refused");
  assert.ok(hasNet(state.tiles.road[at(6, 6)]) && hasNet(state.tiles.rail[at(6, 6)]));

  apply(state, { type: CMD_PLACE_BUILDING, actor: 1, x: 3, y: 3, def: "park" });
  assert.equal(apply(state, rail(1, [at(3, 3)])).result, RESULT.NEEDS_BULLDOZE,
    "rail was laid through a building");
  assert.equal(state.tiles.rail[at(3, 3)], 0);
});

test("bulldoze clears rail, and leaves the road under a crossing", () => {
  const state = world();
  apply(state, road(1, [at(6, 6)]));
  apply(state, rail(1, [at(6, 6)]));
  assert.equal(apply(state, { type: CMD_BULLDOZE, actor: 1, runs: encodeRuns([at(6, 6)]) }).result, RESULT.OK);
  assert.equal(state.tiles.rail[at(6, 6)], 0);
  assert.equal(state.tiles.road[at(6, 6)], 0, "bulldoze is per tile, not per layer");
});

test("copyState copies the rail layer, and the hash moves when a tile is laid", () => {
  const state = world();
  const before = hashState(state);
  apply(state, rail(1, railRow(6, 4, 8)));
  const after = hashState(state);
  assert.notEqual(after, before, "a rail tile left the hash where it was");

  const copy = copyState(state);
  assert.equal(hashState(copy), after);
  copy.tiles.rail[at(6, 6)] = 0;
  assert.notEqual(hashState(copy), after, "the copy shares the caller's rail array");
  assert.equal(hashState(state), after, "writing to the copy changed the original");
});

// --- the station is live, or it is not ---------------------------------------

test("a line that reaches the edge makes the station live; one tile short does not", () => {
  const live = world();
  station(live, { reach: 0 });
  const yes = live.buildings.find((b) => b.def === "railStation");
  assert.equal(gateStatus(live, yes).live, true, gateStatus(live, yes).reason);

  const dead = world();
  station(dead, { reach: 1 });
  const no = dead.buildings.find((b) => b.def === "railStation");
  assert.equal(gateStatus(dead, no).live, false);
  assert.equal(gateStatus(dead, no).reason, "noLine");
});

test("the station says which of the three reasons it is dead", () => {
  const unpowered = world();
  station(unpowered, { reach: 0, powered: false });
  const a = unpowered.buildings.find((b) => b.def === "railStation");
  assert.equal(gateStatus(unpowered, a).live, false);
  assert.equal(gateStatus(unpowered, a).reason, "unpowered");

  const roadless = world();
  station(roadless, { reach: 0, road: false });
  const b = roadless.buildings.find((b) => b.def === "railStation");
  assert.equal(gateStatus(roadless, b).live, false);
  assert.equal(gateStatus(roadless, b).reason, "noRoad");
});

test("a station must touch a rail tile to be built at all", () => {
  const state = world();
  const alone = apply(state, { type: CMD_PLACE_BUILDING, actor: 1, x: 10, y: 10, def: "railStation" });
  assert.equal(alone.result, RESULT.INVALID, "a station was built with no line to stand on");
  apply(state, rail(1, railRow(10, 0, 9)));
  assert.equal(apply(state, { type: CMD_PLACE_BUILDING, actor: 1, x: 10, y: 10, def: "railStation" }).result,
    RESULT.OK);
});

test("railReach marks the tiles joined to an edge and no others", () => {
  const state = world();
  // One line to the edge, one island in the middle of the map.
  apply(state, rail(1, railRow(4, 0, 6)));
  apply(state, rail(1, railRow(14, 10, 16)));
  const reach = railReach(state);
  assert.equal(reach[at(6, 4)], 1, "a line to the edge is not reachable");
  assert.equal(reach[at(0, 4)], 1);
  assert.equal(reach[at(14, 14)], 0, "an island of rail reaches the edge");
  assert.equal(reach[at(3, 3)], 0, "a tile with no rail on it is marked");
});

// --- what a live gate is worth -----------------------------------------------

test("the demand terms appear only when the gate is live", () => {
  const dead = world();
  station(dead, { reach: 1 });
  assert.deepEqual(gateTerms(dead), { residential: 0, commercial: 0, industrial: 0 });

  const live = world();
  station(live, { reach: 0 });
  const terms = gateTerms(live);
  const gate = rules().gate.rail;
  assert.deepEqual(terms, { residential: gate.residential, commercial: gate.commercial, industrial: gate.industrial });

  // And they reach the pool the player sees, rather than sitting in a function
  // nothing calls — the defect this project keeps finding.
  const withGate = computeDemand(live);
  const without = computeDemand(dead);
  assert.ok(withGate.industrial > without.industrial,
    `a live gate did not move industrial demand (${withGate.industrial} against ${without.industrial})`);
});

test("the fare is per resident in range, and only from a live gate", () => {
  const state = world();
  station(state, { reach: 0 });
  assert.equal(gateFare(state, 1), 0, "an empty city paid a fare");

  // One household inside the range and one well outside it.
  const gate = rules().gate.rail;
  assert.ok(gate.range < W, "the fixture cannot place a home outside the range");
  const home = { id: 900, def: "", zone: 1, x: 12, y: 12, w: 1, h: 1, owner: 1, level: 1,
    valueTier: 0, occupancy: 40, condition: 100, builtTick: 0, flags: 0 };
  state.buildings.push(home);
  assert.equal(gateFare(state, 1), 40 * gate.farePerResident);

  // A dead gate collects nothing.
  const dead = world();
  station(dead, { reach: 1 });
  dead.buildings.push({ ...home });
  assert.equal(gateFare(dead, 1), 0);
});

test("a live gate pulls commuters, and a dead one does not", () => {
  // The gate seeds the commuter field the way a workplace does (A65), so the
  // roads to a live station carry load even when every job is elsewhere.
  const build = (reach) => {
    const state = world();
    station(state, { reach });
    // A row of housing along the station's road, and no jobs anywhere.
    apply(state, road(1, railRow(9, 3, 12)));
    for (let x = 3; x <= 8; x += 1) {
      state.buildings.push({
        id: 500 + x, def: "", zone: 1, x, y: 8, w: 1, h: 1, owner: 1, level: 2,
        valueTier: 0, occupancy: 30, condition: 100, builtTick: 0, flags: 0,
      });
      state.tiles.buildingId[at(x, 8)] = 500 + x;
    }
    trafficPass(state);
    return state;
  };
  const live = build(0);
  const dead = build(1);
  assert.ok(live.traffic.commuters > 0, "nobody drove to a live station");
  assert.equal(dead.traffic.commuters, 0, "a dead station pulled commuters anyway");
});

// --- the hash ----------------------------------------------------------------

test("the hash follows the rail layer and nothing about a train", () => {
  // There is no train in the engine (T3 draws one, locally). What moves the
  // hash is the layer; what must not is anything the renderer does with it.
  const state = world();
  apply(state, rail(1, railRow(6, 4, 8)));
  const pinned = hashState(state);
  const copy = copyState(state);
  assert.equal(hashState(copy), pinned);
  // Every field the gate rules DERIVE is derived: nothing about liveness,
  // demand terms or fares is stored, so asking twice cannot move the hash.
  const one = state.buildings.find((b) => b.def === "railStation");
  gateStatus(state, one);
  gateTerms(state);
  gateFare(state, 1);
  railReach(state);
  assert.equal(hashState(state), pinned, "asking about a gate wrote to the state");
});

test("every reason the gate rules can give has a key and a word", () => {
  // Two lists in step: `gateStatus` produces the reasons, `GATE_KEYS` is what
  // the reachability sweep and both catalogues are checked against. A reason
  // added to one and not the other is an inspector row that says `gate.foo`.
  const source = readFileSync(join(repoRoot, "engine", "gates.js"), "utf8");
  const reasons = [...source.matchAll(/reason: "([a-zA-Z]*)"/g)].map((m) => m[1]);
  assert.ok(reasons.length >= 3, `only ${reasons.length} reasons found in engine/gates.js`);
  for (const reason of reasons) {
    const key = reason === "" ? "gate.live" : `gate.${reason}`;
    assert.ok(GATE_KEYS.includes(key), `${key} is not in GATE_KEYS`);
  }
  for (const key of GATE_KEYS) {
    const reason = key.slice("gate.".length);
    assert.ok(reason === "live" || reasons.includes(reason), `${key} is a reason nothing gives`);
  }
});
